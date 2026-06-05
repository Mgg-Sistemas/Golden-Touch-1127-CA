// MGG · Edge Function: enviar-reporte (Brevo Transactional Email API)
// Envía un PDF genérico (reporte de movimientos / caja) por correo. Reusa el
// mismo mecanismo que enviar-trazabilidad pero sin atarse a una orden.
//
// Recibe { pdf_base64, nombre_archivo?, asunto?, mensaje?, to_email? }.
// Si no se pasa `to_email`, envía a todos los usuarios admin/jefe.
//
// Secrets: BREVO_API_KEY · BREVO_FROM_EMAIL · BREVO_FROM_NAME

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let payload: { pdf_base64?: string; nombre_archivo?: string; asunto?: string; mensaje?: string; to_email?: string; to_emails?: string[] };
  try { payload = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }

  const { pdf_base64, nombre_archivo, asunto, mensaje, to_email, to_emails } = payload;
  if (!pdf_base64) return json({ error: 'pdf_base64 es requerido' }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Supabase env vars faltantes' }, 500);

  const brevoKey = Deno.env.get('BREVO_API_KEY');
  const fromEmail = Deno.env.get('BREVO_FROM_EMAIL');
  const fromName = Deno.env.get('BREVO_FROM_NAME') ?? 'MGG Inventario';
  if (!brevoKey || !fromEmail) return json({ error: 'Faltan secrets Brevo (BREVO_API_KEY y/o BREVO_FROM_EMAIL)' }, 500);

  const supabase = createClient(supabaseUrl, serviceKey);

  const rx = /\S+@\S+\.\S+/;
  const lista = Array.isArray(to_emails) ? to_emails.filter((e) => typeof e === 'string' && rx.test(e)) : [];
  let destinatarios: string[];
  if (lista.length) {
    destinatarios = [...new Set(lista.map((e) => e.trim().toLowerCase()))];
  } else if (to_email && rx.test(to_email)) {
    destinatarios = [to_email];
  } else {
    const { data: admins } = await supabase.from('usuarios').select('email').in('role', ['admin', 'jefe']);
    destinatarios = (admins ?? []).map((a: { email: string }) => a.email).filter((e: string) => !!e && rx.test(e));
  }
  if (!destinatarios.length) return json({ error: 'No hay destinatarios (configurá un admin/jefe o pasá to_email).' }, 400);

  const titulo = asunto || 'Reporte de Tesorería';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;color:#1a1a1a">
      <h2 style="border-bottom:3px solid #ff8a00;padding-bottom:8px;margin-top:0">${escapeHtml(titulo)}</h2>
      <p>Hola,</p>
      <p>Adjunto el reporte solicitado desde Tesorería.${mensaje ? ` ${escapeHtml(mensaje)}` : ''}</p>
      <p style="color:#888;font-size:12px;margin-top:32px;border-top:1px solid #ddd;padding-top:12px">
        Mineral Group Guayana C.A. · Sistema de Gestión de Inventarios · Generado automáticamente
      </p>
    </div>`;

  const body = {
    sender: { email: fromEmail, name: fromName },
    to: destinatarios.map((email) => ({ email })),
    subject: titulo,
    htmlContent: html,
    attachment: [{ name: nombre_archivo || 'reporte.pdf', content: pdf_base64 }],
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
