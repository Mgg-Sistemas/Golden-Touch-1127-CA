// Golden Touch · Edge Function: tasa-cop
// Trae la tasa del peso colombiano (COP por 1 USD). Fuente primaria: TRM oficial
// de datos.gov.co (mcec-87by); fallback: open.er-api.com (gratis, sin key).
// Guarda en `tasa_cambio` (moneda COP, fuente trm|er_api) + `tasa_snapshot`
// (par COP_USD) para el gráfico.
//
// Respuesta: { ok: true, cop_usd: number, fuente, fecha, at }
// Env: SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY
//      COP_TRM_URL (opcional), COP_FALLBACK_URL (opcional)

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

/** TRM oficial: datos.gov.co (Socrata). Última fila por vigencia. */
async function trmOficial(url: string): Promise<number | null> {
  const resp = await fetch(url, { headers: { accept: 'application/json' } });
  if (!resp.ok) return null;
  const rows = await resp.json() as Array<Record<string, unknown>>;
  const v = Number(rows?.[0]?.valor);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Fallback: open.er-api.com → rates.COP (COP por 1 USD). */
async function erApi(url: string): Promise<number | null> {
  const resp = await fetch(url, { headers: { accept: 'application/json' } });
  if (!resp.ok) return null;
  const data = await resp.json() as { rates?: Record<string, number> };
  const v = Number(data?.rates?.COP);
  return Number.isFinite(v) && v > 0 ? v : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Supabase env vars faltantes' }, 500);
  const supabase = createClient(supabaseUrl, serviceKey);

  const trmUrl = Deno.env.get('COP_TRM_URL')
    ?? 'https://www.datos.gov.co/resource/mcec-87by.json?$order=vigenciadesde%20DESC&$limit=1';
  const fbUrl = Deno.env.get('COP_FALLBACK_URL') ?? 'https://open.er-api.com/v6/latest/USD';

  let copUsd: number | null = null;
  let fuente = 'trm';
  try { copUsd = await trmOficial(trmUrl); } catch { copUsd = null; }
  if (copUsd == null) {
    fuente = 'er_api';
    try { copUsd = await erApi(fbUrl); } catch { copUsd = null; }
  }
  if (copUsd == null) return json({ error: 'No se pudo obtener la tasa COP' }, 502);
  copUsd = round2(copUsd);

  const fecha = fechaHoyVE();
  const nowIso = new Date().toISOString();
  const { error: upErr } = await supabase.from('tasa_cambio').upsert(
    { fecha, moneda: 'COP', tasa: copUsd, fuente },
    { onConflict: 'fecha,moneda,fuente' },
  );
  if (upErr) return json({ error: 'No se pudo guardar el histórico', detail: upErr.message }, 500);
  await supabase.from('tasa_snapshot').insert({ par: 'COP_USD', tasa: copUsd, fuente, at: nowIso });

  return json({ ok: true, cop_usd: copUsd, fuente, fecha, at: nowIso });
});
