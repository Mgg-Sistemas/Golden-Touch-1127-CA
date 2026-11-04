/* ============================================================
   Golden Touch · Compras · Retenciones por tipo (03/11/2026)

   Al indicar el método de pago de una OC o Control de Servicio con FACTURA y
   marcar «¿cuándo se retiene?», Compras indica QUÉ se retiene y CUÁNTO:

     tipo  · base del %                          · % por defecto
     IVA   · el IVA de la factura                · 75  (100 si el proveedor no es contribuyente formal)
     ISLR  · la base imponible (sin IVA)         · 2   (servicios de persona jurídica)
     ISAE  · la base imponible (sin IVA)         · 1   (municipal; depende de la ordenanza)
     IGTF  · el IGTF de la orden                 · 100

   Cada uno se carga por % o por monto (se sincronizan, como el IVA y el IGTF del
   mismo modal); el MONTO manda y el % queda de referencia.

   CÓMO SE GUARDA (invariante del total): `ordenes.total` NO se reescribe; sigue
   siendo el total de la factura (base − descuento + IVA + IGTF). Las retenciones
   van en columnas propias (`retencion_<tipo>_pct/monto`, `retencion_compras_total`)
   y el neto se calcula: neto = total − retencion_compras_total.
   · ANTES de pagar: Tesorería precarga el neto (el monto BAJA).
   · DESPUÉS de pagar: quedan informadas; Tesorería paga el total y Retenciones
     las aplica luego.
   `retencion_monto`/`retencion_aplicada` siguen siendo lo que Tesorería RESTÓ al pagar.
   ============================================================ */
import type { Orden, RetencionMomento } from '@/shared/lib/types';

export const TIPOS_RETENCION = ['iva', 'islr', 'isae', 'igtf'] as const;
export type TipoRetencion = (typeof TIPOS_RETENCION)[number];

export const RETENCION_INFO: Record<TipoRetencion, { etiqueta: string; corta: string; pctDefault: number; sobre: string }> = {
  iva: { etiqueta: 'Retención de IVA', corta: 'IVA', pctDefault: 75, sobre: 'del IVA' },
  islr: { etiqueta: 'Retención de ISLR', corta: 'ISLR', pctDefault: 2, sobre: 'de la base imponible' },
  isae: { etiqueta: 'Retención municipal (ISAE)', corta: 'ISAE', pctDefault: 1, sobre: 'de la base imponible' },
  igtf: { etiqueta: 'Retención de IGTF', corta: 'IGTF', pctDefault: 100, sobre: 'del IGTF' },
};

const r2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;
const clampPct = (n: number): number => Math.max(0, Math.min(100, r2(n)));

/** Montos de la factura sobre los que se calcula cada %. */
export interface BasesRetencion {
  /** Base imponible: subtotal SIN IVA ni IGTF. */
  baseImponible: number;
  iva: number;
  igtf: number;
}

export function baseDeRetencion(tipo: TipoRetencion, b: BasesRetencion): number {
  if (tipo === 'iva') return Math.max(0, r2(b.iva));
  if (tipo === 'igtf') return Math.max(0, r2(b.igtf));
  return Math.max(0, r2(b.baseImponible));
}

/** Estado de un renglón en el formulario (texto tal cual lo escribe el usuario). */
export interface RetencionTipoUi {
  activa: boolean;
  pct: string;
  monto: string;
  /** true = el usuario escribió el monto (manda el monto); false = manda el %. */
  manual: boolean;
}
export type RetencionesUi = Record<TipoRetencion, RetencionTipoUi>;

export interface RetencionLinea { pct: number; monto: number }
export interface RetencionesCompras {
  iva: RetencionLinea; islr: RetencionLinea; isae: RetencionLinea; igtf: RetencionLinea;
  total: number;
}

const CERO: RetencionLinea = { pct: 0, monto: 0 };
export function retencionesVacias(): RetencionesCompras {
  return { iva: { ...CERO }, islr: { ...CERO }, isae: { ...CERO }, igtf: { ...CERO }, total: 0 };
}

/**
 * % y monto efectivos de un renglón. Con monto manual el % se deriva del monto;
 * si no, el monto sale del % sobre su base. Inactivo = 0.
 */
export function resolverRetencionTipo(ui: RetencionTipoUi, base: number): RetencionLinea {
  if (!ui.activa) return { ...CERO };
  const b = Math.max(0, r2(base));
  if (ui.manual) {
    const monto = Math.max(0, r2(Number(ui.monto)));
    return { monto, pct: b > 0 ? clampPct((monto / b) * 100) : 0 };
  }
  const pct = clampPct(Number(ui.pct));
  return { pct, monto: r2(b * (pct / 100)) };
}

export function calcularRetencionesCompras(ui: RetencionesUi, bases: BasesRetencion): RetencionesCompras {
  const out = retencionesVacias();
  for (const t of TIPOS_RETENCION) out[t] = resolverRetencionTipo(ui[t], baseDeRetencion(t, bases));
  out.total = r2(TIPOS_RETENCION.reduce((a, t) => a + out[t].monto, 0));
  return out;
}

/** Neto a pagar = total de la factura − retenciones (nunca negativo). */
export function netoAPagarCompras(totalFactura: number, retencionTotal: number): number {
  return Math.max(0, r2((Number(totalFactura) || 0) - (Number(retencionTotal) || 0)));
}

/** Error si las retenciones no tienen sentido frente al total; null si están bien. */
export function errorRetencionesCompras(totalFactura: number, retencionTotal: number): string | null {
  const ret = r2(retencionTotal);
  if (ret <= 0) return null;
  if (ret >= r2(totalFactura)) return 'Las retenciones suman igual o más que el total de la factura: revisa los montos.';
  return null;
}

/**
 * Lo que guarda el repositorio: redondea, descarta negativos y recalcula el total.
 * Lanza si la suma alcanza el total de la factura.
 */
export function normalizarRetencionesCompras(
  input: Partial<Record<TipoRetencion, Partial<RetencionLinea>>> | null | undefined,
  totalFactura: number,
): RetencionesCompras {
  const out = retencionesVacias();
  if (!input) return out;
  for (const t of TIPOS_RETENCION) {
    const monto = Math.max(0, r2(Number(input[t]?.monto)));
    out[t] = { monto, pct: monto > 0 ? clampPct(Number(input[t]?.pct)) : 0 };
  }
  out.total = r2(TIPOS_RETENCION.reduce((a, t) => a + out[t].monto, 0));
  const err = errorRetencionesCompras(totalFactura, out.total);
  if (err) throw new Error(err);
  return out;
}

/** Columnas de `ordenes` (null = sin esa retención). */
export function columnasRetencionesCompras(r: RetencionesCompras | null): Record<string, number | null> {
  const cols: Record<string, number | null> = {};
  for (const t of TIPOS_RETENCION) {
    const l = r?.[t];
    cols[`retencion_${t}_pct`] = l && l.monto > 0 ? l.pct : null;
    cols[`retencion_${t}_monto`] = l && l.monto > 0 ? l.monto : null;
  }
  cols.retencion_compras_total = r ? r.total : 0;
  return cols;
}

/** Campos nuevos de la OC (03/11/2026); se leen sin tocar el tipo compartido `Orden`. */
export type CamposRetencionesCompras = Partial<Record<
  `retencion_${TipoRetencion}_pct` | `retencion_${TipoRetencion}_monto` | 'retencion_compras_total',
  number | null
>>;
const kMonto = (t: TipoRetencion) => `retencion_${t}_monto` as const;
const kPct = (t: TipoRetencion) => `retencion_${t}_pct` as const;
type OrdenConRet = Pick<Orden, 'comprobante_tipo' | 'retencion_momento' | 'total'> & CamposRetencionesCompras;

/**
 * Las retenciones que indicó Compras para la OC, o null si no hay (sin factura,
 * sin «¿cuándo se retiene?» o todo en 0).
 */
export function leerRetencionesCompras(o: OrdenConRet): (RetencionesCompras & { momento: RetencionMomento }) | null {
  if (o.comprobante_tipo !== 'factura' || !o.retencion_momento) return null;
  const out = retencionesVacias();
  for (const t of TIPOS_RETENCION) {
    const monto = Math.max(0, r2(Number(o[kMonto(t)])));
    out[t] = { monto, pct: monto > 0 ? clampPct(Number(o[kPct(t)])) : 0 };
  }
  out.total = r2(TIPOS_RETENCION.reduce((a, t) => a + out[t].monto, 0));
  if (out.total <= 0) return null;
  return { ...out, momento: o.retencion_momento };
}

/** Estado inicial del formulario: lo guardado en la OC, o los % por defecto apagados. */
export function uiInicialRetenciones(o: CamposRetencionesCompras): RetencionesUi {
  const ui = {} as RetencionesUi;
  for (const t of TIPOS_RETENCION) {
    const monto = Number(o[kMonto(t)]) || 0;
    const pct = Number(o[kPct(t)]) || 0;
    ui[t] = monto > 0
      ? { activa: true, manual: true, monto: String(monto), pct: String(pct > 0 ? pct : RETENCION_INFO[t].pctDefault) }
      : { activa: false, manual: false, monto: '', pct: String(RETENCION_INFO[t].pctDefault) };
  }
  return ui;
}

/** Renglones con monto, en el orden de la pantalla (para resúmenes y WhatsApp). */
export function lineasRetencion(r: RetencionesCompras): { tipo: TipoRetencion; corta: string; pct: number; monto: number }[] {
  return TIPOS_RETENCION
    .filter((t) => r[t].monto > 0)
    .map((t) => ({ tipo: t, corta: RETENCION_INFO[t].corta, pct: r[t].pct, monto: r[t].monto }));
}

/** «75%» / «2,5%» para etiquetas. */
export function pctTexto(p: number): string {
  return `${(Number(p) || 0).toLocaleString('es-VE', { maximumFractionDigits: 2 })}%`;
}
