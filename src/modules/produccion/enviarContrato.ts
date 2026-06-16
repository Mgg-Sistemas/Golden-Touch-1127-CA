import { supabase } from '@/shared/lib/supabase';
import { obtenerContratosPdfBase64, type ContratoReporteMeta } from './contratoPdf';
import type { ContratoAcopio } from '@/shared/lib/types';

/** Envía el PDF de contratos de producción por correo vía `enviar-reporte` (Brevo). */
export async function enviarContratosPorCorreo(
  rows: ContratoAcopio[], destinos: string[], meta: ContratoReporteMeta = {},
): Promise<{ destinatarios: string[] }> {
  const { base64, nombre } = await obtenerContratosPdfBase64(rows, meta);
  const { data, error } = await supabase.functions.invoke<
    { ok: true; destinatarios: string[] } | { error: string }
  >('enviar-reporte', {
    body: {
      pdf_base64: base64,
      nombre_archivo: nombre,
      asunto: `Datos de Reporte Producción${meta.filtro ? ` · ${meta.filtro}` : ''}`,
      mensaje: `Datos de Reporte Producción (${rows.length} registro(s)).`,
      to_emails: destinos,
    },
  });
  if (error) throw new Error(error.message ?? 'No se pudo enviar el correo');
  if (!data || 'error' in data) throw new Error((data as { error?: string })?.error || 'Respuesta inválida');
  return { destinatarios: data.destinatarios };
}
