import { supabase } from '@/shared/lib/supabase';
import type { MovimientoCaja } from '@/shared/lib/types';

export type TipoPapeleraTesoreria = 'categoria' | 'contraparte';
export interface RegistroPapeleraTesoreria {
  id: string;
  nombre: string;
  tipo: TipoPapeleraTesoreria;
}
const categoriasManuales = new Set(['gasto', 'ingreso', 'ajuste']);

export function esAsientoDeReverso(m: MovimientoCaja): boolean {
  return Boolean(m.revertido_en || m.reverso_de_id);
}

export function puedeRevertirMovimiento(m: MovimientoCaja): boolean {
  return !esAsientoDeReverso(m) && ['salida', 'ingreso', 'ajuste'].includes(m.tipo)
    && (!m.categoria || categoriasManuales.has(m.categoria))
    && !m.cierre_id && !m.ref_caja_id && !m.ref_orden_id && !m.ref_nomina_renglon_id && !m.ref_venta_id
    && !m.estado_mineral && !m.mineral_mov_id && !m.reflejar_acopio
    && Number(m.saldo_antes) !== Number(m.saldo_despues);
}

export async function revertirMovimiento(m: MovimientoCaja, motivo: string): Promise<void> {
  if (!puedeRevertirMovimiento(m)) throw new Error('Este movimiento requiere una corrección desde su operación de origen.');
  const razon = motivo.trim();
  if (!razon) throw new Error('Indica por qué se revierte el movimiento.');
  const { data, error } = await supabase.rpc('tesoreria_revertir_movimiento', { p_movimiento: m.id, p_motivo: razon });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('No se registró el reverso.');
}

export async function cambiarPapeleraTesoreria(
  tipo: TipoPapeleraTesoreria, ids: readonly string[], accion: 'enviar' | 'restaurar' | 'vaciar',
): Promise<number> {
  if (!ids.length) return 0;
  const { data, error } = await supabase.rpc('tesoreria_papelera_cambiar', {
    p_tipo: tipo, p_ids: ids, p_accion: accion,
  });
  if (error) throw new Error(error.message);
  const n = Number(data) || 0;
  if (accion !== 'vaciar' && n !== ids.length) throw new Error('El registro ya cambió. Actualiza la lista.');
  return n;
}

export async function listPapeleraTesoreria(): Promise<RegistroPapeleraTesoreria[]> {
  const [cats, contrapartes] = await Promise.all([
    supabase.from('categorias_gasto').select('id, nombre').not('eliminado_en', 'is', null).is('purgado_en', null).order('nombre'),
    supabase.from('tesoreria_contrapartes').select('id, nombre').not('eliminado_en', 'is', null).is('purgado_en', null).order('nombre'),
  ]);
  if (cats.error || contrapartes.error) throw new Error(cats.error?.message ?? contrapartes.error?.message);
  return [
    ...(cats.data ?? []).map((r): RegistroPapeleraTesoreria => ({ ...r, tipo: 'categoria' })),
    ...(contrapartes.data ?? []).map((r): RegistroPapeleraTesoreria => ({ ...r, tipo: 'contraparte' })),
  ];
}
