// Golden Touch · Edge Function: actualizar-email
// Solo admin. Cambia el correo de un usuario en Auth (auth.users) y en la tabla
// public.usuarios de forma coordinada. El correo es la identidad de login.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
    .select('role')
    .eq('id', caller.user.id)
    .maybeSingle();
  if (!callerRow || callerRow.role !== 'admin')
    return json({ error: 'Solo el administrador puede cambiar el correo' }, 403);

  // 2) Validar payload
  let payload: { user_id?: string; email?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Body JSON inválido' }, 400);
  }
  const targetId = payload.user_id;
  const emailNorm = (payload.email ?? '').trim().toLowerCase();
  if (!targetId) return json({ error: 'user_id requerido' }, 400);
  if (!emailNorm || !/\S+@\S+\.\S+/.test(emailNorm))
    return json({ error: 'Email inválido' }, 400);

  // 3) ¿El correo ya está en uso por OTRO usuario?
  const { data: ya } = await admin
    .from('usuarios')
    .select('id')
    .ilike('email', emailNorm)
    .maybeSingle();
  if (ya && ya.id !== targetId)
    return json({ error: `Ese correo ya está registrado para otro usuario: ${emailNorm}` }, 409);

  // 4) Cambiar el correo en Auth (identidad de login). email_confirm para no exigir verificación.
  const { error: authErr } = await admin.auth.admin.updateUserById(targetId, {
    email: emailNorm,
    email_confirm: true,
  });
  if (authErr) {
    const m = (authErr.message ?? '').toLowerCase();
    const dup = m.includes('already') || m.includes('registered') || m.includes('exists');
    return json(
      { error: dup ? `Ese correo ya está registrado: ${emailNorm}` : (authErr.message || 'No se pudo cambiar el correo') },
      dup ? 409 : 400,
    );
  }

  // 5) Reflejar el correo en public.usuarios
  const { error: upErr } = await admin
    .from('usuarios')
    .update({ email: emailNorm, updated_at: new Date().toISOString() })
    .eq('id', targetId);
  if (upErr) return json({ error: upErr.message }, 500);

  return json({ ok: true, email: emailNorm });
});
