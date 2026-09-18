// Golden Touch · Edge Function: enviar-salida (Brevo)
// Comprobante de salida/traslado de material.
// Recibe { movimiento_id, es_traslado?, pdf_base64, to_email }. `to_email` es obligatorio.
// Permiso: puede('salidas'). El movimiento se lee con el cliente del usuario (RLS).
//
// Toda la validación del correo vive en ../_shared/brevo.ts.

import { CORS, exigirSesion, json, puede } from '../_shared/auth.ts';
import {
  clienteUsuario, enviarCorreo, ErrorCorreo, escapeHtml, exigirUuid, leerJson, plantillaHtml,
  respuestaDeError, validarDestinatarios,
} from '../_shared/brevo.ts';

const FUNCION = 'enviar-salida';
const MODULO = 'salidas';

type Payload = { movimiento_id?: string; es_traslado?: boolean; pdf_base64?: string; to_email?: string };

function fechaCorta(d: unknown): string {
  if (!d) return '—';
  const s = String(d);
  // Formato date 'YYYY-MM-DD' → 'DD/MM/YYYY'
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : escapeHtml(s);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const sesion = await exigirSesion(req);
  if (sesion instanceof Response) return sesion;

  try {
    if (!(await puede(sesion, MODULO))) throw new ErrorCorreo('No tenés permiso para enviar comprobantes de salida', 403);

    const p = await leerJson<Payload>(req);
    const movimientoId = exigirUuid(p.movimiento_id, 'movimiento_id');
    if (!p.pdf_base64) throw new ErrorCorreo('El PDF es requerido');
    const destinatarios = validarDestinatarios(p.to_email);
    if (!destinatarios.length) throw new ErrorCorreo('Indicá un correo de destino');
    const esTraslado = p.es_traslado === true;

    const db = clienteUsuario(req);
    if (!db) throw new ErrorCorreo('No autenticado', 401);
    const { data: mov, error: me } = await db
      .from('movimientos')
      .select('delta, almacen, destino, fecha_entrega, detalle, actor_name, actor, at, producto:productos(sku, nombre, unidad)')
      .eq('id', movimientoId)
      .maybeSingle();
    if (me) console.error(`[${FUNCION}] lectura del movimiento falló:`, me.message);
    if (me || !mov) throw new ErrorCorreo('Movimiento no encontrado', 404);

    const prod = (mov.producto ?? {}) as { sku?: string; nombre?: string; unidad?: string };
    const cant = Math.abs(Number(mov.delta) || 0);
    const titulo = esTraslado ? 'Traslado de material' : 'Salida de material';
    const etiquetaDestino = esTraslado ? 'Almacén destino' : 'Dirigido a';

    const html = plantillaHtml(
      titulo,
      `<p>Material: <strong>${escapeHtml(prod.nombre ?? '—')}</strong>${prod.sku ? ` · ${escapeHtml(prod.sku)}` : ''}</p>
      <table style="border-collapse:collapse;width:100%;margin:1rem 0;font-size:14px">
        <tr><td style="padding:6px 12px;background:#f5f5f5;width:200px"><strong>Cantidad</strong></td><td style="padding:6px 12px">${cant} ${escapeHtml(prod.unidad ?? '')}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Almacén origen</strong></td><td style="padding:6px 12px">${escapeHtml(String(mov.almacen ?? '—'))}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>${etiquetaDestino}</strong></td><td style="padding:6px 12px">${escapeHtml(String(mov.destino ?? '—'))}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Fecha de entrega</strong></td><td style="padding:6px 12px">${fechaCorta(mov.fecha_entrega)}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Motivo / detalle</strong></td><td style="padding:6px 12px">${escapeHtml(String(mov.detalle ?? '—'))}</td></tr>
        <tr><td style="padding:6px 12px;background:#f5f5f5"><strong>Registrado por</strong></td><td style="padding:6px 12px">${escapeHtml(String(mov.actor_name ?? mov.actor ?? '—'))}</td></tr>
      </table>
      <p style="font-size:14px">Adjunto el comprobante en PDF.</p>`,
    );

    const r = await enviarCorreo({
      sesion,
      funcion: FUNCION,
      to: destinatarios,
      subject: `${titulo} · ${prod.nombre ?? 'material'}`,
      html,
      adjunto: { nombre: `${esTraslado ? 'traslado' : 'salida'}-${movimientoId.slice(0, 8)}.pdf`, base64: p.pdf_base64 },
    });
    return json({ ok: true, destinatarios: r.destinatarios, id: r.id });
  } catch (e) {
    return respuestaDeError(FUNCION, e);
  }
});
