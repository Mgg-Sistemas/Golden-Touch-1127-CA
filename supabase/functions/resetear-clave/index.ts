// Golden Touch · Edge Function: resetear-clave
// Solo admin. Resetea la clave del usuario objetivo a la clave inicial
// 'gt-2026', marca must_change_password=true para forzar el cambio en el
// próximo login y devuelve la clave al admin.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceKey || !anonKey)
    return json({ error: 'Supabase env vars faltantes' }, 500);

  // 1) Validar caller admin
  const authHeader = req.headers.get('Authorization') ?? '';
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: caller } = await callerClient.auth.getUser();
  if (!caller?.user) return json({ error: 'No autenticado' }, 401);

  const admin = createClient(url, serviceKey);
  const { data: callerRow } = await admin
    .from('usuarios')
    .select('role, estado, must_change_password')
    .eq('id', caller.user.id)
    .maybeSingle();
  // Mismas reglas que is_admin() en la base: admin ACTIVO y que ya cambió su
  // clave temporal (si no, quien conozca esa clave podría resetear a otros).
  if (!callerRow || callerRow.role !== 'admin' || callerRow.estado !== 'activo' || callerRow.must_change_password)
    return json({ error: 'Solo admin puede resetear claves' }, 403);

  // 2) Validar payload
  let payload: { user_id?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Body JSON inválido' }, 400);
  }
  const targetId = payload.user_id;
  if (!targetId) return json({ error: 'user_id requerido' }, 400);

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
