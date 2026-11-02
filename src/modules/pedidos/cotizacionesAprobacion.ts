/* ============================================================
   Golden Touch · Compras · Cotizaciones en el aviso «pendiente por aprobar»

   El WhatsApp que se le manda al Gerente General para aprobar una OC lleva
   TODAS las cotizaciones (ofertas) que se cargaron para esa solicitud,
   numeradas, con su total en $ y en Bs, cuál quedó elegida (✅) y qué
   analista la escogió (Nombre y Apellido, nunca el correo). Así el gerente
   aprueba viendo contra qué se comparó, sin abrir el sistema.

   QUÉ TOTAL LLEVA CADA COTIZACIÓN
   · La elegida: el total de la OC (o el de divisa si se paga en divisa).
     Es el número que se aprueba y el mismo del renglón «💵 Total»; si la OC
     se editó después de elegir, manda la OC.
   · Las demás: base de la oferta − descuento obtenido + IVA + IGTF (la misma
     regla con la que se arma el total de la OC al aceptar una oferta).

   MONEDA: las ofertas se cargan en $ (referencia BCV). Si la orden está en Bs
   (total_moneda = 'Bs') los montos se leen en Bs y el equivalente va en $.
   La conversión usa la tasa BCV del día; sin tasa, solo sale la moneda propia.

   Función pura (sin red ni React) para poder fijar el formato con tests.
   ============================================================ */
import type { OfertaProveedor, Orden } from '@/shared/lib/types';
import { calcularDesgloseModalidadesOferta } from './modalidadPago';
import { nombrePersonaCompras } from './personasCompras';

/** Número con separador de miles VE y dos decimales, sin símbolo. */
function num(n: number): string {
  return (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Tasa como la publica el BCV: al menos 2 decimales, hasta 4. */
function numTasa(t: number): string {
  return t.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** «$1.113,60 · Bs 40.646,40»: siempre el $ primero; el otro lado solo con tasa. */
export function montoDosMonedas(total: number, moneda: 'USD' | 'Bs', tasaUsd?: number | null): string {
  const t = Number(tasaUsd) || 0;
  if (moneda === 'Bs') {
    return t > 0 ? `$${num(r2(total / t))} · Bs ${num(total)}` : `Bs ${num(total)}`;
  }
  return t > 0 ? `$${num(total)} · Bs ${num(r2(total * t))}` : `$${num(total)}`;
}

/** Total de una oferta con la regla de la OC: base − descuento + IVA/IGTF. */
export function totalOfertaConImpuestos(of: OfertaProveedor): number {
  const d = calcularDesgloseModalidadesOferta(of);
  const desc = Math.max(0, Number(of.descuento_obtenido) || 0);
  return r2(Math.max(0, d.totalBcv - desc));
}

export interface CotizacionAprobacion {
  numero: number;
  proveedor: string;
  total: number;
  elegida: boolean;
  /** Solo en la elegida: la OC se paga en divisa (el total es el de divisa). */
  enDivisa: boolean;
}

/**
 * Las cotizaciones numeradas en el orden en que se cargaron (1 = la primera).
 * La elegida es la oferta «aceptada»; si ninguna lo está, la del proveedor de la OC.
 */
export function cotizacionesDeOrden(
  o: Pick<Orden, 'proveedor_id' | 'total' | 'total_divisa' | 'pago_en_divisa'>,
  ofertas: OfertaProveedor[],
  nombreProveedor: (proveedorId: string) => string | null | undefined,
): CotizacionAprobacion[] {
  const ordenadas = [...ofertas].sort((a, b) => String(a.registrada_en ?? '').localeCompare(String(b.registrada_en ?? '')));
  let idxElegida = ordenadas.findIndex((of) => of.estado === 'aceptada');
  if (idxElegida < 0 && o.proveedor_id) idxElegida = ordenadas.findIndex((of) => of.proveedor_id === o.proveedor_id);
  const totalOc = Number(o.pago_en_divisa && o.total_divisa != null ? o.total_divisa : o.total) || 0;
  return ordenadas.map((of, i) => {
    const elegida = i === idxElegida;
    return {
      numero: i + 1,
      proveedor: (nombreProveedor(of.proveedor_id) ?? '').trim() || 'PROVEEDOR SIN NOMBRE',
      total: elegida && totalOc > 0 ? r2(totalOc) : totalOfertaConImpuestos(of),
      elegida,
      enDivisa: elegida && !!o.pago_en_divisa,
    };
  });
}

/**
 * Quién escogió la oferta: quien la marcó como aceptada; si no consta, quien creó
 * la OC (evento «oc_creada» del historial o el campo oc_creada_por).
 */
export function quienEscogio(
  o: Pick<Orden, 'oc_creada_por' | 'historial'>,
  ofertaElegida: OfertaProveedor | null | undefined,
): string | null {
  const deOferta = ofertaElegida?.decidida_por_email?.trim();
  if (deOferta) return deOferta;
  const ev = (o.historial ?? []).find((h) => (h as { evento?: string }).evento === 'oc_creada') as { actor?: string } | undefined;
  return ev?.actor?.trim() || o.oc_creada_por?.trim() || null;
}

/**
 * Los renglones del bloque de cotizaciones para el aviso de aprobación.
 * Sin ofertas devuelve [] (el aviso queda como antes).
 */
export function lineasCotizacionesAprobacion(
  o: Pick<Orden, 'proveedor_id' | 'total' | 'total_divisa' | 'pago_en_divisa' | 'total_moneda' | 'oc_creada_por' | 'historial'>,
  ofertas: OfertaProveedor[] | null | undefined,
  opts: {
    nombreProveedor: (proveedorId: string) => string | null | undefined;
    personas?: Map<string, string>;
    tasaUsd?: number | null;
  },
): string[] {
  const lista = ofertas ?? [];
  if (!lista.length) return [];
  const moneda: 'USD' | 'Bs' = !o.pago_en_divisa && o.total_moneda === 'Bs' ? 'Bs' : 'USD';
  const cots = cotizacionesDeOrden(o, lista, opts.nombreProveedor);
  const L: string[] = [];
  L.push(`📊 *COTIZACIONES RECIBIDAS (${cots.length}):*`);
  for (const c of cots) {
    const marca = c.elegida ? '✅' : '🔸';
    const divisa = c.enDivisa ? ' (pago en divisa)' : '';
    L.push(`${marca} *COTIZACIÓN ${c.numero}:* ${c.proveedor} · ${montoDosMonedas(c.total, moneda, opts.tasaUsd)}${divisa}`);
  }
  const t = Number(opts.tasaUsd) || 0;
  if (t > 0) L.push(`💱 *Tasa BCV:* ${numTasa(t)}`);

  const elegida = cots.find((c) => c.elegida);
  if (elegida) {
    const ordenadas = [...lista].sort((a, b) => String(a.registrada_en ?? '').localeCompare(String(b.registrada_en ?? '')));
    const ofElegida = ordenadas[elegida.numero - 1];
    const quien = nombrePersonaCompras(quienEscogio(o, ofElegida), opts.personas);
    L.push(quien
      ? `👤 El analista *${quien}* escogió la *COTIZACIÓN ${elegida.numero}* (${elegida.proveedor})`
      : `👤 Se escogió la *COTIZACIÓN ${elegida.numero}* (${elegida.proveedor})`);
  }
  return L;
}
