/* ============================================================
   Golden Touch · Cocina · Control de distribución · datos

   Junta lo que el control necesita, para TODOS los productos del mercado de una
   sola vez: el kardex del período, los comensales de cada día, los conteos
   físicos y los parámetros del EOQ.

   Se trae todo junto y se arma en memoria a propósito: son ~70 productos y unas
   pocas centenas de movimientos, y hacerlo producto por producto serían 70
   consultas para dibujar una tabla.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { Producto } from '@/shared/lib/types';
import { listViveres } from './cocina.repository';
import {
  calcularEoq, construirDias, demandaAnualEstimada, diasEntre, estadoStock, totalizarControl,
  type EstadoStock, type FilaDia, type MovimientoDia, type TotalesControl,
} from './controlDistribucion';

const CONFIG_KEY = 'cocina.eoq';
const TABLA_CONTEOS = 'cocina_conteos';
const TABLA_EOQ = 'cocina_eoq';

const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const dia = (iso: string | null | undefined) => (iso ?? '').slice(0, 10);

/* ───────── Parámetros generales (config) ───────── */

export interface ParametrosGenerales {
  costoOrden: number;
  costoAlmacenar: number;
  leadTimeDias: number;
}

/** Los de la hoja de La Esperanza / Golden Touch, que es lo que se usa hoy. */
export const PARAMETROS_POR_DEFECTO: ParametrosGenerales = {
  costoOrden: 3.33, costoAlmacenar: 1.2, leadTimeDias: 2,
};

export async function getParametrosGenerales(): Promise<ParametrosGenerales> {
  const { data } = await supabase.from('config').select('value').eq('key', CONFIG_KEY).maybeSingle();
  const v = (data?.value ?? {}) as Partial<Record<string, unknown>>;
  return {
    costoOrden: Number(v.costo_orden) > 0 ? Number(v.costo_orden) : PARAMETROS_POR_DEFECTO.costoOrden,
    costoAlmacenar: Number(v.costo_almacenar) > 0 ? Number(v.costo_almacenar) : PARAMETROS_POR_DEFECTO.costoAlmacenar,
    leadTimeDias: Number(v.lead_time_dias) >= 0 ? Number(v.lead_time_dias) : PARAMETROS_POR_DEFECTO.leadTimeDias,
  };
}

export async function guardarParametrosGenerales(p: ParametrosGenerales, actor: string): Promise<void> {
  if (!(p.costoOrden > 0)) throw new Error('El costo por orden debe ser mayor que 0.');
  if (!(p.costoAlmacenar > 0)) throw new Error('El costo de almacenar debe ser mayor que 0.');
  if (!(p.leadTimeDias >= 0)) throw new Error('El tiempo de entrega no puede ser negativo.');
  const { error } = await supabase.from('config').upsert(
    {
      key: CONFIG_KEY,
      value: {
        costo_orden: r2(p.costoOrden),
        costo_almacenar: r2(p.costoAlmacenar),
        lead_time_dias: Math.trunc(p.leadTimeDias),
      },
      updated_by: actor,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  );
  if (error) throw error;
}

/* ───────── Parámetros por producto (override) ───────── */

export interface ParametroProducto {
  producto_id: string;
  costo_orden: number | null;
  costo_almacenar: number | null;
  lead_time_dias: number | null;
  demanda_anual: number | null;
}

export async function listParametrosProducto(): Promise<ParametroProducto[]> {
  const { data, error } = await supabase.from(TABLA_EOQ)
    .select('producto_id, costo_orden, costo_almacenar, lead_time_dias, demanda_anual');
  if (error) throw error;
  return (data ?? []) as ParametroProducto[];
}

/**
 * Guarda el override de un producto. Los campos en null vuelven al valor general:
 * quitar un ajuste tiene que ser tan fácil como ponerlo.
 */
export async function guardarParametroProducto(
  p: ParametroProducto, actor: string, actorName?: string | null,
): Promise<void> {
  const positivoONulo = (v: number | null, etiqueta: string) => {
    if (v == null) return null;
    if (!(Number(v) > 0)) throw new Error(`${etiqueta} debe ser mayor que 0 (o dejarse vacío).`);
    return r2(Number(v));
  };
  const fila = {
    producto_id: p.producto_id,
    costo_orden: positivoONulo(p.costo_orden, 'El costo por orden'),
    costo_almacenar: positivoONulo(p.costo_almacenar, 'El costo de almacenar'),
    lead_time_dias: p.lead_time_dias == null ? null : Math.max(0, Math.trunc(Number(p.lead_time_dias))),
    demanda_anual: positivoONulo(p.demanda_anual, 'La demanda anual'),
    actor, actor_name: actorName ?? null,
    updated_at: new Date().toISOString(),
  };
  const vacio = fila.costo_orden == null && fila.costo_almacenar == null
    && fila.lead_time_dias == null && fila.demanda_anual == null;
  if (vacio) {
    // Sin ningún ajuste no hace falta la fila: el producto vuelve a los generales.
    const { error } = await supabase.from(TABLA_EOQ).delete().eq('producto_id', p.producto_id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from(TABLA_EOQ).upsert(fila, { onConflict: 'producto_id' });
  if (error) throw error;
}

/* ───────── Conteo físico ───────── */

export interface Conteo {
  id: string;
  producto_id: string;
  fecha: string;
  cantidad: number;
  nota: string | null;
  actor: string | null;
  actor_name: string | null;
}

export async function listConteos(desde: string, hasta: string): Promise<Conteo[]> {
  const { data, error } = await supabase.from(TABLA_CONTEOS)
    .select('id, producto_id, fecha, cantidad, nota, actor, actor_name')
    .gte('fecha', desde).lte('fecha', hasta)
    .order('fecha', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Conteo[];
}

export async function guardarConteo(input: {
  productoId: string; fecha: string; cantidad: number; nota?: string | null;
  actor: string; actorName?: string | null;
}): Promise<Conteo> {
  const cantidad = Number(input.cantidad);
  if (!Number.isFinite(cantidad) || cantidad < 0) throw new Error('El conteo no puede ser negativo.');
  if (!input.fecha) throw new Error('Indicá la fecha del conteo.');
  if (input.fecha > new Date().toISOString().slice(0, 10)) {
    throw new Error('No se puede contar un día que todavía no llegó.');
  }
  const { data, error } = await supabase.from(TABLA_CONTEOS).upsert(
    {
      producto_id: input.productoId,
      fecha: input.fecha,
      cantidad: r2(cantidad),
      nota: input.nota?.trim() || null,
      actor: input.actor,
      actor_name: input.actorName ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'producto_id,fecha' },
  ).select('id, producto_id, fecha, cantidad, nota, actor, actor_name').single();
  if (error) throw error;
  return data as Conteo;
}

export async function eliminarConteo(id: string): Promise<void> {
  const { error } = await supabase.from(TABLA_CONTEOS).delete().eq('id', id);
  if (error) throw error;
}

/* ───────── El control completo ───────── */

export interface ControlProducto {
  producto_id: string;
  sku: string;
  nombre: string;
  unidad: string | null;
  /** Stock de hoy, el del inventario. */
  stockActual: number;
  /** Una fila por día del período. */
  dias: FilaDia[];
  totales: TotalesControl;
  /** Demanda anual usada: la cargada a mano o la estimada del consumo real. */
  demandaAnual: number;
  demandaEstimada: boolean;
  costoOrden: number;
  costoAlmacenar: number;
  leadTimeDias: number;
  lote: number;
  puntoReorden: number;
  ordenesPorAno: number;
  cicloDias: number;
  /** Semáforo del stock de HOY. */
  estado: EstadoStock;
}

export interface Control {
  desde: string;
  hasta: string;
  generales: ParametrosGenerales;
  productos: ControlProducto[];
  /** Comensales por día del período (los platos servidos por la cocina). */
  comensalesPorDia: Map<string, number>;
  conteos: Conteo[];
}

/** Comensales (platos) servidos por día en el período. */
async function comensalesPorDia(desde: string, hasta: string): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('cocina_movimientos')
    .select('at, platos')
    .gte('at', `${desde}T00:00:00`).lte('at', `${hasta}T23:59:59`);
  if (error) throw error;
  const out = new Map<string, number>();
  for (const r of (data ?? []) as Array<{ at: string; platos: number | null }>) {
    const d = dia(r.at);
    out.set(d, (out.get(d) ?? 0) + (Number(r.platos) || 0));
  }
  return out;
}

/**
 * Movimientos de inventario de los productos del mercado DESDE el inicio del
 * período hasta hoy.
 *
 * Se traen también los posteriores al período a propósito: el inventario con el
 * que abre el primer día se deduce del stock de hoy restándole todo lo que se
 * movió desde entonces, y si faltara un movimiento de ayer la cuenta entera
 * quedaría corrida.
 */
async function movimientosDesde(desde: string, ids: string[]): Promise<Map<string, MovimientoDia[]>> {
  const out = new Map<string, MovimientoDia[]>();
  if (!ids.length) return out;
  const { data, error } = await supabase.from('movimientos')
    .select('producto_id, at, delta, ref_tipo')
    .in('producto_id', ids)
    .gte('at', `${desde}T00:00:00`)
    .order('at', { ascending: true });
  if (error) throw error;
  for (const r of (data ?? []) as Array<{ producto_id: string; at: string; delta: number; ref_tipo: string | null }>) {
    const lista = out.get(r.producto_id) ?? [];
    lista.push({ fecha: dia(r.at), delta: Number(r.delta) || 0, refTipo: r.ref_tipo });
    out.set(r.producto_id, lista);
  }
  return out;
}

/**
 * El control de TODO el mercado en el período indicado. Un solo viaje por cada
 * cosa que hace falta, y el armado en memoria.
 */
export async function cargarControl(desde: string, hasta: string): Promise<Control> {
  const dias = diasEntre(desde, hasta);
  const [viveres, generales, overrides, conteos, comensales] = await Promise.all([
    listViveres(),
    getParametrosGenerales(),
    listParametrosProducto().catch(() => [] as ParametroProducto[]),
    listConteos(desde, hasta).catch(() => [] as Conteo[]),
    comensalesPorDia(desde, hasta).catch(() => new Map<string, number>()),
  ]);

  const ids = viveres.map((p) => p.id);
  const movs = await movimientosDesde(desde, ids);

  const porProducto = new Map(overrides.map((o) => [o.producto_id, o]));
  const conteosPorProducto = new Map<string, Map<string, number>>();
  for (const c of conteos) {
    const m = conteosPorProducto.get(c.producto_id) ?? new Map<string, number>();
    m.set(c.fecha, Number(c.cantidad) || 0);
    conteosPorProducto.set(c.producto_id, m);
  }

  const productos = viveres.map((p: Producto) => {
    const todos = movs.get(p.id) ?? [];
    const stockActual = r2(Number(p.stock) || 0);
    // Apertura del período: el stock de hoy menos todo lo que se movió desde el inicio.
    const apertura = r2(stockActual - todos.reduce((a, m) => a + m.delta, 0));

    const o = porProducto.get(p.id);
    const costoOrden = o?.costo_orden ?? generales.costoOrden;
    const costoAlmacenar = o?.costo_almacenar ?? generales.costoAlmacenar;
    const leadTimeDias = o?.lead_time_dias ?? generales.leadTimeDias;

    // Primera pasada: sin punto de reorden todavía, solo para medir el consumo.
    const conteosDe = conteosPorProducto.get(p.id) ?? new Map<string, number>();
    const base = { dias, aperturaInventario: apertura, movimientos: todos, comensalesPorDia: comensales, conteosPorDia: conteosDe };
    const previas = construirDias({ ...base, puntoReorden: 0 });
    const tot = totalizarControl(previas);

    const demandaEstimada = o?.demanda_anual == null;
    const demandaAnual = demandaEstimada
      // Sobre los días del PERÍODO, no sobre los que tuvieron consumo: ver
      // demandaAnualEstimada. Con productos que se sirven cada tanto, la
      // diferencia entre una cosa y la otra es pedir de más por diez.
      ? demandaAnualEstimada(tot.consumo, dias.length)
      : Number(o?.demanda_anual);
    const eoq = calcularEoq({ demandaAnual, costoOrden, costoAlmacenar, leadTimeDias });

    // Segunda pasada: ahora sí con el punto de reorden, que es lo que colorea cada día.
    const filas = construirDias({ ...base, puntoReorden: eoq.puntoReorden });

    return {
      producto_id: p.id,
      sku: p.sku,
      nombre: p.nombre,
      unidad: p.unidad ?? null,
      stockActual,
      dias: filas,
      totales: totalizarControl(filas),
      demandaAnual: eoq.demandaAnual,
      demandaEstimada,
      costoOrden, costoAlmacenar, leadTimeDias,
      lote: eoq.lote,
      puntoReorden: eoq.puntoReorden,
      ordenesPorAno: eoq.ordenesPorAno,
      cicloDias: eoq.cicloDias,
      estado: estadoStock(stockActual, eoq.puntoReorden),
    } satisfies ControlProducto;
  });

  return { desde, hasta, generales, productos, comensalesPorDia: comensales, conteos };
}

/** Orden del listado: lo que hay que comprar primero, y dentro de eso lo más consumido. */
const PESO_ESTADO: Record<EstadoStock, number> = { reordenar: 0, alerta: 1, normal: 2 };

export function ordenarPorUrgencia(productos: ControlProducto[]): ControlProducto[] {
  return [...productos].sort((a, b) => {
    const d = PESO_ESTADO[a.estado] - PESO_ESTADO[b.estado];
    if (d !== 0) return d;
    const c = b.totales.consumo - a.totales.consumo;
    if (c !== 0) return c;
    return a.nombre.localeCompare(b.nombre, 'es');
  });
}
