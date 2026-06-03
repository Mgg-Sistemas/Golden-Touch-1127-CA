// Golden Touch · Edge Function: enviar-produccion (Brevo Transactional Email API)
// Espejo de `enviar-trazabilidad` pero para reportes de producción.
// Recibe { produccion_id, pdf_base64, to_email? }. Si no se pasa `to_email`,
// envía a todos los usuarios admin/jefe.
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

function money(n: unknown): string {
  return `$ ${Number(n ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let payload: { produccion_id?: string; pdf_base64?: string; to_email?: string };
  try { payload = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }

  const { produccion_id, pdf_base64, to_email } = payload;
  if (!produccion_id || !pdf_base64) return json({ error: 'produccion_id y pdf_base64 son requeridos' }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Supabase env vars faltantes' }, 500);

  const brevoKey = Deno.env.get('BREVO_API_KEY');
  const fromEmail = Deno.env.get('BREVO_FROM_EMAIL');
  const fromName = Deno.env.get('BREVO_FROM_NAME') ?? 'Golden Touch Inventario';
  if (!brevoKey || !fromEmail) return json({ error: 'Faltan secrets Brevo' }, 500);

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: prod, error: pe } = await supabase
    .from('produccion')
    .select('producto_nombre, cantidad, estado, costo_material, mano_obra, costos_indirectos, costo_unitario, precio_venta, ganancia')
    .eq('id', produccion_id)
    .single();
  if (pe || !prod) return json({ error: 'Producción no encontrada' }, 404);

  let destinatarios: string[];
  if (to_email && /\S+@\S+\.\S+/.test(to_email)) {
    destinatarios = [to_email];
  } else {
    const { data: admins } = await supabase.from('usuarios').select('email').in('role', ['admin', 'jefe']);
    destinatarios = (admins ?? []).map((a: { email: string }) => a.email).filter((e: string) => !!e && /\S+@\S+\.\S+/.test(e));
  }
  if (!destinatarios.length) return json({ error: 'No hay destinatarios (admin/jefe o to_email).' }, 400);

  const cp = Number(prod.costo_material) + Number(prod.mano_obra) + Number(prod.costos_indirectos);
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;color:#1a1a1a">
      <h2 style="border-bottom:3px solid #ff8a00;padding-bottom:8px;margin-top:0">Reporte de producción</h2>
      <p>Producto producido: <strong>${escapeHtml(prod.producto_nombre)}</strong> · ${Number(prod.cantidad)} u (${escapeHtml(prod.estado)})</p>
      <table style="border-collapse:collapse;width:100%;margin:1rem 0;font-size:14px">
        <tr><td style="padding:6px 12px;background:#f5f5f5;width:220px"><strong>Costo Total Materiales (CTM)</strong></td><td style="padding:6px 12px">${money(prod.costo_material)}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Costo de Producción (CP)</strong></td><td style="padding:6px 12px">${money(cp)}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Costo unitario (PMP)</strong></td><td style="padding:6px 12px">${money(prod.costo_unitario)}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Posible ganancia</strong></td><td style="padding:6px 12px">${prod.ganancia != null ? money(prod.ganancia) : '—'}</td></tr>
      </table>
      <p style="font-size:14px">Adjunto el PDF con el detalle del proceso y los materiales utilizados.</p>
      <p style="color:#888;font-size:12px;margin-top:32px;border-top:1px solid #ddd;padding-top:12px">Golden Touch 1127 C.A. · Sistema de Gestión de Inventarios</p>
    </div>`;

  const body = {
    sender: { email: fromEmail, name: fromName },
    to: destinatarios.map((email) => ({ email })),
    subject: `Producción · ${prod.producto_nombre}`,
    htmlContent: html,
    attachment: [{ name: `produccion-${produccion_id.slice(0, 8)}.pdf`, content: pdf_base64 }],
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
