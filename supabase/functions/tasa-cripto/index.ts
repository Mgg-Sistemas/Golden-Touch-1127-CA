// MGG · Edge Function: tasa-cripto
// Trae los precios de BTC/ETH/SOL/BNB en USD desde CoinGecko (API pública, sin
// key) y guarda un punto en `tasa_snapshot` por cada par (BTC_USD…) para el
// historial. Pensada para el cron 2×/día; el cliente también puede traerlos
// directo (CoinGecko tiene CORS), esto asegura la serie aunque nadie abra la app.
//
// Respuesta: { ok: true, precios: {BTC_USD, ETH_USD, SOL_USD, BNB_USD}, at }
// Env: SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · COINGECKO_URL (opcional)

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
function round2(n: number): number { return Math.round(n * 100) / 100; }

const DEF: Array<{ id: string; par: string }> = [
  { id: 'bitcoin', par: 'BTC_USD' },
  { id: 'ethereum', par: 'ETH_USD' },
  { id: 'solana', par: 'SOL_USD' },
  { id: 'binancecoin', par: 'BNB_USD' },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Supabase env vars faltantes' }, 500);
  const supabase = createClient(supabaseUrl, serviceKey);

  const ids = DEF.map((d) => d.id).join(',');
  const base = Deno.env.get('COINGECKO_URL') ?? 'https://api.coingecko.com/api/v3/simple/price';
  let precios: Record<string, { usd?: number }> = {};
  try {
    const resp = await fetch(`${base}?ids=${ids}&vs_currencies=usd`, { headers: { accept: 'application/json' } });
    if (!resp.ok) return json({ error: `CoinGecko HTTP ${resp.status}` }, 502);
    precios = await resp.json();
  } catch (e) {
    return json({ error: 'No se pudo contactar CoinGecko', detail: String(e) }, 502);
  }

  const nowIso = new Date().toISOString();
  const snaps: Array<{ par: string; tasa: number; fuente: string; at: string }> = [];
  const out: Record<string, number> = {};
  for (const d of DEF) {
    const usd = Number(precios?.[d.id]?.usd);
    if (Number.isFinite(usd) && usd > 0) {
      const v = round2(usd);
      snaps.push({ par: d.par, tasa: v, fuente: 'coingecko', at: nowIso });
      out[d.par] = v;
    }
  }
  if (!snaps.length) return json({ error: 'CoinGecko no devolvió precios' }, 502);
  await supabase.from('tasa_snapshot').insert(snaps);

  return json({ ok: true, precios: out, at: nowIso });
});
