/* ============================================================
   Golden Touch · Nombres de usuario a través del tiempo (07/10/2026)

   Cuando a un usuario se le cambia el nombre, lo que hizo ANTES tiene que
   seguir mostrando el nombre que tenía entonces. La base guarda cada cambio
   en `usuarios_nombres_historial` (el trigger exige el motivo); aquí se
   responde «¿cómo se llamaba este correo en tal fecha?».

   Las pantallas que guardan el nombre junto al registro (actor_name, etc.)
   ya lo conservan solas; esto es para las que solo guardan el correo y
   buscaban el nombre ACTUAL del usuario.
   ============================================================ */
import { supabase } from './supabase';

export interface CambioNombre {
  id: string;
  usuario_id: string | null;
  email: string | null;
  nombre_anterior: string | null;
  apellido_anterior: string | null;
  nombre_nuevo: string | null;
  apellido_nuevo: string | null;
  motivo: string;
  cambiado_por: string | null;
  cambiado_por_nombre: string | null;
  cambiado_en: string;
}

export const nombreCompleto = (nombre?: string | null, apellido?: string | null): string =>
  [nombre, apellido].map((x) => (x ?? '').trim()).filter(Boolean).join(' ');

/**
 * Nombre que tenía `email` en `fecha`. Recorre sus cambios en orden: el primero
 * hecho DESPUÉS de esa fecha dice cómo se llamaba (su «nombre anterior»). Si no
 * hubo cambios después, o no hay fecha, es el nombre actual.
 */
export function nombreEnFecha(
  email: string | null | undefined,
  nombreActual: string | null | undefined,
  fecha: string | null | undefined,
  cambios: CambioNombre[],
): string | null {
  const actual = (nombreActual ?? '').trim() || null;
  if (!email || !fecha) return actual;
  const e = email.toLowerCase();
  const t = new Date(fecha).getTime();
  if (Number.isNaN(t)) return actual;
  const posterior = cambios
    .filter((c) => (c.email ?? '').toLowerCase() === e && new Date(c.cambiado_en).getTime() > t)
    .sort((a, b) => a.cambiado_en.localeCompare(b.cambiado_en))[0];
  if (!posterior) return actual;
  return nombreCompleto(posterior.nombre_anterior, posterior.apellido_anterior) || actual;
}

let cache: { at: number; datos: Promise<CambioNombre[]> } | null = null;

/** Todos los cambios de nombre (tabla chica). Se cachea un minuto. */
export function listCambiosNombre(forzar = false): Promise<CambioNombre[]> {
  if (!forzar && cache && Date.now() - cache.at < 60_000) return cache.datos;
  const datos = (async () => {
    const { data, error } = await supabase
      .from('usuarios_nombres_historial').select('*').order('cambiado_en', { ascending: true });
    if (error) throw error;
    return (data ?? []) as CambioNombre[];
  })();
  cache = { at: Date.now(), datos };
  datos.catch(() => { cache = null; });
  return datos;
}

/** Cambios de nombre de un usuario, del más reciente al más viejo. */
export async function listCambiosDeUsuario(usuarioId: string): Promise<CambioNombre[]> {
  const { data, error } = await supabase
    .from('usuarios_nombres_historial').select('*').eq('usuario_id', usuarioId)
    .order('cambiado_en', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CambioNombre[];
}

/**
 * Para los PDF: «correo + fecha → nombre que tenía entonces». Recibe el mapa
 * correo → nombre ACTUAL que el PDF ya armó y le suma el historial de nombres.
 * Si el historial no carga, queda el nombre actual (como antes).
 */
export async function resolverNombresEnFecha(
  actuales: Map<string, string>,
): Promise<(email?: string | null, fecha?: string | null) => string> {
  const cambios = await listCambiosNombre().catch(() => [] as CambioNombre[]);
  return (email, fecha) => {
    if (!email) return '—';
    const actual = actuales.get(email.toLowerCase());
    if (!actual) return email;
    return nombreEnFecha(email, actual, fecha, cambios) || actual;
  };
}
