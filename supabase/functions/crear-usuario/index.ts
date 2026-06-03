// MGG · Edge Function: crear-usuario
// Solo callable por admin. Crea el usuario en auth.users con clave por defecto
// '123456' (must_change_password=true) e inserta su ficha en public.usuarios.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const DEFAULT_PASSWORD = '123456';

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

  // 1) Validar caller admin con su JWT
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
    return json({ error: 'Solo admin puede crear usuarios' }, 403);

  // 2) Validar payload
  let payload: {
    email?: string;
    nombre?: string;
    apellido?: string;
    ci?: string;
    role?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Body JSON inválido' }, 400);
  }
  const { email, nombre, apellido, ci, role } = payload;
  if (!email || !/\S+@\S+\.\S+/.test(email))
    return json({ error: 'Email inválido' }, 400);
  if (!nombre || !nombre.trim()) return json({ error: 'Nombre requerido' }, 400);
  const VALID_ROLES = ['admin', 'analista', 'obrero', 'supervisor', 'jefe', 'contabilidad', 'gerencia'];
  if (!role || !VALID_ROLES.includes(role))
    return json({ error: 'Rol inválido' }, 400);

  // 3) Crear auth user
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: DEFAULT_PASSWORD,
    email_confirm: true,
    user_metadata: { nombre, apellido, ci },
  });
  if (createErr || !created.user) {
    return json({ error: createErr?.message ?? 'No se pudo crear el usuario' }, 400);
  }

  // 4) Insertar/upsert en public.usuarios
  const { error: upErr } = await admin.from('usuarios').upsert(
    {
      id: created.user.id,
      email,
      nombre: nombre.trim(),
      apellido: apellido?.trim() || null,
      ci: ci?.trim() || null,
      role,
      estado: 'activo',
      must_change_password: true,
    },
    { onConflict: 'id' },
  );
  if (upErr) {
    // Rollback: eliminar auth user
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: upErr.message }, 500);
  }

  return json({ ok: true, id: created.user.id, email });
});
