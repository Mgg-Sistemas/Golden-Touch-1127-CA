// MGG · Edge Function: tasa-metales  (fuente: commoditypriceapi.com)
// Trae precios de metales en USD (incluido ESTAÑO/TIN, que ustedes funden) y
// los guarda en `tasa_snapshot` (par METAL_*). Los precios vienen ya en USD por
// la unidad indicada en metadata (TIN/ZINC/níquel/aluminio/plomo = tonelada,
// cobre = libra, oro/plata = onza), sin inversión. Pensada para el cron 2×/día.
// Sin key configurada devuelve ok:false (no rompe el cron).
//
// commoditypriceapi: GET /v2/rates/latest?apiKey=KEY&symbols=TIN,HG-SPOT
//   → { success, rates:{ TIN:57408, ... }, metadata:{ TIN:{unit,quote} } }
// El plan "lite" limita los símbolos por request → se piden en lotes de 2.
//
// Respuesta: { ok, precios?, at } | { ok:false, motivo }
// Env: SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY
//      METALES_API_KEY · METALES_API_URL (opcional)

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

// PAR interno → símbolo en commoditypriceapi (el precio ya viene en USD por su unidad)
const MAPA: Array<{ par: string; sym: string }> = [
  { par: 'METAL_ESTANO', sym: 'TIN' },          // USD/tonelada
  { par: 'METAL_COBRE', sym: 'HG-SPOT' },        // USD/libra
  { par: 'METAL_ALUMINIO', sym: 'AL-SPOT' },     // USD/tonelada
  { par: 'METAL_NIQUEL', sym: 'NICKEL-SPOT' },   // USD/tonelada
  { par: 'METAL_ZINC', sym: 'ZINC' },            // USD/tonelada
  { par: 'METAL_PLOMO', sym: 'LEAD-SPOT' },      // USD/tonelada
  { par: 'METAL_ORO', sym: 'XAU' },              // USD/onza
  { par: 'METAL_PLATA', sym: 'XAG' },            // USD/onza
];

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Supabase env vars faltantes' }, 500);

  const apiKey = Deno.env.get('METALES_API_KEY');
  if (!apiKey) return json({ ok: false, motivo: 'METALES_API_KEY no configurada' });

  const supabase = createClient(supabaseUrl, serviceKey);
  const base = Deno.env.get('METALES_API_URL') ?? 'https://api.commoditypriceapi.com/v2/rates/latest';

  // Lotes de 2 símbolos (límite del plan lite). 8 metales → 4 requests.
  const rates: Record<string, number> = {};
  for (const grupo of chunk(MAPA, 2)) {
    const symbols = grupo.map((g) => g.sym).join(',');
    try {
      const resp = await fetch(`${base}?apiKey=${apiKey}&symbols=${encodeURIComponent(symbols)}`, { headers: { accept: 'application/json' } });
      if (!resp.ok) continue;
      const data = await resp.json() as { rates?: Record<string, number> };
      Object.assign(rates, data.rates ?? {});
    } catch { /* seguimos con los demás lotes */ }
  }

  const nowIso = new Date().toISOString();
  const snaps: Array<{ par: string; tasa: number; fuente: string; at: string }> = [];
  const out: Record<string, number> = {};
  for (const d of MAPA) {
    const v = Number(rates[d.sym]);
    if (Number.isFinite(v) && v > 0) {
      const r = round2(v);
      snaps.push({ par: d.par, tasa: r, fuente: 'commoditypriceapi', at: nowIso });
      out[d.par] = r;
    }
  }
  if (!snaps.length) return json({ ok: false, motivo: 'La API no devolvió precios (revisá la key o el límite del plan)' });
  await supabase.from('tasa_snapshot').insert(snaps);

  return json({ ok: true, precios: out, at: nowIso });
});
