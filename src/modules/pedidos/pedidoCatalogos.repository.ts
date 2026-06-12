/* ============================================================
   Golden Touch · Pedidos · Catálogo gestionable de la OP
   Clasificaciones del pedido y unidades solicitantes, con activar/
   desactivar/editar/eliminar (mismo patrón que el catálogo de acopio).
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';

export type TipoCatalogoPedido = 'clasificacion' | 'unidad_solicitante';

export interface CatalogoPedido {
  id: string;
  tipo: TipoCatalogoPedido;
  valor: string;
  /** Solo para 'unidad_solicitante': la clasificación de la OP asociada (categoría). */
  categoria: string | null;
  activo: boolean;
  orden: number;
  created_at: string;
}

const TABLE = 'pedido_catalogos';

export async function listCatalogosPedido(tipo?: TipoCatalogoPedido): Promise<CatalogoPedido[]> {
  let q = supabase.from(TABLE).select('*')
    .order('orden', { ascending: true })
    .order('valor', { ascending: true });
  if (tipo) q = q.eq('tipo', tipo);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CatalogoPedido[];
}

/** Solo los valores ACTIVOS de un tipo (para los selectores del formulario). */
export async function listActivosPedido(tipo: TipoCatalogoPedido): Promise<string[]> {
  const rows = await listCatalogosPedido(tipo);
  return rows.filter((r) => r.activo).map((r) => r.valor);
}

export async function addCatalogoPedido(tipo: TipoCatalogoPedido, valor: string, categoria?: string | null): Promise<CatalogoPedido> {
  const v = valor.trim();
  if (!v) throw new Error('Indicá el valor.');
  const cat = categoria?.trim() || null;
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ tipo, valor: v, categoria: cat, orden: 999 })
    .select('*')
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Ese valor ya existe en el catálogo.');
    throw error;
  }
  return data as CatalogoPedido;
}

export async function updateCatalogoPedido(id: string, valor: string, categoria?: string | null): Promise<void> {
  const v = valor.trim();
  if (!v) throw new Error('Indicá el valor.');
  // Si `categoria` no se pasa (undefined), no se toca la columna; null/'' la limpia.
  const patch: { valor: string; categoria?: string | null } = { valor: v };
  if (categoria !== undefined) patch.categoria = categoria?.trim() || null;
  const { error } = await supabase.from(TABLE).update(patch).eq('id', id);
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Ese valor ya existe en el catálogo.');
    throw error;
  }
}

export async function setCatalogoPedidoActivo(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from(TABLE).update({ activo }).eq('id', id);
  if (error) throw error;
}

export async function eliminarCatalogoPedido(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}
