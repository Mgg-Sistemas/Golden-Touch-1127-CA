// Golden Touch · Edge Function: enviar-combustible (Brevo)
// Solicitudes de salida de combustible.
// Recibe { solicitud_id, pdf_base64, to_email }. `to_email` es obligatorio.
// Permiso: puede('combustible'). La solicitud se lee con el cliente del usuario (RLS).
//
// Toda la validación del correo vive en ../_shared/brevo.ts.

import { CORS, exigirSesion, json, puede } from '../_shared/auth.ts';
import {
  clienteUsuario, enviarCorreo, ErrorCorreo, escapeHtml, exigirUuid, leerJson, plantillaHtml,
  respuestaDeError, validarDestinatarios,
} from '../_shared/brevo.ts';

const FUNCION = 'enviar-combustible';
const MODULO = 'combustible';

const ESTADO: Record<string, string> = {
  por_aprobar: 'Por aprobar', aprobada: 'Aprobada', finalizada: 'Finalizada', cancelada: 'Cancelada',
};

type Payload = { solicitud_id?: string; pdf_base64?: string; to_email?: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const sesion = await exigirSesion(req);
  if (sesion instanceof Response) return sesion;

  try {
    if (!(await puede(sesion, MODULO))) throw new ErrorCorreo('No tenés permiso para enviar solicitudes de combustible', 403);

    const p = await leerJson<Payload>(req);
    const solicitudId = exigirUuid(p.solicitud_id, 'solicitud_id');
    if (!p.pdf_base64) throw new ErrorCorreo('El PDF es requerido');
    const destinatarios = validarDestinatarios(p.to_email);
    if (!destinatarios.length) throw new ErrorCorreo('Indicá un correo de destino');

    const db = clienteUsuario(req);
    if (!db) throw new ErrorCorreo('No autenticado', 401);
    const { data: s, error: se } = await db
      .from('combustible_solicitudes')
      .select('codigo, combustible_nombre, solicitante, destino, litros, estado, motivo')
      .eq('id', solicitudId)
      .maybeSingle();
    if (se) console.error(`[${FUNCION}] lectura de la solicitud falló:`, se.message);
    if (se || !s) throw new ErrorCorreo('Solicitud no encontrada', 404);

    const html = plantillaHtml(
      `Solicitud de salida de combustible · ${s.codigo}`,
      `<table style="border-collapse:collapse;width:100%;margin:1rem 0;font-size:14px">
        <tr><td style="padding:6px 12px;background:#f5f5f5;width:200px"><strong>Combustible</strong></td><td style="padding:6px 12px">${escapeHtml(s.combustible_nombre)}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Quién solicita</strong></td><td style="padding:6px 12px">${escapeHtml(s.solicitante)}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>A dónde va</strong></td><td style="padding:6px 12px">${escapeHtml(s.destino)}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Total de litros</strong></td><td style="padding:6px 12px">${Number(s.litros)} L</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Estado</strong></td><td style="padding:6px 12px">${ESTADO[s.estado] ?? escapeHtml(s.estado)}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Motivo</strong></td><td style="padding:6px 12px">${escapeHtml(String(s.motivo ?? '—'))}</td></tr>
      </table>
      <p style="font-size:14px">Adjunto el reporte en PDF.</p>`,
    );

    const r = await enviarCorreo({
      sesion,
      funcion: FUNCION,
      to: destinatarios,
      subject: `Combustible · ${s.codigo} · ${s.combustible_nombre}`,
      html,
      adjunto: { nombre: `solicitud-combustible-${s.codigo}.pdf`, base64: p.pdf_base64 },
    });
    return json({ ok: true, destinatarios: r.destinatarios, id: r.id });
  } catch (e) {
    return respuestaDeError(FUNCION, e);
  }
});
