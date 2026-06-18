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

  const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

  // ── Cuenta por COBRAR (deuda de un centro de costo externo, p. ej. GT) ──
  // El otro sistema (centro de acopio) nos avisa que nos entregó USD: lo
  // registramos como cuenta por cobrar de ESE cliente, INCREMENTAL (se acumula en
  // una sola cuenta abierta por moneda). Idempotente por transf_id (tag en la nota).
  if ((payload.recurso as string | undefined) === 'cuenta_por_cobrar' && payload.tipo !== 'ack') {
    const monto = round2(Number(payload.monto));
    if (monto <= 0) return json({ ok: true, skip: 'monto<=0' });
    const moneda = (payload.moneda as string) || 'USD';
    const cliente = ((payload.cliente_nombre as string) || (payload.empresa_origen as string) || 'Centro de costo externo').trim();
    const tag = `#${transfId}`;
    // Idempotencia: si ya entró este transf_id (tag en la nota de un cargo), salir.
    const { data: yaCargo } = await supabase.from('cuentas_por_cobrar_cargos').select('id').ilike('nota', `%${tag}%`).limit(1);
    if (yaCargo && yaCargo.length) return json({ ok: true, dedup: true });
    const nota = `USD entregados (centro de costo) · ${payload.empresa_origen ?? ''} ${tag}`.trim();
    // Buscar cuenta abierta del cliente en esa moneda → acumular; si no, crear.
    const { data: abiertas } = await supabase.from('cuentas_por_cobrar').select('*')
      .eq('tipo', 'cliente').eq('moneda', moneda).eq('estado', 'abierta')
      .ilike('contraparte', cliente).order('created_at', { ascending: false }).limit(1);
    let cuenta = (abiertas?.[0] ?? null) as { id: string; monto: number; cobrado: number } | null;
    if (cuenta) {
      const { data: cu, error } = await supabase.from('cuentas_por_cobrar')
        .update({ monto: round2(Number(cuenta.monto) + monto), estado: 'abierta', updated_at: new Date().toISOString() })
        .eq('id', cuenta.id).select('*').single();
      if (error) return json({ error: error.message }, 500);
      cuenta = cu as typeof cuenta;
    } else {
      const { data: cu, error } = await supabase.from('cuentas_por_cobrar').insert({
        tipo: 'cliente', contraparte: cliente, monto, cobrado: 0, moneda, estado: 'abierta',
        nota, actor: payload.actor ?? null, actor_name: payload.actor_name ?? null,
      }).select('*').single();
      if (error) return json({ error: error.message }, 500);
      cuenta = cu as typeof cuenta;
    }
    const totalAdeudado = round2(Number(cuenta!.monto) - (Number(cuenta!.cobrado) || 0));
    await supabase.from('cuentas_por_cobrar_cargos').insert({
      cuenta_id: cuenta!.id, monto, moneda, total_adeudado: totalAdeudado, nota,
      actor: payload.actor ?? null, actor_name: payload.actor_name ?? null,
    });
    return json({ ok: true, cuenta_id: cuenta!.id });
  }

  // El recurso determina la tabla destino: dinero (default) o combustible (litros).
  const recurso = (payload.recurso as string | undefined) === 'combustible' ? 'combustible' : 'dinero';
  const TABLE = recurso === 'combustible' ? 'transferencias_combustible_inter' : 'transferencias_inter';

  // ── ACK: el otro sistema confirmó nuestra saliente ──
  if (payload.tipo === 'ack') {
    const { error } = await supabase.from(TABLE)
      .update({ estado: 'recibida', confirmada_at: new Date().toISOString() })
      .eq('transf_id', transfId).eq('direccion', 'saliente');
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, ack: true });
  }

  // ── Transferencia nueva: guardar como entrante (idempotente) ──
  const { data: existe } = await supabase.from(TABLE)
    .select('id, estado').eq('transf_id', transfId).maybeSingle();
  if (existe) return json({ ok: true, dedup: true, estado: (existe as { estado: string }).estado });

  // Fila común a ambos recursos.
  const base = {
    transf_id: transfId, direccion: 'entrante', estado: 'por_confirmar',
    empresa_origen: payload.empresa_origen ?? 'desconocido',
    empresa_destino: payload.empresa_destino ?? 'desconocido',
    resumen: payload.resumen ?? null, motivo: payload.motivo ?? null,
    callback_base: payload.callback_base ?? null,
    actor: payload.actor ?? null, actor_name: payload.actor_name ?? null,
  };

  const fila = recurso === 'combustible'
    ? {
        ...base,
        combustible_nombre: payload.combustible_nombre ?? 'Combustible',
        litros: payload.litros ?? 0,
        costo_litro: payload.costo_litro ?? null,
        // El tanque MGG que recibe lo elige el operador al confirmar.
      }
    : {
        ...base,
        caja_id: Deno.env.get('INTER_CAJA_ENTRANTE_ID') || null,
        legs: payload.legs ?? [],
      };

  const { error } = await supabase.from(TABLE).insert(fila);
  if (error) {
    // Si chocó por unicidad (carrera con otro reintento), es idempotencia OK.
    if ((error as { code?: string }).code === '23505') return json({ ok: true, dedup: true });
    return json({ error: error.message }, 500);
  }
  return json({ ok: true });
});
