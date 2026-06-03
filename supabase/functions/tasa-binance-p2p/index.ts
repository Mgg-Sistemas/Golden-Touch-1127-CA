// Golden Touch · Edge Function: tasa-binance-p2p
// Trae la tasa USDT/VES del mercado P2P de Binance (promedio de las primeras
// ofertas) y la guarda en `tasa_cambio` (moneda USDT, fuente binance_p2p) +
// un punto en `tasa_snapshot` (par USDT_VES) para el gráfico día a día.
//
// El stream spot btcusdt NO sirve para esto: Binance no cotiza VES en spot,
// solo en P2P (C2C). Se consulta el endpoint público de búsqueda de anuncios.
//
// Body opcional: { tradeType?: 'BUY'|'SELL', rows?: number }
// Respuesta: { ok: true, usdt_ves: number, muestras: number, fecha, at }
//
// Env: SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY
//      BINANCE_P2P_URL (opcional; default endpoint C2C público)

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
function fechaHoyVE(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
}
function round2(n: number): number { return Math.round(n * 100) / 100; }

/** Mediana robusta (descarta extremos vacíos). */
function mediana(nums: number[]): number | null {
  const xs = nums.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

async function consultarP2P(url: string, tradeType: string, rows: number): Promise<number[]> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      asset: 'USDT', fiat: 'VES', tradeType, page: 1, rows,
      payTypes: [], countries: [], proMerchantAds: false, publisherType: null,
    }),
  });
  if (!resp.ok) throw new Error(`Binance P2P HTTP ${resp.status}`);
  const data = await resp.json() as { data?: Array<{ adv?: { price?: string } }> };
  return (data.data ?? []).map((d) => Number(d.adv?.price)).filter((n) => Number.isFinite(n) && n > 0);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let payload: { tradeType?: 'BUY' | 'SELL'; rows?: number } = {};
  try { payload = req.body ? await req.json() : {}; } catch { payload = {}; }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Supabase env vars faltantes' }, 500);
  const supabase = createClient(supabaseUrl, serviceKey);

  const url = Deno.env.get('BINANCE_P2P_URL')
    ?? 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';
  const rows = Math.min(20, Math.max(3, Number(payload.rows) || 10));

  // 3 tasas de referencia del P2P: VENTA (SELL), COMPRA (BUY) y PROMEDIO (midpoint).
  let sellArr: number[] = [], buyArr: number[] = [];
  try {
    [sellArr, buyArr] = await Promise.all([
      consultarP2P(url, 'SELL', rows).catch(() => [] as number[]),
      consultarP2P(url, 'BUY', rows).catch(() => [] as number[]),
    ]);
  } catch (e) {
    return json({ error: 'No se pudo contactar el P2P de Binance', detail: String(e) }, 502);
  }

  const sellM = mediana(sellArr);
  const buyM = mediana(buyArr);
  if (sellM == null && buyM == null) return json({ error: 'Binance P2P no devolvió precios' }, 502);
  const sell = sellM != null ? round2(sellM) : null;
  const buy = buyM != null ? round2(buyM) : null;
  const promedio = round2(
    sell != null && buy != null ? (sell + buy) / 2 : (sell ?? buy ?? 0),
  );

  const fecha = fechaHoyVE();
  const nowIso = new Date().toISOString();

  // Histórico del día: el PROMEDIO es la tasa USDT/VES de referencia.
  const { error: upErr } = await supabase.from('tasa_cambio').upsert(
    { fecha, moneda: 'USDT', tasa: promedio, fuente: 'binance_p2p' },
    { onConflict: 'fecha,moneda,fuente' },
  );
  if (upErr) return json({ error: 'No se pudo guardar el histórico', detail: upErr.message }, 500);

  // Snapshots de las 3 tasas para el gráfico (barras).
  const snaps: Array<{ par: string; tasa: number; fuente: string; at: string }> = [
    { par: 'USDT_VES', tasa: promedio, fuente: 'binance_p2p', at: nowIso },
  ];
  if (buy != null) snaps.push({ par: 'USDT_VES_BUY', tasa: buy, fuente: 'binance_p2p', at: nowIso });
  if (sell != null) snaps.push({ par: 'USDT_VES_SELL', tasa: sell, fuente: 'binance_p2p', at: nowIso });
  await supabase.from('tasa_snapshot').insert(snaps);

  return json({ ok: true, promedio, buy, sell, usdt_ves: promedio, fecha, at: nowIso });
});
