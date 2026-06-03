/* ============================================================
   Golden Touch · Tesorería · Tasas de cambio (BCV)
   Tasa oficial del BCV para USD y EUR. La trae una Edge Function
   (`tasa-bcv`) desde una API pública y la cachea por día en `config`
   + historial en `tasa_cambio`. El euro es solo referencial (no hay
   caja en euros). Conversión con la fórmula del BCV, 2 decimales.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { MonedaTasa, TasaCambio, TasaHoy, TasaSnapshot } from '@/shared/lib/types';

const CONFIG_KEY = 'tesoreria.tasa_hoy';

/** Redondeo a 2 decimales (se aplica en cada cálculo). */
export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Bs = monto extranjero × tasa BCV. */
export function aBs(montoExtranjero: number, tasa: number): number {
  return round2((Number(montoExtranjero) || 0) * (Number(tasa) || 0));
}

/** Monto extranjero = Bs ÷ tasa BCV. */
export function aExtranjero(montoBs: number, tasa: number): number {
  const t = Number(tasa) || 0;
  if (t <= 0) return 0;
  return round2((Number(montoBs) || 0) / t);
}

/** Fecha de hoy (YYYY-MM-DD) en horario de Venezuela. */
export function hoyVE(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
}

/** Lee el snapshot guardado en config (puede ser de un día anterior). */
async function leerSnapshot(): Promise<TasaHoy | null> {
  const { data } = await supabase.from('config').select('value').eq('key', CONFIG_KEY).maybeSingle();
  const v = data?.value as { usd?: number; eur?: number; fecha?: string } | undefined;
  if (!v || typeof v.usd !== 'number') return null;
  return { usd: v.usd, eur: typeof v.eur === 'number' ? v.eur : null, fecha: v.fecha ?? null };
}

/**
 * Tasa del día. Si el snapshot no es de hoy, invoca la Edge Function para
 * traerla (cache on-demand: el primer acceso del día la actualiza). Si la
 * API falla, cae a la última tasa conocida para no romper el navbar.
 */
export async function getTasaHoy(): Promise<TasaHoy> {
  const hoy = hoyVE();
  const snap = await leerSnapshot();
  if (snap && snap.fecha === hoy && snap.usd != null) return snap;

  try {
    const { data, error } = await supabase.functions.invoke<
      { ok: true; usd: number; eur: number | null; fecha: string } | { error: string }
    >('tasa-bcv', { body: {} });
    if (!error && data && 'ok' in data) return { usd: data.usd, eur: data.eur ?? null, fecha: data.fecha };
  } catch { /* sin conexión / función no desplegada: usamos lo último conocido */ }

  if (snap) return snap;
  // Último recurso: última fila por moneda del historial.
  return ultimaConocida();
}

/** Fuerza la actualización vía Edge Function (botón "Actualizar"). */
export async function refrescarTasa(): Promise<TasaHoy> {
  const { data, error } = await supabase.functions.invoke<
    { ok: true; usd: number; eur: number | null; fecha: string } | { error: string }
  >('tasa-bcv', { body: { force: true } });
  if (error) throw new Error(error.message ?? 'No se pudo actualizar la tasa');
  if (!data || 'error' in data) throw new Error((data as { error?: string })?.error || 'Respuesta inválida');
  return { usd: data.usd, eur: data.eur ?? null, fecha: data.fecha };
}

/** Última tasa conocida (por si no hay snapshot ni conexión). */
async function ultimaConocida(): Promise<TasaHoy> {
  const { data } = await supabase
    .from('tasa_cambio')
    .select('fecha, moneda, tasa')
    .order('fecha', { ascending: false })
    .limit(8);
  const rows = (data ?? []) as Array<{ fecha: string; moneda: MonedaTasa; tasa: number }>;
  const usdRow = rows.find((r) => r.moneda === 'USD');
  const eurRow = rows.find((r) => r.moneda === 'EUR');
  return {
    usd: usdRow ? Number(usdRow.tasa) : null,
    eur: eurRow ? Number(eurRow.tasa) : null,
    fecha: usdRow?.fecha ?? eurRow?.fecha ?? null,
  };
}

/** Corrección / carga manual de la tasa de una moneda (admin). Acepta cualquier
 *  moneda registrada (USD/EUR/USDT/COP o personalizada). */
export async function setTasaManual(input: { moneda: string; tasa: number; fecha?: string }): Promise<void> {
  const tasa = round2(Number(input.tasa) || 0);
  if (tasa <= 0) throw new Error('La tasa debe ser mayor que 0.');
  const fecha = input.fecha || hoyVE();

  const { error } = await supabase
    .from('tasa_cambio')
    .upsert({ fecha, moneda: input.moneda, tasa, fuente: 'manual' }, { onConflict: 'fecha,moneda,fuente' });
  if (error) throw error;

  // Si es la tasa de hoy, actualizamos el snapshot (conservando la otra moneda).
  if (fecha === hoyVE()) {
    const snap = (await leerSnapshot()) ?? { usd: null, eur: null, fecha };
    const nuevo = {
      usd: input.moneda === 'USD' ? tasa : snap.usd,
      eur: input.moneda === 'EUR' ? tasa : snap.eur,
      fecha,
    };
    await supabase.from('config').upsert(
      { key: CONFIG_KEY, value: nuevo, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );
  }

  // USDT/COP cargadas a mano también alimentan el gráfico (serie histórica).
  const par = input.moneda === 'USDT' ? 'USDT_VES' : input.moneda === 'COP' ? 'COP_USD' : null;
  if (par) await supabase.from('tasa_snapshot').insert({ par, tasa, fuente: 'manual' });
}

/** Historial de tasas filtrable por rango de fecha y moneda. */
export async function listHistorialTasas(filtros: { desde?: string; hasta?: string; moneda?: string } = {}): Promise<TasaCambio[]> {
  let q = supabase.from('tasa_cambio').select('*').order('fecha', { ascending: false }).order('moneda', { ascending: true });
  if (filtros.desde) q = q.gte('fecha', filtros.desde);
  if (filtros.hasta) q = q.lte('fecha', filtros.hasta);
  if (filtros.moneda) q = q.eq('moneda', filtros.moneda);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as TasaCambio[];
}

/* ───────────── Tasas de mercado (USDT/VES Binance, COP/USD) ───────────── */

/** Tasas vigentes para el módulo multimoneda. */
export interface TasasMercado {
  bcvUsd: number | null;    // Bs por 1 USD (BCV)
  usdtVes: number | null;   // Bs por 1 USDT (Binance P2P)
  copUsd: number | null;    // COP por 1 USD
  fecha: string | null;
}

/** Última tasa conocida de una moneda en `tasa_cambio` (cualquier fuente). */
async function ultimaTasaMoneda(moneda: MonedaTasa): Promise<{ tasa: number; fecha: string } | null> {
  const { data } = await supabase
    .from('tasa_cambio')
    .select('tasa, fecha')
    .eq('moneda', moneda)
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { tasa: Number(data.tasa), fecha: data.fecha as string };
}

/** Las 3 tasas de referencia del P2P de Binance (Bs por 1 USDT). */
export interface Binance3 {
  buy: number | null;       // COMPRA (lo que cobran al vender USDT)
  sell: number | null;      // VENTA (lo que pagan por USDT)
  promedio: number | null;  // punto medio
  at: string | null;
}

/** Fuerza la actualización (Edge Function Binance P2P) y devuelve las 3 tasas. */
export async function refrescarBinanceP2P(): Promise<Binance3> {
  const { data, error } = await supabase.functions.invoke<
    { ok: true; promedio: number; buy: number | null; sell: number | null; at: string } | { error: string }
  >('tasa-binance-p2p', { body: {} });
  if (error) throw new Error(error.message ?? 'No se pudo actualizar la tasa Binance');
  if (!data || 'error' in data) throw new Error((data as { error?: string })?.error || 'Respuesta inválida');
  return { buy: data.buy ?? null, sell: data.sell ?? null, promedio: data.promedio ?? null, at: data.at };
}

/** Últimas 3 tasas Binance guardadas (compra/venta/promedio). */
export async function getBinance3(): Promise<Binance3> {
  const { data } = await supabase
    .from('tasa_snapshot')
    .select('par, tasa, at')
    .in('par', ['USDT_VES', 'USDT_VES_BUY', 'USDT_VES_SELL'])
    .order('at', { ascending: false })
    .limit(30);
  const rows = (data ?? []) as Array<{ par: string; tasa: number; at: string }>;
  const ultima = (par: string): number | null => {
    const r = rows.find((x) => x.par === par);
    return r ? Number(r.tasa) : null;
  };
  return { buy: ultima('USDT_VES_BUY'), sell: ultima('USDT_VES_SELL'), promedio: ultima('USDT_VES'), at: rows[0]?.at ?? null };
}

/** Fuerza la actualización de la tasa COP/USD (Edge Function). */
export async function refrescarCop(): Promise<number> {
  const { data, error } = await supabase.functions.invoke<
    { ok: true; cop_usd: number } | { error: string }
  >('tasa-cop', { body: {} });
  if (error) throw new Error(error.message ?? 'No se pudo actualizar la tasa COP');
  if (!data || 'error' in data) throw new Error((data as { error?: string })?.error || 'Respuesta inválida');
  return data.cop_usd;
}

/**
 * Tasas de mercado para conversor/caja: BCV (USD), USDT/VES y COP/USD.
 * Lee lo último de BD; si USDT no está cargado hoy, intenta el Edge Function.
 */
export async function getTasasMercado(): Promise<TasasMercado> {
  const [bcv, usdt, cop] = await Promise.all([
    getTasaHoy().catch(() => ({ usd: null, eur: null, fecha: null } as TasaHoy)),
    ultimaTasaMoneda('USDT'),
    ultimaTasaMoneda('COP'),
  ]);
  let usdtVes = usdt?.tasa ?? null;
  if (usdtVes == null) {
    try { usdtVes = (await refrescarBinanceP2P()).promedio; } catch { /* sin función desplegada */ }
  }
  let copUsd = cop?.tasa ?? null;
  if (copUsd == null) {
    try { copUsd = await refrescarCop(); } catch { /* sin función desplegada */ }
  }
  return {
    bcvUsd: bcv.usd,
    usdtVes,
    copUsd,
    fecha: bcv.fecha ?? usdt?.fecha ?? cop?.fecha ?? null,
  };
}

/** Serie histórica de un par para el gráfico (más reciente primero). */
export async function listSnapshots(
  filtros: { par: string; desde?: string; hasta?: string; limit?: number } ,
): Promise<TasaSnapshot[]> {
  let q = supabase.from('tasa_snapshot').select('*').eq('par', filtros.par).order('at', { ascending: false });
  if (filtros.desde) q = q.gte('at', filtros.desde);
  if (filtros.hasta) q = q.lte('at', filtros.hasta);
  q = q.limit(filtros.limit ?? 200);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as TasaSnapshot[];
}
