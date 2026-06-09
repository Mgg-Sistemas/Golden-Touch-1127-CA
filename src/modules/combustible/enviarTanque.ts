import { supabase } from '@/shared/lib/supabase';
import { obtenerMovimientosTanquePdfBase64, type TanqueReporteMeta } from './tanquePdf';
import type { MovimientoTanque, TanqueCombustible } from '@/shared/lib/types';

/** Envía el PDF del libro mayor de un tanque por correo vía `enviar-reporte` (Brevo). */
export async function enviarMovimientosTanquePorCorreo(
  tanque: TanqueCombustible, movs: MovimientoTanque[], destinos: string[], meta: TanqueReporteMeta = {},
): Promise<{ destinatarios: string[] }> {
  const { base64, nombre } = await obtenerMovimientosTanquePdfBase64(tanque, movs, meta);
  const { data, error } = await supabase.functions.invoke<
    { ok: true; destinatarios: string[] } | { error: string }
  >('enviar-reporte', {
    body: {
      pdf_base64: base64,
      nombre_archivo: nombre,
      asunto: `Combustible · ${tanque.nombre}${meta.filtro ? ` · ${meta.filtro}` : ''}`,
      mensaje: `Libro mayor de ${tanque.nombre} (${movs.length} movimiento(s)).`,
      to_emails: destinos,
    },
  });
  if (error) throw new Error(error.message ?? 'No se pudo enviar el correo');
  if (!data || 'error' in data) throw new Error((data as { error?: string })?.error || 'Respuesta inválida');
  return { destinatarios: data.destinatarios };
}
