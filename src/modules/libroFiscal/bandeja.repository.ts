/* ============================================================
   Golden Touch · Libro fiscal · OC con factura

   Las órdenes de compra a las que se les puede practicar una retención: las
   de soporte «factura», y las que tienen la factura del proveedor adjunta al
   recibir (`factura_recepcion_path`). Ojo: en GT `factura_path` es el primer
   comprobante del PAGO, no la factura, y por eso no entra en el filtro.

   Cada OC dice cuántas retenciones vigentes tiene ya en el libro, para que
   se vea qué falta.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { todasLasFilas } from '@/shared/lib/todasLasFilas';
import { labelCondicionPago } from '@/modules/pedidos/ofertas.repository';

/** El mismo filtro que la bandeja de Retenciones de hoy. */
export const FILTRO_OC_CON_FACTURA = 'comprobante_tipo.eq.factura,factura_recepcion_path.not.is.null';

export interface OcConFactura {
  id: string;
  ocCodigo: string | null;
  opCodigo: string | null;
  proveedorId: string | null;
  proveedorNombre: string;
  proveedorRif: string | null;
  condicionLabel: string;
  moneda: string;
  /** Total de la OC: incluye el IVA y el IGTF. */
  total: number;
  iva: number;
  igtf: number;
  facturaPath: string | null;
  facturaNombre: string | null;
  /** Retenciones vigentes (no anuladas) que ya tiene en el libro. */
  enLibro: number;
}

export function aOcConFactura(
  o: Record<string, unknown>,
  proveedores: Map<string, { nombre: string; rif: string | null }>,
  enLibro: Map<string, number>,
): OcConFactura {
  const prov = o.proveedor_id ? proveedores.get(String(o.proveedor_id)) : undefined;
  return {
    id: String(o.id),
    ocCodigo: (o.oc_codigo as string) ?? null, opCodigo: (o.codigo as string) ?? null,
    proveedorId: (o.proveedor_id as string) ?? null,
    proveedorNombre: prov?.nombre ?? '—', proveedorRif: prov?.rif ?? null,
    condicionLabel: labelCondicionPago(o.condiciones_pago as string | null),
    moneda: (o.total_moneda as string) || 'USD',
    total: Number(o.total) || 0,
    iva: o.iva_aplicado === false ? 0 : Number(o.iva_monto) || 0,
    igtf: o.igtf_aplicado === false ? 0 : Number(o.igtf_monto) || 0,
    facturaPath: (o.factura_recepcion_path as string) ?? null,
    facturaNombre: (o.factura_recepcion_nombre as string) ?? null,
    enLibro: enLibro.get(String(o.id)) ?? 0,
  };
}

export async function listOcConFactura(): Promise<OcConFactura[]> {
  const [ordenes, proveedores, retenciones] = await Promise.all([
    todasLasFilas<Record<string, unknown>>((d, h) => supabase.from('ordenes')
      .select('id, codigo, oc_codigo, proveedor_id, condiciones_pago, total, total_moneda, iva_aplicado, iva_monto, igtf_aplicado, igtf_monto, factura_recepcion_path, factura_recepcion_nombre, created_at')
      .or(FILTRO_OC_CON_FACTURA)
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(d, h)),
    todasLasFilas<Record<string, unknown>>((d, h) => supabase.from('proveedores')
      .select('id, razon_social, rif').order('id').range(d, h)),
    todasLasFilas<Record<string, unknown>>((d, h) => supabase.from('retenciones')
      .select('orden_id').not('orden_id', 'is', null).neq('estado', 'anulada').order('id').range(d, h)),
  ]);
  const pm = new Map(proveedores.map((p) => [String(p.id), { nombre: (p.razon_social as string) ?? '—', rif: (p.rif as string) ?? null }]));
  const enLibro = new Map<string, number>();
  for (const r of retenciones) enLibro.set(String(r.orden_id), (enLibro.get(String(r.orden_id)) ?? 0) + 1);
  return ordenes.map((o) => aOcConFactura(o, pm, enLibro));
}
