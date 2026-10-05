/* ============================================================
   Golden Touch · Inventario · Presentaciones de compra (Supabase)
   Tabla `producto_presentaciones`: en qué otra unidad se compra un producto
   y cuántas unidades de uso trae (ver `presentaciones.ts`).
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { Presentacion } from './presentaciones';

const TABLE = 'producto_presentaciones';
const COLS = 'id, producto_id, proveedor_id, unidad, factor';

const norm = (r: Presentacion): Presentacion => ({ ...r, factor: Number(r.factor) });

/** Presentaciones de varios productos (o de todos si no se pasan ids). */
export async function listPresentaciones(productoIds?: string[]): Promise<Presentacion[]> {
  let q = supabase.from(TABLE).select(COLS).order('unidad');
  if (productoIds) {
    const ids = [...new Set(productoIds.filter(Boolean))];
    if (!ids.length) return [];
    q = q.in('producto_id', ids);
  }
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as Presentacion[]).map(norm);
}

export async function crearPresentacion(
  input: { producto_id: string; proveedor_id: string | null; unidad: string; factor: number },
  actorEmail: string | null,
): Promise<Presentacion> {
  const unidad = input.unidad.trim();
  const factor = Number(input.factor);
  if (!unidad) throw new Error('Indica la unidad en que se compra (SACO, CAJA…).');
  if (!(factor > 0)) throw new Error('Indica cuántas unidades de uso trae (mayor que 0).');
  const { data, error } = await supabase.from(TABLE)
    .insert({ producto_id: input.producto_id, proveedor_id: input.proveedor_id, unidad, factor, created_by: actorEmail })
    .select(COLS).single();
  if (error) {
    if (error.code === '23505') throw new Error(`Ya existe la presentación ${unidad} para ${input.proveedor_id ? 'ese proveedor' : 'todos los proveedores'}.`);
    throw error;
  }
  return norm(data as Presentacion);
}

export async function actualizarFactorPresentacion(id: string, factor: number): Promise<void> {
  if (!(Number(factor) > 0)) throw new Error('El factor debe ser mayor que 0.');
  const { error } = await supabase.from(TABLE).update({ factor: Number(factor) }).eq('id', id);
  if (error) throw error;
}

/** Quitar una presentación no toca las OC ya hechas: cada renglón guarda su propio factor. */
export async function quitarPresentacion(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}
