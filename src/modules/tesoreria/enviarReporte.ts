import { supabase } from '@/shared/lib/supabase';
import { obtenerReporteBase64, type ReporteMeta } from './reportePdf';
import type { MovimientoCaja } from '@/shared/lib/types';

const FUNCTION_SLUG = 'enviar-reporte';

/**
 * Genera el reporte PDF en el navegador (una sola vez) y lo envía por correo vía
 * la Edge Function `enviar-reporte` (Brevo). `destinos` puede ser una lista de
 * correos (como en el envío de las OC) o un único string; si no se pasa, va a
 * admin/jefe.
 */
export async function enviarReportePorCorreo(
  movs: MovimientoCaja[],
  meta: ReporteMeta,
  destinos?: string[] | string,
): Promise<{ destinatarios: string[] }> {
  const { base64, nombre } = await obtenerReporteBase64(movs, meta);
  const lista = Array.isArray(destinos) ? destinos : destinos ? [destinos] : [];
  const { data, error } = await supabase.functions.invoke<
    { ok: true; destinatarios: string[] } | { error: string }
  >(FUNCTION_SLUG, {
    body: {
      pdf_base64: base64,
      nombre_archivo: nombre,
      asunto: meta.titulo + (meta.subtitulo ? ` · ${meta.subtitulo}` : ''),
      mensaje: meta.subtitulo ?? '',
      to_emails: lista,
    },
  });
  if (error) throw new Error(error.message ?? 'No se pudo enviar el correo');
  if (!data || 'error' in data) throw new Error((data as { error?: string })?.error || 'Respuesta inválida');
  return { destinatarios: data.destinatarios };
}
