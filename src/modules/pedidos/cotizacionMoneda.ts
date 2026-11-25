/* ============================================================
   Golden Touch · Cotizaciones · moneda de la oferta ($ o €) a BCV

   El sistema compara y calcula el PMP en USD. El proveedor puede cotizar
   en dólares o en euros: en los dos casos el precio canónico (`precio`,
   `precio_total`) se guarda en USD equivalente a la tasa BCV.

   · USD → USD: el precio se toma tal cual.
   · EUR → USD: USD = EUR × (tasa BCV € / tasa BCV $), porque ambas tasas
     están en Bs por unidad de moneda. Ej.: 44 Bs/€ y 40 Bs/$ → 1 € = 1,10 $.

   Se guardan la moneda elegida y las dos tasas usadas para poder reflejar
   después que la cotización era «euro a tasa BCV» y reconstruir el monto
   original en euros al editarla.
   ============================================================ */

export type MonedaCotizacion = 'USD' | 'EUR';

export interface TasasCotizacion {
  /** Bs por 1 USD (BCV). */
  usd: number;
  /** Bs por 1 EUR (BCV). */
  eur: number;
}

const red = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** USD por 1 EUR. 0 si falta alguna tasa (evita divisiones por cero). */
export function factorEuroUsd(tasas: TasasCotizacion): number {
  const u = Number(tasas?.usd) || 0;
  const e = Number(tasas?.eur) || 0;
  return u > 0 && e > 0 ? Math.round((e / u) * 10000) / 10000 : 0;
}

/** Convierte el precio escrito en la moneda elegida al USD canónico del sistema. */
export function cotizacionAUsd(
  monto: number,
  moneda: MonedaCotizacion,
  tasas: TasasCotizacion,
): number {
  const n = Number(monto) || 0;
  if (moneda !== 'EUR') return red(n);
  const f = factorEuroUsd(tasas);
  return f > 0 ? red(n * f) : 0;
}

/** Inverso: USD canónico al monto en la moneda en que el proveedor cotizó. */
export function usdACotizacion(
  usd: number,
  moneda: MonedaCotizacion,
  tasas: TasasCotizacion,
): number {
  const n = Number(usd) || 0;
  if (moneda !== 'EUR') return red(n);
  const f = factorEuroUsd(tasas);
  return f > 0 ? red(n / f) : 0;
}

export function simboloCotizacion(moneda: MonedaCotizacion): string {
  return moneda === 'EUR' ? '€' : '$';
}

function fmt(n: number): string {
  return (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Texto para mostrar en la comparativa: deja claro que el € se cambió a BCV. */
export function detalleCotizacionEur(
  precioUsd: number,
  tasas: TasasCotizacion,
): string | null {
  const usd = Number(precioUsd) || 0;
  const f = factorEuroUsd(tasas);
  if (!(usd > 0) || !(f > 0)) return null;
  const eur = red(usd / f);
  return `Cotizada en € ${fmt(eur)} a tasa BCV ${fmt(tasas.eur)} Bs/€ (${fmt(f)} $/€) → ${fmt(tasas.usd)} Bs/$ · $${fmt(usd)}`;
}
