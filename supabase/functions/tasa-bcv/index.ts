// Golden Touch · Edge Function: tasa-bcv
// Trae la tasa oficial del BCV (USD y EUR) desde una API pública y la guarda
// en `tasa_cambio` (historial) + `config` (snapshot del día). Cache diario:
// si ya existe la del día y no se fuerza, la devuelve sin volver a consultar.
//
// Body opcional: { force?: boolean }
//   · force de un admin pleno: consulta siempre.
//   · force de cualquier otro: solo consulta si lo guardado tiene ≥ 10 min
//     (throttle en servidor); si no, devuelve lo guardado.
// Respuesta: { ok: true, usd: number, eur: number|null, fecha: 'YYYY-MM-DD', cached: boolean }
//
// Quién puede llamarla: ver _shared/tasas.ts (usuario activo, cron de servicio
// o —en transición— la anon con throttle).
//
// Env:
//   SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY (estándar)
//   BCV_API_URL (opcional; un endpoint con ambas) · BCV_USD_URL · BCV_EUR_URL
//   TASAS_CRON_SECRET · TASAS_EXIGIR_AUTH (ver _shared/tasas.ts)

import {
  CORS, json, identificarLlamador, forceDeAdmin, fetchT, leerPayload,
  esReciente, fechaHoyVE, round2, positivo,
} from '../_shared/tasas.ts';

/** Extrae un precio numérico (> 0 y finito) de varias formas posibles del payload. */
function precio(monitor: unknown): number | null {
  if (monitor == null) return null;
  if (typeof monitor === 'object') {
    const m = monitor as Record<string, unknown>;
    return positivo(m.price ?? m.promedio ?? m.value ?? m.tasa);
  }
  return positivo(monitor);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const llamador = await identificarLlamador(req);
  if (llamador instanceof Response) return llamador;
  const supabase = llamador.db;

  const payload = await leerPayload<{ force?: boolean }>(req);
  const forzarAdmin = forceDeAdmin(llamador, payload);
  const pideForce = payload.force === true;

  const fecha = fechaHoyVE();

  // 1) Cache: la del día (sin force) o lo guardado hace < 10 min (force de no-admin).
  if (!forzarAdmin) {
    const { data: cfg, error: cfgErr } = await supabase
      .from('config').select('value, updated_at').eq('key', 'tesoreria.tasa_hoy').maybeSingle();
    if (cfgErr) console.error('tasa-bcv: leer config', cfgErr);
    const v = cfg?.value as { usd?: number; eur?: number; fecha?: string } | undefined;
    if (v && typeof v.usd === 'number') {
      const delDia = v.fecha === fecha;
      const reciente = esReciente(cfg?.updated_at ? { at: String(cfg.updated_at) } : null);
      if ((!pideForce && delDia) || reciente) {
        return json({ ok: true, usd: v.usd, eur: v.eur ?? null, fecha: v.fecha ?? fecha, cached: true });
      }
    }
  }

  // 2) Consultar la API pública del BCV (USD y EUR oficiales, endpoints separados).
  //    Por defecto ve.dolarapi.com; configurable por env. Acepta también un único
  //    endpoint estilo pydolarve (monitors.usd/eur) vía BCV_API_URL.
  const usdUrl = Deno.env.get('BCV_USD_URL') ?? 'https://ve.dolarapi.com/v1/dolares/oficial';
  const eurUrl = Deno.env.get('BCV_EUR_URL') ?? 'https://ve.dolarapi.com/v1/euros/oficial';
  const singleUrl = Deno.env.get('BCV_API_URL'); // opcional: un endpoint con ambas
  let usd: number | null = null;
  let eur: number | null = null;
  try {
    if (singleUrl) {
      const resp = await fetchT(singleUrl, { headers: { accept: 'application/json' } });
      if (!resp.ok) return json({ error: `API BCV respondió HTTP ${resp.status}` }, 502);
      const data = await resp.json() as Record<string, unknown>;
      const monitors = ((data?.monitors ?? data) ?? {}) as Record<string, unknown>;
      usd = precio(monitors.usd) ?? precio(data?.usd);
      eur = precio(monitors.eur) ?? precio(data?.eur);
    } else {
      const [ru, re] = await Promise.all([
        fetchT(usdUrl, { headers: { accept: 'application/json' } }),
        fetchT(eurUrl, { headers: { accept: 'application/json' } }).catch(() => null),
      ]);
      if (!ru.ok) return json({ error: `API BCV (USD) respondió HTTP ${ru.status}` }, 502);
      usd = precio(await ru.json());
      if (re && re.ok) eur = precio(await re.json().catch(() => null));
    }
  } catch (e) {
    console.error('tasa-bcv: consultar API', e);
    return json({ error: 'No se pudo contactar la API del BCV' }, 502);
  }
  // Validación final en TODAS las rutas: finito y > 0.
  if (positivo(usd) == null) return json({ error: 'La API no devolvió la tasa USD del BCV' }, 502);
  usd = round2(usd as number);
  eur = positivo(eur) != null ? round2(eur as number) : null;

  // 3) Guardar en historial (upsert por fecha+moneda+fuente).
  const filas: Array<{ fecha: string; moneda: string; tasa: number; fuente: string }> = [
    { fecha, moneda: 'USD', tasa: usd, fuente: 'bcv' },
  ];
  if (eur != null) filas.push({ fecha, moneda: 'EUR', tasa: eur, fuente: 'bcv' });
  const { error: upErr } = await supabase.from('tasa_cambio').upsert(filas, { onConflict: 'fecha,moneda,fuente' });
  if (upErr) {
    console.error('tasa-bcv: guardar historial', upErr);
    return json({ error: 'No se pudo guardar el historial' }, 500);
  }

  // 4) Snapshot del día en config.
  const { error: cfgUpErr } = await supabase.from('config').upsert(
    { key: 'tesoreria.tasa_hoy', value: { usd, eur, fecha }, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );
  if (cfgUpErr) {
    console.error('tasa-bcv: guardar snapshot del día', cfgUpErr);
    return json({ error: 'No se pudo guardar la tasa del día' }, 500);
  }

  return json({ ok: true, usd, eur, fecha, cached: false });
});
