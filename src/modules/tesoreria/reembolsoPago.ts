/* ============================================================
   Golden Touch · Tesorería · Pago de OC con reembolso

   Si al pagar una OC se carga MÁS que el total (la factura es de 200 y
   salieron 300), el excedente no se esconde dentro del pago: el pago dice
   200 y los 100 salen en otro egreso, «REEMBOLSO DE ORDEN DE COMPRA …».

   En el multipago el dinero sale de varias cuentas, cada una en su moneda.
   Acá se decide qué parte de cada cuenta es PAGO y qué parte es REEMBOLSO:
   las cuentas se recorren en orden; mientras falte cubrir el total van
   enteras al pago, la que cruza el total se parte en dos, y las que quedan
   después van enteras al reembolso. Cada cuenta conserva su monto exacto
   (pago + reembolso = lo cargado), así el saldo de la caja no se descuadra
   por redondeo.
   ============================================================ */

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Una pata del pago: cualquier cosa con moneda y monto en esa moneda. */
export interface PataMonto {
  moneda: string;
  monto: number;
}

export interface RepartoPagoReembolso<T extends PataMonto> {
  /** Lo que cubre el total de la OC. */
  pago: T[];
  /** Lo que sobra: sale en egresos de reembolso, desde la misma cuenta. */
  reembolso: T[];
  /** Cuánto suma el reembolso, en USD equivalente. */
  reembolsoUsd: number;
}

/**
 * Parte las patas de un multipago en PAGO (hasta cubrir `debidoUsd`) y REEMBOLSO.
 *
 * @param aUsd     convierte un monto en su moneda a USD (con la tasa del día)
 * @param desdeUsd convierte USD a la moneda de la pata (inversa de `aUsd`)
 */
export function repartirPagoYReembolso<T extends PataMonto>(
  patas: T[],
  debidoUsd: number,
  aUsd: (moneda: string, monto: number) => number,
  desdeUsd: (moneda: string, usd: number) => number,
): RepartoPagoReembolso<T> {
  const pago: T[] = [];
  const reembolso: T[] = [];
  let faltaUsd = r2(debidoUsd);

  for (const p of patas) {
    const monto = r2(p.monto);
    if (monto <= 0) continue;
    const usd = aUsd(p.moneda, monto);

    // El total ya está cubierto: todo lo de esta cuenta es de más.
    if (faltaUsd <= 0.005) { reembolso.push({ ...p, monto }); continue; }

    // Cabe entera en lo que falta.
    if (usd <= faltaUsd + 0.005) {
      pago.push({ ...p, monto });
      faltaUsd = r2(faltaUsd - usd);
      continue;
    }

    // Cruza el total: se parte. El pago se expresa en la moneda de la cuenta y el
    // reembolso es el resto EXACTO, para que las dos partes sumen lo cargado.
    const montoPago = Math.min(monto, r2(desdeUsd(p.moneda, faltaUsd)));
    const montoReembolso = r2(monto - montoPago);
    if (montoPago > 0) pago.push({ ...p, monto: montoPago });
    if (montoReembolso > 0) reembolso.push({ ...p, monto: montoReembolso });
    faltaUsd = 0;
  }

  const reembolsoUsd = r2(reembolso.reduce((a, p) => a + aUsd(p.moneda, p.monto), 0));
  return { pago, reembolso, reembolsoUsd };
}
