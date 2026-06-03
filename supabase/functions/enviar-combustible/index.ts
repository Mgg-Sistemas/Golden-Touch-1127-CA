// MGG · Edge Function: enviar-combustible (Brevo Transactional Email API)
// Espejo de `enviar-salida` para solicitudes de salida de combustible.
// Recibe { solicitud_id, pdf_base64, to_email? }. Sin to_email → admin/jefe.
//
// Secrets requeridos (compartidos con enviar-trazabilidad):
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

const ESTADO: Record<string, string> = {
  por_aprobar: 'Por aprobar', aprobada: 'Aprobada', finalizada: 'Finalizada', cancelada: 'Cancelada',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let payload: { solicitud_id?: string; pdf_base64?: string; to_email?: string };
  try { payload = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }

  const { solicitud_id, pdf_base64, to_email } = payload;
  if (!solicitud_id || !pdf_base64) return json({ error: 'solicitud_id y pdf_base64 son requeridos' }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Supabase env vars faltantes' }, 500);

  const brevoKey = Deno.env.get('BREVO_API_KEY');
  const fromEmail = Deno.env.get('BREVO_FROM_EMAIL');
  const fromName = Deno.env.get('BREVO_FROM_NAME') ?? 'MGG Inventario';
  if (!brevoKey || !fromEmail) return json({ error: 'Faltan secrets Brevo' }, 500);

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: s, error: se } = await supabase
    .from('combustible_solicitudes')
    .select('codigo, combustible_nombre, solicitante, destino, litros, estado, motivo')
    .eq('id', solicitud_id)
    .single();
  if (se || !s) return json({ error: 'Solicitud no encontrada' }, 404);

  let destinatarios: string[];
  if (to_email && /\S+@\S+\.\S+/.test(to_email)) {
    destinatarios = [to_email];
  } else {
    const { data: admins } = await supabase.from('usuarios').select('email').in('role', ['admin', 'jefe']);
    destinatarios = (admins ?? []).map((a: { email: string }) => a.email).filter((e: string) => !!e && /\S+@\S+\.\S+/.test(e));
  }
  if (!destinatarios.length) return json({ error: 'No hay destinatarios (admin/jefe o to_email).' }, 400);

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;color:#1a1a1a">
      <h2 style="border-bottom:3px solid #ff8a00;padding-bottom:8px;margin-top:0">Solicitud de salida de combustible · ${escapeHtml(s.codigo)}</h2>
      <table style="border-collapse:collapse;width:100%;margin:1rem 0;font-size:14px">
        <tr><td style="padding:6px 12px;background:#f5f5f5;width:200px"><strong>Combustible</strong></td><td style="padding:6px 12px">${escapeHtml(s.combustible_nombre)}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Quién solicita</strong></td><td style="padding:6px 12px">${escapeHtml(s.solicitante)}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>A dónde va</strong></td><td style="padding:6px 12px">${escapeHtml(s.destino)}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Total de litros</strong></td><td style="padding:6px 12px">${Number(s.litros)} L</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Estado</strong></td><td style="padding:6px 12px">${ESTADO[s.estado] ?? escapeHtml(s.estado)}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Motivo</strong></td><td style="padding:6px 12px">${escapeHtml(String(s.motivo ?? '—'))}</td></tr>
      </table>
      <p style="font-size:14px">Adjunto el reporte en PDF.</p>
      <p style="color:#888;font-size:12px;margin-top:32px;border-top:1px solid #ddd;padding-top:12px">Mineral Group Guayana C.A. · Sistema de Gestión de Inventarios</p>
    </div>`;

  const body = {
    sender: { email: fromEmail, name: fromName },
    to: destinatarios.map((email) => ({ email })),
    subject: `Combustible · ${s.codigo} · ${s.combustible_nombre}`,
    htmlContent: html,
    attachment: [{ name: `solicitud-combustible-${s.codigo}.pdf`, content: pdf_base64 }],
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

  return json({ ok: true, destinatarios, id: respJson?.messageId ?? null });
});
