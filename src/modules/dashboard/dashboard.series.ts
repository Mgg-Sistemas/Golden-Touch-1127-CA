import { supabase } from '@/shared/lib/supabase';
import type { Movimiento, Producto } from '@/shared/lib/types';

export type BucketKind = 'day' | 'week' | 'month';

export interface SeriePoint {
  start: Date;
  end: Date;
  label: string;
  value: number;
  count: number;
}

export interface RangoFechas {
  desde: Date;
  hasta: Date;
  bucket: BucketKind;
}

/** Devuelve el inicio del día (00:00:00 local). */
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Devuelve el inicio de la semana ISO (lunes 00:00 local). */
function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7; // 0 = lunes
  x.setDate(x.getDate() - dow);
  return x;
}

/** Devuelve el inicio del mes. */
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function nextBucket(start: Date, bucket: BucketKind): Date {
  const n = new Date(start);
  if (bucket === 'day') n.setDate(n.getDate() + 1);
  else if (bucket === 'week') n.setDate(n.getDate() + 7);
  else n.setMonth(n.getMonth() + 1);
  return n;
}

function bucketStart(d: Date, bucket: BucketKind): Date {
  if (bucket === 'day') return startOfDay(d);
  if (bucket === 'week') return startOfWeek(d);
  return startOfMonth(d);
}

function bucketLabel(start: Date, bucket: BucketKind): string {
  if (bucket === 'day') return start.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' });
  if (bucket === 'week') {
    const end = new Date(start); end.setDate(end.getDate() + 6);
    return `${start.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' })}`;
  }
  return start.toLocaleDateString('es-VE', { month: 'short', year: '2-digit' });
}

/**
 * Recorta los buckets iniciales que están en cero (sin valor ni conteo), de modo
 * que la serie arranque en el primer punto con datos reales. Evita el tramo plano
 * de "$0" al inicio del rango cuando el sistema todavía no tenía inventario/actividad
 * cargada. Si TODOS los buckets están en cero, devuelve la serie tal cual (para no
 * dejar la gráfica vacía). Solo recorta el prefijo: los ceros intermedios/finales
 * se conservan porque sí representan estado real.
 */
export function recortarCerosIniciales(buckets: SeriePoint[]): SeriePoint[] {
  const primero = buckets.findIndex((b) => b.value !== 0 || b.count !== 0);
  if (primero <= 0) return buckets; // -1 (todo en cero) o 0 (sin prefijo cero): sin cambios
  return buckets.slice(primero);
}

/** Genera buckets vacíos en el rango (cerrado por inicio del bucket). */
export function generarBuckets(rango: RangoFechas): SeriePoint[] {
  const out: SeriePoint[] = [];
  let cursor = bucketStart(rango.desde, rango.bucket);
  const fin = bucketStart(rango.hasta, rango.bucket);
  let safety = 0;
  while (cursor.getTime() <= fin.getTime() && safety < 600) {
    const end = nextBucket(cursor, rango.bucket);
    out.push({
      start: new Date(cursor),
      end,
      label: bucketLabel(cursor, rango.bucket),
      value: 0,
      count: 0,
    });
    cursor = end;
    safety++;
  }
  return out;
}

/**
 * Reconstruye la serie de "valor del inventario" para el rango pedido.
 * Estrategia: parte del estado actual de productos (stock × precio_promedio) y
 * retrocede en el tiempo aplicando los deltas de cada movimiento.
 */
export async function getSerieValorInventario(rango: RangoFechas): Promise<SeriePoint[]> {
  const [{ data: prods, error: pErr }, { data: movs, error: mErr }] = await Promise.all([
    supabase.from('productos').select('id, stock, precio, precio_promedio'),
    supabase
      .from('movimientos')
      .select('producto_id, delta, at')
      .gte('at', rango.desde.toISOString())
      .order('at', { ascending: true }),
  ]);
  if (pErr) throw pErr;
  if (mErr) throw mErr;

  const productos = (prods ?? []) as Pick<Producto, 'id' | 'stock' | 'precio' | 'precio_promedio'>[];
  const movimientos = (movs ?? []) as Pick<Movimiento, 'producto_id' | 'delta' | 'at'>[];

  const precioPorProducto = new Map<string, number>();
  const stockPorProducto = new Map<string, number>();
  for (const p of productos) {
    precioPorProducto.set(p.id, p.precio_promedio ?? p.precio ?? 0);
    stockPorProducto.set(p.id, p.stock ?? 0);
  }

  const buckets = generarBuckets(rango);
  if (!buckets.length) return [];

  // Empezamos desde el último bucket (estado actual) y retrocedemos.
  const reversedMovs = [...movimientos].reverse();
  let movIdx = 0;

  for (let i = buckets.length - 1; i >= 0; i--) {
    const bucket = buckets[i];
    // Aplicamos hacia atrás todos los movimientos posteriores al inicio del bucket
    while (movIdx < reversedMovs.length && new Date(reversedMovs[movIdx].at).getTime() >= bucket.end.getTime()) {
      const m = reversedMovs[movIdx];
      stockPorProducto.set(m.producto_id, (stockPorProducto.get(m.producto_id) ?? 0) - m.delta);
      movIdx++;
    }
    // El valor en el inicio del bucket = stock reconstruido × precio
    let valor = 0;
    for (const [id, stock] of stockPorProducto.entries()) {
      valor += stock * (precioPorProducto.get(id) ?? 0);
    }
    bucket.value = Math.max(0, valor);
    bucket.count = 0;
  }

  return recortarCerosIniciales(buckets);
}

/**
 * Serie de "Producción finalizada": en Golden Touch la producción son los CONTRATOS
 * de acopio CERRADOS (`acopio_contratos`), que al cerrarse dan entrada a la casiterita
 * recuperada. Se acumula por bucket según la fecha de cierre (`cerrado_at`):
 *  - count = Kg de casiterita producidos (Σ kg_seco_limpio)
 *  - value = valor $ producido (Σ Kg × costo $/Kg de la entrada al inventario, que es
 *            la tasa de acopio vigente al cerrar el contrato)
 * Antes leía la tabla `produccion` (fundición), que en GT no se usa, por eso salía en 0.
 */
export async function getSerieProduccion(rango: RangoFechas): Promise<SeriePoint[]> {
  const { data, error } = await supabase
    .from('acopio_contratos')
    .select('cerrado_at, kg_seco_limpio, mov_cantidad, mov_id')
    .eq('estado', 'cerrado')
    .gte('cerrado_at', rango.desde.toISOString())
    .lte('cerrado_at', rango.hasta.toISOString())
    .order('cerrado_at', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as Array<{ cerrado_at: string | null; kg_seco_limpio: number | null; mov_cantidad: number | null; mov_id: string | null }>;

  // Costo $/Kg de cada contrato: lo trae su movimiento de entrada de casiterita
  // (precio_unitario = tasa de acopio al cerrar; fallback al costo promedio).
  const movIds = rows.map((r) => r.mov_id).filter((x): x is string => !!x);
  const costoPorMov = new Map<string, number>();
  if (movIds.length) {
    const { data: movs } = await supabase.from('movimientos').select('id, precio_unitario, costo_promedio').in('id', movIds);
    for (const m of (movs ?? []) as Array<{ id: string; precio_unitario: number | null; costo_promedio: number | null }>) {
      costoPorMov.set(m.id, Number(m.precio_unitario) || Number(m.costo_promedio) || 0);
    }
  }

  const buckets = generarBuckets(rango);
  for (const r of rows) {
    if (!r.cerrado_at) continue;
    const t = new Date(r.cerrado_at).getTime();
    const idx = buckets.findIndex((b) => b.start.getTime() <= t && t < b.end.getTime());
    if (idx === -1) continue;
    const kg = Number(r.kg_seco_limpio) || 0;
    const costo = r.mov_id ? (costoPorMov.get(r.mov_id) ?? 0) : 0;
    buckets[idx].count += kg;                               // Kg de casiterita producidos
    buckets[idx].value += (Number(r.mov_cantidad) || kg) * costo; // Valor $ (Kg × tasa acopio)
  }
  return recortarCerosIniciales(buckets);
}
