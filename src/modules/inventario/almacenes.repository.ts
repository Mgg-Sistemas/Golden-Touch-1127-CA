/* ============================================================
   MGG · Inventario · Almacenes (Supabase)
   Los almacenes son entidades reales en `almacenes`.
   `productos.almacen` referencia el NOMBRE del almacén (texto),
   por retrocompatibilidad con datos legados ('General', etc.).
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { Almacen, Existencia, Producto } from '@/shared/lib/types';

const TABLE = 'almacenes';

export interface AlmacenInput {
  nombre: string;
  ubicacion?: string | null;
}

export interface AlmacenValor {
  valor: number;     // Σ stock × precio
  items: number;     // nº de productos
  unidades: number;  // Σ stock
}

export async function listAlmacenes(): Promise<Almacen[]> {
  const { data, error } = await supabase.from(TABLE).select('*').order('nombre', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Almacen[];
}

/**
 * Nombres de almacén para poblar desplegables: unión de la tabla `almacenes`
 * con los valores ya presentes en productos (mismo patrón que getCategorias).
 */
export async function getNombresAlmacenes(fromProductos: Producto[] = []): Promise<string[]> {
  const set = new Set<string>();
  try {
    const rows = await listAlmacenes();
    rows.forEach((a) => a.nombre && set.add(a.nombre));
  } catch { /* falla silenciosa: caemos a valores legados */ }
  fromProductos.forEach((p) => p.almacen && set.add(p.almacen));
  if (set.size === 0) set.add('General');
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
}

export async function crearAlmacen(input: AlmacenInput, actorEmail?: string): Promise<Almacen> {
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error('El nombre del almacén es obligatorio');
  const payload = {
    nombre,
    ubicacion: input.ubicacion?.trim() || null,
    created_by: actorEmail ?? null,
  };
  const { data, error } = await supabase.from(TABLE).insert(payload).select('*').single();
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Ya existe un almacén con ese nombre');
    throw error;
  }
  return data as Almacen;
}

export async function actualizarAlmacen(id: string, patch: Partial<AlmacenInput>): Promise<Almacen> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.nombre !== undefined) {
    const nombre = patch.nombre.trim();
    if (!nombre) throw new Error('El nombre del almacén no puede estar vacío');
    payload.nombre = nombre;
  }
  if (patch.ubicacion !== undefined) payload.ubicacion = patch.ubicacion?.trim() || null;
  const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select('*').single();
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Ya existe un almacén con ese nombre');
    throw error;
  }
  return data as Almacen;
}

export async function eliminarAlmacen(id: string, nombre: string): Promise<void> {
  // Bloquea si hay existencias con stock en este almacén.
  const { data, error: cErr } = await supabase
    .from('existencias')
    .select('stock')
    .eq('almacen', nombre)
    .gt('stock', 0);
  if (cErr) throw cErr;
  if ((data ?? []).length > 0) {
    throw new Error(`No se puede eliminar: hay ${(data ?? []).length} producto(s) con stock en este almacén`);
  }
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

/** Todas las existencias (stock + costo por almacén). */
export async function listExistencias(): Promise<Existencia[]> {
  const { data, error } = await supabase.from('existencias').select('*');
  if (error) throw error;
  return (data ?? []) as Existencia[];
}

/** Existencia de un producto en un almacén (null si no hay fila). */
export async function getExistencia(productoId: string, almacen: string): Promise<Existencia | null> {
  const { data, error } = await supabase
    .from('existencias')
    .select('*')
    .eq('producto_id', productoId)
    .eq('almacen', almacen)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Existencia | null;
}

/** Valor total ($), nº de productos y unidades por almacén, a partir de existencias.
 *  El costo usado es el PMP propio de cada almacén. */
export function agruparValores(existencias: Existencia[]): Record<string, AlmacenValor> {
  return existencias.reduce<Record<string, AlmacenValor>>((acc, e) => {
    const key = e.almacen || 'General';
    const stock = Number(e.stock) || 0;
    const acc0 = acc[key] ?? { valor: 0, items: 0, unidades: 0 };
    acc0.valor += stock * (Number(e.costo_promedio) || 0);
    acc0.items += 1;
    acc0.unidades += stock;
    acc[key] = acc0;
    return acc;
  }, {});
}

export async function valoresPorAlmacen(): Promise<Record<string, AlmacenValor>> {
  return agruparValores(await listExistencias());
}

/** Entradas/salidas por producto dentro de un almacén (desde movimientos de ese almacén). */
export async function movStatsDeAlmacen(almacen: string): Promise<Map<string, { entradas: number; salidas: number }>> {
  const map = new Map<string, { entradas: number; salidas: number }>();
  const { data, error } = await supabase.from('movimientos').select('producto_id, delta').eq('almacen', almacen);
  if (error) throw error;
  (data ?? []).forEach((row) => {
    const r = row as { producto_id: string; delta: number | null };
    const d = Number(r.delta) || 0;
    const cur = map.get(r.producto_id) ?? { entradas: 0, salidas: 0 };
    if (d > 0) cur.entradas += d;
    else if (d < 0) cur.salidas += Math.abs(d);
    map.set(r.producto_id, cur);
  });
  return map;
}

export interface ConsumoProducto {
  /** Total de unidades consumidas/salidas del producto en este almacén. */
  usados: number;
  /** Promedio de consumo por día (usados ÷ días desde el primer movimiento). */
  diario: number;
}

/**
 * Consumo por producto dentro de un almacén, calculado SOLO a partir de las
 * salidas realizadas (movimientos tipo 'salida'): total usado y consumo diario
 * promedio (usados ÷ días desde la primera salida).
 */
export async function consumoDeAlmacen(almacen: string): Promise<Map<string, ConsumoProducto>> {
  const { data, error } = await supabase
    .from('movimientos')
    .select('producto_id, delta, at')
    .eq('almacen', almacen)
    .eq('tipo', 'salida');
  if (error) throw error;

  const acc = new Map<string, { usados: number; primera: number }>();
  const ahora = Date.now();
  (data ?? []).forEach((row) => {
    const r = row as { producto_id: string; delta: number | null; at: string };
    const usado = Math.abs(Number(r.delta) || 0);
    const t = new Date(r.at).getTime();
    const cur = acc.get(r.producto_id) ?? { usados: 0, primera: ahora };
    cur.usados += usado;
    if (Number.isFinite(t) && t < cur.primera) cur.primera = t;
    acc.set(r.producto_id, cur);
  });

  const out = new Map<string, ConsumoProducto>();
  acc.forEach((v, pid) => {
    const dias = Math.max(1, Math.ceil((ahora - v.primera) / 86400000));
    out.set(pid, { usados: v.usados, diario: Math.round((v.usados / dias) * 100) / 100 });
  });
  return out;
}
