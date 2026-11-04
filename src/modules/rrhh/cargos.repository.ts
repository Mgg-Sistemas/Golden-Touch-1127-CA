/* ============================================================
   Golden Touch · RRHH · Historial de cargos (base) — 04/11/2026
   Ver cargos.ts y supabase/2026-11-04-rrhh-historial-de-cargos.sql.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { PersonalCargo } from './cargos';

const TABLE = 'personal_cargos';

function mensaje(error: { message?: string } | null): string {
  const m = String(error?.message ?? '').trim();
  if (/permission denied|row-level security/i.test(m)) return 'No tienes permiso para cambiar cargos en RRHH.';
  return m || 'No se pudo registrar el cambio de cargo.';
}

/** El historial de una persona, del cambio más nuevo al más viejo. */
export async function listHistorialCargo(personalId: string): Promise<PersonalCargo[]> {
  const { data, error } = await supabase.from(TABLE).select('*').eq('personal_id', personalId)
    .order('fecha', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw new Error(mensaje(error));
  return (data ?? []) as PersonalCargo[];
}

/** Todos los cambios de cargo del personal (para «🔁 Histórico de cargos», como en MGG). */
export async function listTodosCambiosCargo(): Promise<PersonalCargo[]> {
  const { data, error } = await supabase.from(TABLE).select('*')
    .order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(5000);
  if (error) throw new Error(mensaje(error));
  return (data ?? []) as PersonalCargo[];
}

/** Cambia el cargo (y el departamento, si se indica) y deja el renglón con su motivo. */
export async function cambiarCargo(input: {
  personalId: string; cargoNuevo: string; motivo: string; fecha?: string | null;
  departamentoNuevo?: string | null; nota?: string | null; actorName?: string | null;
}): Promise<PersonalCargo> {
  const { data, error } = await supabase.rpc('cambiar_cargo', {
    p_personal_id: input.personalId,
    p_cargo_nuevo: input.cargoNuevo.trim().toUpperCase(),
    p_motivo: input.motivo.trim(),
    p_fecha: input.fecha || null,
    p_departamento_nuevo: input.departamentoNuevo?.trim() || null,
    p_nota: input.nota?.trim() || null,
    p_actor_name: input.actorName?.trim() || null,
  });
  if (error) throw new Error(mensaje(error));
  return data as PersonalCargo;
}

/** Borra un renglón del historial (solo administrador): no cambia el cargo de hoy. */
export async function borrarRenglonCargo(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw new Error(mensaje(error));
}
