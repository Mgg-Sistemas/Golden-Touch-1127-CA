// MGG · Edge Function: transfer-enviar (proxy SALIENTE del puente inter-sistema)
// La invoca el cliente (con su JWT) para empujar al OTRO sistema:
//   - tipo 'transferencia': una transferencia nueva → POST a {INTER_DESTINO_URL}/transfer-recibir
//   - tipo 'ack':           confirmación de recepción → POST a {callback_base}/transfer-recibir
// Autentica contra el otro sistema con el secreto compartido INTER_SECRET
// (NO se expone la service-role de ninguna base). Incluye callback_base propio
// (este SUPABASE_URL) para que el destino sepa a quién devolver el ACK.
//
// Secrets: INTER_SECRET · INTER_DESTINO_URL (base .../functions/v1 del otro sistema)
// SUPABASE_URL lo provee la plataforma.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }

  const secret = Deno.env.get('INTER_SECRET');
  if (!secret) return json({ entregada: false, error: 'INTER_SECRET no configurado en este sistema.' });

  const selfUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const callbackBase = (payload.callback_base as string) || (selfUrl ? `${selfUrl}/functions/v1` : '');

  // Resolver destino según el tipo.
  let target: string;
  if (payload.tipo === 'ack') {
    const cb = payload.callback_base as string | undefined;
    if (!cb) return json({ entregada: false, error: 'callback_base faltante para el ACK.' });
    target = `${cb.replace(/\/+$/, '')}/transfer-recibir`;
  } else {
    const destino = Deno.env.get('INTER_DESTINO_URL');
    if (!destino) return json({ entregada: false, error: 'Destino no configurado todavía: definí INTER_DESTINO_URL al desplegar el otro sistema.' });
    target = `${destino.replace(/\/+$/, '')}/transfer-recibir`;
  }

  const body = { ...payload, callback_base: callbackBase };
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
