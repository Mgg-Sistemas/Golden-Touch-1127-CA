/* ============================================================
   Golden Touch · Tesorería · Retención al pagar una OC

   El comprobante de retención sale en BOLÍVARES, pero la OC puede estar en
   dólares. Por eso la retención se carga en la moneda que se tenga a mano
   (Bs o $) y se convierte con una tasa propia, editable: arranca en la BCV
   del día, pero la que vale es la del comprobante.

   Lo que se resta del total de la factura es la retención expresada en la
   MONEDA DE LA OC.
   ============================================================ */

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export type MonedaRetencion = 'Bs' | 'USD';

export interface RetencionConvertida {
  /** La retención en bolívares. */
  enBs: number;
  /** La retención en dólares. */
  enUsd: number;
  /** La retención en la moneda de la OC: es lo que se resta del total. */
  enMonedaOc: number;
  /** Hace falta la tasa para convertir y no se indicó. */
  faltaTasa: boolean;
}

/**
 * Convierte la retención cargada a Bs, a $ y a la moneda de la OC.
 *
 * @param monto     lo que se escribió
 * @param moneda    en qué moneda se escribió
 * @param tasa      Bs por dólar
 * @param monedaOc  moneda del total de la OC
 */
export function convertirRetencion(
  monto: number,
  moneda: MonedaRetencion,
  tasa: number,
  monedaOc: MonedaRetencion,
): RetencionConvertida {
  const m = r2(monto);
  const t = Number(tasa) || 0;
  const hayTasa = t > 0;
  const enBs = moneda === 'Bs' ? m : (hayTasa ? r2(m * t) : 0);
  const enUsd = moneda === 'USD' ? m : (hayTasa ? r2(m / t) : 0);
  return {
    enBs,
    enUsd,
    enMonedaOc: monedaOc === 'Bs' ? enBs : enUsd,
    faltaTasa: m > 0 && moneda !== monedaOc && !hayTasa,
  };
}
