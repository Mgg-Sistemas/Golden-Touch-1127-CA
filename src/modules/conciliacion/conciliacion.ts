/* ============================================================
   Conciliación (12/11/2026) · lógica pura, sin Supabase.

   Módulo de SOLO LECTURA que cruza, por cada OC de Compras:
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

export interface FilaConciliacion {
  item: number;
  ordenId: string;
  codigo: string;
  proveedor: string;
  estado: EstadoOrden;
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
  pagadoUsd: number;
  pagadoBs: number | null;
  referencias: string[];
  llevaRetencion: boolean;
  retenciones: LineaRetencion[];
  anulada: boolean;
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

const ESTADOS_ANULADOS = new Set<string>(['cancelada', 'rechazada', 'desistida_proveedor', 'reasignada']);

export function etiquetaEstado(estado: EstadoOrden): { label: string; clase: string } {
  const base = statusBadge(estado);
  const clase = estado === 'oc_aprobada' ? 'warning' : base.className;
  return { label: ESTADO_LABEL[estado] ?? base.label, clase };
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
    const referencias = [...new Set(pagos.flatMap((p) => referenciasDeMotivo(p.motivo)))];
    const retenciones = retencionesDeOrden(o, ctx.retenciones.get(o.id) ?? []);
    const { label, clase } = etiquetaEstado(o.estado);
    return {
      item: i + 1,
      ordenId: o.id,
      codigo: o.oc_codigo ?? o.codigo,
      proveedor: (o.proveedor_id && ctx.proveedores.get(o.proveedor_id)) || '—',
      estado: o.estado,
      estadoLabel: label,
      estadoClase: clase,
      fecha: o.created_at,
      monedaOc, totalUsd, totalBs, tasa, fuenteTasa: fuente,
      pagada: !!o.pagada_en || pagos.length > 0,
      fechaPago,
      pagadoUsd, pagadoBs,
      referencias,
      llevaRetencion: retenciones.length > 0,
      retenciones,
      anulada: ESTADOS_ANULADOS.has(o.estado),
    };
  });
}

/* ─────────────── Filtros y totales ─────────────── */

export type FiltroRetencion = 'todas' | 'con' | 'sin';
export type FiltroPago = 'todas' | 'pagadas' | 'sin_pagar';

export interface FiltrosConciliacion {
  texto: string;
  estado: string; // '' = todos; si no, la etiqueta de estatus
  retencion: FiltroRetencion;
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
      const heno = norm([r.codigo, r.proveedor, r.estadoLabel, ...r.referencias,
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
