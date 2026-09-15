/* ============================================================
   Golden Touch · Pago de compras y servicios directos: retención y reintegro

   Pedido del usuario (15/09/2026): lo mismo que ya hace el pago de una OC.
     · RETENCIÓN: Tesorería marca «Tiene retención» y se paga el NETO
       (total de la factura − retención).
     · REINTEGRO: si se carga más que el neto, el pago cubre lo debido y lo que
       sobra sale en otro egreso, desde las mismas cuentas (`repartirPagoYReembolso`).

   Al REABRIR hay que devolver exactamente lo que salió de la caja: el neto (no el
   total de la factura) y también los reintegros. Si no, la caja queda descuadrada.

   Piezas puras: se prueban sin base ni React.
   ============================================================ */

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Categorías de caja del egreso por lo pagado de más (la OC usa `reembolso_oc`). */
export const CATEGORIA_REEMBOLSO = {
  compra: 'reembolso_compra_directa',
  servicio: 'reembolso_servicio_directo',
} as const;

/** Por qué no se puede aplicar esa retención al total; `null` si está bien. */
export function errorRetencionPago(total: number, retencion: number): string | null {
  const t = r2(total);
  const r = r2(retencion);
  if (r <= 0 || r >= t) return 'La retención tiene que ser mayor que 0 y menor que el total de la factura.';
  return null;
}

/** Lo que se paga: total − retención. Una retención negativa no suma. */
export function netoAPagar(total: number, retencion: number): number {
  return r2(r2(total) - Math.max(0, r2(retencion)));
}

/**
 * Cuánto devolver al reabrir un pago de caja SIMPLE (sin desglose por cuenta): salió el
 * neto, no el total. Con desglose por cuenta se devuelve cada pata tal como salió.
 */
export function montoLegadoARevertir(gasto: number | null | undefined, retencionPago: number | null | undefined): number {
  return Math.max(0, netoAPagar(Number(gasto) || 0, Number(retencionPago) || 0));
}

/** Patas con monto: las vacías no mueven caja ni se revierten. */
export function patasConMonto<T extends { monto: number | string }>(patas: T[] | null | undefined): T[] {
  return Array.isArray(patas) ? patas.filter((p) => (Number(p.monto) || 0) > 0) : [];
}
