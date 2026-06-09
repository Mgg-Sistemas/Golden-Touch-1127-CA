import { supabase } from '@/shared/lib/supabase';
import { obtenerConciliacionesPdfBase64, type ConciliacionRow, type ConciliacionReporteMeta } from './conciliacionPdf';

/** Envía el PDF del historial de conciliaciones por correo vía `enviar-reporte` (Brevo). */
export async function enviarConciliacionesPorCorreo(
  rows: ConciliacionRow[], destinos: string[], meta: ConciliacionReporteMeta = {},
): Promise<{ destinatarios: string[] }> {
  const { base64, nombre } = await obtenerConciliacionesPdfBase64(rows, meta);
  const { data, error } = await supabase.functions.invoke<
    { ok: true; destinatarios: string[] } | { error: string }
  >('enviar-reporte', {
    body: {
      pdf_base64: base64,
      nombre_archivo: nombre,
      asunto: `Combustible · Conciliaciones${meta.filtro ? ` · ${meta.filtro}` : ''}`,
      mensaje: `Historial de conciliaciones de tanques (${rows.length} registro(s)).`,
      to_emails: destinos,
    },
  });
  if (error) throw new Error(error.message ?? 'No se pudo enviar el correo');
  if (!data || 'error' in data) throw new Error((data as { error?: string })?.error || 'Respuesta inválida');
  return { destinatarios: data.destinatarios };
}
