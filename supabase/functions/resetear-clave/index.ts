// Golden Touch · Edge Function: resetear-clave
// La llama el admin o quien tenga Full control de Usuarios (17/10/2026); un no-admin
// no puede resetear la clave de un administrador. Resetea la clave del usuario objetivo a la clave inicial
// 'gt-2026', marca must_change_password=true para forzar el cambio en el
// próximo login y devuelve la clave al admin.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { CORS, json, exigirGestorUsuarios, gestorPuedeTocar } from '../_shared/auth.ts';

// Clave INICIAL fija (el usuario la cambia obligatoriamente en su primer inicio).
// Antes era '123456', pero Supabase Auth rechaza las claves que aparecen en
// filtraciones públicas («Password is known to be weak and easy to guess»);
// 'gt2026' y 'gt123456' también están filtradas. 'gt-2026' no (verificado contra
// Have I Been Pwned el 18/09/2026). Si se cambia, verificarla antes.
const CLAVE_INICIAL = 'gt-2026';

/** Traduce los rechazos de clave de Supabase Auth. */
function mensajeClave(m: string): string {
  return /weak|easy to guess|pwned|leaked|compromised/i.test(m)
    ? 'Supabase rechazó la clave inicial por insegura: hay que cambiar CLAVE_INICIAL en la función.'
    : m;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // 1) Validar caller: admin pleno o Full control de Usuarios (cuenta activa, sin clave temporal)
  const g = await exigirGestorUsuarios(req);
  if (g instanceof Response) return g;
  const admin = g.admin;

  // 2) Validar payload
  let payload: { user_id?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Body JSON inválido' }, 400);
  }
  const targetId = payload.user_id;
  if (!targetId) return json({ error: 'user_id requerido' }, 400);
  // Un no-admin no resetea la clave de un administrador.
  const { data: destino } = await admin.from('usuarios').select('role').eq('id', targetId).maybeSingle();
  if (!destino) return json({ error: 'Usuario no encontrado' }, 404);
  if (!gestorPuedeTocar(g, destino.role)) return json({ error: 'Solo un administrador puede resetear la clave de otro administrador.' }, 403);

  // 3) Resetear clave
  const clave = CLAVE_INICIAL;
  const { error: pwErr } = await admin.auth.admin.updateUserById(targetId, {
    password: clave,
  });
  if (pwErr) return json({ error: mensajeClave(pwErr.message) }, 400);

  // 4) Forzar cambio en próximo login
  const { error: flagErr } = await admin
    .from('usuarios')
    .update({ must_change_password: true })
    .eq('id', targetId);
  if (flagErr) return json({ error: flagErr.message }, 500);

  return json({ ok: true, clave_temporal: clave });
});
