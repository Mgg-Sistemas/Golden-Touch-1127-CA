// MGG · Edge Function: tasa-metales  (fuente: commoditypriceapi.com)
// Trae precios de metales en USD (incluido ESTAÑO/TIN, que ustedes funden) y
// los guarda en `tasa_snapshot` (par METAL_*). Los precios vienen ya en USD por
// la unidad indicada en metadata (TIN/ZINC/níquel/aluminio/plomo = tonelada,
// cobre = libra, oro/plata = onza), sin inversión. Pensada para el cron 2×/día.
//
// commoditypriceapi: GET /v2/rates/latest?apiKey=KEY&symbols=TIN,HG-SPOT
//   → { success, rates:{ TIN:57408, ... }, metadata:{ TIN:{unit,quote} } }
// El plan "lite" limita los símbolos por request → se piden en lotes de 2.
//
// Respuestas:
//   200 { ok:true, precios, at, cached, faltantes?, motivo? }  ← motivo = por qué faltan
//   200 { ok:false, motivo }   ← SOLO "sin API key" y sin respaldo: no rompe el cron
//   502 { ok:false, error }    ← la API rechazó la key / límite / sin precios
//   500 { ok:false, error }    ← no se pudo guardar
// Throttle: un metal con snapshot de hace < 10 min no se vuelve a pedir ni a
// guardar (salvo force de un admin); si todos están frescos no se llama a la API.
//
// Env: SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY
//      METALES_API_KEY · METALES_API_URL (opcional)
//      TASAS_CRON_SECRET · TASAS_EXIGIR_AUTH (ver _shared/tasas.ts)

import {
  CORS, json, identificarLlamador, forceDeAdmin, fetchT, leerPayload,
  ultimosSnapshots, esReciente, round2, positivo,
} from '../_shared/tasas.ts';

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

// Respaldo GRATIS y sin key (gold-api.com): oro, plata y cobre. Se usa cuando
// commoditypriceapi no da precio (09/11/2026: respondía HTTP 402 = plan vencido)
// o no hay METALES_API_KEY. GET /price/XAU → { price, symbol, updatedAt }.
// Unidades iguales a las de arriba: oro/plata USD/onza, cobre (HG) USD/libra.
const RESPALDO: Record<string, string> = { METAL_ORO: 'XAU', METAL_PLATA: 'XAG', METAL_COBRE: 'HG' };
const RESPALDO_URL = 'https://api.gold-api.com/price/';

async function precioRespaldo(sym: string): Promise<number | null> {
  try {
    const resp = await fetchT(RESPALDO_URL + encodeURIComponent(sym), { headers: { accept: 'application/json' } });
    if (!resp.ok) { console.warn(`tasa-metales: respaldo ${sym} HTTP ${resp.status}`); return null; }
    const data = await resp.json() as { price?: number };
    return positivo(data?.price);
  } catch (e) {
    console.warn(`tasa-metales: respaldo ${sym}`, e instanceof Error ? e.name : 'error');
    return null;
  }
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const llamador = await identificarLlamador(req);
  if (llamador instanceof Response) return llamador;
  const supabase = llamador.db;

  // Sin key igual se intenta el respaldo gratis (oro, plata, cobre).
  const apiKey = Deno.env.get('METALES_API_KEY');

  const payload = await leerPayload<{ force?: boolean }>(req);
  const forzar = forceDeAdmin(llamador, payload);

  // Throttle por par.
  let previos;
  try {
    previos = await ultimosSnapshots(supabase, MAPA.map((m) => m.par));
  } catch (e) {
    console.error('tasa-metales: leer snapshots', e);
    return json({ ok: false, error: 'No se pudieron leer los últimos precios' }, 500);
  }
  const pendientes = forzar ? MAPA : MAPA.filter((m) => !esReciente(previos.get(m.par)));
  if (!pendientes.length) {
    const precios: Record<string, number> = {};
    let at = '';
    for (const m of MAPA) {
      const s = previos.get(m.par);
      if (s) { precios[m.par] = s.tasa; if (s.at > at) at = s.at; }
    }
    return json({ ok: true, precios, at, cached: true });
  }

  const base = Deno.env.get('METALES_API_URL') ?? 'https://api.commoditypriceapi.com/v2/rates/latest';

  // Lotes de 2 símbolos (límite del plan lite). 8 metales → 4 requests.
  const rates: Record<string, number> = {};
  const fallas: string[] = [];
  let keyRechazada = false;
  let limite = false;
  let sinPago = false;
  for (const grupo of (apiKey ? chunk(pendientes, 2) : [])) {
    const symbols = grupo.map((g) => g.sym).join(',');
    try {
      const resp = await fetchT(
        `${base}?apiKey=${encodeURIComponent(apiKey ?? '')}&symbols=${encodeURIComponent(symbols)}`,
        { headers: { accept: 'application/json' } },
      );
      if (resp.status === 401 || resp.status === 403) keyRechazada = true;
      if (resp.status === 429) limite = true;
      if (resp.status === 402) sinPago = true;
      if (!resp.ok) { fallas.push(`${symbols}: HTTP ${resp.status}`); continue; }
      const data = await resp.json() as { success?: boolean; rates?: Record<string, number> };
      if (data?.success === false) { fallas.push(`${symbols}: success=false`); continue; }
      Object.assign(rates, data?.rates ?? {});
    } catch (e) {
      fallas.push(`${symbols}: ${e instanceof Error ? e.name : 'error'}`);
    }
  }
  if (fallas.length) console.warn('tasa-metales: lotes con falla', fallas);

  // Respaldo gratis para oro/plata/cobre que la API paga no trajo.
  const respaldo: Record<string, number> = {};
  await Promise.all(pendientes
    .filter((d) => RESPALDO[d.par] && positivo(rates[d.sym]) == null)
    .map(async (d) => {
      const v = await precioRespaldo(RESPALDO[d.par]);
      if (v != null) respaldo[d.par] = v;
    }));

  const nowIso = new Date().toISOString();
  const snaps: Array<{ par: string; tasa: number; fuente: string; at: string }> = [];
  const out: Record<string, number> = {};
  const faltantes: string[] = [];
  for (const d of pendientes) {
    const pago = positivo(rates[d.sym]);
    const v = pago ?? respaldo[d.par] ?? null;
    if (v != null) {
      const r = round2(v);
      snaps.push({ par: d.par, tasa: r, fuente: pago != null ? 'commoditypriceapi' : 'gold-api', at: nowIso });
      out[d.par] = r;
    } else {
      faltantes.push(d.par);
    }
  }
  // Por qué la API paga no trajo precios (se devuelve para que la vista lo explique).
  const motivoApi = !apiKey
    ? 'METALES_API_KEY no configurada'
    : keyRechazada
      ? 'La API de metales rechazó la key (revisá METALES_API_KEY)'
      : sinPago
        ? 'El plan de la API de metales (commoditypriceapi) está vencido o sin créditos (pago requerido)'
        : limite
          ? 'La API de metales llegó al límite del plan; probá más tarde'
          : 'La API de metales no devolvió precios';
  if (!snaps.length) {
    if (!apiKey) return json({ ok: false, motivo: motivoApi });
    return json({ ok: false, error: motivoApi }, 502);
  }
  const { error: insErr } = await supabase.from('tasa_snapshot').insert(snaps);
  if (insErr) {
    console.error('tasa-metales: guardar snapshots', insErr);
    return json({ ok: false, error: 'No se pudieron guardar los precios de metales' }, 500);
  }

  return json({
    ok: true, precios: out, at: nowIso, cached: false,
    ...(faltantes.length ? { faltantes, motivo: motivoApi } : {}),
  });
});
