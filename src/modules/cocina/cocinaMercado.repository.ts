/* ============================================================
   Golden Touch · Cocina · Ciclo de mercado (21 días)
   El mercado dura 21 días. Al llegar el día 22 se hace un CIERRE:
   se saca la foto de lo que queda (stock actual de cada víver), se
   arma el reporte (saldo inicial + entradas del mercado − consumo =
   lo que queda) y el siguiente ciclo arranca con ese saldo. El
   contador y el cierre son manuales (Cocina pulsa «Cerrar mercado»).
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { Producto } from '@/shared/lib/types';
import { listViveres } from './cocina.repository';

const TABLE = 'cocina_mercados';
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Días que dura un ciclo de mercado. Al día 22 toca cerrar. */
export const CICLO_DIAS = 21;

/** Foto de un víver en un momento (inicio o cierre del ciclo). */
export interface SaldoViver {
  producto_id: string;
  sku: string;
  nombre: string;
  unidad: string | null;
  cantidad: number;
}

/** Fila del resumen del ciclo por víver. */
export interface ResumenViver {
  producto_id: string;
  sku: string;
  nombre: string;
  unidad: string | null;
  saldo_inicial: number;   // lo que quedó del mercado anterior (al iniciar el ciclo)
  entradas: number;        // entradas de inventario (nuevo mercado) durante el ciclo
  disponible: number;      // saldo_inicial + entradas (total disponible a consumir)
  consumo: number;         // consumido por cocina durante el ciclo
  queda: number;           // stock actual (lo que queda → pasa al próximo ciclo)
}

export interface TotalesMercado {
  viveres: number;
  consumo_valor: number;   // costo total consumido (Bs/$ del inventario)
  entradas_total: number;  // suma de cantidades entradas
  queda_viveres: number;   // víveres con saldo > 0 que pasan al próximo
}

export interface Mercado {
  id: string;
  numero: string | null;
  inicio_at: string;
  cierre_at: string | null;
  estado: 'abierto' | 'cerrado';
  saldo_inicial: SaldoViver[];
  saldo_final: SaldoViver[] | null;
  resumen: ResumenViver[] | null;
  totales: TotalesMercado | null;
  cerrado_por: string | null;
  nota: string | null;
  created_at: string;
}

function normalizar(r: Record<string, unknown>): Mercado {
  return {
    id: String(r.id),
    numero: (r.numero as string) ?? null,
    inicio_at: String(r.inicio_at),
    cierre_at: (r.cierre_at as string) ?? null,
    estado: r.estado === 'cerrado' ? 'cerrado' : 'abierto',
    saldo_inicial: Array.isArray(r.saldo_inicial) ? (r.saldo_inicial as SaldoViver[]) : [],
    saldo_final: Array.isArray(r.saldo_final) ? (r.saldo_final as SaldoViver[]) : null,
    resumen: Array.isArray(r.resumen) ? (r.resumen as ResumenViver[]) : null,
    totales: (r.totales as TotalesMercado) ?? null,
    cerrado_por: (r.cerrado_por as string) ?? null,
    nota: (r.nota as string) ?? null,
    created_at: String(r.created_at),
  };
}

/** Foto del stock actual de cada víver (para saldo inicial/final). */
export function snapshotViveres(viveres: Producto[]): SaldoViver[] {
  return viveres
    .map((p) => ({
      producto_id: p.id, sku: p.sku, nombre: p.nombre,
      unidad: p.unidad ?? null, cantidad: round2(Number(p.stock) || 0),
    }));
}

/** Correlativo del mercado: MK-AAAA-#### (atómico, reusa next_correlativo). */
async function nextNumeroMercado(): Promise<string> {
  const year = new Date().getFullYear();
  const { data, error } = await supabase.rpc('next_correlativo', { p_clave: `cocina-mercado-${year}` });
  if (error) throw error;
  return `MK-${year}-${String(Number(data) || 1).padStart(4, '0')}`;
}

/** El mercado ABIERTO actual (o null si no hay ninguno). */
export async function getMercadoActivo(): Promise<Mercado | null> {
  const { data, error } = await supabase.from(TABLE).select('*')
    .eq('estado', 'abierto').order('inicio_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? normalizar(data as Record<string, unknown>) : null;
}

/**
 * Garantiza que haya un mercado abierto: si no existe (primera vez), lo crea con el
 * saldo inicial = foto del stock actual de víveres. Devuelve el mercado abierto.
 */
export async function asegurarMercadoActivo(viveres?: Producto[]): Promise<Mercado> {
  const actual = await getMercadoActivo();
  if (actual) return actual;
  const vs = viveres ?? await listViveres();
  const numero = await nextNumeroMercado();
  const { data, error } = await supabase.from(TABLE).insert({
    numero, estado: 'abierto', inicio_at: new Date().toISOString(),
    saldo_inicial: snapshotViveres(vs),
  }).select('*').single();
  if (error) throw error;
  return normalizar(data as Record<string, unknown>);
}

/** Estado del contador del ciclo: día actual, días que faltan y si ya venció (día 22+). */
export function diasDelCiclo(m: Mercado): { transcurridos: number; dia: number; faltan: number; vencido: boolean } {
  const ini = new Date(m.inicio_at).getTime();
  const ahora = Date.now();
  const transcurridos = Math.max(0, Math.floor((ahora - ini) / 86_400_000));
  const dia = transcurridos + 1;                 // día 1 = el día que arrancó
  const faltan = Math.max(0, CICLO_DIAS - dia);
  return { transcurridos, dia, faltan, vencido: dia > CICLO_DIAS };
}

/** Entradas de inventario (nuevo mercado) por víver dentro de la ventana [desde, hasta]. */
async function entradasPorViver(desde: string, hasta: string, viverIds: Set<string>): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('movimientos')
    .select('producto_id, delta, tipo, at')
    .eq('tipo', 'entrada').gte('at', desde).lte('at', hasta);
  if (error) throw error;
  const out = new Map<string, number>();
  for (const r of (data ?? []) as { producto_id: string; delta: number }[]) {
    if (!viverIds.has(r.producto_id)) continue;
    out.set(r.producto_id, round2((out.get(r.producto_id) ?? 0) + (Number(r.delta) || 0)));
  }
  return out;
}

/** Consumo de cocina por víver (cantidad y valor) dentro de la ventana [desde, hasta]. */
async function consumoPorViver(desde: string, hasta: string): Promise<Map<string, { cantidad: number; valor: number }>> {
  const { data, error } = await supabase.from('cocina_movimientos')
    .select('items, at').gte('at', desde).lte('at', hasta);
  if (error) throw error;
  const out = new Map<string, { cantidad: number; valor: number }>();
  for (const m of (data ?? []) as { items: { producto_id: string; cantidad: number; precio: number }[] }[]) {
    for (const it of m.items ?? []) {
      const acc = out.get(it.producto_id) ?? { cantidad: 0, valor: 0 };
      acc.cantidad = round2(acc.cantidad + (Number(it.cantidad) || 0));
      acc.valor = round2(acc.valor + (Number(it.cantidad) || 0) * (Number(it.precio) || 0));
      out.set(it.producto_id, acc);
    }
  }
  return out;
}

/**
 * Resumen del ciclo por víver: saldo inicial (del mercado anterior) + entradas (nuevo
 * mercado) = disponible; consumo de cocina; y lo que queda (stock actual). `hastaISO`
 * permite congelar la ventana al cerrar (por defecto, ahora).
 */
export async function computeResumen(
  m: Mercado, viveres: Producto[], hastaISO?: string,
): Promise<{ items: ResumenViver[]; totales: TotalesMercado }> {
  const hasta = hastaISO ?? new Date().toISOString();
  const viverIds = new Set(viveres.map((p) => p.id));
  const [entradas, consumos] = await Promise.all([
    entradasPorViver(m.inicio_at, hasta, viverIds),
    consumoPorViver(m.inicio_at, hasta),
  ]);
  const inicialPorId = new Map(m.saldo_inicial.map((s) => [s.producto_id, Number(s.cantidad) || 0]));
  // Unión de víveres actuales + los que tenían saldo inicial (por si alguno se agotó/desactivó).
  const idsTodos = new Set<string>([...viverIds, ...inicialPorId.keys()]);
  const prodPorId = new Map(viveres.map((p) => [p.id, p]));
  const iniPorId = new Map(m.saldo_inicial.map((s) => [s.producto_id, s]));

  const items: ResumenViver[] = [];
  for (const id of idsTodos) {
    const p = prodPorId.get(id);
    const ini = iniPorId.get(id);
    const saldoInicial = inicialPorId.get(id) ?? 0;
    const ent = entradas.get(id) ?? 0;
    const cons = consumos.get(id)?.cantidad ?? 0;
    const queda = p ? round2(Number(p.stock) || 0) : round2(saldoInicial + ent - cons);
    const disponible = round2(saldoInicial + ent);
    // Solo interesan víveres con algún movimiento/saldo en el ciclo.
    if (saldoInicial === 0 && ent === 0 && cons === 0 && queda === 0) continue;
    items.push({
      producto_id: id,
      sku: p?.sku ?? ini?.sku ?? '',
      nombre: p?.nombre ?? ini?.nombre ?? '(víver)',
      unidad: p?.unidad ?? ini?.unidad ?? null,
      saldo_inicial: round2(saldoInicial), entradas: ent, disponible, consumo: cons, queda,
    });
  }
  items.sort((a, b) => a.nombre.localeCompare(b.nombre));

  const totales: TotalesMercado = {
    viveres: items.length,
    consumo_valor: round2([...consumos.values()].reduce((a, c) => a + c.valor, 0)),
    entradas_total: round2(items.reduce((a, i) => a + i.entradas, 0)),
    queda_viveres: items.filter((i) => i.queda > 0).length,
  };
  return { items, totales };
}

/**
 * Cierra el mercado abierto: congela el resumen y la foto del stock actual (lo que queda),
 * marca el ciclo como cerrado y ABRE el siguiente con saldo inicial = lo que quedó. Devuelve
 * el mercado cerrado (con resumen/totales) para el reporte.
 */
export async function cerrarMercado(
  m: Mercado, viveres: Producto[], actorEmail: string, nota?: string | null,
): Promise<Mercado> {
  if (m.estado !== 'abierto') throw new Error('El mercado ya está cerrado.');
  const cierre = new Date().toISOString();
  const { items, totales } = await computeResumen(m, viveres, cierre);
  const saldoFinal = snapshotViveres(viveres).filter((s) => s.cantidad > 0);

  const { data, error } = await supabase.from(TABLE).update({
    estado: 'cerrado', cierre_at: cierre, cerrado_por: actorEmail,
    saldo_final: saldoFinal, resumen: items, totales, nota: nota?.trim() || null,
  }).eq('id', m.id).eq('estado', 'abierto').select('*').single();
  if (error) throw error;

  // Abre el siguiente ciclo arrancando con lo que quedó (saldo inicial = saldo final).
  const numero = await nextNumeroMercado();
  await supabase.from(TABLE).insert({
    numero, estado: 'abierto', inicio_at: cierre, saldo_inicial: saldoFinal,
  });
  return normalizar(data as Record<string, unknown>);
}

/** Historial de ciclos (cerrados y el abierto), más recientes primero. */
export async function listMercados(): Promise<Mercado[]> {
  const { data, error } = await supabase.from(TABLE).select('*').order('inicio_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => normalizar(r as Record<string, unknown>));
}

/** Solo los ciclos CERRADOS (histórico), más recientes primero. */
export async function listMercadosCerrados(): Promise<Mercado[]> {
  const { data, error } = await supabase.from(TABLE).select('*')
    .eq('estado', 'cerrado').order('cierre_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => normalizar(r as Record<string, unknown>));
}

/** Recalcula los totales de un resumen editado (para el histórico). */
export function totalesDesdeResumen(items: ResumenViver[]): TotalesMercado {
  return {
    viveres: items.length,
    consumo_valor: 0,   // el valor $ del consumo no se recalcula al editar cantidades a mano
    entradas_total: round2(items.reduce((a, i) => a + (Number(i.entradas) || 0), 0)),
    queda_viveres: items.filter((i) => (Number(i.queda) || 0) > 0).length,
  };
}

/**
 * Edita un ciclo CERRADO del histórico: nota y/o el resumen por víver (cantidades). Al
 * guardar el resumen, recalcula `disponible` (= saldo + entradas), los totales y la foto
 * `saldo_final` (lo que queda). Corrige el reporte de ESE ciclo; no reescribe el ciclo
 * siguiente (que ya arrancó con su propio saldo).
 */
export async function actualizarMercadoHistorico(
  id: string, patch: { resumen?: ResumenViver[]; nota?: string | null },
): Promise<Mercado> {
  const upd: Record<string, unknown> = {};
  if (patch.nota !== undefined) upd.nota = patch.nota?.trim() || null;
  if (patch.resumen !== undefined) {
    const items = patch.resumen.map((r) => {
      const saldo = round2(Number(r.saldo_inicial) || 0);
      const ent = round2(Number(r.entradas) || 0);
      const cons = round2(Number(r.consumo) || 0);
      const queda = round2(Number(r.queda) || 0);
      return { ...r, saldo_inicial: saldo, entradas: ent, consumo: cons, queda, disponible: round2(saldo + ent) };
    });
    upd.resumen = items;
    upd.totales = totalesDesdeResumen(items);
    upd.saldo_final = items.filter((i) => i.queda > 0).map((i) => ({
      producto_id: i.producto_id, sku: i.sku, nombre: i.nombre, unidad: i.unidad, cantidad: i.queda,
    }));
  }
  const { data, error } = await supabase.from(TABLE).update(upd).eq('id', id).select('*').single();
  if (error) throw error;
  return normalizar(data as Record<string, unknown>);
}

/** Elimina un ciclo del histórico (no repone stock ni toca el ciclo abierto). */
export async function eliminarMercado(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

/** Detalle por víver de un ciclo: la nueva entrada (con fechas) y los consumos (con fechas). */
export interface DetalleViverCiclo {
  entradas: { fecha: string; cantidad: number; ref?: string | null }[];
  consumos: { fecha: string; cantidad: number; valor: number; codigo?: string | null; tipo_comida?: string | null }[];
}
export async function detalleViverCiclo(m: Mercado, productoId: string, hastaISO?: string): Promise<DetalleViverCiclo> {
  const hasta = hastaISO ?? m.cierre_at ?? new Date().toISOString();
  const [movs, cocina] = await Promise.all([
    supabase.from('movimientos').select('delta, at, ref_codigo, tipo')
      .eq('tipo', 'entrada').eq('producto_id', productoId).gte('at', m.inicio_at).lte('at', hasta).order('at'),
    supabase.from('cocina_movimientos').select('codigo, tipo_comida, items, at')
      .gte('at', m.inicio_at).lte('at', hasta).order('at'),
  ]);
  const entradas = ((movs.data ?? []) as { delta: number; at: string; ref_codigo: string | null }[])
    .map((r) => ({ fecha: r.at, cantidad: round2(Number(r.delta) || 0), ref: r.ref_codigo }));
  const consumos: DetalleViverCiclo['consumos'] = [];
  for (const c of (cocina.data ?? []) as { codigo: string | null; tipo_comida: string; items: { producto_id: string; cantidad: number; precio: number }[]; at: string }[]) {
    for (const it of c.items ?? []) {
      if (it.producto_id !== productoId) continue;
      consumos.push({
        fecha: c.at, cantidad: round2(Number(it.cantidad) || 0),
        valor: round2((Number(it.cantidad) || 0) * (Number(it.precio) || 0)),
        codigo: c.codigo, tipo_comida: c.tipo_comida,
      });
    }
  }
  return { entradas, consumos };
}
