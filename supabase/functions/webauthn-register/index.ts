// Golden Touch · Edge Function: webauthn-register
// Registro de una credencial WebAuthn (huella/Face ID/Windows Hello) para el
// usuario AUTENTICADO en el dispositivo actual. Dos acciones:
//   { action: 'options' }                       -> opciones de registro + challenge
//   { action: 'verify', response, deviceLabel } -> verifica y guarda la credencial
// Exige sesión con cuenta activa (exigirSesion) y verificación de usuario
// (huella/PIN/rostro), no solo presencia. El challenge se consume de forma
// atómica: un challenge, un único intento.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from 'https://esm.sh/@simplewebauthn/server@13';
import { isoBase64URL } from 'https://esm.sh/@simplewebauthn/server@13/helpers';
import { exigirSesion } from '../_shared/auth.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const RP_NAME = 'GOLDEN TOUCH 1127 C.A.';
const CHALLENGE_TTL_MIN = 5;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

/** rpID/origin se derivan del Origin del navegador. Si WEBAUTHN_ORIGINS está
 *  configurado (lista separada por comas), se valida contra esa lista. */
function resolverRp(req: Request): { origin: string; rpID: string } | null {
  const origin = req.headers.get('Origin') ?? '';
  if (!origin) return null;
  const permitidos = (Deno.env.get('WEBAUTHN_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  // GT-AUT-04 · Antes, con la variable sin definir la lista quedaba vacía y la
  // condición no se evaluaba nunca: se aceptaba CUALQUIER origen. Ahora la falta
  // de configuración rechaza, que es el lado seguro del error.
  if (!permitidos.length) return null;
  if (!permitidos.includes(origin)) return null;
  try { return { origin, rpID: new URL(origin).hostname }; } catch { return null; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const rp = resolverRp(req);
  if (!rp) return json({ error: 'Origen no permitido' }, 403);

  // Caller autenticado Y con cuenta activa: una cuenta dada de baja conserva su
  // JWT hasta que vence y no debe poder enrolar una huella nueva en ese lapso.
  const s = await exigirSesion(req);
  if (s instanceof Response) return s;
  const userId = s.userId;
  const email = s.email ?? '';
  const admin = s.admin;

  let payload: { action?: string; response?: unknown; deviceLabel?: string };
  try { payload = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }

  if (payload.action === 'options') {
    const { data: existentes } = await admin
      .from('webauthn_credentials')
      .select('credential_id, transports')
      .eq('user_id', userId);
    const opts = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: rp.rpID,
      userID: new TextEncoder().encode(userId),
      userName: email || userId,
      userDisplayName: email || userId,
      attestationType: 'none',
      excludeCredentials: (existentes ?? []).map((c) => ({
        id: c.credential_id as string,
        // deno-lint-ignore no-explicit-any
        transports: ((c.transports as string[] | null) ?? undefined) as any,
      })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    });
    // Guardar el challenge (borrando los previos de registro de este usuario).
    const { error: delErr } = await admin.from('webauthn_challenges').delete().eq('user_id', userId).eq('kind', 'register');
    if (delErr) console.error('webauthn-register: limpiar challenges', delErr);
    const expira = new Date(Date.now() + CHALLENGE_TTL_MIN * 60_000).toISOString();
    const { error: insErr } = await admin.from('webauthn_challenges')
      .insert({ user_id: userId, challenge: opts.challenge, kind: 'register', expires_at: expira });
    if (insErr) {
      console.error('webauthn-register: guardar challenge', insErr);
      return json({ error: 'No se pudo iniciar el registro' }, 500);
    }
    return json(opts);
  }

  if (payload.action === 'verify') {
    if (!payload.response) return json({ error: 'Falta la respuesta del autenticador' }, 400);

    // Consumo atómico (DELETE … RETURNING): un challenge, un solo intento.
    const { data: consumidos, error: chalErr } = await admin
      .from('webauthn_challenges')
      .delete()
      .eq('user_id', userId).eq('kind', 'register')
      .select('id, challenge, expires_at, created_at');
    if (chalErr) {
      console.error('webauthn-register: consumir challenge', chalErr);
      return json({ error: 'No se pudo verificar la huella' }, 500);
    }
    const chal = (consumidos ?? [])
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    if (!chal) return json({ error: 'No hay un registro en curso. Reintentá.' }, 400);
    if (new Date(chal.expires_at as string).getTime() < Date.now()) {
      return json({ error: 'El registro expiró. Reintentá.' }, 400);
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        // deno-lint-ignore no-explicit-any
        response: payload.response as any,
        expectedChallenge: chal.challenge as string,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        requireUserVerification: true,
      });
    } catch (e) {
      console.warn('webauthn-register: verificación rechazada', e instanceof Error ? e.message : e);
      return json({ error: 'No se pudo verificar la huella. Reintentá.' }, 400);
    }
    if (!verification.verified || !verification.registrationInfo) {
      return json({ error: 'La huella no pudo verificarse' }, 400);
    }
    const cred = verification.registrationInfo.credential;
    // deno-lint-ignore no-explicit-any
    const transports = (payload.response as any)?.response?.transports ?? cred.transports ?? null;
    const { error: upErr } = await admin.from('webauthn_credentials').insert({
      user_id: userId,
      credential_id: cred.id,
      public_key: isoBase64URL.fromBuffer(cred.publicKey),
      counter: cred.counter ?? 0,
      transports,
      device_label: (payload.deviceLabel ?? '').toString().slice(0, 80) || null,
    });
    if (upErr) {
      if ((upErr as { code?: string }).code === '23505') return json({ error: 'Esta huella ya está registrada en este dispositivo.' }, 409);
      console.error('webauthn-register: guardar credencial', upErr);
      return json({ error: 'No se pudo guardar la huella' }, 500);
    }
    return json({ ok: true });
  }

  return json({ error: 'Acción inválida' }, 400);
});
