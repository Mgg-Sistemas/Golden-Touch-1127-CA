// Golden Touch · Edge Function: webauthn-login  (pública, sin sesión previa)
// Entrar con huella. Dos acciones:
//   { action: 'options', email }            -> opciones de autenticación + challenge
//   { action: 'verify', email, response }   -> verifica la huella y devuelve un
//                                              token_hash de magic-link para abrir sesión.
//
// Endurecido (18/09/2026):
//   · Usuario inexistente, inactivo o sin huella reciben la MISMA respuesta
//     (mismo status y mensaje): la función no sirve para averiguar quién existe.
//   · El challenge se consume de forma atómica (DELETE … RETURNING) al empezar
//     a verificar: un challenge sirve para un único intento, salga bien o mal.
//   · Se exige verificación de usuario (huella/PIN/rostro), no solo presencia.
//   · Los mensajes internos de la librería nunca llegan al cliente.
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

/** Respuesta única para "no hay huella disponible para ese correo". */
const SIN_HUELLA = { error: 'No hay huella disponible para este correo. Entrá con tu contraseña.' };
const SIN_HUELLA_STATUS = 400;
/** Respuesta única para cualquier fallo de verificación. */
const NO_VERIFICA = { error: 'No se pudo verificar la huella. Reintentá.' };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
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

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'Supabase env vars faltantes' }, 500);

  const rp = resolverRp(req);
  if (!rp) return json({ error: 'Origen no permitido' }, 403);

  const admin = createClient(url, serviceKey);

  let payload: { action?: string; email?: string; response?: unknown };
  try { payload = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }
  const email = (payload.email ?? '').toString().trim().toLowerCase();
  if (!email) return json({ error: 'Indicá el correo' }, 400);
  if (payload.action !== 'options' && payload.action !== 'verify') {
    return json({ error: 'Acción inválida' }, 400);
  }

  // Usuario activo. Los correos de `usuarios` están normalizados: eq, no ilike
  // (ilike trataría '_' y '%' del correo como comodines).
  const { data: usuario, error: uErr } = await admin
    .from('usuarios')
    .select('id, email, estado')
    .eq('email', email)
    .maybeSingle();
  if (uErr) {
    console.error('webauthn-login: leer usuario', uErr);
    return json({ error: 'No se pudo iniciar con huella' }, 500);
  }
  const activo = Boolean(usuario && usuario.estado === 'activo');

  if (payload.action === 'options') {
    if (!activo) return json(SIN_HUELLA, SIN_HUELLA_STATUS);
    const userId = usuario!.id as string;
    const { data: creds, error: cErr } = await admin
      .from('webauthn_credentials')
      .select('credential_id, transports')
      .eq('user_id', userId);
    if (cErr) {
      console.error('webauthn-login: leer credenciales', cErr);
      return json({ error: 'No se pudo iniciar con huella' }, 500);
    }
    if (!creds || !creds.length) return json(SIN_HUELLA, SIN_HUELLA_STATUS);

    const opts = await generateAuthenticationOptions({
      rpID: rp.rpID,
      allowCredentials: creds.map((c) => ({
        id: c.credential_id as string,
        // deno-lint-ignore no-explicit-any
        transports: ((c.transports as string[] | null) ?? undefined) as any,
      })),
      userVerification: 'required',
    });
    const { error: delErr } = await admin.from('webauthn_challenges').delete().eq('email', email).eq('kind', 'login');
    if (delErr) console.error('webauthn-login: limpiar challenges', delErr);
    const expira = new Date(Date.now() + CHALLENGE_TTL_MIN * 60_000).toISOString();
    const { error: insErr } = await admin.from('webauthn_challenges')
      .insert({ email, challenge: opts.challenge, kind: 'login', expires_at: expira });
    if (insErr) {
      console.error('webauthn-login: guardar challenge', insErr);
      return json({ error: 'No se pudo iniciar con huella' }, 500);
    }
    return json(opts);
  }

  // ── verify ──
  if (!payload.response) return json({ error: 'Falta la respuesta del autenticador' }, 400);

  // Consumo ATÓMICO del challenge: el DELETE … RETURNING lo saca de la tabla en
  // la misma operación en que lo leemos. Si dos pedidos llegan a la vez, solo
  // uno recibe la fila; y tras un fallo el challenge ya no existe (hay que
  // volver a pedir 'options').
  const { data: consumidos, error: chalErr } = await admin
    .from('webauthn_challenges')
    .delete()
    .eq('email', email)
    .eq('kind', 'login')
    .select('id, challenge, expires_at, created_at');
  if (chalErr) {
    console.error('webauthn-login: consumir challenge', chalErr);
    return json({ error: 'No se pudo iniciar con huella' }, 500);
  }
  const chal = (consumidos ?? [])
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  if (!chal) return json({ error: 'No hay un inicio en curso. Reintentá.' }, 400);
  if (new Date(chal.expires_at as string).getTime() < Date.now()) {
    return json({ error: 'El inicio expiró. Reintentá.' }, 400);
  }

  // Si el usuario se dio de baja entre 'options' y 'verify', mismo mensaje genérico.
  if (!activo) return json(NO_VERIFICA, 401);
  const userId = usuario!.id as string;

  // deno-lint-ignore no-explicit-any
  const credId = (payload.response as any)?.id;
  if (typeof credId !== 'string' || !credId) return json(NO_VERIFICA, 401);
  const { data: cred, error: credErr } = await admin
    .from('webauthn_credentials')
    .select('id, credential_id, public_key, counter, transports')
    .eq('user_id', userId).eq('credential_id', credId)
    .maybeSingle();
  if (credErr) {
    console.error('webauthn-login: leer credencial', credErr);
    return json({ error: 'No se pudo iniciar con huella' }, 500);
  }
  if (!cred) return json(NO_VERIFICA, 401);

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
        // deno-lint-ignore no-explicit-any
        transports: ((cred.transports as string[] | null) ?? undefined) as any,
      },
      requireUserVerification: true,
    });
  } catch (e) {
    // El detalle queda en el log del servidor; al cliente, mensaje genérico.
    console.warn('webauthn-login: verificación rechazada', e instanceof Error ? e.message : e);
    return json(NO_VERIFICA, 401);
  }
  if (!verification.verified) return json(NO_VERIFICA, 401);

  const { error: cntErr } = await admin.from('webauthn_credentials')
    .update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
    .eq('id', cred.id);
  if (cntErr) {
    // Sin el contador al día se debilita la detección de clonado: no emitimos sesión.
    console.error('webauthn-login: actualizar contador', cntErr);
    return json({ error: 'No se pudo iniciar con huella' }, 500);
  }

  // Emitir sesión: generamos un magic-link y devolvemos su token_hash; el cliente
  // lo canjea con verifyOtp para abrir sesión sin contraseña.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: (usuario!.email as string) ?? email,
  });
  if (linkErr || !link?.properties?.hashed_token) {
    console.error('webauthn-login: generar sesión', linkErr);
    return json({ error: 'No se pudo emitir la sesión' }, 500);
  }
  return json({ ok: true, token_hash: link.properties.hashed_token, email: usuario!.email ?? email });
});
