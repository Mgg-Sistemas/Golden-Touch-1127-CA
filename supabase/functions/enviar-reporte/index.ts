// Golden Touch · Edge Function: enviar-reporte (Brevo)
// Envía un PDF genérico (reportes de Tesorería, Acopio, Cocina, Combustible,
// Inventario, Maquinaria, Producción, Salidas) o el respaldo .sql.txt.
//
// Recibe { modulo, pdf_base64, nombre_archivo?, asunto?, mensaje?, to_email?, to_emails? }.
//   · `modulo` dice de qué pantalla sale el reporte; el servidor exige puede(modulo)
//     y que esté en la lista blanca MODULOS_REPORTE.
//   · Sin destinatarios → admin/jefe activos (máx. 10).
//   · El adjunto `.sql.txt` (respaldo) solo lo pueden mandar admin/analista.
//
// TRANSICIÓN (18/09/2026): mientras el front nuevo no esté publicado, si falta
// `modulo` se acepta el envío solo si el usuario tiene puede() en al menos uno
// de los módulos de la lista blanca. Cuando todo el front mande `modulo`, quitar
// ese camino y rechazar la falta de `modulo` con 400.
//
// Toda la validación del correo vive en ../_shared/brevo.ts.

import { CORS, exigirSesion, json, puede } from '../_shared/auth.ts';
import {
  destinatariosPorDefecto, enviarCorreo, ErrorCorreo, escapeHtml, leerJson, plantillaHtml,
  respuestaDeError, validarDestinatarios,
} from '../_shared/brevo.ts';

const FUNCION = 'enviar-reporte';

/** Módulos desde los que el front manda reportes por esta función. */
const MODULOS_REPORTE = [
  'acopio', 'ajustes', 'cocina', 'combustible', 'inventario', 'maquinaria', 'produccion', 'salidas', 'tesoreria',
] as const;
type ModuloReporte = typeof MODULOS_REPORTE[number];

const ETIQUETA: Record<ModuloReporte, string> = {
  acopio: 'Centro de Costo PERAMANAL',
  ajustes: 'Respaldo de datos',
  cocina: 'Control de Alimentación (Cocina)',
  combustible: 'Combustible',
  inventario: 'Inventario',
  maquinaria: 'Control de Maquinaria y Vehículos',
  produccion: 'Producción',
  salidas: 'Salidas / Traslados',
  tesoreria: 'Tesorería',
};

type Payload = {
  modulo?: string;
  pdf_base64?: string;
  nombre_archivo?: string;
  asunto?: string;
  mensaje?: string;
  to_email?: string;
  to_emails?: string[];
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const sesion = await exigirSesion(req);
  if (sesion instanceof Response) return sesion;

  try {
    const p = await leerJson<Payload>(req);

    // ── Permiso por módulo ────────────────────────────────────────────────
    let modulo: ModuloReporte | null = null;
    if (p.modulo !== undefined && p.modulo !== null && p.modulo !== '') {
      if (!(MODULOS_REPORTE as readonly string[]).includes(p.modulo)) throw new ErrorCorreo('Módulo inválido');
      modulo = p.modulo as ModuloReporte;
      if (!(await puede(sesion, modulo))) throw new ErrorCorreo('No tenés permiso para enviar reportes de este módulo', 403);
    } else {
      // Transición: front viejo sin `modulo`.
      let alguno = false;
      for (const m of MODULOS_REPORTE) {
        if (await puede(sesion, m)) { alguno = true; break; }
      }
      if (!alguno) throw new ErrorCorreo('No tenés permiso para enviar reportes', 403);
    }

    if (!p.pdf_base64) throw new ErrorCorreo('El adjunto es requerido');

    // El respaldo (.sql.txt) es el único adjunto de texto: solo admin/analista,
    // y (cuando el front ya manda `modulo`) solo desde Ajustes.
    const permitirTexto = (sesion.role === 'admin' || sesion.role === 'analista') && (modulo === null || modulo === 'ajustes');

    // ── Destinatarios ─────────────────────────────────────────────────────
    let destinatarios = validarDestinatarios(p.to_emails);
    if (!destinatarios.length) destinatarios = validarDestinatarios(p.to_email);
    if (!destinatarios.length) destinatarios = await destinatariosPorDefecto(sesion);
    if (!destinatarios.length) throw new ErrorCorreo('No hay destinatarios: indicá un correo.');

    const titulo = String(p.asunto ?? '').trim().slice(0, 140) || 'Reporte';
    const mensaje = String(p.mensaje ?? '').trim().slice(0, 500);
    const origen = modulo ? ETIQUETA[modulo] : 'el sistema';
    const html = plantillaHtml(
      titulo,
      `<p>Hola,</p>
      <p>Adjunto el reporte solicitado desde ${escapeHtml(origen)}.${mensaje ? ` ${escapeHtml(mensaje)}` : ''}</p>
      <p style="font-size:12px;color:#666">Enviado por ${escapeHtml(sesion.email ?? 'un usuario del sistema')}.</p>`,
    );

    const r = await enviarCorreo({
      sesion,
      funcion: FUNCION,
      to: destinatarios,
      subject: titulo,
      html,
      adjunto: { nombre: p.nombre_archivo || 'reporte.pdf', base64: p.pdf_base64 },
      permitirTexto,
    });
    return json({ ok: true, destinatarios: r.destinatarios, id: r.id });
  } catch (e) {
    return respuestaDeError(FUNCION, e);
  }
});
