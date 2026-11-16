import { supabase } from '@/shared/lib/supabase';
import type { Movimiento } from '@/shared/lib/types';

export type TipoPapeleraInventario = 'almacen' | 'presentacion';
export interface RegistroPapeleraInventario {
  id: string;
  tipo: TipoPapeleraInventario;
  nombre: string;
}

export function esMovimientoInventarioReversible(m: Movimiento): boolean {
  return m.ref_tipo === 'manual' && ['entrada', 'salida', 'ajuste'].includes(m.tipo)
    && !m.ref_id && !m.revertido_en && !m.reverso_de_id
    && Number(m.delta) !== 0
    && (m.costo_antes != null || (Number(m.delta) < 0 && Number(m.stock_despues) > 0 && m.costo_promedio != null));
}

export async function revertirMovimientoInventario(m: Movimiento, motivo: string): Promise<void> {
  const razon = motivo.trim();
  if (!razon) throw new Error('Indica el motivo del reverso.');
  if (!esMovimientoInventarioReversible(m)) throw new Error('Este movimiento se corrige desde su operación de origen.');
  const { data, error } = await supabase.rpc('inventario_revertir_movimiento_manual', { p_movimiento: m.id, p_motivo: razon });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('No se registró el reverso.');
}

export async function cambiarPapeleraInventario(
  tipo: TipoPapeleraInventario, ids: readonly string[], accion: 'enviar' | 'restaurar' | 'vaciar',
): Promise<number> {
  if (!ids.length) return 0;
  const { data, error } = await supabase.rpc('inventario_papelera_cambiar', { p_tipo: tipo, p_ids: ids, p_accion: accion });
  if (error) throw new Error(error.message);
  const n = Number(data) || 0;
  if (accion !== 'vaciar' && n !== ids.length) throw new Error('El registro ya cambió. Actualiza la lista.');
  return n;
}

export async function listPapeleraInventario(): Promise<RegistroPapeleraInventario[]> {
  const { data, error } = await supabase.rpc('inventario_papelera_listar');
  if (error) throw new Error(error.message);
  return (data ?? []) as RegistroPapeleraInventario[];
}
