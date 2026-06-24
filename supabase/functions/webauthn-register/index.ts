// Golden Touch · Edge Function: webauthn-register
// Registro de una credencial WebAuthn (huella/Face ID/Windows Hello) para el
// usuario AUTENTICADO en el dispositivo actual. Dos acciones:
//   { action: 'options' }                       -> opciones de registro + challenge
//   { action: 'verify', response, deviceLabel } -> verifica y guarda la credencial
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from 'https://esm.sh/@simplewebauthn/server@13';
import { isoBase64URL } from 'https://esm.sh/@simplewebauthn/server@13/helpers';

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
  if (permitidos.length && !permitidos.includes(origin)) return null;
  try { return { origin, rpID: new URL(origin).hostname }; } catch { return null; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceKey || !anonKey) return json({ error: 'Supabase env vars faltantes' }, 500);

  const rp = resolverRp(req);
  if (!rp) return json({ error: 'Origen no permitido' }, 403);

  // Caller autenticado (su JWT).
  const authHeader = req.headers.get('Authorization') ?? '';
  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: caller } = await callerClient.auth.getUser();
  if (!caller?.user) return json({ error: 'No autenticado' }, 401);
  const userId = caller.user.id;
  const email = caller.user.email ?? '';

  const admin = createClient(url, serviceKey);

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
        transports: (c.transports as string[] | null) ?? undefined,
      })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });
    // Guardar el challenge (borrando los previos de registro de este usuario).
    await admin.from('webauthn_challenges').delete().eq('user_id', userId).eq('kind', 'register');
    const expira = new Date(Date.now() + CHALLENGE_TTL_MIN * 60_000).toISOString();
    const { error: insErr } = await admin.from('webauthn_challenges')
      .insert({ user_id: userId, challenge: opts.challenge, kind: 'register', expires_at: expira });
    if (insErr) return json({ error: insErr.message }, 500);
    return json(opts);
  }

  if (payload.action === 'verify') {
    if (!payload.response) return json({ error: 'Falta la respuesta del autenticador' }, 400);
    const { data: chal } = await admin
      .from('webauthn_challenges')
      .select('id, challenge, expires_at')
      .eq('user_id', userId).eq('kind', 'register')
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle();
    if (!chal) return json({ error: 'No hay un registro en curso. Reintentá.' }, 400);
    if (new Date(chal.expires_at as string).getTime() < Date.now()) {
      await admin.from('webauthn_challenges').delete().eq('id', chal.id);
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
        requireUserVerification: false,
      });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'No se pudo verificar' }, 400);
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
      return json({ error: upErr.message }, 500);
    }
    await admin.from('webauthn_challenges').delete().eq('id', chal.id);
    return json({ ok: true });
  }

  return json({ error: 'Acción inválida' }, 400);
});
