/* ============================================================
   Golden Touch · RRHH · Descansos por rotación (datos)

   rrhh_descansos        → un descanso de una persona (desde / hasta).
                           origen 'plan' = lo armó el generador; 'manual' = cargado a mano.
                           La base no deja que una persona tenga dos descansos cruzados.
   rrhh_descansos_config → días de trabajo, días de descanso y tope de personas
                           fuera a la vez, uno por nómina (GT / MTO). Guarda también la
                           SELECCIÓN de trabajadores para el próximo «Generar plan».
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { EmpresaRrhh } from '@/shared/lib/types';
import { CONFIG_POR_DEFECTO, type ConfigDescansos, type DescansoRango } from './descansosPlan';

export interface Descanso extends DescansoRango {
  id: string;
  origen: 'plan' | 'manual';
  nota?: string | null;
  created_at: string;
  created_by?: string | null;
  actor_name?: string | null;
  updated_at?: string | null;
}

const TABLA = 'rrhh_descansos';
const TABLA_CFG = 'rrhh_descansos_config';

/** Descansos de esas personas (todas las fechas). */
export async function listDescansos(personalIds: string[]): Promise<Descanso[]> {
  if (!personalIds.length) return [];
  const out: Descanso[] = [];
  // En tandas: una lista larga de ids en la URL puede pasarse del límite.
  for (let i = 0; i < personalIds.length; i += 150) {
    const { data, error } = await supabase.from(TABLA).select('*')
      .in('personal_id', personalIds.slice(i, i + 150)).order('desde');
    if (error) throw error;
    out.push(...((data ?? []) as Descanso[]));
  }
  return out;
}

export async function getConfigDescansos(empresa: EmpresaRrhh): Promise<ConfigDescansos> {
  const { data, error } = await supabase.from(TABLA_CFG).select('dias_trabajo, dias_descanso, max_simultaneos')
    .eq('empresa', empresa).maybeSingle();
  if (error) throw error;
  return (data as ConfigDescansos | null) ?? CONFIG_POR_DEFECTO;
}

export async function guardarConfigDescansos(empresa: EmpresaRrhh, cfg: ConfigDescansos, actor: string): Promise<void> {
  const { error } = await supabase.from(TABLA_CFG)
    .upsert({ empresa, ...cfg, updated_at: new Date().toISOString(), updated_by: actor }, { onConflict: 'empresa' });
  if (error) throw error;
}

/** Selección guardada para el próximo «Generar plan» (ids de personal), por nómina. */
export interface SeleccionPlanGuardada { ids: string[]; en: string | null; por: string | null }

export async function getSeleccionPlan(empresa: EmpresaRrhh): Promise<SeleccionPlanGuardada> {
  const { data, error } = await supabase.from(TABLA_CFG).select('seleccion_plan, seleccion_plan_en, seleccion_plan_por')
    .eq('empresa', empresa).maybeSingle();
  if (error) throw error;
  const row = data as { seleccion_plan?: unknown; seleccion_plan_en?: string | null; seleccion_plan_por?: string | null } | null;
  const ids = Array.isArray(row?.seleccion_plan) ? (row!.seleccion_plan as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  return { ids, en: row?.seleccion_plan_en ?? null, por: row?.seleccion_plan_por ?? null };
}

/** Guarda (o limpia, con []) la selección para el próximo plan. No toca la rotación. */
export async function guardarSeleccionPlan(empresa: EmpresaRrhh, ids: string[], actor: string): Promise<void> {
  const { error } = await supabase.from(TABLA_CFG)
    .upsert({ empresa, seleccion_plan: ids, seleccion_plan_en: new Date().toISOString(), seleccion_plan_por: actor }, { onConflict: 'empresa' });
  if (error) throw error;
}

function mensaje(e: { message?: string } | null): Error {
  return new Error(e?.message || 'No se pudo guardar el descanso');
}

export async function crearDescanso(
  d: { personal_id: string; desde: string; hasta: string; nota?: string | null },
  actor: string, actorName: string | null,
): Promise<void> {
  const { error } = await supabase.from(TABLA).insert({
    ...d, nota: d.nota?.trim() || null, origen: 'manual', created_by: actor, actor_name: actorName,
  });
  if (error) throw mensaje(error);
}

/** Editar a mano un descanso lo vuelve 'manual': el generador ya no lo pisa. */
export async function editarDescanso(id: string, cambios: { desde: string; hasta: string; nota?: string | null }): Promise<void> {
  const { error } = await supabase.from(TABLA)
    .update({ ...cambios, nota: cambios.nota?.trim() || null, origen: 'manual' }).eq('id', id);
  if (error) throw mensaje(error);
}

export async function eliminarDescanso(id: string): Promise<void> {
  const { error } = await supabase.from(TABLA).delete().eq('id', id);
  if (error) throw error;
}

/**
 * Reemplaza el plan: borra los descansos 'plan' de esas personas desde `desde`
 * y guarda los nuevos, todo junto (si algo falla, queda el plan anterior).
 */
export async function aplicarPlanDescansos(
  personalIds: string[], desde: string, filas: DescansoRango[], actor: string, actorName: string | null,
): Promise<number> {
  const { data, error } = await supabase.rpc('rrhh_descansos_aplicar_plan', {
    p_personal_ids: personalIds, p_desde: desde, p_filas: filas, p_actor: actor, p_actor_name: actorName,
  });
  if (error) throw mensaje(error);
  return Number(data) || 0;
}
