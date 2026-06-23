/* ============================================================
   Golden Touch · Inventario · Repository (Supabase)
   Acceso a `productos`. Las mutaciones de `stock` se hacen
   exclusivamente desde `movimientos.repository.ts` (kardex).
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { EstadoGenerico, Orden, Producto, RecetaFundicion } from '@/shared/lib/types';

export interface ProductoInput {
  sku: string;
  nombre: string;
  categoria: string;
  unidad: string;
  stock: number;
  stock_min: number;
  precio: number;
  almacen: string;
  estado: EstadoGenerico;
  restock_pct?: number | null;
  receta_fundicion?: RecetaFundicion | null;
  precio_venta?: number | null;
  es_receta?: boolean;
  es_producible?: boolean;
  // Detalle del producto (opcional).
  nombre_busqueda?: string | null;
  marca?: string | null;
  modelo?: string | null;
  serial?: string | null;
  codigo?: string | null;
  numero?: string | null;
  descripcion?: string | null;
  ubicacion?: string | null;
}

export const CATEGORIAS_DEFAULT = [
  'Explosivos',
  'EPP',
  'Herramientas',
  'Maquinaria',
  'Lubricantes',
  'Reactivos',
  'Repuestos',
  'Logística',
] as const;
// Alias para retro-compatibilidad con código que importaba CATEGORIAS.
export const CATEGORIAS = CATEGORIAS_DEFAULT;

export const UNIDADES_DEFAULT = ['und', 'kg', 'l', 'm', 'par', 'saco', 'tambor', 'caja'] as const;
export const UNIDADES = UNIDADES_DEFAULT;

/* ─────────────── SKU automático e incremental ───────────────
   El SKU es <PREFIJO>-<NNN>. El prefijo se hereda de los productos
   que ya existen en esa categoría (lo que "se viene manejando":
   LUB-, EXP-, MAQ-…); si la categoría es nueva se deriva de su
   nombre (3 letras). El número es correlativo por prefijo. */

/** Deriva el prefijo de SKU de una categoría: reutiliza el prefijo más usado
 *  entre los productos existentes de esa categoría; si no hay, lo arma con las
 *  primeras 3 letras del nombre de la categoría. */
export function prefijoCategoria(categoria: string, productos: Producto[] = []): string {
  const counts = new Map<string, number>();
  productos
    .filter((p) => p.categoria === categoria && p.sku)
    .forEach((p) => {
      const m = String(p.sku).match(/^([A-Za-z]+)/);
      if (m) {
        const pre = m[1].toUpperCase();
        counts.set(pre, (counts.get(pre) ?? 0) + 1);
      }
    });
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top) return top[0];
  const norm = categoria
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase();
  return norm.slice(0, 3) || 'GEN';
}

/** Siguiente SKU correlativo para la categoría dada (p.ej. "LUB-003"),
 *  tomando el mayor número ya existente para ese prefijo + 1. */
export function siguienteSku(categoria: string, productos: Producto[] = []): string {
  const prefijo = prefijoCategoria(categoria, productos);
  const re = new RegExp(`^${prefijo}[-_]?(\\d+)$`, 'i');
  let max = 0;
  productos.forEach((p) => {
    const m = String(p.sku ?? '').match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return `${prefijo}-${String(max + 1).padStart(3, '0')}`;
}

/* Catálogos compartidos: persistidos en Supabase (tabla `taxonomias`) +
   valores ya presentes en productos (por compatibilidad con datos legados). */
import { addTaxonomia, deleteTaxonomia, listTaxonomia, renameTaxonomia } from '@/shared/lib/taxonomias';

export async function getCategorias(fromProductos: Producto[] = []): Promise<string[]> {
  const set = new Set<string>();
  try {
    const extras = await listTaxonomia('inventario.categoria');
    extras.forEach((c) => set.add(c));
  } catch { /* falla silenciosa */ }
  fromProductos.forEach((p) => p.categoria && set.add(p.categoria));
  // Defaults de respaldo sólo si la lectura del catálogo falló completamente.
  if (set.size === 0) CATEGORIAS_DEFAULT.forEach((c) => set.add(c));
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
}

export async function addCategoria(nombre: string, actorEmail?: string): Promise<string | null> {
  return addTaxonomia('inventario.categoria', nombre, actorEmail);
}

/**
 * Renombra una categoría de inventario en cascada:
 *  · Actualiza la fila de `taxonomias` (insert nuevo + delete viejo).
 *  · Re-etiqueta todos los `productos.categoria` que tenían el valor anterior.
 *  Devuelve la cantidad de productos afectados.
 */
export async function renombrarCategoria(oldNombre: string, newNombre: string, actorEmail?: string): Promise<number> {
  const oldClean = oldNombre.trim();
  const newClean = newNombre.trim();
  if (!oldClean || !newClean) throw new Error('Nombres vacíos');
  if (oldClean === newClean) return 0;

  await renameTaxonomia('inventario.categoria', oldClean, newClean, actorEmail);

  const { data, error } = await supabase
    .from('productos')
    .update({ categoria: newClean })
    .eq('categoria', oldClean)
    .select('id');
  if (error) throw error;
  return (data ?? []).length;
}

export async function eliminarCategoria(nombre: string): Promise<void> {
  const { count, error } = await supabase
    .from('productos')
    .select('id', { count: 'exact', head: true })
    .eq('categoria', nombre);
  if (error) throw error;
  if ((count ?? 0) > 0) throw new Error(`No se puede eliminar: ${count} producto(s) usan esta categoría`);
  await deleteTaxonomia('inventario.categoria', nombre);
}

export async function getUnidades(fromProductos: Producto[] = []): Promise<string[]> {
  // Deduplicamos SIN distinguir mayúsculas/minúsculas (evita el doble «kg»/«Kg»).
  // La primera grafía que aparece (catálogo > productos) gana como canónica.
  const porClave = new Map<string, string>();
  const agregar = (u?: string | null) => {
    const v = (u ?? '').trim();
    if (!v) return;
    const k = v.toLowerCase();
    if (!porClave.has(k)) porClave.set(k, v);
  };
  try {
    const extras = await listTaxonomia('inventario.unidad');
    extras.forEach(agregar);
  } catch { /* falla silenciosa */ }
  fromProductos.forEach((p) => agregar(p.unidad));
  if (porClave.size === 0) UNIDADES_DEFAULT.forEach(agregar);
  return Array.from(porClave.values()).sort((a, b) => a.localeCompare(b, 'es'));
}

export async function addUnidad(nombre: string, actorEmail?: string): Promise<string | null> {
  return addTaxonomia('inventario.unidad', nombre, actorEmail);
}

export async function renombrarUnidad(oldNombre: string, newNombre: string, actorEmail?: string): Promise<number> {
  const oldClean = oldNombre.trim();
  const newClean = newNombre.trim();
  if (!oldClean || !newClean) throw new Error('Nombres vacíos');
  if (oldClean === newClean) return 0;
  await renameTaxonomia('inventario.unidad', oldClean, newClean, actorEmail);
  const { data, error } = await supabase
    .from('productos')
    .update({ unidad: newClean })
    .eq('unidad', oldClean)
    .select('id');
  if (error) throw error;
  return (data ?? []).length;
}

export async function contarProductosPorCategoria(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('productos').select('categoria');
  if (error) throw error;
  return (data ?? []).reduce<Record<string, number>>((acc, row) => {
    const c = (row as { categoria: string }).categoria;
    if (c) acc[c] = (acc[c] ?? 0) + 1;
    return acc;
  }, {});
}

/** Conteo de productos por unidad (para el gestor de Medidas). */
export async function contarProductosPorUnidad(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('productos').select('unidad');
  if (error) throw error;
  return (data ?? []).reduce<Record<string, number>>((acc, row) => {
    const u = (row as { unidad: string }).unidad;
    if (u) acc[u] = (acc[u] ?? 0) + 1;
    return acc;
  }, {});
}

/** Elimina una medida del catálogo. SOLO si ningún producto la usa. */
export async function eliminarUnidad(nombre: string): Promise<void> {
  const { count, error } = await supabase
    .from('productos')
    .select('id', { count: 'exact', head: true })
    .eq('unidad', nombre);
  if (error) throw error;
  if ((count ?? 0) > 0) throw new Error(`No se puede eliminar: ${count} producto(s) usan esta medida`);
  await deleteTaxonomia('inventario.unidad', nombre);
}

export async function listProductos(): Promise<Producto[]> {
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .order('nombre', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Producto[];
}

export async function findProducto(id: string): Promise<Producto | null> {
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Producto | null;
}

export async function findBySku(sku: string): Promise<Producto | null> {
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .eq('sku', sku)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Producto | null;
}

export async function createProducto(input: ProductoInput): Promise<Producto> {
  const { data, error } = await supabase
    .from('productos')
    .insert(input)
    .select('*')
    .single();
  if (error) throw error;
  return data as Producto;
}

export async function updateProducto(
  id: string,
  patch: Partial<ProductoInput>,
): Promise<Producto> {
  const { data, error } = await supabase
    .from('productos')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Producto;
}

export async function setEstadoProducto(
  id: string,
  estado: EstadoGenerico,
): Promise<Producto> {
  return updateProducto(id, { estado });
}

/**
 * Mutación directa de stock — uso restringido a `movimientos.repository.ts`.
 * El resto del código debe pasar SIEMPRE por `registrarMovimiento` para
 * mantener el kardex sincronizado.
 */
export async function _setStockRaw(id: string, nuevoStock: number): Promise<void> {
  const { error } = await supabase
    .from('productos')
    .update({ stock: nuevoStock })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Recepciones finalizadas: órdenes ya cerradas (estado 'finalizada').
 * Se muestran como tarjetas (historial) en el módulo de inventario.
 */
export async function listRecepcionesFinalizadas(): Promise<Orden[]> {
  const { data, error } = await supabase
    .from('ordenes')
    .select('*')
    .eq('estado', 'finalizada')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Orden[];
}

/**
 * Cuántas órdenes están PENDIENTES por marcar la recepción (desde Pedidos/Compras):
 * contra entrega lista para recibir (`por_recibir`) o ya pagada y aún sin recibir
 * (`pagada` con `recibida_en` nulo). Es el número que se muestra en el botón de
 * Recepciones; las finalizadas NO cuentan.
 */
export async function contarRecepcionesPorMarcar(): Promise<number> {
  const { count, error } = await supabase
    .from('ordenes')
    .select('id', { count: 'exact', head: true })
    .is('recibida_en', null)
    .in('estado', ['por_recibir', 'pagada']);
  if (error) throw error;
  return count ?? 0;
}
