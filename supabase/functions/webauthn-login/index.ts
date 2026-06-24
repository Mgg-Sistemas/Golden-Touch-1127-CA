// Golden Touch · Edge Function: webauthn-login  (pública, sin sesión previa)
// Entrar con huella. Dos acciones:
//   { action: 'options', email }            -> opciones de autenticación + challenge
//   { action: 'verify', email, response }   -> verifica la huella y devuelve un
//                                              token_hash de magic-link para abrir sesión.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from 'https://esm.sh/@simplewebauthn/server@13';
import { isoBase64URL } from 'https://esm.sh/@simplewebauthn/server@13/helpers';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const CHALLENGE_TTL_MIN = 5;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
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
  if (!url || !serviceKey) return json({ error: 'Supabase env vars faltantes' }, 500);

  const rp = resolverRp(req);
  if (!rp) return json({ error: 'Origen no permitido' }, 403);

  const admin = createClient(url, serviceKey);

  let payload: { action?: string; email?: string; response?: unknown };
  try { payload = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }
  const email = (payload.email ?? '').trim().toLowerCase();
  if (!email) return json({ error: 'Indicá el correo' }, 400);

  // Usuario activo + sus credenciales.
  const { data: usuario } = await admin
    .from('usuarios')
    .select('id, email, estado')
    .ilike('email', email)
    .maybeSingle();
  if (!usuario || usuario.estado !== 'activo') {
    return json({ error: 'Este usuario no tiene huella disponible' }, 404);
  }
  const userId = usuario.id as string;

  if (payload.action === 'options') {
    const { data: creds } = await admin
      .from('webauthn_credentials')
      .select('credential_id, transports')
      .eq('user_id', userId);
    if (!creds || !creds.length) {
      return json({ error: 'Este usuario no tiene huella registrada en ningún dispositivo' }, 404);
    }
    const opts = await generateAuthenticationOptions({
      rpID: rp.rpID,
      allowCredentials: creds.map((c) => ({
        id: c.credential_id as string,
        transports: (c.transports as string[] | null) ?? undefined,
      })),
      userVerification: 'preferred',
    });
    await admin.from('webauthn_challenges').delete().eq('email', email).eq('kind', 'login');
    const expira = new Date(Date.now() + CHALLENGE_TTL_MIN * 60_000).toISOString();
    const { error: insErr } = await admin.from('webauthn_challenges')
      .insert({ email, challenge: opts.challenge, kind: 'login', expires_at: expira });
    if (insErr) return json({ error: insErr.message }, 500);
    return json(opts);
  }

  if (payload.action === 'verify') {
    if (!payload.response) return json({ error: 'Falta la respuesta del autenticador' }, 400);
    const { data: chal } = await admin
      .from('webauthn_challenges')
      .select('id, challenge, expires_at')
      .eq('email', email).eq('kind', 'login')
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle();
    if (!chal) return json({ error: 'No hay un inicio en curso. Reintentá.' }, 400);
    if (new Date(chal.expires_at as string).getTime() < Date.now()) {
      await admin.from('webauthn_challenges').delete().eq('id', chal.id);
      return json({ error: 'El inicio expiró. Reintentá.' }, 400);
    }

    // deno-lint-ignore no-explicit-any
    const credId = (payload.response as any)?.id as string | undefined;
    if (!credId) return json({ error: 'Respuesta inválida' }, 400);
    const { data: cred } = await admin
      .from('webauthn_credentials')
      .select('id, credential_id, public_key, counter, transports')
      .eq('user_id', userId).eq('credential_id', credId)
      .maybeSingle();
    if (!cred) return json({ error: 'Huella no reconocida para este usuario' }, 404);

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        // deno-lint-ignore no-explicit-any
        response: payload.response as any,
        expectedChallenge: chal.challenge as string,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        credential: {
          id: cred.credential_id as string,
          publicKey: isoBase64URL.toBuffer(cred.public_key as string),
          counter: Number(cred.counter) || 0,
          transports: (cred.transports as string[] | null) ?? undefined,
        },
        requireUserVerification: false,
      });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'No se pudo verificar la huella' }, 400);
    }
    if (!verification.verified) return json({ error: 'La huella no coincide' }, 401);

    await admin.from('webauthn_credentials')
      .update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
      .eq('id', cred.id);
    await admin.from('webauthn_challenges').delete().eq('id', chal.id);

    // Emitir sesión: generamos un magic-link y devolvemos su token_hash; el cliente
    // lo canjea con verifyOtp para abrir sesión sin contraseña.
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: (usuario.email as string) ?? email,
    });
    if (linkErr || !link?.properties?.hashed_token) {
      return json({ error: linkErr?.message ?? 'No se pudo emitir la sesión' }, 500);
    }
    return json({ ok: true, token_hash: link.properties.hashed_token, email: usuario.email ?? email });
  }

  return json({ error: 'Acción inválida' }, 400);
});
