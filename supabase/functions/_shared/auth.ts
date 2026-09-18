// Golden Touch · Helper compartido de autenticación para Edge Functions.
//
// POR QUÉ EXISTE: la clave `anon` viaja en el bundle de JavaScript, así que
// cualquiera la lee con F12 → Network. Presentar la anon key NO prueba nada:
// `verify_jwt` solo exige que el JWT esté firmado por el proyecto, y el anon
// key ES un JWT firmado por el proyecto. Por eso toda función que haga algo
// con privilegio tiene que verificar el usuario real detrás del pedido.
//
// El patrón correcto ya estaba en crear-usuario/index.ts; esto lo centraliza
// para que no haya que repetirlo (ni olvidarlo) en cada función.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

export type Sesion = {
  userId: string;
  email: string | null;
  role: string | null;
  estado: string | null;
  /** Cliente con service_role: úsalo DESPUÉS de haber validado la sesión. */
  admin: SupabaseClient;
};

/**
 * Verifica que el pedido venga de un usuario con sesión válida y cuenta activa.
 *
 * Devuelve `Response` cuando hay que cortar (401/403/500) y `Sesion` cuando
 * está todo bien. El llamador hace:
 *
 *   const s = await exigirSesion(req);
 *   if (s instanceof Response) return s;
 *   // a partir de acá s.userId / s.role / s.admin son de fiar
 */
export async function exigirSesion(req: Request): Promise<Sesion | Response> {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceKey || !anonKey) return json({ error: 'Supabase env vars faltantes' }, 500);

  const authHeader = req.headers.get('Authorization') ?? '';
  // Sin header no hay nada que verificar. Ojo: el cliente manda la anon key en
  // `apikey`, pero el JWT del usuario va en `Authorization`. Son distintos.
  if (!authHeader) return json({ error: 'No autenticado' }, 401);

  const comoLlamante = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: caller } = await comoLlamante.auth.getUser();
  if (!caller?.user) return json({ error: 'No autenticado' }, 401);

  const admin = createClient(url, serviceKey);
  const { data: fila } = await admin
    .from('usuarios')
    .select('email, role, estado')
    .eq('id', caller.user.id)
    .maybeSingle();

  // Una cuenta dada de baja conserva su JWT hasta que vence: acá se corta.
  if (!fila) return json({ error: 'Usuario no registrado en el sistema' }, 403);
  if (fila.estado && fila.estado !== 'activo') return json({ error: 'Cuenta inhabilitada' }, 403);

  return {
    userId: caller.user.id,
    email: fila.email ?? caller.user.email ?? null,
    role: fila.role ?? null,
    estado: fila.estado ?? null,
    admin,
  };
}

type FilaPermisos = {
  role: string | null;
  estado: string | null;
  must_change_password: boolean | null;
};

/** Relee la fila del usuario (rol, estado y si debe cambiar la clave). */
async function leerFila(s: Sesion): Promise<FilaPermisos | null> {
  const { data, error } = await s.admin
    .from('usuarios')
    .select('role, estado, must_change_password')
    .eq('id', s.userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as FilaPermisos;
}

/** Réplica de `public.is_admin()`: role='admin', estado='activo' (estricto) y
 *  sin cambio de clave pendiente. */
function esAdminFila(f: FilaPermisos | null): boolean {
  return Boolean(f && f.role === 'admin' && f.estado === 'activo' && !(f.must_change_password ?? false));
}

/**
 * ¿La sesión es de un administrador "pleno"? Mismas reglas que `is_admin()` de
 * Postgres: rol admin, cuenta activa y sin cambio de clave pendiente. Un admin
 * que todavía tiene la clave temporal NO cuenta como admin.
 */
export async function esAdminPleno(s: Sesion): Promise<boolean> {
  return esAdminFila(await leerFila(s));
}

/** Igual que `exigirSesion`, pero además exige admin pleno (ver `esAdminPleno`). */
export async function exigirAdmin(req: Request): Promise<Sesion | Response> {
  const s = await exigirSesion(req);
  if (s instanceof Response) return s;
  const f = await leerFila(s);
  if (!f || f.role !== 'admin') return json({ error: 'Solo un administrador puede hacer esto' }, 403);
  if (f.must_change_password) {
    return json({ error: 'Cambiá tu contraseña temporal antes de hacer esto' }, 403);
  }
  if (!esAdminFila(f)) return json({ error: 'Solo un administrador puede hacer esto' }, 403);
  return s;
}

/**
 * Permiso de escritura por módulo. Réplica exacta de `public.puede(modulo)`:
 *
 *   is_admin()
 *   or (estado activo —null cuenta como activo—, sin cambio de clave pendiente,
 *       y roles_permisos[role][modulo].escritura o .full = true)
 *
 * Se relee la fila en vez de confiar en `s.role`, igual que hace Postgres con auth.uid().
 */
export async function puede(s: Sesion, modulo: string): Promise<boolean> {
  const f = await leerFila(s);
  if (!f) return false;
  if (esAdminFila(f)) return true;
  if ((f.estado ?? 'activo') !== 'activo') return false;
  if (f.must_change_password ?? false) return false;
  if (!f.role) return false;
  const { data, error } = await s.admin.from('roles_permisos').select('permisos').eq('role', f.role).maybeSingle();
  if (error || !data) return false;
  const m = ((data.permisos ?? {}) as Record<string, unknown>)[modulo] as
    | { escritura?: unknown; full?: unknown }
    | undefined;
  // Postgres hace (x ->> 'escritura')::boolean: solo true (o 'true') cuenta.
  const verdadero = (v: unknown) => v === true || v === 'true';
  return Boolean(m && (verdadero(m.escritura) || verdadero(m.full)));
}
