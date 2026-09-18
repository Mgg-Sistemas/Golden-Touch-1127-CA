// Golden Touch · Edge Function: tasa-cop
// Trae la tasa del peso colombiano (COP por 1 USD). Fuente primaria: TRM oficial
// de datos.gov.co (mcec-87by); fallback: open.er-api.com (gratis, sin key).
// Guarda en `tasa_cambio` (moneda COP, fuente trm|er_api) + `tasa_snapshot`
// (par COP_USD) para el gráfico.
//
// Cada consulta externa tiene su propio timeout de 8 s: si la TRM se cuelga,
// se aborta y todavía queda tiempo para el respaldo er-api.
// Throttle: si ya hay un COP_USD de hace < 10 min se devuelve ese (salvo force
// de un admin).
//
// Body opcional: { force?: boolean }
// Respuesta: { ok: true, cop_usd: number, fuente, fecha, at, cached }
// Env: SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY
//      COP_TRM_URL (opcional), COP_FALLBACK_URL (opcional)
//      TASAS_CRON_SECRET · TASAS_EXIGIR_AUTH (ver _shared/tasas.ts)

import {
  CORS, json, identificarLlamador, forceDeAdmin, fetchT, leerPayload,
  ultimosSnapshots, esReciente, fechaHoyVE, round2, positivo,
} from '../_shared/tasas.ts';

/** TRM oficial: datos.gov.co (Socrata). Última fila por vigencia. */
async function trmOficial(url: string): Promise<number | null> {
  const resp = await fetchT(url, { headers: { accept: 'application/json' } });
  if (!resp.ok) return null;
  const rows = await resp.json() as Array<Record<string, unknown>>;
  return positivo(Array.isArray(rows) ? rows[0]?.valor : null);
}

/** Fallback: open.er-api.com → rates.COP (COP por 1 USD). */
async function erApi(url: string): Promise<number | null> {
  const resp = await fetchT(url, { headers: { accept: 'application/json' } });
  if (!resp.ok) return null;
  const data = await resp.json() as { rates?: Record<string, number> };
  return positivo(data?.rates?.COP);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const llamador = await identificarLlamador(req);
  if (llamador instanceof Response) return llamador;
  const supabase = llamador.db;

  const payload = await leerPayload<{ force?: boolean }>(req);
  const forzar = forceDeAdmin(llamador, payload);

  if (!forzar) {
    let previos;
    try {
      previos = await ultimosSnapshots(supabase, ['COP_USD']);
    } catch (e) {
      console.error('tasa-cop: leer snapshot', e);
      return json({ error: 'No se pudo leer la última tasa guardada' }, 500);
    }
    const ultimo = previos.get('COP_USD');
    if (ultimo && esReciente(ultimo)) {
      return json({
        ok: true, cop_usd: ultimo.tasa, fuente: ultimo.fuente, fecha: fechaHoyVE(), at: ultimo.at, cached: true,
      });
    }
  }

  const trmUrl = Deno.env.get('COP_TRM_URL')
    ?? 'https://www.datos.gov.co/resource/mcec-87by.json?$order=vigenciadesde%20DESC&$limit=1';
  const fbUrl = Deno.env.get('COP_FALLBACK_URL') ?? 'https://open.er-api.com/v6/latest/USD';

  let copUsd: number | null = null;
  let fuente = 'trm';
  try { copUsd = await trmOficial(trmUrl); } catch (e) { console.warn('tasa-cop: TRM', e); copUsd = null; }
  if (copUsd == null) {
    fuente = 'er_api';
    try { copUsd = await erApi(fbUrl); } catch (e) { console.warn('tasa-cop: er-api', e); copUsd = null; }
  }
  if (copUsd == null) return json({ error: 'No se pudo obtener la tasa COP' }, 502);
  copUsd = round2(copUsd);

  const fecha = fechaHoyVE();
  const nowIso = new Date().toISOString();
  const { error: upErr } = await supabase.from('tasa_cambio').upsert(
    { fecha, moneda: 'COP', tasa: copUsd, fuente },
    { onConflict: 'fecha,moneda,fuente' },
  );
  if (upErr) {
    console.error('tasa-cop: guardar histórico', upErr);
    return json({ error: 'No se pudo guardar el histórico' }, 500);
  }
  const { error: snapErr } = await supabase.from('tasa_snapshot')
    .insert({ par: 'COP_USD', tasa: copUsd, fuente, at: nowIso });
  if (snapErr) {
    console.error('tasa-cop: guardar snapshot', snapErr);
    return json({ error: 'No se pudo guardar la tasa en el historial del gráfico' }, 500);
  }

  return json({ ok: true, cop_usd: copUsd, fuente, fecha, at: nowIso, cached: false });
});
