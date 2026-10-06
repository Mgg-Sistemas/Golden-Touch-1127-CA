/* ============================================================
   Golden Touch · Compras · Adjuntos del pago de una OC (06/10/2026)
   Junta en una sola lista los archivos que se subieron al pagar la
   OC: comprobantes del pago (hasta 6; las OC viejas traen uno solo
   en `factura_path`), comprobante de retención, factura del
   proveedor y los comprobantes de cada abono si fue a crédito.
   Lo usa el Histórico para el botón «📎 Ver adjunto de pago».
   ============================================================ */
import type { AbonoCredito, Orden } from '@/shared/lib/types';

export interface AdjuntoPago {
  path: string;
  nombre: string;
  /** Qué es: «Comprobante de pago», «Abono 2», «Retención», «Factura». */
  etiqueta: string;
}

type OrdenAdjuntos = Pick<Orden, 'comprobantes_pago' | 'factura_path' | 'factura_nombre'
  | 'retencion_path' | 'retencion_nombre' | 'factura_recepcion_path' | 'factura_recepcion_nombre'>;

const nombreDe = (path: string, nombre?: string | null) => nombre || path.split('/').pop() || 'archivo';

/** Comprobantes del pago guardados en la propia OC (sin consultar abonos). */
export function comprobantesDeLaOrden(o: OrdenAdjuntos): AdjuntoPago[] {
  const lista = (o.comprobantes_pago ?? []).filter((c) => c?.path);
  const base = lista.length
    ? lista
    : o.factura_path ? [{ path: o.factura_path, nombre: nombreDe(o.factura_path, o.factura_nombre) }] : [];
  return base.map((c, i) => ({
    path: c.path,
    nombre: nombreDe(c.path, c.nombre),
    etiqueta: base.length > 1 ? `Comprobante de pago ${i + 1}` : 'Comprobante de pago',
  }));
}

/** Todos los adjuntos del pago: comprobantes, abonos, retención y factura. Sin repetidos. */
export function adjuntosDePago(o: OrdenAdjuntos, abonos: Pick<AbonoCredito, 'comprobante_path' | 'comprobante_nombre'>[] = []): AdjuntoPago[] {
  const out: AdjuntoPago[] = [...comprobantesDeLaOrden(o)];
  abonos.forEach((a, i) => {
    if (a.comprobante_path) out.push({ path: a.comprobante_path, nombre: nombreDe(a.comprobante_path, a.comprobante_nombre), etiqueta: `Abono ${i + 1}` });
  });
  if (o.retencion_path) out.push({ path: o.retencion_path, nombre: nombreDe(o.retencion_path, o.retencion_nombre), etiqueta: 'Retención' });
  if (o.factura_recepcion_path) out.push({ path: o.factura_recepcion_path, nombre: nombreDe(o.factura_recepcion_path, o.factura_recepcion_nombre), etiqueta: 'Factura del proveedor' });
  const vistos = new Set<string>();
  return out.filter((a) => (vistos.has(a.path) ? false : (vistos.add(a.path), true)));
}
