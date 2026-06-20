// Golden Touch · Edge Function: enviar-trazabilidad (Brevo Transactional Email API)
// El puerto 587 (SMTP) no está disponible desde Supabase Edge Functions —
// el runtime solo permite HTTP/HTTPS de salida. Usamos la API REST de Brevo,
// que es el mismo servicio y respeta el mismo remitente verificado.
//
// Recibe { orden_id, pdf_base64, to_email? }. Si no se pasa `to_email`,
// envía a todos los usuarios admin/jefe.
//
// Secrets requeridos en Supabase:
//   BREVO_API_KEY        (API key de https://app.brevo.com/settings/keys/api)
//   BREVO_FROM_EMAIL     (remitente verificado en Brevo)
//   BREVO_FROM_NAME      (nombre del remitente, ej: "Golden Touch Inventario")

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let payload: { orden_id?: string; pdf_base64?: string; to_email?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Body JSON inválido' }, 400);
  }

  const { orden_id, pdf_base64, to_email } = payload;
  if (!orden_id || !pdf_base64) {
    return json({ error: 'orden_id y pdf_base64 son requeridos' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Supabase env vars faltantes' }, 500);

  const brevoKey = Deno.env.get('BREVO_API_KEY');
  const fromEmail = Deno.env.get('BREVO_FROM_EMAIL');
  const fromName = Deno.env.get('BREVO_FROM_NAME') ?? 'Golden Touch Inventario';
  if (!brevoKey || !fromEmail) {
    return json({ error: 'Faltan secrets Brevo (BREVO_API_KEY y/o BREVO_FROM_EMAIL)' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: orden, error: oe } = await supabase
    .from('ordenes')
    .select('codigo, oc_codigo, solicitante, unidad_solicitante, ci_solicitante, total, estado, created_at, aprobada_en, oc_emitida_en')
    .eq('id', orden_id)
    .single();
  if (oe || !orden) return json({ error: 'Orden no encontrada' }, 404);

  let destinatarios: string[];
  if (to_email && /\S+@\S+\.\S+/.test(to_email)) {
    destinatarios = [to_email];
  } else {
    const { data: admins } = await supabase
      .from('usuarios')
      .select('email')
      .in('role', ['admin', 'jefe']);
    destinatarios = (admins ?? [])
      .map((a: { email: string }) => a.email)
      .filter((e: string) => !!e && /\S+@\S+\.\S+/.test(e));
  }
  if (!destinatarios.length) {
    return json({ error: 'No hay destinatarios (configurá al menos un usuario admin/jefe o pasá to_email).' }, 400);
  }

  const totalFmt = `$ ${Number(orden.total).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fechaFmt = (iso?: string | null): string => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('es-VE', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
        timeZone: 'America/Caracas',
      });
    } catch { return String(iso); }
  };
  const ref = orden.oc_codigo ? `${orden.codigo} · OC ${orden.oc_codigo}` : orden.codigo;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;color:#1a1a1a">
      <h2 style="border-bottom:3px solid #ff8a00;padding-bottom:8px;margin-top:0">
        Trazabilidad de orden ${escapeHtml(ref)}
      </h2>
      <p>Hola,</p>
      <p>Adjunto el reporte de trazabilidad completo de la orden <strong>${escapeHtml(orden.codigo)}</strong>.</p>
      <table style="border-collapse:collapse;width:100%;margin:1rem 0;font-size:14px">
        <tr><td style="padding:6px 12px;background:#f5f5f5;width:190px"><strong>Unidad solicitante</strong></td>
            <td style="padding:6px 12px">${escapeHtml(orden.unidad_solicitante ?? '—')}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Solicitado por</strong></td>
            <td style="padding:6px 12px">${escapeHtml(orden.solicitante ?? '—')}${orden.ci_solicitante ? ` · C.I. ${escapeHtml(orden.ci_solicitante)}` : ''}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Fecha de solicitud (SP)</strong></td>
            <td style="padding:6px 12px">${fechaFmt(orden.created_at)}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>SP aprobada el</strong></td>
            <td style="padding:6px 12px">${fechaFmt(orden.aprobada_en)}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>OC emitida el</strong></td>
            <td style="padding:6px 12px">${fechaFmt(orden.oc_emitida_en)}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Estado actual</strong></td>
            <td style="padding:6px 12px">${escapeHtml(orden.estado)}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Total</strong></td>
            <td style="padding:6px 12px">${totalFmt}</td></tr>
      </table>
      <p style="font-size:14px">
        El PDF adjunto incluye: solicitud, ítems, ofertas de proveedores, orden de compra final y recepción de mercancía.
      </p>
      <p style="color:#888;font-size:12px;margin-top:32px;border-top:1px solid #ddd;padding-top:12px">
        Golden Touch 1127 C.A. · Sistema de Gestión de Inventarios · Generado automáticamente
      </p>
    </div>
  `;

  const body = {
    sender: { email: fromEmail, name: fromName },
    to: destinatarios.map((email) => ({ email })),
    subject: `Trazabilidad orden ${orden.codigo}`,
    htmlContent: html,
    attachment: [
      {
        name: `trazabilidad-${orden.codigo}.pdf`,
        content: pdf_base64,
      },
    ],
  };

  console.log('[enviar-trazabilidad] Brevo → from=', fromEmail, 'to=', destinatarios, 'orden=', orden.codigo);

  let resp: Response;
  try {
    resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error('[enviar-trazabilidad] fetch a Brevo falló:', e);
    return json({ error: 'No se pudo contactar a Brevo', detail: String(e) }, 502);
  }

  const respText = await resp.text();
  let respJson: { messageId?: string; message?: string; code?: string } | null = null;
  try { respJson = respText ? JSON.parse(respText) : null; } catch { /* texto plano */ }

  if (!resp.ok) {
    const msg = respJson?.message ?? respText ?? `HTTP ${resp.status}`;
    console.error('[enviar-trazabilidad] Brevo HTTP', resp.status, msg);
    return json({ error: msg, status: resp.status, code: respJson?.code }, 502);
  }

  console.log('[enviar-trazabilidad] Brevo OK messageId=', respJson?.messageId);
  return json({ ok: true, destinatarios, id: respJson?.messageId ?? null });
});
