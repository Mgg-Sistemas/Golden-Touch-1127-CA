/* ============================================================
   Golden Touch · Pedidos · Precios que ya traen el IVA (04-11-2026)
   Adaptado a GT (14-10-2026), que guarda el
   IVA como iva_aplicado / iva_pct / iva_monto.

   total = (Σ ítems − descuento) + IVA + IGTF

   …salvo cuando los precios cotizados YA TRAEN el IVA (factura de punto de
   venta: cada renglón viene con el impuesto adentro). Si ese IVA se SUMA otra
   vez, la OC paga el impuesto dos veces; si no se carga, la retención de IVA
   no tiene de dónde salir.

   `iva_incluido` = el monto de IVA se GUARDA (retención, libro fiscal) pero NO
   suma al total: ya está adentro de los precios. El % se calcula sobre la base
   SIN IVA: monto = factura × p / (100 + p).
   ============================================================ */

export const r2 = (n: unknown): number => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
};

/** Campos de IVA tal como los guardan la oferta y la orden. */
export interface IvaGuardado {
  iva_aplicado?: boolean | null;
  iva_monto?: number | null;
  iva_incluido?: boolean | null;
}

/** El IVA guardado (sume o no): el que va a la retención y al libro fiscal. */
export function ivaDeclarado(o: IvaGuardado): number {
  return o.iva_aplicado ? Math.max(0, r2(o.iva_monto)) : 0;
}

/** El IVA que SUMA al total: 0 cuando los precios ya lo traen. */
export function ivaQueSuma(o: IvaGuardado): number {
  return o.iva_incluido ? 0 : ivaDeclarado(o);
}

export interface ItemCalculable {
  cantidad?: number | null;
  precio?: number | null;
  precio_usd?: number | null;
  comprar?: boolean | null;
  exento?: boolean | null;
}

/** Suma del monto de los ítems marcados como exentos de IVA (Art. 18 Ley del IVA). */
export function montoExentoDeItems(items?: ItemCalculable[] | null, tieneUsd?: boolean): number {
  if (!items || !items.length) return 0;
  const s = items.reduce((acc, it) => {
    if (it.comprar === false || !it.exento) return acc;
    const cant = Number(it.cantidad) || 0;
    const precio = tieneUsd ? (Number(it.precio_usd) || 0) : (Number(it.precio) || 0);
    return acc + (cant * precio);
  }, 0);
  return r2(s);
}

/** Suma del monto de los ítems gravados con IVA (no exentos). */
export function baseGravadaDeItems(items?: ItemCalculable[] | null, tieneUsd?: boolean): number {
  if (!items || !items.length) return 0;
  const s = items.reduce((acc, it) => {
    if (it.comprar === false || it.exento) return acc;
    const cant = Number(it.cantidad) || 0;
    const precio = tieneUsd ? (Number(it.precio_usd) || 0) : (Number(it.precio) || 0);
    return acc + (cant * precio);
  }, 0);
  return r2(s);
}

export interface PartesDeTotal {
  /** Σ cantidad × precio de los renglones. */
  subtotal: number;
  descuento?: number | null;
  iva?: number | null;
  igtf?: number | null;
  /** `true` = los precios ya traen el IVA: se guarda pero no suma. */
  iva_incluido?: boolean | null;
  /** Monto de renglones exentos de IVA (informativo). */
  exento?: number | null;
}

/** Total a pagar a partir de sus partes (la única fórmula). */
export function totalDesdePartes(p: PartesDeTotal): number {
  const descuento = Math.max(0, r2(p.descuento));
  const iva = p.iva_incluido ? 0 : Math.max(0, r2(p.iva));
  const igtf = Math.max(0, r2(p.igtf));
  return r2(Math.max(0, r2(p.subtotal) - descuento) + iva + igtf);
}

/**
 * Monto de IVA a partir de un %: si los precios lo traen adentro,
 * base × p / (100 + p); si no, base × p / 100.
 */
export function ivaDesdePorcentaje(base: number, pct: number, incluido: boolean | null | undefined): number {
  const b = Math.max(0, Number(base) || 0);
  const p = Math.max(0, Number(pct) || 0);
  if (b <= 0 || p <= 0) return 0;
  return r2(incluido ? (b * p) / (100 + p) : (b * p) / 100);
}

/** % de IVA a partir de un monto (inverso de `ivaDesdePorcentaje`). */
export function porcentajeDesdeIva(base: number, monto: number, incluido: boolean | null | undefined): number {
  const b = Math.max(0, Number(base) || 0);
  const m = Math.max(0, Number(monto) || 0);
  if (b <= 0 || m <= 0) return 0;
  const neto = incluido ? b - m : b;
  if (neto <= 0) return 0;
  return r2((m / neto) * 100);
}

/** Base para el IGTF: lo que de verdad se paga (base + IVA, salvo que el IVA ya venga adentro). */
export function baseIgtfDe(base: number, iva: number, incluido: boolean | null | undefined): number {
  return r2(Math.max(0, Number(base) || 0) + (incluido ? 0 : Math.max(0, Number(iva) || 0)));
}

/** Etiqueta del IVA según cómo entra al total. */
export function etiquetaIva(incluido: boolean | null | undefined): string {
  return incluido ? 'IVA (incluido en los precios)' : 'IVA';
}
