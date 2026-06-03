// Golden Touch · Edge Function: enviar-checklist (Brevo Transactional Email API)
// Envía la checklist "OC por lote" (relación de compras pendientes por pagar)
// en PDF a uno o varios correos. Recibe { pdf_base64, to_email, codigo, items, total }.
//
// Secrets (compartidos): BREVO_API_KEY · BREVO_FROM_EMAIL · BREVO_FROM_NAME

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let payload: { pdf_base64?: string; to_email?: string; codigo?: string; items?: number; total?: number };
  try { payload = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }

  const { pdf_base64, to_email, codigo, items, total } = payload;
  if (!pdf_base64) return json({ error: 'pdf_base64 es requerido' }, 400);
  if (!to_email || !/\S+@\S+\.\S+/.test(to_email)) return json({ error: 'to_email inválido' }, 400);

  const brevoKey = Deno.env.get('BREVO_API_KEY');
  const fromEmail = Deno.env.get('BREVO_FROM_EMAIL');
  const fromName = Deno.env.get('BREVO_FROM_NAME') ?? 'Golden Touch Inventario';
  if (!brevoKey || !fromEmail) return json({ error: 'Faltan secrets Brevo' }, 500);

  const cod = escapeHtml(codigo ?? 'OC por lote');
  const totalFmt = typeof total === 'number' ? `$ ${total.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;color:#1a1a1a">
      <h2 style="border-bottom:3px solid #ff8a00;padding-bottom:8px;margin-top:0">Checklist ${cod}</h2>
      <p style="font-size:14px">Relación de compras pendientes por pagar (cuentas por pagar).</p>
      <table style="border-collapse:collapse;width:100%;margin:1rem 0;font-size:14px">
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Órdenes</strong></td><td style="padding:6px 12px">${Number(items ?? 0)}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Monto total</strong></td><td style="padding:6px 12px">${totalFmt}</td></tr>
      </table>
      <p style="font-size:14px">Adjunto el detalle en PDF.</p>
      <p style="color:#888;font-size:12px;margin-top:32px;border-top:1px solid #ddd;padding-top:12px">Golden Touch 1127 C.A. · Sistema de Gestión de Inventarios</p>
    </div>`;

  const body = {
    sender: { email: fromEmail, name: fromName },
    to: [{ email: to_email }],
    subject: `Checklist ${codigo ?? 'OC por lote'} · Compras pendientes por pagar`,
    htmlContent: html,
    attachment: [{ name: `checklist-${(codigo ?? 'oc-por-lote')}.pdf`, content: pdf_base64 }],
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
  let respJson: { messageId?: string; message?: string } | null = null;
  try { respJson = respText ? JSON.parse(respText) : null; } catch { /* texto plano */ }
  if (!resp.ok) return json({ error: respJson?.message ?? respText ?? `HTTP ${resp.status}`, status: resp.status }, 502);

  return json({ ok: true, destinatarios: [to_email], id: respJson?.messageId ?? null });
});
