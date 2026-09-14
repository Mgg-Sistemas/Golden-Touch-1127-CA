import { supabase } from '@/shared/lib/supabase';
import { obtenerCocinaCierreBase64 } from './cocinaCierrePdf';
import type { Mercado } from './cocinaMercado.repository';
import { esDescartado } from './mercadoDescarte';

const FUNCTION_SLUG = 'enviar-reporte';

/**
 * Envía por correo el PDF del cierre de mercado (Cocina) vía la Edge Function genérica
 * `enviar-reporte` (Brevo). `destinos` acepta una lista o un único correo; si no se pasa,
 * la función decide el destino por defecto (admin/jefe).
 */
export async function enviarCierreCocinaPorCorreo(
  m: Mercado, destinos?: string[] | string,
): Promise<{ destinatarios: string[] }> {
  const { base64, nombre } = await obtenerCocinaCierreBase64(m);
  const lista = Array.isArray(destinos) ? destinos : destinos ? [destinos] : [];
  const { data, error } = await supabase.functions.invoke<
    { ok: true; destinatarios: string[] } | { error: string }
  >(FUNCTION_SLUG, {
    body: {
      pdf_base64: base64,
      nombre_archivo: nombre,
      asunto: esDescartado(m) ? `Mercado descartado · Cocina · ${m.numero ?? ''}` : `Cierre de mercado · Cocina · ${m.numero ?? ''}`,
      mensaje: esDescartado(m)
        ? `Reporte del mercado ${m.numero ?? ''}, descartado: no cuenta y no le pasa saldo al próximo mercado. Motivo: ${m.totales?.motivo_descarte ?? '—'}.`
        : `Reporte del cierre del ciclo de mercado ${m.numero ?? ''} (consumo por víver y lo que queda para el próximo mercado).`,
      to_emails: lista,
    },
  });
  if (error) throw new Error(error.message ?? 'No se pudo enviar el correo');
  if (!data || 'error' in data) throw new Error((data as { error?: string })?.error || 'Respuesta inválida');
  return { destinatarios: data.destinatarios };
}
