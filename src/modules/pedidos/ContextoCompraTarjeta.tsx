import { useQuien } from '@/shared/lib/directorioUsuarios';
import { dateTime } from '@/shared/lib/format';
import type { Orden } from '@/shared/lib/types';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import { fechaMontadaOrden, fechaPagoTesoreriaOrden, resolverAnalistaOrden, etiquetaSinPagoTesoreria } from '@/modules/inventario/pendientesRecepcionReporte';

export type OrdenTarjeta = Orden & { proveedores?: { razon_social: string } | null };

export function ContextoCompraTarjeta({ orden, titulo, detalle, estado }: { orden?: OrdenTarjeta; titulo: string; detalle: string[]; estado: string }) {
  const quien = useQuien();
  if (!orden) return <p className="muted">Datos de la OC no disponibles.</p>;
  const analista = resolverAnalistaOrden(orden, quien);
  const montada = fechaMontadaOrden(orden);
  const pagada = fechaPagoTesoreriaOrden(orden);
  const proveedor = orden.proveedores?.razon_social || 'Sin proveedor asignado';
  const pago = pagada ? dateTime(pagada) : etiquetaSinPagoTesoreria(orden.condiciones_pago);
  const moneda = (orden as OrdenTarjeta & { moneda?: string; total_moneda?: string }).total_moneda || (orden as OrdenTarjeta & { moneda?: string }).moneda || 'USD';
  const texto = [
    `*${titulo}*`, `*OC:* ${orden.oc_codigo || orden.codigo}`, `*Solicitud:* ${orden.codigo}`,
    `*Proveedor:* ${proveedor}`, `*Analista encargado:* ${analista}`,
    `*Fecha montada:* ${montada ? dateTime(montada) : '—'}`, `*Pago Tesorería:* ${pago}`,
    `*Recepción:* ${orden.recibida_en ? dateTime(orden.recibida_en) : 'Sin recepción registrada'}`,
    `*Total de la OC:* ${Number(orden.total).toFixed(2)} ${moneda}`, `*Estado:* ${estado}`, '', ...detalle,
  ].join('\n');
  return <>
    <div className="compras-proveedor">{proveedor}</div>
    <dl className="compras-contexto">
      <div><dt>Analista encargado</dt><dd>{analista}</dd></div>
      <div><dt>Fecha montada</dt><dd>{montada ? dateTime(montada) : '—'}</dd></div>
      <div><dt>Pago Tesorería</dt><dd>{pago}</dd></div>
      <div><dt>Recepción</dt><dd>{orden.recibida_en ? dateTime(orden.recibida_en) : 'Sin recepción registrada'}</dd></div>
      <div><dt>Total de la OC</dt><dd>{Number(orden.total).toFixed(2)} {moneda}</dd></div>
      <div><dt>Recibido por</dt><dd>{orden.recibida_por ? quien(null, orden.recibida_por) : '—'}</dd></div>
    </dl>
    <div className="compras-acciones"><CompartirWhatsapp texto={texto} /></div>
  </>;
}
