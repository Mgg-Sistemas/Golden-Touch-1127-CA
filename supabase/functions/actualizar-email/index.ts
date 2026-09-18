// Golden Touch · Edge Function: actualizar-email
// Solo admin. Cambia el correo de un usuario en Auth (auth.users) y en la tabla
// public.usuarios de forma coordinada. El correo es la identidad de login.
//
// verify_jwt = false: la validación del llamador la hace `exigirAdmin` por
// dentro, con las mismas reglas que is_admin() de Postgres (rol admin, cuenta
// activa y sin cambio de clave pendiente).

import { CORS, json, exigirAdmin } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // 1) Validar caller admin pleno
  const s = await exigirAdmin(req);
  if (s instanceof Response) return s;
  const admin = s.admin;

  // 2) Validar payload
  let payload: { user_id?: string; email?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Body JSON inválido' }, 400);
  }
  const targetId = (payload.user_id ?? '').toString();
  const emailNorm = (payload.email ?? '').toString().trim().toLowerCase();
  if (!targetId) return json({ error: 'user_id requerido' }, 400);
  if (!emailNorm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm))
    return json({ error: 'Email inválido' }, 400);

  // 3) El usuario destino existe (en la tabla y en Auth) y guardamos su correo
  //    actual en Auth para poder revertir si algo falla a mitad de camino.
  const { data: destino, error: destErr } = await admin
    .from('usuarios')
    .select('id, email')
    .eq('id', targetId)
    .maybeSingle();
  if (destErr) {
    console.error('actualizar-email: leer destino', destErr);
    return json({ error: 'No se pudo leer el usuario' }, 500);
  }
  if (!destino) return json({ error: 'Usuario no encontrado' }, 404);

  const { data: authUser, error: getErr } = await admin.auth.admin.getUserById(targetId);
  if (getErr || !authUser?.user) {
    console.error('actualizar-email: leer auth', getErr);
    return json({ error: 'Usuario no encontrado en el acceso' }, 404);
  }
  const emailAnteriorAuth = authUser.user.email ?? null;

  if (emailAnteriorAuth === emailNorm && destino.email === emailNorm) {
    return json({ ok: true, email: emailNorm });
  }

  // 4) ¿El correo ya está en uso por OTRO usuario? Los correos de `usuarios`
  //    se guardan normalizados (minúsculas, sin espacios): basta con eq.
  const { data: ya, error: dupErr } = await admin
    .from('usuarios')
    .select('id')
    .eq('email', emailNorm)
    .maybeSingle();
  if (dupErr) {
    console.error('actualizar-email: duplicado', dupErr);
    return json({ error: 'No se pudo validar el correo' }, 500);
  }
  if (ya && ya.id !== targetId)
    return json({ error: `Ese correo ya está registrado para otro usuario: ${emailNorm}` }, 409);

  // 5) Cambiar el correo en Auth (identidad de login). email_confirm para no exigir verificación.
  const { error: authErr } = await admin.auth.admin.updateUserById(targetId, {
    email: emailNorm,
    email_confirm: true,
  });
  if (authErr) {
    const m = (authErr.message ?? '').toLowerCase();
    const dup = m.includes('already') || m.includes('registered') || m.includes('exists');
    if (!dup) console.error('actualizar-email: auth update', authErr);
    return json(
      { error: dup ? `Ese correo ya está registrado: ${emailNorm}` : 'No se pudo cambiar el correo' },
      dup ? 409 : 400,
    );
  }

  // 6) Reflejar el correo en public.usuarios. Si falla, se revierte Auth al
  //    correo anterior: no puede quedar un login con un correo y la ficha con otro.
  const { error: upErr } = await admin
    .from('usuarios')
    .update({ email: emailNorm, updated_at: new Date().toISOString() })
    .eq('id', targetId);
  if (upErr) {
    console.error('actualizar-email: update usuarios', upErr);
    if (emailAnteriorAuth && emailAnteriorAuth !== emailNorm) {
      const { error: revErr } = await admin.auth.admin.updateUserById(targetId, {
        email: emailAnteriorAuth,
        email_confirm: true,
      });
      if (revErr) {
        console.error('actualizar-email: NO se pudo revertir Auth', revErr);
        return json({
          error: 'El correo de acceso cambió pero la ficha no se actualizó. Avisá a sistemas.',
        }, 500);
      }
    }
    return json({ error: 'No se pudo cambiar el correo; no se aplicó ningún cambio' }, 500);
  }

  return json({ ok: true, email: emailNorm });
});
