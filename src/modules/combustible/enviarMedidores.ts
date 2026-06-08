import { supabase } from '@/shared/lib/supabase';
import { obtenerMedidoresPdfBase64, type MedidoresReporteMeta } from './medidoresPdf';
import type { MedidorCombustible } from '@/shared/lib/types';

/** Envía el reporte PDF de medidores por correo vía la Edge Function `enviar-reporte` (Brevo). */
export async function enviarMedidoresPorCorreo(
  rows: MedidorCombustible[], destinos: string[], meta: MedidoresReporteMeta = {},
): Promise<{ destinatarios: string[] }> {
  const { base64, nombre } = await obtenerMedidoresPdfBase64(rows, meta);
  const { data, error } = await supabase.functions.invoke<
    { ok: true; destinatarios: string[] } | { error: string }
  >('enviar-reporte', {
    body: {
      pdf_base64: base64,
      nombre_archivo: nombre,
      asunto: `Combustible · Medidores por equipo${meta.filtro ? ` · ${meta.filtro}` : ''}`,
      mensaje: `Reporte de medidores (${rows.length} lectura(s)).`,
      to_emails: destinos,
    },
  });
  if (error) throw new Error(error.message ?? 'No se pudo enviar el correo');
  if (!data || 'error' in data) throw new Error((data as { error?: string })?.error || 'Respuesta inválida');
  return { destinatarios: data.destinatarios };
}
