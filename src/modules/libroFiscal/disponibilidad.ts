/* ============================================================
   Golden Touch · Retenciones · ¿Está la tabla en la base?

   Mientras los paquetes de la base se aplican aparte, una pantalla que
   depende de una tabla nueva se muestra solo si la tabla existe y PostgREST la
   expone. Se pregunta una vez por sesión con un conteo vacío (no trae filas).
   · responde (aunque sea con 0 filas o sin permiso de lectura) → existe;
   · «relation does not exist» (42P01) o tabla no expuesta (PGRST205) → no;
   · cualquier otro fallo (red, sesión) → no, y no se guarda en caché, para
     volver a preguntar.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';

const cache = new Map<string, Promise<boolean>>();

/** ¿El error dice que la tabla no existe o no está expuesta? */
export function esTablaInexistente(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  if (e.code === '42P01' || e.code === 'PGRST205') return true;
  return /relation .* does not exist|could not find the table/i.test(e.message ?? '');
}

/** ¿El error es de la base, con un código propio? Si no, es de red o de sesión y vale volver a preguntar. */
const esRespuestaDeLaBase = (e: { code?: string }) => !!e.code && e.code !== 'PGRST301';

export function tablaDisponible(nombre: string): Promise<boolean> {
  const previa = cache.get(nombre);
  if (previa) return previa;
  const consulta = (async () => {
    try {
      const { error } = await supabase.from(nombre).select('*', { head: true, count: 'exact' }).limit(0);
      if (!error) return true;
      if (esTablaInexistente(error)) return false;
      if (esRespuestaDeLaBase(error)) return true;   // existe: respondió con otro rechazo (permiso, RLS…)
      cache.delete(nombre);
      return false;
    } catch {
      cache.delete(nombre);
      return false;
    }
  })();
  cache.set(nombre, consulta);
  return consulta;
}

/** R1 aplicado: entes y perfiles de proveedores. */
export async function r1Disponible(): Promise<boolean> {
  const [entes, perfiles] = await Promise.all([tablaDisponible('retencion_entes'), tablaDisponible('retencion_contraparte_perfiles')]);
  return entes && perfiles;
}

/** Olvida lo preguntado (al cambiar de sesión, o en las pruebas). */
export function olvidarDisponibilidad(): void {
  cache.clear();
}
