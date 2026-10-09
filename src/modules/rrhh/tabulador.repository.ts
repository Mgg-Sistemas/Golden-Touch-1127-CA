/* ============================================================
   Golden Touch · RRHH · Tabulador de sueldos por cargo (base)

   Toda escritura pasa por funciones de la base:
     · `tabulador_guardar` / `tabulador_borrar`: alta, cambio y baja de un
       cargo; un disparador deja el renglón en `rrhh_tabulador_historial`
       con el motivo que se indique.
     · `aplicar_tabulador`: iguala el sueldo de los activos al de su cargo y
       escribe cada cambio en el histórico salarial (`personal_sueldos`),
       todo en una transacción.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { EmpresaRrhh } from '@/shared/lib/types';
import type { FilaHistorialSalarial, TabuladorCargo, TabuladorHistorial } from './tabulador';

export async function listTabulador(empresa: EmpresaRrhh): Promise<TabuladorCargo[]> {
  const { data, error } = await supabase
    .from('rrhh_tabulador')
    .select('*')
    .eq('empresa', empresa)
    .order('cargo', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as TabuladorCargo[]).map((t) => ({ ...t, monto: Number(t.monto) || 0 }));
}

export async function listHistorialTabulador(empresa: EmpresaRrhh): Promise<TabuladorHistorial[]> {
  const { data, error } = await supabase
    .from('rrhh_tabulador_historial')
    .select('*')
    .eq('empresa', empresa)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as TabuladorHistorial[];
}

export interface GuardarTabuladorInput {
  id?: string | null;
  empresa: EmpresaRrhh;
  cargo: string;
  monto: number;
  motivo?: string | null;
  nota?: string | null;
}

export async function guardarTabulador(input: GuardarTabuladorInput): Promise<TabuladorCargo> {
  const { data, error } = await supabase.rpc('tabulador_guardar', {
    p_id: input.id ?? null,
    p_empresa: input.empresa,
    p_cargo: input.cargo.trim(),
    p_monto: Math.round((Number(input.monto) || 0) * 100) / 100,
    p_motivo: input.motivo?.trim() || null,
    p_nota: input.nota?.trim() || null,
  });
  if (error) throw new Error(mensaje(error, 'No se pudo guardar el cargo.'));
  return data as TabuladorCargo;
}

export async function borrarTabulador(id: string, motivo?: string | null): Promise<void> {
  const { error } = await supabase.rpc('tabulador_borrar', { p_id: id, p_motivo: motivo?.trim() || null });
  if (error) throw new Error(mensaje(error, 'No se pudo borrar el cargo.'));
}

export interface ResultadoAplicar { personal_id: string; sueldo_anterior: number; sueldo_nuevo: number }

/** Aplica el tabulador a las personas indicadas (las de la vista previa). */
export async function aplicarTabulador(
  empresa: EmpresaRrhh, personalIds: string[], fecha?: string | null, motivo?: string | null,
): Promise<ResultadoAplicar[]> {
  const { data, error } = await supabase.rpc('aplicar_tabulador', {
    p_empresa: empresa,
    p_personal_ids: personalIds,
    p_fecha: fecha || null,
    p_motivo: motivo?.trim() || null,
  });
  if (error) throw new Error(mensaje(error, 'No se pudo aplicar el tabulador.'));
  return (data ?? []) as ResultadoAplicar[];
}

/**
 * El histórico salarial de todos (o de una nómina), con los datos de cada
 * persona, filtrado por la fecha desde la que rige cada cambio.
 */
export async function listHistorialSalarial(filtro: {
  empresa?: EmpresaRrhh | 'todas'; desde?: string | null; hasta?: string | null; personalId?: string | null;
}): Promise<FilaHistorialSalarial[]> {
  let q = supabase
    .from('personal_sueldos')
    .select('*, persona:personal!inner(id, nombre, apellido, cedula, cargo, empresa, ficha_nro, activo)')
    .order('fecha', { ascending: true })
    .order('created_at', { ascending: true });
  if (filtro.empresa && filtro.empresa !== 'todas') q = q.eq('persona.empresa', filtro.empresa);
  if (filtro.personalId) q = q.eq('personal_id', filtro.personalId);
  if (filtro.desde) q = q.gte('fecha', filtro.desde);
  if (filtro.hasta) q = q.lte('fecha', filtro.hasta);
  const { data, error } = await q.limit(5000);
  if (error) throw error;
  return (data ?? []) as unknown as FilaHistorialSalarial[];
}

function mensaje(error: { message?: string }, porDefecto: string): string {
  const m = String(error?.message ?? '').trim();
  if (!m) return porDefecto;
  if (/permission denied|row-level security/i.test(m)) return 'No tienes permiso para modificar el tabulador de RRHH.';
  return m;
}
