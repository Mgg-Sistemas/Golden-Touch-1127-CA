/* ============================================================
   Golden Touch · Tesorería · datos del reporte «Pendientes por pagar»

   UNA sola lectura y UN solo armado para las tres salidas —PDF, Excel y
   WhatsApp—: así lo que se imprime, lo que se exporta y lo que se manda por
   el chat dicen exactamente lo mismo (mismos renglones, mismos montos, misma
   tasa).

   Segmentos (en este orden; los vacíos no salen):
     · 🛒 Compras directas
     · 📄 Órdenes de compra (OC)
     · 🔧 Servicios (Control de Servicio · CS)
     · 🧰 Servicios directos
   Más, aparte y FUERA del total, las cuentas a crédito (cuenta abierta): se
   saldan por abonos en Tesorería, no se pagan de inmediato.

   Cada renglón lleva su monto en $ y su equivalente en Bs a la tasa BCV del
   día, y CÓMO se le paga (método y datos), para pagar sin volver a la pantalla.

   Los textos salen CRUDOS (con acentos y emojis): el PDF los sanea con
   `pdfSafe` al dibujar, porque las fuentes base de jsPDF no tienen todo.
   ============================================================ */
import { labelMetodoPago, listOrdenesPorPagar, listOrdenesEnCredito, type OrdenPorPagar } from '@/modules/pedidos/pedidos.repository';
import { listComprasDirectas, type CompraDirecta } from '@/modules/pedidos/compras.repository';
import { listServiciosDirectos, type ServicioDirecto } from '@/modules/pedidos/serviciosDirectos.repository';
import { listDatosPagoDeProveedores, type DatosPago } from '@/modules/pedidos/datosPago.repository';
import { resumenDatosPago } from '@/shared/ui/DatosPagoFields';
import type { PagoMetodo } from '@/shared/lib/types';
import { money } from '@/shared/lib/format';
import { getTasaHoy } from './tasas.repository';

/** Una línea de «cómo se le paga»: el método (para su emoji) y el texto completo. */
export interface LineaPago {
  /** Clave del método (`pago_movil`, `transferencia`…). */
  metodo: string;
  texto: string;
  /** true = dato guardado del proveedor, solo como referencia (el método se decide al pagar). */
  registrado: boolean;
}

/** Fila común del reporte + sus montos normalizados ($ y Bs). */
export interface FilaPendiente {
  codigo: string;
  proveedor: string;
  estado: string;
  /** true = ya se puede pagar (Compras indicó el método o es un directo). */
  listaParaPagar: boolean;
  pagos: LineaPago[];
  usd: number;
  bs: number;
}

export type ClaveSegmento = 'compras_directas' | 'oc' | 'servicios' | 'servicios_directos' | 'credito';

export interface SegmentoPendiente {
  clave: ClaveSegmento;
  titulo: string;
  filas: FilaPendiente[];
  subUsd: number;
  subBs: number;
}

export interface DatosPendientesPorPagar {
  /** Lo por pagar (SIN el crédito), solo los segmentos con filas. */
  segmentos: SegmentoPendiente[];
  /** Cuentas a crédito abiertas: indicativo aparte, no suman al total. */
  credito: SegmentoPendiente | null;
  /** Bs por 1 USD (BCV). 0 = no se calculan equivalencias en Bs. */
  tasa: number;
  tasaFecha: string | null;
  totUsd: number;
  totBs: number;
  totCant: number;
  /** ISO del momento en que se armó. */
  generadoEn: string;
}

/** Entradas ya leídas, para armar el reporte sin tocar la base (lo que se prueba). */
export interface EntradaPendientes {
  rows: OrdenPorPagar[];
  creditos?: OrdenPorPagar[];
  comprasDir?: CompraDirecta[];
  serviciosDir?: ServicioDirecto[];
  /** Datos de pago guardados por proveedor: { proveedorId: { metodo: datos } }. */
  datosProv?: Record<string, Record<string, DatosPago>>;
  tasa?: number;
  tasaFecha?: string | null;
  generadoEn?: string;
}

const redondear2 = (n: number) => Math.round(n * 100) / 100;

/** Normaliza el monto de un directo (Bs o USD) a { usd, bs } con la tasa del día. */
function normMonto(gasto: number | null | undefined, moneda: string | null | undefined, tasa: number): { usd: number; bs: number } {
  const g = Number(gasto) || 0;
  if (moneda === 'Bs') return { usd: tasa > 0 ? redondear2(g / tasa) : 0, bs: g };
  return { usd: g, bs: tasa > 0 ? redondear2(g * tasa) : 0 };
}

/** Bs con separador de miles VE y 2 decimales (sin prefijo). */
function bsNum(n: number): string {
  return Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Monto de una pata del pago, en su propia moneda. */
function montoPata(m: PagoMetodo): string {
  const n = Number(m.monto) || 0;
  if (m.moneda === 'Bs') return 'Bs ' + bsNum(n);
  if (!m.moneda || m.moneda === 'USD') return money(n);
  return m.moneda + ' ' + bsNum(n);
}

/**
 * «Cómo se le paga esto». Una línea por método. El monto por pata solo aparece si el
 * pago va partido en varias: con una sola repetiría el importe de la columna de al lado.
 * Sin método en el documento: lo que el proveedor tenga guardado, marcado «(registrado)»
 * para que nadie lo lea como «se paga así».
 */
export function lineasDePago(
  metodos: PagoMetodo[] | null | undefined,
  proveedorId: string | null | undefined,
  datosProv: Record<string, Record<string, DatosPago>>,
): LineaPago[] {
  const list = (metodos ?? []).filter(Boolean);
  if (list.length) {
    return list.map((m) => {
      const datos = resumenDatosPago(m.metodo, (m.datos ?? {}) as DatosPago).trim();
      const cabeza = labelMetodoPago(m.metodo) + (list.length > 1 ? ' · ' + montoPata(m) : '');
      return { metodo: m.metodo, texto: datos ? cabeza + ' — ' + datos : cabeza, registrado: false };
    });
  }
  const guardados = (proveedorId && datosProv[proveedorId]) || null;
  if (!guardados) return [];
  return Object.entries(guardados)
    .map(([metodo, d]): LineaPago | null => {
      const datos = resumenDatosPago(metodo, d).trim();
      return datos ? { metodo, texto: labelMetodoPago(metodo) + ' — ' + datos + ' (registrado)', registrado: true } : null;
    })
    .filter((l): l is LineaPago => l !== null);
}

function mkSeg(clave: ClaveSegmento, titulo: string, filas: FilaPendiente[]): SegmentoPendiente {
  return {
    clave, titulo, filas,
    subUsd: filas.reduce((a, f) => a + f.usd, 0),
    subBs: filas.reduce((a, f) => a + f.bs, 0),
  };
}

/** Arma el reporte a partir de lo ya leído (sin tocar la base). */
export function armarPendientesPorPagar(e: EntradaPendientes): DatosPendientesPorPagar {
  const tasa = Number(e.tasa) || 0;
  const datosProv = e.datosProv ?? {};
  const creditos = e.creditos ?? [];

  const filaOc = (r: OrdenPorPagar): FilaPendiente => {
    const usd = Number(r.montoAPagar || 0);
    return {
      codigo: r.orden.oc_codigo || '—',
      proveedor: r.proveedorNombre || '—',
      estado: r.esperandoMetodo ? 'Esperando método' : 'Lista para pagar',
      listaParaPagar: !r.esperandoMetodo,
      pagos: lineasDePago(r.orden.metodo_pago, r.orden.proveedor_id, datosProv),
      usd,
      bs: tasa > 0 ? redondear2(usd * tasa) : 0,
    };
  };
  const filaCompra = (c: CompraDirecta): FilaPendiente => {
    const { usd, bs } = normMonto(c.gasto, c.moneda, tasa);
    return {
      codigo: c.codigo || '—',
      proveedor: c.proveedor_nombre || '—',
      estado: 'Por pagar',
      listaParaPagar: true,
      // Una compra directa elige el método recién al pagarla: aquí van los datos
      // guardados del proveedor, como referencia.
      pagos: lineasDePago(null, c.proveedor_id, datosProv),
      usd, bs,
    };
  };
  const filaServicio = (s: ServicioDirecto): FilaPendiente => {
    // Con abonos: lo pendiente es el saldo (total − abonado).
    const total = Number(s.gasto) || 0;
    const pend = s.con_abonos ? Math.max(0, total - (Number(s.abonado_total) || 0)) : total;
    const { usd, bs } = normMonto(pend, s.moneda, tasa);
    return {
      codigo: s.codigo || '—',
      proveedor: s.proveedor_nombre || '—',
      // «Se salda por abonos» cambia cuánto se paga hoy: va en el estado.
      estado: s.con_abonos ? 'Por pagar · saldo con abonos' : 'Por pagar',
      listaParaPagar: true,
      pagos: lineasDePago(null, s.proveedor_id, datosProv),
      usd, bs,
    };
  };
  const filaCredito = (r: OrdenPorPagar): FilaPendiente => {
    const usd = Number(r.orden.total || 0);
    return {
      codigo: r.orden.oc_codigo || '—',
      proveedor: r.proveedorNombre || '—',
      estado: 'Crédito · se salda por abonos',
      listaParaPagar: false,
      pagos: lineasDePago(r.orden.metodo_pago, r.orden.proveedor_id, datosProv),
      usd,
      bs: tasa > 0 ? redondear2(usd * tasa) : 0,
    };
  };

  const ocRows = e.rows.filter((r) => r.orden.tipo !== 'servicio');
  const csRows = e.rows.filter((r) => r.orden.tipo === 'servicio');
  const comprasPP = (e.comprasDir ?? []).filter((c) => c.estado === 'por_pagar');
  const serviciosPP = (e.serviciosDir ?? []).filter((s) => s.estado === 'por_pagar');

  const segmentos = [
    mkSeg('compras_directas', 'COMPRAS DIRECTAS', comprasPP.map(filaCompra)),
    mkSeg('oc', 'ÓRDENES DE COMPRA (OC)', ocRows.map(filaOc)),
    mkSeg('servicios', 'SERVICIOS (CONTROL DE SERVICIO · CS)', csRows.map(filaOc)),
    mkSeg('servicios_directos', 'SERVICIOS DIRECTOS', serviciosPP.map(filaServicio)),
  ].filter((s) => s.filas.length > 0);

  return {
    segmentos,
    credito: creditos.length ? mkSeg('credito', 'CUENTAS A CRÉDITO (CUENTA ABIERTA)', creditos.map(filaCredito)) : null,
    tasa,
    tasaFecha: e.tasaFecha ?? null,
    totUsd: segmentos.reduce((a, s) => a + s.subUsd, 0),
    totBs: segmentos.reduce((a, s) => a + s.subBs, 0),
    totCant: segmentos.reduce((a, s) => a + s.filas.length, 0),
    generadoEn: e.generadoEn ?? new Date().toISOString(),
  };
}

/** Lee las OC por pagar y a crédito (lo que ve Compras) y arma el reporte. */
export async function cargarPendientesPorPagar(): Promise<DatosPendientesPorPagar> {
  const [rows, creditos] = await Promise.all([listOrdenesPorPagar(), listOrdenesEnCredito()]);
  return cargarConLecturas(rows, creditos);
}

/** Igual, pero con las OC ya leídas (la pantalla de Tesorería ya las tiene). */
export async function cargarConLecturas(rows: OrdenPorPagar[], creditos: OrdenPorPagar[] = []): Promise<DatosPendientesPorPagar> {
  const [tasaHoy, comprasDir, serviciosDir] = await Promise.all([
    getTasaHoy().catch(() => ({ usd: null, eur: null, fecha: null })),
    listComprasDirectas().catch(() => [] as CompraDirecta[]),
    listServiciosDirectos().catch(() => [] as ServicioDirecto[]),
  ]);
  // Datos de pago guardados de TODOS los proveedores del reporte, en una sola consulta
  // (uno por renglón serían decenas). Si falla, el reporte sale igual.
  const datosProv = await listDatosPagoDeProveedores([
    ...rows.map((r) => r.orden.proveedor_id),
    ...creditos.map((r) => r.orden.proveedor_id),
    ...comprasDir.map((c) => c.proveedor_id),
    ...serviciosDir.map((sv) => sv.proveedor_id),
  ]).catch(() => ({} as Record<string, Record<string, DatosPago>>));
  return armarPendientesPorPagar({
    rows, creditos, comprasDir, serviciosDir, datosProv,
    tasa: Number(tasaHoy?.usd) || 0, tasaFecha: tasaHoy?.fecha ?? null,
  });
}
