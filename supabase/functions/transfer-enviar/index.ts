// GT · Edge Function: transfer-enviar (proxy SALIENTE del puente inter-sistema)
// La invoca el cliente (con su JWT) para empujar al OTRO sistema:
//   - tipo 'transferencia': una transferencia nueva → POST a {INTER_DESTINO_URL}/transfer-recibir
//   - tipo 'ack':           confirmación de recepción → POST al callback, YA VALIDADO
// Autentica contra el otro sistema con el secreto compartido INTER_SECRET
// (NO se expone la service-role de ninguna base).
//
// Secrets: INTER_SECRET · INTER_DESTINO_URL (base .../functions/v1 del otro sistema)
//          INTER_CALLBACK_ALLOWLIST (opcional: orígenes extra permitidos para el ACK,
//          separados por coma; p. ej. "https://abc.supabase.co")
// SUPABASE_URL lo provee la plataforma.
//
// ─────────────────────────────────────────────────────────────────────────────
// SEGURIDAD (corregido 02/09/2026 · hallazgo GT-EXT-01)
// Antes esta función no leía `Authorization` y tomaba la URL de destino del
// cuerpo del pedido. Cualquiera con la anon key (que es pública) podía pedirle
// que llamara a su propio servidor y quedarse con INTER_SECRET, que es la
// llave de la función privilegiada de AMBOS sistemas. Ahora:
//   1) exige sesión válida y cuenta activa;
//   2) el destino del ACK se valida contra una lista blanca de orígenes.
// ─────────────────────────────────────────────────────────────────────────────

import { CORS, json, exigirSesion } from '../_shared/auth.ts';

/** Orígenes a los que este sistema acepta mandar el secreto compartido. */
function origenesPermitidos(): string[] {
  const lista: string[] = [];
  const destino = Deno.env.get('INTER_DESTINO_URL');
  if (destino) {
    try { lista.push(new URL(destino).origin); } catch { /* mal configurado: se ignora */ }
  }
  for (const extra of (Deno.env.get('INTER_CALLBACK_ALLOWLIST') ?? '').split(',')) {
    const v = extra.trim();
    if (!v) continue;
    try { lista.push(new URL(v).origin); } catch { /* entrada inválida: se ignora */ }
  }
  return lista;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // 1) Sesión válida antes de tocar nada. Sin esto, el resto es de acceso público.
  const sesion = await exigirSesion(req);
  if (sesion instanceof Response) return sesion;

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }

  const secret = Deno.env.get('INTER_SECRET');
  if (!secret) return json({ entregada: false, error: 'INTER_SECRET no configurado en este sistema.' });

  const selfUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const callbackPropio = selfUrl ? `${selfUrl}/functions/v1` : '';

  // 2) Resolver destino. NUNCA se toma crudo del cuerpo.
  let target: string;
  if (payload.tipo === 'ack') {
    const cb = payload.callback_base as string | undefined;
    if (!cb) return json({ entregada: false, error: 'callback_base faltante para el ACK.' });

    let origen: string;
    try { origen = new URL(cb).origin; }
    catch { return json({ entregada: false, error: 'callback_base no es una URL válida.' }, 400); }

    const permitidos = origenesPermitidos();
    if (!permitidos.includes(origen)) {
      // El secreto compartido solo viaja a sistemas que configuramos nosotros.
      return json({ entregada: false, error: 'Destino de ACK no permitido.' }, 403);
    }
    target = `${cb.replace(/\/+$/, '')}/transfer-recibir`;
  } else {
    const destino = Deno.env.get('INTER_DESTINO_URL');
    if (!destino) return json({ entregada: false, error: 'Destino no configurado todavía: definí INTER_DESTINO_URL al desplegar el otro sistema.' });
    target = `${destino.replace(/\/+$/, '')}/transfer-recibir`;
  }

  // 3) El callback que anunciamos es SIEMPRE el propio, no el que venga en el cuerpo.
  const body = { ...payload, callback_base: callbackPropio, origen_actor: sesion.email };

  let resp: Response;
  try {
    resp = await fetch(target, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-inter-secret': secret },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return json({ entregada: false, error: `No se pudo contactar al otro sistema: ${String(e)}` });
  }

  const text = await resp.text();
  if (!resp.ok) return json({ entregada: false, error: `El otro sistema respondió ${resp.status}: ${text}` });
  return json({ entregada: true, respuesta: text });
});
