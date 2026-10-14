import type { OcConFactura } from './bandeja.repository';
import type { SemillaRetencion } from './LibroFiscal';

/**
 * Con qué datos se abre el registro desde una OC: el documento, el proveedor y
 * la base. La OC trae aparte el IVA y el IGTF, que van dentro de su total: la
 * base es el total sin los dos, con lo exento dentro.
 */
export function semillaDeOc(oc: OcConFactura): SemillaRetencion {
  const iva = Number(oc.iva) || 0;
  const igtf = Number(oc.igtf) || 0;
  return {
    direccion: 'practicada',
    docKind: 'oc', docId: oc.id, codigo: oc.ocCodigo ?? oc.opCodigo,
    contraparteId: oc.proveedorId,
    contraparteNombre: oc.proveedorNombre === '—' ? null : oc.proveedorNombre,
    contraparteRif: oc.proveedorRif,
    moneda: oc.moneda === 'Bs' ? 'Bs' : 'USD',
    total: oc.total, iva,
    baseImponible: Math.max(0, oc.total - iva - igtf),
  };
}
