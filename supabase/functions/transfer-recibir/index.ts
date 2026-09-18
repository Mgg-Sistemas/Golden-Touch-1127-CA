// Edge Function: transfer-recibir (webhook ENTRANTE del puente inter-sistema)
// La llama por HTTP el transfer-enviar del OTRO sistema. Se autentica con el
// secreto compartido (header x-inter-secret), NO con JWT → deploy con
// --no-verify-jwt. Maneja:
//   - 'transferencia' de dinero / combustible: inserta una ENTRANTE en estado
//     'por_confirmar' (NO acredita: eso lo hace el operador al confirmar).
//     Idempotente por transf_id (índice único).
//   - 'transferencia' de casiterita: se acredita AUTOMÁTICO en inventario, en
//     un RPC transaccional (inter_recibir_casiterita) que primero RESERVA el
//     transf_id y solo acredita si ganó la reserva → nunca dos créditos.
//   - 'transferencia' de cuenta_por_cobrar: cargo incremental a la CxC del
//     cliente, en RPC (inter_recibir_cxc): idempotente por transf_id único.
//   - 'ack': marca la SALIENTE local del recurso indicado como 'recibida',
//     solo si seguía 'enviada' (no revive filas en 'error' ni revertidas).
//
// Requiere supabase/2026-09-18-puente-inter-atomico.sql aplicado.
// Secrets: INTER_SECRET · INTER_CAJA_ENTRANTE_ID (opcional: caja que recibe)
//          INTER_CASITERITA_PRODUCTO_ID (opcional: producto receptor).
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los provee la plataforma.
//
// Al llamador solo se le devuelven mensajes genéricos; el detalle va a los logs.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-inter-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Comparación en tiempo constante (se comparan los SHA-256, de largo fijo). */
async function secretoValido(recibido: string | null, esperado: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(recibido ?? '')),
    crypto.subtle.digest('SHA-256', enc.encode(esperado)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = recibido == null ? 1 : 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** Número finito y > 0 (y con techo razonable). null si no lo es. */
function positivo(v: unknown, max = 1e9): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n > 0 && n < max ? n : null;
}
/** Número finito ≥ 0, o null. */
function noNegativo(v: unknown, max = 1e9): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n < max ? n : null;
}
/** Texto recortado, o null. */
function texto(v: unknown, max: number): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

type Leg = { cuenta: string; moneda: string; monto: number; tasa_bs: number | null };
/** Legs bien formados: 1..20 renglones, moneda y cuenta cortas, monto > 0 finito. null si alguno es inválido. */
function legsValidos(v: unknown): Leg[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > 20) return null;
  const out: Leg[] = [];
  for (const l of v) {
    if (!l || typeof l !== 'object') return null;
    const o = l as Record<string, unknown>;
    const moneda = texto(o.moneda, 10);
    const cuenta = texto(o.cuenta ?? 'general', 40);
    const monto = positivo(o.monto, 1e12);
    if (!moneda || !/^[A-Za-z0-9]+$/.test(moneda)) return null;
    if (!cuenta || !/^[A-Za-z0-9_ -]+$/.test(cuenta)) return null;
    if (monto == null) return null;
    const tasa = o.tasa_bs == null || o.tasa_bs === '' ? null : positivo(o.tasa_bs, 1e12);
    if (o.tasa_bs != null && o.tasa_bs !== '' && tasa == null) return null;
    out.push({ cuenta, moneda, monto: Math.round(monto * 100) / 100, tasa_bs: tasa });
  }
  return out;
}

const FALLO = 'No se pudo procesar la transferencia en el sistema destino.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secret = Deno.env.get('INTER_SECRET');
  if (!secret) {
    console.error('[transfer-recibir] INTER_SECRET no configurado');
    return json({ error: 'Receptor no configurado' }, 500);
  }
  if (!(await secretoValido(req.headers.get('x-inter-secret'), secret))) return json({ error: 'No autorizado' }, 401);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }
  if (!payload || typeof payload !== 'object') return json({ error: 'Body JSON inválido' }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    console.error('[transfer-recibir] faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    return json({ error: 'Receptor no configurado' }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const transfId = typeof payload.transf_id === 'string' ? payload.transf_id.trim() : '';
  if (!UUID_RE.test(transfId)) return json({ error: 'transf_id inválido' }, 400);

  const recursoRaw = typeof payload.recurso === 'string' ? payload.recurso : 'dinero';
  const RECURSOS = ['dinero', 'combustible', 'casiterita', 'cuenta_por_cobrar'];
  if (!RECURSOS.includes(recursoRaw)) return json({ error: 'Recurso no soportado' }, 400);
  const recurso = recursoRaw as 'dinero' | 'combustible' | 'casiterita' | 'cuenta_por_cobrar';

  const tablaDe: Record<string, string> = {
    dinero: 'transferencias_inter',
    combustible: 'transferencias_combustible_inter',
    casiterita: 'transferencias_casiterita_inter',
  };

  // ── ACK: el otro sistema confirmó nuestra saliente de ESE recurso ──
  if (payload.tipo === 'ack') {
    const TABLE = tablaDe[recurso];
    if (!TABLE) return json({ error: 'Recurso sin ACK' }, 400);
    // Solo 'enviada' → 'recibida'. Una fila en 'error' pudo haberse revertido
    // (o estar por revertirse): revivirla duplicaría el recurso entre sistemas.
    const { data, error } = await supabase.from(TABLE)
      .update({ estado: 'recibida', confirmada_at: new Date().toISOString() })
      .eq('transf_id', transfId).eq('direccion', 'saliente').eq('estado', 'enviada')
      .select('id');
    if (error) {
      console.error('[transfer-recibir] ack', recurso, transfId, error);
      return json({ error: FALLO }, 500);
    }
    return json({ ok: true, ack: true, aplicado: (data ?? []).length > 0 });
  }

  // ── Cuenta por COBRAR (deuda de un centro de costo externo, p. ej. GT) ──
  if (recurso === 'cuenta_por_cobrar') {
    const monto = positivo(payload.monto, 1e12);
    if (monto == null) return json({ error: 'monto inválido' }, 400);
    const moneda = texto(payload.moneda, 10) ?? 'USD';
    if (!/^[A-Za-z0-9]{2,10}$/.test(moneda)) return json({ error: 'moneda inválida' }, 400);
    const { data, error } = await supabase.rpc('inter_recibir_cxc', {
      p: {
        transf_id: transfId, monto: Math.round(monto * 100) / 100, moneda,
        cliente_nombre: texto(payload.cliente_nombre, 200),
        empresa_origen: texto(payload.empresa_origen, 80),
        actor: texto(payload.actor, 200), actor_name: texto(payload.actor_name, 200),
      },
    });
    const r = data as { ok?: boolean; dedup?: boolean; cuenta_id?: string; error?: string } | null;
    if (error || !r?.ok) {
      console.error('[transfer-recibir] cxc', transfId, error ?? r);
      return json({ error: FALLO }, error ? 500 : 422);
    }
    return json({ ok: true, dedup: Boolean(r.dedup), cuenta_id: r.cuenta_id });
  }

  // ── CASITERITA: recepción AUTOMÁTICA (reserva + crédito atómicos en el RPC) ──
  if (recurso === 'casiterita') {
    const kg = positivo(payload.kg);
    if (kg == null) return json({ error: 'kg inválido' }, 400);
    const costo = noNegativo(payload.costo_unitario);
    const { data, error } = await supabase.rpc('inter_recibir_casiterita', {
      p: {
        transf_id: transfId, kg, costo_unitario: costo,
        almacen_destino: texto(payload.almacen_destino, 120),
        producto_id: Deno.env.get('INTER_CASITERITA_PRODUCTO_ID') || null,
        empresa_origen: texto(payload.empresa_origen, 80), empresa_destino: texto(payload.empresa_destino, 80),
        producto_nombre: texto(payload.producto_nombre, 200), sku: texto(payload.sku, 80),
        resumen: texto(payload.resumen, 500), motivo: texto(payload.motivo, 500),
        callback_base: texto(payload.callback_base, 300),
        actor: texto(payload.actor, 200), actor_name: texto(payload.actor_name, 200),
      },
    });
    const r = data as { ok?: boolean; dedup?: boolean; estado?: string; error?: string; detalle?: string } | null;
    if (error || !r?.ok) {
      console.error('[transfer-recibir] casiterita', transfId, error ?? r);
      // NO-OK → el origen deja su saliente en 'error' y puede reintentar (idempotente).
      return json({ error: 'No se pudo acreditar la casiterita en el sistema destino.' }, error ? 500 : 422);
    }
    return json({ ok: true, recibida: true, dedup: Boolean(r.dedup) });
  }

  // ── Dinero / combustible: guardar como entrante 'por_confirmar' (idempotente) ──
  const TABLE = tablaDe[recurso];

  const { data: existe } = await supabase.from(TABLE)
    .select('id, estado').eq('transf_id', transfId).maybeSingle();
  if (existe) return json({ ok: true, dedup: true, estado: (existe as { estado: string }).estado });

  const base = {
    transf_id: transfId, direccion: 'entrante', estado: 'por_confirmar',
    empresa_origen: texto(payload.empresa_origen, 80) ?? 'desconocido',
    empresa_destino: texto(payload.empresa_destino, 80) ?? 'desconocido',
    resumen: texto(payload.resumen, 500), motivo: texto(payload.motivo, 500),
    callback_base: texto(payload.callback_base, 300),
    actor: texto(payload.actor, 200), actor_name: texto(payload.actor_name, 200),
  };

  let fila: Record<string, unknown>;
  if (recurso === 'combustible') {
    const litros = positivo(payload.litros);
    if (litros == null) return json({ error: 'litros inválidos' }, 400);
    const costoLitro = noNegativo(payload.costo_litro);
    fila = {
      ...base,
      combustible_nombre: texto(payload.combustible_nombre, 80) ?? 'Combustible',
      litros, costo_litro: costoLitro,
      // El tanque que recibe lo elige el operador al confirmar.
    };
  } else {
    const legs = legsValidos(payload.legs);
    if (!legs) return json({ error: 'legs inválidos' }, 400);
    fila = { ...base, caja_id: Deno.env.get('INTER_CAJA_ENTRANTE_ID') || null, legs };
  }

  const { error } = await supabase.from(TABLE).insert(fila);
  if (error) {
    // Si chocó por unicidad (carrera con otro reintento), es idempotencia OK.
    if ((error as { code?: string }).code === '23505') return json({ ok: true, dedup: true });
    console.error('[transfer-recibir] insert', recurso, transfId, error);
    return json({ error: FALLO }, 500);
  }
  return json({ ok: true });
});
