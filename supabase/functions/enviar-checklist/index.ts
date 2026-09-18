// Golden Touch · Edge Function: enviar-checklist (Brevo)
// Envía la checklist "OC por lote" (relación de compras pendientes por pagar)
// en PDF. Recibe { pdf_base64, to_email, codigo, items, total }.
// Permiso: puede('pedidos') (la pantalla OC por lote vive en Pedidos / Compras).
//
// Toda la validación del correo vive en ../_shared/brevo.ts.

import { CORS, exigirSesion, json, puede } from '../_shared/auth.ts';
import {
  enviarCorreo, ErrorCorreo, escapeHtml, leerJson, plantillaHtml, respuestaDeError, validarDestinatarios,
} from '../_shared/brevo.ts';

const FUNCION = 'enviar-checklist';
const MODULO = 'pedidos';

type Payload = { pdf_base64?: string; to_email?: string; codigo?: string; items?: number; total?: number };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const sesion = await exigirSesion(req);
  if (sesion instanceof Response) return sesion;

  try {
    if (!(await puede(sesion, MODULO))) throw new ErrorCorreo('No tenés permiso para enviar esta checklist', 403);

    const p = await leerJson<Payload>(req);
    if (!p.pdf_base64) throw new ErrorCorreo('El PDF es requerido');
    const destinatarios = validarDestinatarios(p.to_email);
    if (!destinatarios.length) throw new ErrorCorreo('Indicá un correo de destino');

    const codigo = String(p.codigo ?? '').trim().slice(0, 60) || 'OC por lote';
    const items = Number.isFinite(Number(p.items)) ? Math.max(0, Math.trunc(Number(p.items))) : 0;
    const totalFmt = typeof p.total === 'number' && Number.isFinite(p.total)
      ? `$ ${p.total.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '—';

    const html = plantillaHtml(
      `Checklist ${codigo}`,
      `<p style="font-size:14px">Relación de compras pendientes por pagar (cuentas por pagar).</p>
      <table style="border-collapse:collapse;width:100%;margin:1rem 0;font-size:14px">
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Órdenes</strong></td><td style="padding:6px 12px">${items}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Monto total</strong></td><td style="padding:6px 12px">${escapeHtml(totalFmt)}</td></tr>
      </table>
      <p style="font-size:14px">Adjunto el detalle en PDF.</p>`,
    );

    const r = await enviarCorreo({
      sesion,
      funcion: FUNCION,
      to: destinatarios,
      subject: `Checklist ${codigo} · Compras pendientes por pagar`,
      html,
      adjunto: { nombre: `checklist-${codigo}.pdf`, base64: p.pdf_base64 },
    });
    return json({ ok: true, destinatarios: r.destinatarios, id: r.id });
  } catch (e) {
    return respuestaDeError(FUNCION, e);
  }
});
