// Golden Touch · Edge Function: crear-usuario
// Solo callable por admin. Crea el usuario en auth.users con la clave inicial
// 'gt-2026' (must_change_password=true), inserta su ficha en public.usuarios y
// devuelve la clave al admin.

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
    .select('role, estado, must_change_password')
    .eq('id', caller.user.id)
    .maybeSingle();
  // Mismas reglas que is_admin() en la base: admin ACTIVO y que ya cambió su
  // clave temporal (si no, quien conozca esa clave podría resetear a otros).
  if (!callerRow || callerRow.role !== 'admin' || callerRow.estado !== 'activo' || callerRow.must_change_password)
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
  // Los roles son dinámicos (tabla custom_roles): validamos contra ella en vez
  // de una lista fija, así los roles creados por el admin (p. ej. "Analista de
  // Centro de Acopio") también son válidos.
  if (!role || !role.trim()) return json({ error: 'Rol requerido' }, 400);
  const { data: roleRow } = await admin
    .from('custom_roles')
    .select('key')
    .eq('key', role)
    .maybeSingle();
  if (!roleRow) return json({ error: `Rol inválido: ${role}` }, 400);

  // 3) ¿El correo ya está registrado? (mensaje claro en vez del genérico de Auth)
  // eq sobre el correo normalizado (con ilike, un «_» del correo actuaba de comodín).
  const emailNorm = email.trim().toLowerCase();
  const { data: yaUsuario } = await admin
    .from('usuarios')
    .select('id')
    .eq('email', emailNorm)
    .limit(1)
    .maybeSingle();
  if (yaUsuario) {
    return json({ error: `Ese correo ya está registrado para otro usuario: ${emailNorm}` }, 409);
  }

  // 4) Crear auth user
  const clave = CLAVE_INICIAL;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: emailNorm,
    password: clave,
    email_confirm: true,
    user_metadata: { nombre, apellido, ci },
  });
  if (createErr || !created.user) {
    const m = (createErr?.message ?? '').toLowerCase();
    const dup = m.includes('already') || m.includes('registered') || m.includes('exists');
    return json(
      { error: dup ? `Ese correo ya está registrado: ${emailNorm}` : mensajeClave(createErr?.message ?? 'No se pudo crear el usuario') },
      dup ? 409 : 400,
    );
  }

  // 5) Insertar/upsert en public.usuarios
  const { error: upErr } = await admin.from('usuarios').upsert(
    {
      id: created.user.id,
      email: emailNorm,
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

  return json({ ok: true, id: created.user.id, email: emailNorm, clave_temporal: clave });
});
