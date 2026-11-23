/* ============================================================
   Golden Touch · Compras · cotizaciones cuando la SP se reparte (23/11/2026)

   En el reparto «multiproveedor» la SP madre conserva las N ofertas y crea
   una OC hija por proveedor elegido (`op_padre_id`). Las ofertas NO se copian
   a las hijas: viven en la madre, con varias en estado «aceptada».

   Todo lo que muestre cotizaciones (comparativa, WhatsApp, PDF, adjuntos de
   Tesorería, fecha prometida) debe leer las de la madre; y para una hija la
   oferta «elegida/es esta OC» es la de su `proveedor_id`, no la primera
   aceptada que encuentre.
   ============================================================ */
import type { OfertaProveedor, Orden } from '@/shared/lib/types';

type OrdenConPadre = Pick<Orden, 'id' | 'op_padre_id'>;
type OrdenConProveedor = Pick<Orden, 'proveedor_id'>;

/** ID cuyas ofertas hay que consultar: la madre si es hija, si no la orden misma. */
export function idOrdenCotizaciones(o: OrdenConPadre): string {
  return o.op_padre_id || o.id;
}

/** ¿Esta cotización pertenece al proveedor al que se le asignó la orden? */
export function esCotizacionDeEstaOc(o: OrdenConProveedor, oferta: OfertaProveedor): boolean {
  return !!o.proveedor_id && oferta.proveedor_id === o.proveedor_id;
}

/**
 * La oferta elegida para el texto/PDF. En una hija gana la de su proveedor
 * (aunque en la madre haya varias «aceptada» por el reparto); si no, la
 * aceptada; y si no, la del proveedor de la orden.
 */
export function ofertaElegidaDe(
  o: OrdenConProveedor,
  ofertas: OfertaProveedor[],
): OfertaProveedor | null {
  const ordenadas = [...ofertas].sort((a, b) => String(a.registrada_en ?? '').localeCompare(String(b.registrada_en ?? '')));
  return ordenadas.find((of) => esCotizacionDeEstaOc(o, of) && of.estado === 'aceptada')
    ?? ordenadas.find((of) => of.estado === 'aceptada')
    ?? ordenadas.find((of) => esCotizacionDeEstaOc(o, of))
    ?? null;
}
