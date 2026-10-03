/* ============================================================
   Golden Touch · Geodesta · Actividades planificadas (Supabase)
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { EstadoPlan, PlanificacionGeodesta } from '@/shared/lib/types';
import { componerBusqPlan, type BorradorPlan } from './planModelo';

const TABLE = 'geodesta_planificacion';

const textoONull = (s: string | null | undefined) => {
  const t = (s ?? '').trim();
  return t ? t : null;
};

/**
 * Traduce el borrador a las columnas exactas de la tabla. Exportada para
 * poder probarla sin tocar la red.
 */
export function filaPlanAGuardar(b: BorradorPlan): Record<string, unknown> {
  return {
    titulo: b.titulo.trim(),
    desde: b.desde,
    hasta: b.hasta,
    lugar: textoONull(b.lugar),
    nota: textoONull(b.nota),
    estado: b.estado,
    estado_nota: textoONull(b.estado_nota),
    busq: componerBusqPlan(b),
  };
}

/** Todo, lo más reciente primero: lo usan el tablero y el buscador. */
export async function listPlanificacion(): Promise<PlanificacionGeodesta[]> {
  const { data, error } = await supabase
    .from(TABLE).select('*').order('desde', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PlanificacionGeodesta[];
}

/**
 * Lo que TOCA el mes, no solo lo que empieza en él: dos rangos se cruzan
 * cuando uno empieza antes de que el otro termine y viceversa. Con
 * `.gte('desde', ini)` se perderían las que vienen del mes anterior.
 */
export async function listPlanDelMes(ini: string, fin: string): Promise<PlanificacionGeodesta[]> {
  const { data, error } = await supabase
    .from(TABLE).select('*')
    .lte('desde', fin).gte('hasta', ini)
    .order('desde', { ascending: true });
  if (error) throw error;
  return (data ?? []) as PlanificacionGeodesta[];
}

export async function crearPlan(b: BorradorPlan, actor: string): Promise<PlanificacionGeodesta> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...filaPlanAGuardar(b), creado_por: actor })
    .select('*').single();
  if (error) throw error;
  return data as PlanificacionGeodesta;
}

export async function actualizarPlan(id: string, b: BorradorPlan, actor: string): Promise<PlanificacionGeodesta> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...filaPlanAGuardar(b), modificado_por: actor, modificado_en: new Date().toISOString() })
    .eq('id', id)
    .select('*').single();
  if (error) throw error;
  return data as PlanificacionGeodesta;
}

/** Atajo del tablero: cambia solo el estado y su nota, no pisa el resto de la fila. */
export async function marcarPlan(
  id: string, estado: EstadoPlan, nota: string, actor: string,
): Promise<PlanificacionGeodesta> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      estado,
      estado_nota: textoONull(nota),
      modificado_por: actor,
      modificado_en: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*').single();
  if (error) throw error;
  return data as PlanificacionGeodesta;
}

export async function borrarPlan(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

/** Lugares distintos ya cargados, ordenados: alimentan las sugerencias del editor. */
export async function lugaresUsados(): Promise<string[]> {
  const { data, error } = await supabase.from(TABLE).select('lugar').not('lugar', 'is', null);
  if (error) throw error;
  const lugares = (data ?? []).map((r) => (r as { lugar: string | null }).lugar);
  return [...new Set(lugares.filter((l): l is string => !!l))].sort((a, b) => a.localeCompare(b, 'es'));
}
