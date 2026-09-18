// Golden Touch · Edge Function: enviar-trazabilidad (Brevo)
// El puerto 587 (SMTP) no está disponible desde Supabase Edge Functions; se usa
// la API REST de Brevo (mismo servicio y remitente verificado).
//
// Recibe { orden_id, pdf_base64, to_email }. `to_email` es obligatorio: ya no
// se reparte a todos los admin/jefe (se podía usar para inundarlos).
// Permiso: puede('pedidos'). La orden se lee con el cliente del usuario (RLS),
// no con service_role.
//
// Toda la validación del correo vive en ../_shared/brevo.ts.

import { CORS, exigirSesion, json, puede } from '../_shared/auth.ts';
import {
  clienteUsuario, enviarCorreo, ErrorCorreo, escapeHtml, exigirUuid, leerJson, plantillaHtml,
  respuestaDeError, validarDestinatarios,
} from '../_shared/brevo.ts';

const FUNCION = 'enviar-trazabilidad';
const MODULO = 'pedidos';

type Payload = { orden_id?: string; pdf_base64?: string; to_email?: string };

function fechaFmt(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-VE', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Caracas',
    });
  } catch { return String(iso); }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const sesion = await exigirSesion(req);
  if (sesion instanceof Response) return sesion;

  try {
    if (!(await puede(sesion, MODULO))) throw new ErrorCorreo('No tenés permiso para enviar la trazabilidad', 403);

    const p = await leerJson<Payload>(req);
    const ordenId = exigirUuid(p.orden_id, 'orden_id');
    if (!p.pdf_base64) throw new ErrorCorreo('El PDF es requerido');
    const destinatarios = validarDestinatarios(p.to_email);
    if (!destinatarios.length) throw new ErrorCorreo('Indicá un correo de destino');

    const db = clienteUsuario(req);
    if (!db) throw new ErrorCorreo('No autenticado', 401);
    const { data: orden, error: oe } = await db
      .from('ordenes')
      .select('codigo, oc_codigo, solicitante, unidad_solicitante, ci_solicitante, total, estado, created_at, aprobada_en, oc_emitida_en')
      .eq('id', ordenId)
      .maybeSingle();
    if (oe) console.error(`[${FUNCION}] lectura de la orden falló:`, oe.message);
    if (oe || !orden) throw new ErrorCorreo('Orden no encontrada', 404);

    const totalFmt = `$ ${Number(orden.total).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const ref = orden.oc_codigo ? `${orden.codigo} · OC ${orden.oc_codigo}` : orden.codigo;
    const fila = (k: string, v: string, ancho = '') =>
      `<tr><td style="padding:6px 12px;background:#f5f5f5${ancho}"><strong>${k}</strong></td><td style="padding:6px 12px">${v}</td></tr>`;

    const html = plantillaHtml(
      `Trazabilidad de orden ${ref}`,
      `<p>Hola,</p>
      <p>Adjunto el reporte de trazabilidad completo de la orden <strong>${escapeHtml(orden.codigo)}</strong>.</p>
      <table style="border-collapse:collapse;width:100%;margin:1rem 0;font-size:14px">
        ${fila('Unidad solicitante', escapeHtml(orden.unidad_solicitante ?? '—'), ';width:190px')}
        ${fila('Solicitado por', `${escapeHtml(orden.solicitante ?? '—')}${orden.ci_solicitante ? ` · C.I. ${escapeHtml(orden.ci_solicitante)}` : ''}`)}
        ${fila('Fecha de solicitud (SP)', fechaFmt(orden.created_at))}
        ${fila('SP aprobada el', fechaFmt(orden.aprobada_en))}
        ${fila('OC emitida el', fechaFmt(orden.oc_emitida_en))}
        ${fila('Estado actual', escapeHtml(orden.estado))}
        ${fila('Total', escapeHtml(totalFmt))}
      </table>
      <p style="font-size:14px">El PDF adjunto incluye: solicitud, ítems, ofertas de proveedores, orden de compra final y recepción de mercancía.</p>`,
    );

    const r = await enviarCorreo({
      sesion,
      funcion: FUNCION,
      to: destinatarios,
      subject: `Trazabilidad orden ${orden.codigo}`,
      html,
      adjunto: { nombre: `trazabilidad-${orden.codigo}.pdf`, base64: p.pdf_base64 },
    });
    return json({ ok: true, destinatarios: r.destinatarios, id: r.id });
  } catch (e) {
    return respuestaDeError(FUNCION, e);
  }
});
