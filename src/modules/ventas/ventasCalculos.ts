/* La UNICA cuenta de totales del modulo. La usan la pantalla, los PDF y los
 * reportes. En este sistema el bug de «el IVA no se suma» ya volvio varias veces
 * por tener la cuenta escrita en varios lados: aca esta escrita una sola vez. */
export interface RenglonCalculo { cantidad: number; precio_unit: number; costo_unit: number; descuento?: number }
export interface TotalesVenta { subtotal: number; descuento: number; ivaPct: number; ivaMonto: number; total: number; costoTotal: number; gananciaTotal: number }

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function calcularTotalesVenta(
  renglones: RenglonCalculo[], ivaPct: number, descuento: number,
): TotalesVenta {
  const desc = Math.max(0, round2(descuento));
  const pct = Math.max(0, Number(ivaPct) || 0);
  let subtotal = 0, costoTotal = 0, ganancia = 0;
  for (const r of renglones) {
    const cant = Number(r.cantidad) || 0;
    const dr = Math.max(0, Number(r.descuento) || 0);
    subtotal += cant * (Number(r.precio_unit) || 0) - dr;
    costoTotal += cant * (Number(r.costo_unit) || 0);
    ganancia += cant * ((Number(r.precio_unit) || 0) - (Number(r.costo_unit) || 0)) - dr;
  }
  subtotal = round2(subtotal);
  const base = round2(subtotal - desc);
  const ivaMonto = round2(base * pct / 100);
  return {
    subtotal, descuento: desc, ivaPct: pct, ivaMonto,
    total: round2(base + ivaMonto),
    costoTotal: round2(costoTotal),
    // NUNCA total - costoTotal: el total lleva IVA, y el IVA no es ganancia.
    gananciaTotal: round2(ganancia - desc),
  };
}
