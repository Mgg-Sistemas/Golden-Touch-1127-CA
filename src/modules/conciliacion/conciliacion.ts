/* ============================================================
   Conciliación (12/11/2026) · lógica pura, sin Supabase.

   Cruza, por cada OC de Compras (y, desde el 12/11/2026, cada compra
   directa y servicio directo):
     · el monto de la OC en $ y en Bs, a la tasa con que se pagó;
     · la referencia del pago que Tesorería anota al pagar (últimos 4
       dígitos de la transferencia / pago móvil o del ID de Binance,
       ver tesoreria/referenciasPago.ts);
     · si lleva retención, de qué tipo y su número de comprobante;
     · el estatus de Compras.

   LA TASA DEL PAGO no se guarda en la OC. Se reconstruye así:
     1. la derivada de lo pagado: Bs pagados ÷ lo que cubrieron en $ (exacta
        cuando la OC se pagó en Bs). Solo se usa si queda a menos de 5 % de
        la BCV de ese día: así una retención o un pago parcial no la deforman;
     2. si no, la BCV del día del pago;
     3. sin pago, la BCV de hoy (la columna lo dice).
   ============================================================ */

import type { EstadoOrden, Orden } from '@/shared/lib/types';
import { statusBadge } from '@/shared/lib/format';
import {
  leerRetencionesCompras, lineasRetencion, type CamposRetencionesCompras,
} from '@/modules/pedidos/retencionesCompras';

export const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Un egreso de pago de la OC (movimientos_caja, categoría pago_oc). */
export interface PagoOc {
  ordenId: string;
  monto: number;
  moneda: string;
  motivo: string | null;
  at: string | null;
}

/** Una retención del libro fiscal ligada a la OC. */
export interface RetencionLibro {
  ordenId: string;
  /** Tipo del libro: iva | islr | municipal (ISAE) | regional | igtf. */
  tipo: string;
  comprobante: string | null;
  monto: number;
  moneda: string | null;
}

export interface LineaRetencion {
  tipo: string;
  comprobante: string | null;
}

export type FuenteTasa = 'pago' | 'bcv_pago' | 'bcv_hoy';

/** De qué tabla sale la fila: OC/CS (ordenes), compra directa o servicio directo. */
export type OrigenDoc = 'oc' | 'cd' | 'sd';

/** Un archivo cargado desde Conciliación (bucket conciliacion-pagos). */
export interface ArchivoNota {
  path: string;
  nombre: string;
  at?: string | null;
  por?: string | null;
}

export type EstadoDrive = 'cuadra' | 'no_cuadra';

/** Resultado del cruce con el archivo del Drive (columna DRIVE, 12/11/2026). */
export interface DriveConciliacion {
  estado: EstadoDrive;
  detalle: string | null;
  archivo: string | null;
  archivoPath: string | null;
  en: string | null;
  por: string | null;
}

/** Lo que Conciliación anota por documento: la referencia (lapicito), comprobantes y el cruce del Drive. */
export interface NotaConciliacion {
  referencia: string | null;
  comprobantes: ArchivoNota[];
  drive?: DriveConciliacion | null;
}

/** Un comprobante del pago que cargó Tesorería (bucket compras-oc). */
export interface ComprobanteTesoreria {
  path: string;
  nombre: string;
}

export const claveDoc = (origen: OrigenDoc, id: string) => `${origen}:${id}`;

export interface FilaConciliacion {
  item: number;
  /** Id del documento (orden, compra directa o servicio directo). */
  ordenId: string;
  origen: OrigenDoc;
  codigo: string;
  /** Orden de compra (OC-…), de servicio (CS-…), compra directa o servicio directo. */
  tipo: TipoOrden;
  proveedor: string;
  estado: string;
  estadoLabel: string;
  estadoClase: string;
  fecha: string;
  monedaOc: 'USD' | 'Bs';
  totalUsd: number | null;
  totalBs: number | null;
  tasa: number | null;
  fuenteTasa: FuenteTasa | null;
  pagada: boolean;
  fechaPago: string | null;
  /** Moneda en que Tesorería pagó la orden: Bs (se concilia en banco) o USD/$ (no se cruza en banco Bs). */
  monedaPago?: 'Bs' | 'USD' | 'Mixto' | null;
  pagadoUsd: number;
  pagadoBs: number | null;
  referencias: string[];
  /** La referencia anotada en Conciliación (lapicito). Ya va también en `referencias`. */
  referenciaManual: string | null;
  /** Comprobantes del pago: los de Tesorería y los cargados en Conciliación. */
  comprobantesTesoreria: ComprobanteTesoreria[];
  comprobantesConciliacion: ArchivoNota[];
  /** Facturas cargadas (null = no se sabe sin abrirlas: p. ej. fotos del delivery). */
  facturas: number | null;
  /** Ruta de la factura principal de una compra/servicio directo (adjunto_path). */
  facturaPrincipal: { path: string; nombre: string } | null;
  llevaRetencion: boolean;
  retenciones: LineaRetencion[];
  retencionMontoBs?: number | null;
  retencionMontoUsd?: number | null;
  anulada: boolean;
  /** Cruce con el archivo del Drive: CUADRA / NO CUADRA (null = no se ha cruzado). */
  drive: DriveConciliacion | null;
}

/* ─────────────── Estatus (lenguaje de Compras) ─────────────── */

const ESTADO_LABEL: Partial<Record<EstadoOrden, string>> = {
  aprobada: 'Pendiente por cargar ofertas',
  oc_creada: 'Pendiente por aprobar',
  confirmada_metodo: 'Pendiente método de pago',
  oc_aprobada: 'Esperando pago',
  cuenta_abierta: 'Crédito · cuenta abierta',
  pagada: 'Pendiente por recibir',
  por_recibir: 'Pendiente por recibir',
  oc_emitida: 'OC emitida',
  recibida: 'Recibida',
  finalizada: 'Finalizada',
  cancelada: 'Cancelada',
  rechazada: 'Rechazada',
  desistida_proveedor: 'Proveedor desistió',
  reasignada: 'Reasignada',
};

/** Órdenes de servicio (12/11/2026): los estatus con el nombre del kanban de Servicios. */
const ESTADO_LABEL_SERVICIO: Partial<Record<EstadoOrden, string>> = {
  pagada: 'Pagado · por realizar',
  por_recibir: 'Pendiente por realizar',
  recibida: 'Servicio realizado',
  finalizada: 'Finalizado',
  cancelada: 'Cancelado',
};

const ESTADOS_ANULADOS = new Set<string>(['cancelada', 'rechazada', 'desistida_proveedor', 'reasignada']);

export type TipoOrden = 'compra' | 'servicio' | 'compra_directa' | 'servicio_directo';

export function tipoDeOrden(o: Pick<Orden, 'tipo'>): TipoOrden {
  return o.tipo === 'servicio' ? 'servicio' : 'compra';
}

const ETIQUETA_TIPO: Record<TipoOrden, string> = {
  compra: 'Compra', servicio: 'Servicio', compra_directa: 'Compra directa', servicio_directo: 'Servicio directo',
};

export function etiquetaTipo(t: TipoOrden): string {
  return ETIQUETA_TIPO[t] ?? 'Compra';
}

export function etiquetaEstado(estado: EstadoOrden, tipo: TipoOrden = 'compra'): { label: string; clase: string } {
  const base = statusBadge(estado);
  const clase = estado === 'oc_aprobada' ? 'warning' : base.className;
  const label = (tipo === 'servicio' ? ESTADO_LABEL_SERVICIO[estado] : undefined) ?? ESTADO_LABEL[estado] ?? base.label;
  return { label, clase };
}

/* ─────────────── Referencias del pago ─────────────── */

const RE_REFERENCIA = /(Ref\. Bs|ID Binance)(?: \(([^)]*)\))? (\d{4})/g;

/** «Ref. Bs 1234» / «ID Binance (Caja · Jurídica) 5678» dentro del motivo → «Bs 1234», «Binance 5678». */
export function referenciasDeMotivo(motivo: string | null | undefined): string[] {
  if (!motivo) return [];
  const out: string[] = [];
  for (const m of motivo.matchAll(RE_REFERENCIA)) {
    out.push(`${m[1] === 'Ref. Bs' ? 'Bs' : 'Binance'} ${m[3]}`);
  }
  return out;
}

/* ─────────────── Retenciones ─────────────── */

const TIPO_LIBRO: Record<string, string> = { iva: 'IVA', islr: 'ISLR', municipal: 'ISAE', regional: 'Estadal', igtf: 'IGTF' };

export function etiquetaTipoLibro(tipo: string): string {
  return TIPO_LIBRO[tipo] ?? tipo.toUpperCase();
}

/**
 * Las retenciones de la OC: las del libro fiscal (con su número de comprobante) y,
 * si Compras indicó otras que el libro aún no tiene, esas sin comprobante.
 */
export function retencionesDeOrden(o: Orden, libro: RetencionLibro[]): LineaRetencion[] {
  const out: LineaRetencion[] = libro.map((r) => ({ tipo: etiquetaTipoLibro(r.tipo), comprobante: r.comprobante }));
  const compras = leerRetencionesCompras(o as Orden & CamposRetencionesCompras);
  if (compras) {
    for (const l of lineasRetencion(compras)) {
      if (!out.some((x) => x.tipo === l.corta)) out.push({ tipo: l.corta, comprobante: null });
    }
  }
  if (!out.length && o.retencion_aplicada) out.push({ tipo: 'Retención', comprobante: null });
  return out;
}

/* ─────────────── Tasa y montos ─────────────── */

const esDolar = (moneda: string) => moneda === 'USD' || moneda === 'USDT';

/**
 * Tasa del pago: la derivada de los egresos si es coherente con la BCV del día del
 * pago (±5 %); si no, esa BCV; sin pago, la de hoy.
 */
export function tasaDelPago(
  o: Pick<Orden, 'total' | 'total_moneda' | 'retencion_monto'>,
  pagos: PagoOc[],
  bcvDiaPago: number | null,
  bcvHoy: number | null,
): { tasa: number | null; fuente: FuenteTasa | null } {
  if (!pagos.length) return bcvHoy ? { tasa: bcvHoy, fuente: 'bcv_hoy' } : { tasa: null, fuente: null };
  const bs = pagos.filter((p) => p.moneda === 'Bs').reduce((a, p) => a + p.monto, 0);
  const usd = pagos.filter((p) => esDolar(p.moneda)).reduce((a, p) => a + p.monto, 0);
  if (bs > 0 && (o.total_moneda ?? 'USD') !== 'Bs') {
    const cubierto = (Number(o.total) || 0) - (Number(o.retencion_monto) || 0) - usd;
    const derivada = cubierto > 0.01 ? bs / cubierto : 0;
    if (derivada > 0 && (!bcvDiaPago || Math.abs(derivada / bcvDiaPago - 1) <= 0.05)) {
      return { tasa: r2(derivada), fuente: 'pago' };
    }
  }
  if (bcvDiaPago) return { tasa: bcvDiaPago, fuente: 'bcv_pago' };
  return bcvHoy ? { tasa: bcvHoy, fuente: 'bcv_hoy' } : { tasa: null, fuente: null };
}

export interface ContextoConciliacion {
  proveedores: Map<string, string>;
  /** Notas de Conciliación por `claveDoc` (referencia y comprobantes). */
  notas?: Map<string, NotaConciliacion>;
  /** Facturas conocidas por `claveDoc` (adjuntos + factura de recepción). */
  facturas?: Map<string, number>;
  /** Comprobantes del pago de Tesorería por id de OC. */
  comprobantes?: Map<string, ComprobanteTesoreria[]>;
  pagos: Map<string, PagoOc[]>;
  retenciones: Map<string, RetencionLibro[]>;
  /** BCV por día (YYYY-MM-DD). */
  bcvPorDia: Map<string, number>;
  bcvHoy: number | null;
  /** Fecha (YYYY-MM-DD, hora de Venezuela) de un ISO. */
  dia: (iso: string) => string;
}

/** Arma las filas, numeradas del 1 al N en el orden recibido. */
export function armarFilas(ordenes: Orden[], ctx: ContextoConciliacion): FilaConciliacion[] {
  return ordenes.map((o, i) => {
    const pagos = ctx.pagos.get(o.id) ?? [];
    const fechaPago = o.pagada_en ?? pagos[0]?.at ?? null;
    const bcvDiaPago = fechaPago ? ctx.bcvPorDia.get(ctx.dia(fechaPago)) ?? null : null;
    const { tasa, fuente } = tasaDelPago(o, pagos, bcvDiaPago, ctx.bcvHoy);
    const monedaOc: 'USD' | 'Bs' = (o.total_moneda ?? 'USD') === 'Bs' ? 'Bs' : 'USD';
    const total = Number(o.total) || 0;
    const totalUsd = monedaOc === 'USD' ? r2(total) : (tasa ? r2(total / tasa) : null);
    const totalBs = monedaOc === 'Bs' ? r2(total) : (tasa ? r2(total * tasa) : null);
    const pagadoBsBruto = pagos.filter((p) => p.moneda === 'Bs').reduce((a, p) => a + p.monto, 0);
    const pagadoUsdDirecto = pagos.filter((p) => esDolar(p.moneda)).reduce((a, p) => a + p.monto, 0);
    const pagadoUsd = r2(pagadoUsdDirecto + (tasa ? pagadoBsBruto / tasa : 0));
    const pagadoBs = tasa ? r2(pagadoBsBruto + pagadoUsdDirecto * tasa) : (pagadoUsdDirecto ? null : r2(pagadoBsBruto));
    const nota = ctx.notas?.get(claveDoc('oc', o.id)) ?? null;
    const referencias = conManual([...new Set(pagos.flatMap((p) => referenciasDeMotivo(p.motivo)))], nota?.referencia);
    const retLibro = ctx.retenciones.get(o.id) ?? [];
    const retenciones = retencionesDeOrden(o, retLibro);
    const tipo = tipoDeOrden(o);
    const { label, clase } = etiquetaEstado(o.estado, tipo);
    const estaPagada = !!o.pagada_en || pagos.length > 0;

    const sumaLibroBs = retLibro.filter((r) => r.moneda === 'Bs').reduce((a, r) => a + r.monto, 0);
    const sumaLibroUsd = retLibro.filter((r) => r.moneda !== 'Bs').reduce((a, r) => a + r.monto, 0);
    const comprasRet = leerRetencionesCompras(o as Orden & CamposRetencionesCompras);
    const oRet = o as Orden & CamposRetencionesCompras;
    const comprasTotal = (comprasRet && comprasRet.total > 0)
      ? comprasRet.total
      : (Number(oRet.retencion_compras_total) || 0) > 0
      ? Number(oRet.retencion_compras_total)
      : (Number(oRet.retencion_iva_monto) || 0) + (Number(oRet.retencion_islr_monto) || 0) + (Number(oRet.retencion_isae_monto) || 0) + (Number(oRet.retencion_igtf_monto) || 0);

    let retencionMontoBs: number | null = null;
    let retencionMontoUsd: number | null = null;
    if (sumaLibroBs > 0 || sumaLibroUsd > 0) {
      retencionMontoBs = sumaLibroBs + (tasa && sumaLibroUsd > 0 ? r2(sumaLibroUsd * tasa) : 0);
      retencionMontoUsd = sumaLibroUsd + (tasa && sumaLibroBs > 0 ? r2(sumaLibroBs / tasa) : 0);
    } else if (comprasTotal > 0) {
      if (monedaOc === 'Bs') {
        retencionMontoBs = comprasTotal;
        retencionMontoUsd = tasa ? r2(comprasTotal / tasa) : null;
      } else {
        retencionMontoUsd = comprasTotal;
        retencionMontoBs = tasa ? r2(comprasTotal * tasa) : null;
      }
    } else if ((o.retencion_monto_bs ?? 0) > 0) {
      retencionMontoBs = Number(o.retencion_monto_bs);
      retencionMontoUsd = tasa ? r2(retencionMontoBs / tasa) : (Number(o.retencion_monto) || null);
    } else if ((o.retencion_monto ?? 0) > 0) {
      if (monedaOc === 'Bs') {
        retencionMontoBs = Number(o.retencion_monto);
        retencionMontoUsd = tasa ? r2(Number(o.retencion_monto) / tasa) : null;
      } else {
        retencionMontoUsd = Number(o.retencion_monto);
        retencionMontoBs = tasa ? r2(Number(o.retencion_monto) * tasa) : null;
      }
    }

    let monedaPago: 'Bs' | 'USD' | 'Mixto' | null = null;
    if (pagadoBsBruto > 0 && pagadoUsdDirecto > 0) {
      monedaPago = 'Mixto';
    } else if (pagadoBsBruto > 0) {
      monedaPago = 'Bs';
    } else if (pagadoUsdDirecto > 0) {
      monedaPago = 'USD';
    } else if (estaPagada || o.estado === 'pagada' || o.estado === 'finalizada') {
      const tieneRefBs = referencias.some((r) => /^Bs\b/i.test(r) || /\bBSS?\b/i.test(r));
      const tieneRefBinance = referencias.some((r) => /^Binance\b/i.test(r));
      if (tieneRefBinance) monedaPago = 'USD';
      else if (tieneRefBs || monedaOc === 'Bs') monedaPago = 'Bs';
      else monedaPago = 'USD';
    }

    return {
      item: i + 1,
      ordenId: o.id,
      origen: 'oc' as const,
      codigo: o.oc_codigo ?? o.codigo,
      tipo,
      proveedor: (o.proveedor_id && ctx.proveedores.get(o.proveedor_id)) || '—',
      estado: o.estado,
      estadoLabel: label,
      estadoClase: clase,
      fecha: o.created_at,
      monedaOc, totalUsd, totalBs, tasa, fuenteTasa: fuente,
      pagada: estaPagada,
      fechaPago,
      monedaPago,
      pagadoUsd, pagadoBs,
      referencias,
      referenciaManual: nota?.referencia ?? null,
      comprobantesTesoreria: ctx.comprobantes?.get(o.id) ?? [],
      comprobantesConciliacion: nota?.comprobantes ?? [],
      facturas: ctx.facturas?.get(claveDoc('oc', o.id)) ?? 0,
      facturaPrincipal: null,
      llevaRetencion: retenciones.length > 0,
      retenciones,
      retencionMontoBs,
      retencionMontoUsd,
      anulada: ESTADOS_ANULADOS.has(o.estado),
      drive: nota?.drive ?? null,
    };
  });
}

/** La referencia de Conciliación va junto a las de Tesorería (sin repetirla). */
function conManual(refs: string[], manual: string | null | undefined): string[] {
  const m = (manual ?? '').trim();
  if (!m) return refs;
  const norm = (x: string) => x.replace(/\D/g, '') || x.toLowerCase();
  return refs.some((r) => norm(r) === norm(m)) ? refs : [...refs, m];
}

/* ─────────────── Compras y servicios DIRECTOS (12/11/2026) ─────────────── */

/** Una compra directa o un servicio directo, ya normalizado para Conciliación. */
export interface DocDirecto {
  id: string;
  origen: 'cd' | 'sd';
  codigo: string | null;
  proveedor: string | null;
  estado: string;
  fecha: string;
  moneda: string | null;
  /** Total del documento en su moneda (`gasto`). */
  total: number | null;
  /** Tasa con la que pagó Tesorería y la del montaje (conversor). */
  tasaPago: number | null;
  tasaConversion: number | null;
  pagadaAt: string | null;
  /** Retención que restó Tesorería al pagar (moneda del documento). */
  retencionPago: number | null;
  /** Retención que cargó Compras al montar (compra directa). */
  retencionTipo: string | null;
  adjuntoPath: string | null;
  adjuntoNombre: string | null;
}

const ESTADO_DIRECTO: Record<string, { label: string; clase: string }> = {
  en_proceso: { label: 'En proceso', clase: 'info' },
  por_pagar: { label: 'Por pagar', clase: 'warning' },
  finalizada: { label: 'Finalizada', clase: 'success' },
};

export function filasDirectas(docs: DocDirecto[], ctx: ContextoConciliacion): FilaConciliacion[] {
  return docs.map((d, i) => {
    const bcvDiaPago = d.pagadaAt ? ctx.bcvPorDia.get(ctx.dia(d.pagadaAt)) ?? null : null;
    let tasa: number | null = null;
    let fuente: FuenteTasa | null = null;
    if (d.tasaPago && d.tasaPago > 0) { tasa = d.tasaPago; fuente = 'pago'; }
    else if (bcvDiaPago) { tasa = bcvDiaPago; fuente = 'bcv_pago'; }
    else if (d.tasaConversion && d.tasaConversion > 0) { tasa = d.tasaConversion; fuente = d.pagadaAt ? 'pago' : 'bcv_hoy'; }
    else if (ctx.bcvHoy) { tasa = ctx.bcvHoy; fuente = 'bcv_hoy'; }
    const monedaOc: 'USD' | 'Bs' = d.moneda === 'Bs' ? 'Bs' : 'USD';
    const total = Number(d.total) || 0;
    const totalUsd = monedaOc === 'USD' ? r2(total) : (tasa ? r2(total / tasa) : null);
    const totalBs = monedaOc === 'Bs' ? r2(total) : (tasa ? r2(total * tasa) : null);
    const pagada = !!d.pagadaAt;
    const neto = Math.max(0, total - (Number(d.retencionPago) || 0));
    const netoUsd = monedaOc === 'USD' ? neto : (tasa ? neto / tasa : 0);
    const netoBs = monedaOc === 'Bs' ? neto : (tasa ? neto * tasa : null);
    const clave = claveDoc(d.origen, d.id);
    const nota = ctx.notas?.get(clave) ?? null;
    const libro = ctx.retenciones.get(d.id) ?? [];
    const retenciones: LineaRetencion[] = libro.map((r) => ({ tipo: etiquetaTipoLibro(r.tipo), comprobante: r.comprobante }));
    if (!retenciones.length && (d.retencionTipo || (Number(d.retencionPago) || 0) > 0)) {
      retenciones.push({ tipo: d.retencionTipo ? d.retencionTipo.toUpperCase() : 'Retención', comprobante: null });
    }
    const est = ESTADO_DIRECTO[d.estado] ?? { label: d.estado, clase: 'muted' };
    const sumaLibroBs = libro.filter((r) => r.moneda === 'Bs').reduce((a, r) => a + r.monto, 0);
    const sumaLibroUsd = libro.filter((r) => r.moneda !== 'Bs').reduce((a, r) => a + r.monto, 0);
    let retencionMontoBs: number | null = null;
    let retencionMontoUsd: number | null = null;
    if (sumaLibroBs > 0 || sumaLibroUsd > 0) {
      retencionMontoBs = sumaLibroBs + (tasa && sumaLibroUsd > 0 ? r2(sumaLibroUsd * tasa) : 0);
      retencionMontoUsd = sumaLibroUsd + (tasa && sumaLibroBs > 0 ? r2(sumaLibroBs / tasa) : 0);
    } else if ((Number(d.retencionPago) || 0) > 0) {
      if (monedaOc === 'Bs') {
        retencionMontoBs = Number(d.retencionPago);
        retencionMontoUsd = tasa ? r2(retencionMontoBs / tasa) : null;
      } else {
        retencionMontoUsd = Number(d.retencionPago);
        retencionMontoBs = tasa ? r2(retencionMontoUsd * tasa) : null;
      }
    }
    return {
      item: i + 1,
      ordenId: d.id,
      origen: d.origen,
      codigo: d.codigo ?? (d.origen === 'cd' ? 'Compra directa' : 'Servicio directo'),
      tipo: d.origen === 'cd' ? 'compra_directa' as const : 'servicio_directo' as const,
      proveedor: d.proveedor?.trim() || '—',
      estado: d.estado,
      estadoLabel: est.label,
      estadoClase: est.clase,
      fecha: d.fecha,
      monedaOc, totalUsd, totalBs, tasa, fuenteTasa: fuente,
      pagada,
      fechaPago: d.pagadaAt,
      monedaPago: pagada ? (monedaOc === 'Bs' ? 'Bs' : 'USD') : null,
      pagadoUsd: pagada ? r2(netoUsd) : 0,
      pagadoBs: pagada ? (netoBs == null ? null : r2(netoBs)) : null,
      referencias: conManual([], nota?.referencia),
      referenciaManual: nota?.referencia ?? null,
      comprobantesTesoreria: [],
      comprobantesConciliacion: nota?.comprobantes ?? [],
      facturas: (ctx.facturas?.get(clave) ?? 0) + (d.adjuntoPath ? 1 : 0),
      facturaPrincipal: d.adjuntoPath ? { path: d.adjuntoPath, nombre: d.adjuntoNombre || d.adjuntoPath.split('/').pop() || 'factura' } : null,
      llevaRetencion: retenciones.length > 0,
      retenciones,
      retencionMontoBs,
      retencionMontoUsd,
      anulada: false,
      drive: nota?.drive ?? null,
    };
  });
}

/** Junta OC y documentos directos, del más nuevo al más viejo, numerados 1..N. */
export function combinarFilas(...grupos: FilaConciliacion[][]): FilaConciliacion[] {
  return grupos.flat()
    .sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''))
    .map((r, i) => ({ ...r, item: i + 1 }));
}

/* ─────────────── Filtros y totales ─────────────── */

export type FiltroRetencion = 'todas' | 'con' | 'sin';
export type FiltroPago = 'todas' | 'pagadas' | 'sin_pagar';

export interface FiltrosConciliacion {
  texto: string;
  estado: string; // '' = todos; si no, la etiqueta de estatus
  retencion: FiltroRetencion;
  /** Compras, servicios o todas (12/11/2026). */
  tipo?: 'todas' | TipoOrden;
  /** Varios estatus a la vez (filtro con casillas). Vacío = todos. */
  estados?: string[];
  /** Varios tipos a la vez (filtro con casillas). Vacío = todos. */
  tipos?: TipoOrden[];
  /** Columna DRIVE: cuadra, no cuadra o sin cruzar. Vacío = todos. */
  drive?: Array<EstadoDrive | 'sin'>;
  pago: FiltroPago;
  desde: string;  // YYYY-MM-DD ('' = sin tope)
  hasta: string;
  /** Sobre qué fecha corre el rango: la de la OC (por defecto) o la del pago. */
  fechaDe?: 'oc' | 'pago';
  incluirAnuladas: boolean;
}

export const FILTROS_VACIOS: FiltrosConciliacion = {
  texto: '', estado: '', retencion: 'todas', pago: 'todas', desde: '', hasta: '', incluirAnuladas: false,
};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtrarFilas(filas: FilaConciliacion[], f: FiltrosConciliacion, dia: (iso: string) => string): FilaConciliacion[] {
  const q = norm(f.texto.trim());
  return filas.filter((r) => {
    if (!f.incluirAnuladas && r.anulada) return false;
    if (f.estado && r.estadoLabel !== f.estado) return false;
    if (f.tipo && f.tipo !== 'todas' && r.tipo !== f.tipo) return false;
    if (f.estados?.length && !f.estados.includes(r.estadoLabel)) return false;
    if (f.tipos?.length && !f.tipos.includes(r.tipo)) return false;
    if (f.drive?.length && !f.drive.includes(r.drive?.estado ?? 'sin')) return false;
    if (f.retencion === 'con' && !r.llevaRetencion) return false;
    if (f.retencion === 'sin' && r.llevaRetencion) return false;
    if (f.pago === 'pagadas' && !r.pagada) return false;
    if (f.pago === 'sin_pagar' && r.pagada) return false;
    if (f.desde || f.hasta) {
      // Por fecha de pago, la OC sin pagar queda fuera del rango.
      const base = f.fechaDe === 'pago' ? r.fechaPago : r.fecha;
      if (!base) return false;
      const d = dia(base);
      if (f.desde && d < f.desde) return false;
      if (f.hasta && d > f.hasta) return false;
    }
    if (q) {
      const heno = norm([r.codigo, etiquetaTipo(r.tipo), r.proveedor, r.estadoLabel, ...r.referencias,
        ...r.comprobantesConciliacion.map((c) => c.nombre),
        ...r.retenciones.map((x) => `${x.tipo} ${x.comprobante ?? ''}`)].join(' '));
      if (!heno.includes(q)) return false;
    }
    return true;
  });
}

/** Vuelve a numerar 1..N (después de filtrar u ordenar). */
export function renumerar(filas: FilaConciliacion[]): FilaConciliacion[] {
  return filas.map((r, i) => ({ ...r, item: i + 1 }));
}

export interface IndicadoresConciliacion {
  totalOc: { cantidad: number; usd: number; bs: number };
  pagado: { cantidad: number; usd: number; bs: number };
  conRetencion: { cantidad: number; usd: number; bs: number };
}

export function indicadores(filas: FilaConciliacion[]): IndicadoresConciliacion {
  const suma = (xs: FilaConciliacion[], k: 'totalUsd' | 'totalBs') => r2(xs.reduce((a, r) => a + (r[k] ?? 0), 0));
  const pagadas = filas.filter((r) => r.pagada);
  const conRet = filas.filter((r) => r.llevaRetencion);
  return {
    totalOc: { cantidad: filas.length, usd: suma(filas, 'totalUsd'), bs: suma(filas, 'totalBs') },
    pagado: {
      cantidad: pagadas.length,
      usd: r2(pagadas.reduce((a, r) => a + r.pagadoUsd, 0)),
      bs: r2(pagadas.reduce((a, r) => a + (r.pagadoBs ?? 0), 0)),
    },
    conRetencion: { cantidad: conRet.length, usd: suma(conRet, 'totalUsd'), bs: suma(conRet, 'totalBs') },
  };
}

/* ─────────────── Textos de celda (tabla, reporte y WhatsApp) ─────────────── */

export function textoRetencion(r: FilaConciliacion): string {
  if (!r.llevaRetencion) return 'No';
  return r.retenciones.map((x) => (x.comprobante ? `${x.tipo} N° ${x.comprobante}` : `${x.tipo} (sin comprobante)`)).join(' · ');
}

export function textoReferencia(r: FilaConciliacion): string {
  if (r.referencias.length) return r.referencias.join(' · ');
  return r.pagada ? 'Sin referencia' : '—';
}

export function textoFuenteTasa(f: FuenteTasa | null): string {
  if (f === 'pago') return 'tasa del pago';
  if (f === 'bcv_pago') return 'BCV del día del pago';
  if (f === 'bcv_hoy') return 'BCV de hoy (sin pagar)';
  return 'sin tasa';
}
