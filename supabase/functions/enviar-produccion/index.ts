// Golden Touch · Edge Function: enviar-produccion (Brevo)
// Espejo de `enviar-trazabilidad` para reportes de producción.
// Recibe { produccion_id, pdf_base64, to_email }. `to_email` es obligatorio.
// Permiso: puede('produccion'). El registro se lee con el cliente del usuario (RLS).
//
// Toda la validación del correo vive en ../_shared/brevo.ts.

import { CORS, exigirSesion, json, puede } from '../_shared/auth.ts';
import {
  clienteUsuario, enviarCorreo, ErrorCorreo, escapeHtml, exigirUuid, leerJson, plantillaHtml,
  respuestaDeError, validarDestinatarios,
} from '../_shared/brevo.ts';

const FUNCION = 'enviar-produccion';
const MODULO = 'produccion';

type Payload = { produccion_id?: string; pdf_base64?: string; to_email?: string };

function money(n: unknown): string {
  return `$ ${Number(n ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const sesion = await exigirSesion(req);
  if (sesion instanceof Response) return sesion;

  try {
    if (!(await puede(sesion, MODULO))) throw new ErrorCorreo('No tenés permiso para enviar reportes de producción', 403);

    const p = await leerJson<Payload>(req);
    const produccionId = exigirUuid(p.produccion_id, 'produccion_id');
    if (!p.pdf_base64) throw new ErrorCorreo('El PDF es requerido');
    const destinatarios = validarDestinatarios(p.to_email);
    if (!destinatarios.length) throw new ErrorCorreo('Indicá un correo de destino');

    const db = clienteUsuario(req);
    if (!db) throw new ErrorCorreo('No autenticado', 401);
    const { data: prod, error: pe } = await db
      .from('produccion')
      .select('producto_nombre, cantidad, estado, costo_material, mano_obra, costos_indirectos, costo_unitario, precio_venta, ganancia')
      .eq('id', produccionId)
      .maybeSingle();
    if (pe) console.error(`[${FUNCION}] lectura de la producción falló:`, pe.message);
    if (pe || !prod) throw new ErrorCorreo('Producción no encontrada', 404);

    const cp = Number(prod.costo_material) + Number(prod.mano_obra) + Number(prod.costos_indirectos);
    const html = plantillaHtml(
      'Reporte de producción',
      `<p>Producto producido: <strong>${escapeHtml(prod.producto_nombre)}</strong> · ${Number(prod.cantidad)} u (${escapeHtml(prod.estado)})</p>
      <table style="border-collapse:collapse;width:100%;margin:1rem 0;font-size:14px">
        <tr><td style="padding:6px 12px;background:#f5f5f5;width:220px"><strong>Costo Total Materiales (CTM)</strong></td><td style="padding:6px 12px">${money(prod.costo_material)}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Costo de Producción (CP)</strong></td><td style="padding:6px 12px">${money(cp)}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Costo unitario (PMP)</strong></td><td style="padding:6px 12px">${money(prod.costo_unitario)}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Posible ganancia</strong></td><td style="padding:6px 12px">${prod.ganancia != null ? money(prod.ganancia) : '—'}</td></tr>
      </table>
      <p style="font-size:14px">Adjunto el PDF con el detalle del proceso y los materiales utilizados.</p>`,
    );

    const r = await enviarCorreo({
      sesion,
      funcion: FUNCION,
      to: destinatarios,
      subject: `Producción · ${prod.producto_nombre}`,
      html,
      adjunto: { nombre: `produccion-${produccionId.slice(0, 8)}.pdf`, base64: p.pdf_base64 },
    });
    return json({ ok: true, destinatarios: r.destinatarios, id: r.id });
  } catch (e) {
    return respuestaDeError(FUNCION, e);
  }
});
