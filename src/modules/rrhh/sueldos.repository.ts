/* ============================================================
   Golden Touch · RRHH · Historial de sueldos

   El sueldo NO se escribe nunca a mano sobre la ficha: todo pasa por la
   función `cambiar_sueldo` de la base, que en una sola operación mueve la
   ficha y escribe el renglón del histórico con su motivo. Si falla algo,
   no queda ni el cambio a medias ni un renglón huérfano.

   Y por si alguien mueve el sueldo por otro camino (una consulta suelta, una
   carga masiva, un cambio futuro que se olvide de la regla), en la base hay un
   disparador que igual escribe el renglón, marcado como sin motivo: en el
   histórico se ve el hueco en vez de desaparecer el cambio.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { PersonalSueldo } from '@/shared/lib/types';

const TABLE = 'personal_sueldos';

/** El histórico de una persona, del cambio más nuevo al más viejo. */
export async function listHistorialSueldo(personalId: string): Promise<PersonalSueldo[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('personal_id', personalId)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PersonalSueldo[];
}

export interface CambioSueldoInput {
  personalId: string;
  sueldoNuevo: number;
  motivo: string;
  /** Desde cuándo rige. Vacío = hoy. */
  fecha?: string | null;
  nota?: string | null;
}

/** Cambia el sueldo y deja el renglón en el histórico. Devuelve el renglón. */
export async function cambiarSueldo(input: CambioSueldoInput): Promise<PersonalSueldo> {
  const { data, error } = await supabase.rpc('cambiar_sueldo', {
    p_personal_id: input.personalId,
    p_sueldo_nuevo: Math.round((Number(input.sueldoNuevo) || 0) * 100) / 100,
    p_motivo: String(input.motivo ?? '').trim(),
    p_fecha: input.fecha || null,
    p_nota: input.nota?.trim() || null,
  });
  if (error) throw new Error(mensaje(error));
  return data as PersonalSueldo;
}

/**
 * Registra un sueldo VIEJO (anterior al vigente) sin tocar el sueldo de la
 * ficha: sirve para cargar el historial que se tenía en Excel.
 */
export async function registrarSueldoHistorico(input: {
  personalId: string; fecha: string; sueldo: number; motivo: string; nota?: string | null;
}): Promise<PersonalSueldo> {
  const { data, error } = await supabase.rpc('registrar_sueldo_historico', {
    p_personal_id: input.personalId,
    p_fecha: input.fecha,
    p_sueldo: Math.round((Number(input.sueldo) || 0) * 100) / 100,
    p_motivo: String(input.motivo ?? '').trim(),
    p_nota: input.nota?.trim() || null,
  });
  if (error) throw new Error(mensaje(error));
  return data as PersonalSueldo;
}

/** Carga en lote (todo o nada). Devuelve cuántos sueldos entraron. */
export async function cargarSueldosHistoricos(filas: Array<{
  fila: number; personalId: string; fecha: string; sueldo: number; motivo: string; nota?: string | null;
}>): Promise<number> {
  const { data, error } = await supabase.rpc('cargar_sueldos_historicos', {
    p_filas: filas.map((f) => ({
      fila: f.fila, personal_id: f.personalId, fecha: f.fecha,
      sueldo: Math.round(f.sueldo * 100) / 100, motivo: f.motivo, nota: f.nota?.trim() || null,
    })),
  });
  if (error) throw new Error(mensaje(error));
  return Number(data) || 0;
}

/**
 * Borra un renglón del histórico. Solo admin, y es para deshacer una carga
 * equivocada: no existe "editar" a propósito, porque un histórico que se puede
 * retocar no sirve como histórico.
 */
export async function borrarRenglonSueldo(id: string): Promise<void> {
  const { data, error } = await supabase.from(TABLE).delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('No se pudo borrar ese renglón: hace falta ser administrador.');
  }
}

/** Los mensajes de Postgres no le dicen nada a nadie; los de la función sí. */
function mensaje(error: { message?: string; hint?: string }): string {
  const m = String(error?.message ?? '').trim();
  if (!m) return 'No se pudo registrar el cambio de sueldo.';
  // Las excepciones que levanta `cambiar_sueldo` ya vienen escritas para leer.
  if (/motivo|negativo|mismo que ya tenía|no se encontró|fecha|Fila d+|permiso|No hay filas/i.test(m)) return m;
  if (/permission denied|row-level security/i.test(m)) {
    return 'No tienes permiso para cambiar sueldos en RRHH.';
  }
  return m;
}
