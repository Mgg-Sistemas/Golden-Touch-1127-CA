/* ============================================================
   MGG · Tesorería · Tasas de cambio (BCV)
   Tasa oficial del BCV para USD y EUR. La trae una Edge Function
   (`tasa-bcv`) desde una API pública y la cachea por día en `config`
   + historial en `tasa_cambio`. El euro es solo referencial (no hay
   caja en euros). Conversión con la fórmula del BCV, 2 decimales.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { MonedaTasa, TasaCambio, TasaHoy } from '@/shared/lib/types';

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

/** Corrección / carga manual de la tasa de una moneda (admin). */
export async function setTasaManual(input: { moneda: MonedaTasa; tasa: number; fecha?: string }): Promise<void> {
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
}

/** Historial de tasas filtrable por rango de fecha y moneda. */
export async function listHistorialTasas(filtros: { desde?: string; hasta?: string; moneda?: MonedaTasa } = {}): Promise<TasaCambio[]> {
  let q = supabase.from('tasa_cambio').select('*').order('fecha', { ascending: false }).order('moneda', { ascending: true });
  if (filtros.desde) q = q.gte('fecha', filtros.desde);
  if (filtros.hasta) q = q.lte('fecha', filtros.hasta);
  if (filtros.moneda) q = q.eq('moneda', filtros.moneda);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as TasaCambio[];
}
