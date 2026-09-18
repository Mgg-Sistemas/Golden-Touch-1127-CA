// Golden Touch · Edge Function: tasa-binance-p2p
// Trae la tasa USDT/VES del mercado P2P de Binance (mediana de las primeras
// ofertas) y la guarda en `tasa_cambio` (moneda USDT, fuente binance_p2p) +
// un punto en `tasa_snapshot` (par USDT_VES) para el gráfico día a día.
//
// El stream spot btcusdt NO sirve para esto: Binance no cotiza VES en spot,
// solo en P2P (C2C). Se consulta el endpoint público de búsqueda de anuncios.
//
// Salvaguardas (18/09/2026):
//   · Throttle: si ya hay un USDT_VES de hace < 10 min se devuelve ese (salvo
//     force de un admin).
//   · Cada lado (compra/venta) necesita al menos 3 ofertas válidas.
//   · Si el promedio se aleja más de 30 % del último snapshot guardado, se
//     descarta (no se guarda). Si el mercado realmente saltó, un admin carga la
//     tasa a mano (setTasaManual) y eso pasa a ser la nueva referencia.
//
// Body opcional: { rows?: number, force?: boolean }
// Respuesta: { ok: true, promedio, buy, sell, usdt_ves, fecha, at, cached }
//
// Env: SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY
//      BINANCE_P2P_URL (opcional; default endpoint C2C público)
//      TASAS_CRON_SECRET · TASAS_EXIGIR_AUTH (ver _shared/tasas.ts)

import {
  CORS, json, identificarLlamador, forceDeAdmin, fetchT, leerPayload,
  ultimosSnapshots, esReciente, fechaHoyVE, round2,
} from '../_shared/tasas.ts';

const MIN_MUESTRAS = 3;
const MAX_DESVIO = 0.30;
const PARES = ['USDT_VES', 'USDT_VES_BUY', 'USDT_VES_SELL'];

/** Mediana robusta (descarta no finitos / no positivos); null con < MIN_MUESTRAS. */
function mediana(nums: number[]): number | null {
  const xs = nums.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (xs.length < MIN_MUESTRAS) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

async function consultarP2P(url: string, tradeType: string, rows: number): Promise<number[]> {
  const resp = await fetchT(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      asset: 'USDT', fiat: 'VES', tradeType, page: 1, rows,
      payTypes: [], countries: [], proMerchantAds: false, publisherType: null,
    }),
  });
  if (!resp.ok) throw new Error(`Binance P2P HTTP ${resp.status}`);
  const data = await resp.json() as { data?: Array<{ adv?: { price?: string } }> };
  return (data?.data ?? []).map((d) => Number(d.adv?.price)).filter((n) => Number.isFinite(n) && n > 0);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const llamador = await identificarLlamador(req);
  if (llamador instanceof Response) return llamador;
  const supabase = llamador.db;

  const payload = await leerPayload<{ rows?: number; force?: boolean }>(req);
  const forzar = forceDeAdmin(llamador, payload);

  // Últimos guardados: sirven para el throttle y para el control de desvío.
  let previos;
  try {
    previos = await ultimosSnapshots(supabase, PARES);
  } catch (e) {
    console.error('tasa-binance-p2p: leer snapshots', e);
    return json({ error: 'No se pudo leer la última tasa guardada' }, 500);
  }
  const ultimo = previos.get('USDT_VES');

  if (!forzar && ultimo && esReciente(ultimo)) {
    const buy = previos.get('USDT_VES_BUY')?.tasa ?? null;
    const sell = previos.get('USDT_VES_SELL')?.tasa ?? null;
    return json({
      ok: true, promedio: ultimo.tasa, buy, sell, usdt_ves: ultimo.tasa,
      fecha: fechaHoyVE(), at: ultimo.at, cached: true,
    });
  }

  const url = Deno.env.get('BINANCE_P2P_URL')
    ?? 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';
  const rows = Math.min(20, Math.max(MIN_MUESTRAS, Number(payload.rows) || 10));

  // 3 tasas de referencia del P2P: VENTA (SELL), COMPRA (BUY) y PROMEDIO (midpoint).
  const [sellArr, buyArr] = await Promise.all([
    consultarP2P(url, 'SELL', rows).catch((e) => { console.warn('tasa-binance-p2p: SELL', e); return [] as number[]; }),
    consultarP2P(url, 'BUY', rows).catch((e) => { console.warn('tasa-binance-p2p: BUY', e); return [] as number[]; }),
  ]);

  const sellM = mediana(sellArr);
  const buyM = mediana(buyArr);
  if (sellM == null && buyM == null) {
    return json({ error: `Binance P2P no devolvió suficientes precios (mínimo ${MIN_MUESTRAS} ofertas)` }, 502);
  }
  const sell = sellM != null ? round2(sellM) : null;
  const buy = buyM != null ? round2(buyM) : null;
  const promedio = round2(
    sell != null && buy != null ? (sell + buy) / 2 : (sell ?? buy ?? 0),
  );
  if (!(promedio > 0)) return json({ error: 'Binance P2P no devolvió precios válidos' }, 502);

  // Control de cordura contra el último snapshot (si lo hay).
  if (ultimo && ultimo.tasa > 0) {
    const desvio = Math.abs(promedio / ultimo.tasa - 1);
    if (desvio > MAX_DESVIO) {
      console.warn(`tasa-binance-p2p: descartada ${promedio} (último ${ultimo.tasa}, desvío ${(desvio * 100).toFixed(1)} %)`);
      return json({
        error: `La tasa de Binance (${promedio}) se aleja más de ${MAX_DESVIO * 100} % de la última guardada (${ultimo.tasa}); no se guardó. Si es correcta, cargala a mano.`,
      }, 502);
    }
  }

  const fecha = fechaHoyVE();
  const nowIso = new Date().toISOString();

  // Histórico del día: el PROMEDIO es la tasa USDT/VES de referencia.
  const { error: upErr } = await supabase.from('tasa_cambio').upsert(
    { fecha, moneda: 'USDT', tasa: promedio, fuente: 'binance_p2p' },
    { onConflict: 'fecha,moneda,fuente' },
  );
  if (upErr) {
    console.error('tasa-binance-p2p: guardar histórico', upErr);
    return json({ error: 'No se pudo guardar el histórico' }, 500);
  }

  // Snapshots de las 3 tasas para el gráfico (barras).
  const snaps: Array<{ par: string; tasa: number; fuente: string; at: string }> = [
    { par: 'USDT_VES', tasa: promedio, fuente: 'binance_p2p', at: nowIso },
  ];
  if (buy != null) snaps.push({ par: 'USDT_VES_BUY', tasa: buy, fuente: 'binance_p2p', at: nowIso });
  if (sell != null) snaps.push({ par: 'USDT_VES_SELL', tasa: sell, fuente: 'binance_p2p', at: nowIso });
  const { error: snapErr } = await supabase.from('tasa_snapshot').insert(snaps);
  if (snapErr) {
    console.error('tasa-binance-p2p: guardar snapshots', snapErr);
    return json({ error: 'No se pudo guardar la tasa en el historial del gráfico' }, 500);
  }

  return json({ ok: true, promedio, buy, sell, usdt_ves: promedio, fecha, at: nowIso, cached: false });
});
