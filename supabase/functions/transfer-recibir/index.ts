// MGG · Edge Function: transfer-recibir (webhook ENTRANTE del puente inter-sistema)
// La llama por HTTP el transfer-enviar del OTRO sistema. Se autentica con el
// secreto compartido (header x-inter-secret), NO con JWT → deploy con
// --no-verify-jwt. Maneja dos tipos:
//   - 'transferencia': inserta una transferencia ENTRANTE en estado
//     'por_confirmar' (NO acredita saldo: eso lo hace el operador al confirmar).
//     Idempotente por transf_id (id global) → un reintento no duplica.
//   - 'ack': marca la transferencia SALIENTE local como 'recibida' (el otro
//     sistema confirmó la recepción).
//
// Secrets: INTER_SECRET · INTER_CAJA_ENTRANTE_ID (opcional: caja que recibe).
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los provee la plataforma.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-inter-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secret = Deno.env.get('INTER_SECRET');
  if (!secret) return json({ error: 'INTER_SECRET no configurado en este sistema.' }, 500);
  if (req.headers.get('x-inter-secret') !== secret) return json({ error: 'No autorizado' }, 401);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Supabase env vars faltantes' }, 500);
  const supabase = createClient(supabaseUrl, serviceKey);

  const transfId = payload.transf_id as string | undefined;
  if (!transfId) return json({ error: 'transf_id requerido' }, 400);

  // ── COMBUSTIBLE · ACK: el otro sistema confirmó nuestra transferencia de litros ──
  if (payload.tipo === 'combustible-ack') {
    const { error } = await supabase.from('combustible_transferencias')
      .update({ estado: 'recibida', confirmada_at: new Date().toISOString() })
      .eq('transf_id', transfId).eq('direccion', 'saliente');
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, ack: true, combustible: true });
  }

  // ── COMBUSTIBLE · entrante: guardar pendiente (NO acredita el tanque: eso lo
  //    hace el operador al confirmar). Idempotente por transf_id. ──
  if (payload.tipo === 'combustible') {
    const { data: ya } = await supabase.from('combustible_transferencias')
      .select('id, estado').eq('transf_id', transfId).maybeSingle();
    if (ya) return json({ ok: true, dedup: true, estado: (ya as { estado: string }).estado });
    const { error } = await supabase.from('combustible_transferencias').insert({
      transf_id: transfId, direccion: 'entrante', estado: 'por_confirmar',
      empresa_origen: payload.empresa_origen ?? 'desconocido',
      empresa_destino: payload.empresa_destino ?? 'desconocido',
      tanque_origen_nombre: payload.tanque_origen_nombre ?? null,
      tanque_destino_nombre: payload.tanque_destino_nombre ?? 'TANQUE MGG',
      litros: payload.litros ?? 0,
      costo_litro: payload.costo_litro ?? null,
      combustible: payload.combustible ?? null,
      resumen: payload.resumen ?? null, motivo: payload.motivo ?? null,
      callback_base: payload.callback_base ?? null,
      actor: payload.actor ?? null, actor_name: payload.actor_name ?? null,
    });
    if (error) {
      if ((error as { code?: string }).code === '23505') return json({ ok: true, dedup: true });
      return json({ error: error.message }, 500);
    }
    return json({ ok: true, combustible: true });
  }

  // ── ACK: el otro sistema confirmó nuestra saliente ──
  if (payload.tipo === 'ack') {
    const { error } = await supabase.from('transferencias_inter')
      .update({ estado: 'recibida', confirmada_at: new Date().toISOString() })
      .eq('transf_id', transfId).eq('direccion', 'saliente');
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, ack: true });
  }

  // ── Transferencia nueva: guardar como entrante (idempotente) ──
  const { data: existe } = await supabase.from('transferencias_inter')
    .select('id, estado').eq('transf_id', transfId).maybeSingle();
  if (existe) return json({ ok: true, dedup: true, estado: (existe as { estado: string }).estado });

  const cajaEntrante = Deno.env.get('INTER_CAJA_ENTRANTE_ID') || null;
  const { error } = await supabase.from('transferencias_inter').insert({
    transf_id: transfId, direccion: 'entrante', estado: 'por_confirmar',
    empresa_origen: payload.empresa_origen ?? 'desconocido',
    empresa_destino: payload.empresa_destino ?? 'desconocido',
    caja_id: cajaEntrante,
    legs: payload.legs ?? [], resumen: payload.resumen ?? null, motivo: payload.motivo ?? null,
    callback_base: payload.callback_base ?? null,
    actor: payload.actor ?? null, actor_name: payload.actor_name ?? null,
  });
  if (error) {
    // Si chocó por unicidad (carrera con otro reintento), es idempotencia OK.
    if ((error as { code?: string }).code === '23505') return json({ ok: true, dedup: true });
    return json({ error: error.message }, 500);
  }
  return json({ ok: true });
});
