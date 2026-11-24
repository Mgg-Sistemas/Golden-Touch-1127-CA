/**
 * Cotizaciones que se pueden corregir desde «Ofertas y comparativa».
 *
 * Una oferta ACEPTADA ya generó su OC: no se toca desde aquí. Las PENDIENTES y las
 * DESCARTADAS sí se pueden editar para arreglar precios, medidas, condiciones, etc.
 * Editar una descartada NO cambia su estado: sigue descartada hasta que se reabra la
 * elección (`reabrirEleccionOferta`) y se vuelva a elegir.
 */
export const ESTADOS_OFERTA_EDITABLES = ['pendiente', 'descartada'] as const;

export function esOfertaEditable(estado: string | null | undefined): boolean {
  return ESTADOS_OFERTA_EDITABLES.some((e) => e === estado);
}
