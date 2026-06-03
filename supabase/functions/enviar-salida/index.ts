// Golden Touch · Edge Function: enviar-salida (Brevo Transactional Email API)
// Espejo de `enviar-produccion` pero para comprobantes de salida/traslado de material.
// Recibe { movimiento_id, es_traslado?, pdf_base64, to_email? }. Si no se pasa
// `to_email`, envía a todos los usuarios admin/jefe.
//
// Secrets requeridos (ya configurados para enviar-trazabilidad):
//   BREVO_API_KEY · BREVO_FROM_EMAIL · BREVO_FROM_NAME

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fechaCorta(d: unknown): string {
  if (!d) return '—';
  const s = String(d);
  // Formato date 'YYYY-MM-DD' → 'DD/MM/YYYY'
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let payload: { movimiento_id?: string; es_traslado?: boolean; pdf_base64?: string; to_email?: string };
  try { payload = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }

  const { movimiento_id, es_traslado, pdf_base64, to_email } = payload;
  if (!movimiento_id || !pdf_base64) return json({ error: 'movimiento_id y pdf_base64 son requeridos' }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Supabase env vars faltantes' }, 500);

  const brevoKey = Deno.env.get('BREVO_API_KEY');
  const fromEmail = Deno.env.get('BREVO_FROM_EMAIL');
  const fromName = Deno.env.get('BREVO_FROM_NAME') ?? 'Golden Touch Inventario';
  if (!brevoKey || !fromEmail) return json({ error: 'Faltan secrets Brevo' }, 500);

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: mov, error: me } = await supabase
    .from('movimientos')
    .select('delta, almacen, destino, fecha_entrega, detalle, actor_name, actor, at, producto:productos(sku, nombre, unidad)')
    .eq('id', movimiento_id)
    .single();
  if (me || !mov) return json({ error: 'Movimiento no encontrado' }, 404);

  let destinatarios: string[];
  if (to_email && /\S+@\S+\.\S+/.test(to_email)) {
    destinatarios = [to_email];
  } else {
    const { data: admins } = await supabase.from('usuarios').select('email').in('role', ['admin', 'jefe']);
    destinatarios = (admins ?? []).map((a: { email: string }) => a.email).filter((e: string) => !!e && /\S+@\S+\.\S+/.test(e));
  }
  if (!destinatarios.length) return json({ error: 'No hay destinatarios (admin/jefe o to_email).' }, 400);

  const prod = (mov.producto ?? {}) as { sku?: string; nombre?: string; unidad?: string };
  const cant = Math.abs(Number(mov.delta) || 0);
  const titulo = es_traslado ? 'Traslado de material' : 'Salida de material';
  const etiquetaDestino = es_traslado ? 'Almacén destino' : 'Dirigido a';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;color:#1a1a1a">
      <h2 style="border-bottom:3px solid #ff8a00;padding-bottom:8px;margin-top:0">${titulo}</h2>
      <p>Material: <strong>${escapeHtml(prod.nombre ?? '—')}</strong>${prod.sku ? ` · ${escapeHtml(prod.sku)}` : ''}</p>
      <table style="border-collapse:collapse;width:100%;margin:1rem 0;font-size:14px">
        <tr><td style="padding:6px 12px;background:#f5f5f5;width:200px"><strong>Cantidad</strong></td><td style="padding:6px 12px">${cant} ${escapeHtml(prod.unidad ?? '')}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Almacén origen</strong></td><td style="padding:6px 12px">${escapeHtml(String(mov.almacen ?? '—'))}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>${etiquetaDestino}</strong></td><td style="padding:6px 12px">${escapeHtml(String(mov.destino ?? '—'))}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Fecha de entrega</strong></td><td style="padding:6px 12px">${fechaCorta(mov.fecha_entrega)}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Motivo / detalle</strong></td><td style="padding:6px 12px">${escapeHtml(String(mov.detalle ?? '—'))}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Registrado por</strong></td><td style="padding:6px 12px">${escapeHtml(String(mov.actor_name ?? mov.actor ?? '—'))}</td></tr>
      </table>
      <p style="font-size:14px">Adjunto el comprobante en PDF.</p>
      <p style="color:#888;font-size:12px;margin-top:32px;border-top:1px solid #ddd;padding-top:12px">Golden Touch 1127 C.A. · Sistema de Gestión de Inventarios</p>
    </div>`;

  const body = {
    sender: { email: fromEmail, name: fromName },
    to: destinatarios.map((email) => ({ email })),
    subject: `${titulo} · ${prod.nombre ?? 'material'}`,
    htmlContent: html,
    attachment: [{ name: `${es_traslado ? 'traslado' : 'salida'}-${movimiento_id.slice(0, 8)}.pdf`, content: pdf_base64 }],
  };

  let resp: Response;
  try {
    resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevoKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return json({ error: 'No se pudo contactar a Brevo', detail: String(e) }, 502);
  }

  const respText = await resp.text();
  let respJson: { messageId?: string; message?: string; code?: string } | null = null;
  try { respJson = respText ? JSON.parse(respText) : null; } catch { /* texto plano */ }
  if (!resp.ok) return json({ error: respJson?.message ?? respText ?? `HTTP ${resp.status}`, status: resp.status }, 502);

  return json({ ok: true, destinatarios, id: respJson?.messageId ?? null });
});
