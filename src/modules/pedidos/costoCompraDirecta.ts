/* ============================================================
   Golden Touch · Compras directas · Costo en $ para el inventario

   El inventario se valoriza en dólares. Una compra directa puede montarse en
   $ o en Bs; si es en Bs, el costo del renglón se lleva a $ dividiendo entre la
   tasa (Bs por $) y luego entre la cantidad en unidades de USO (SACO de 25 KG →
   el costo es por KG). El IVA y el descuento NO entran al costo: el renglón
   entra por su monto (subtotal).

   09/10/2026 · CD-2026-0055: se montó en «$» con montos en Bs (la moneda venía
   «elegida» de fábrica porque la base guarda 'USD' por defecto) y el almacén la
   recibió a $266.082 el contactor. Luego se corrigió a Bs y, al volver a montar,
   la recepción se reabrió y entró DOS veces. Aquí viven las reglas puras que lo
   evitan; compras.repository.ts y CompraDirectaView.tsx las usan.
   ============================================================ */
import { cantidadEnUso } from '@/modules/inventario/presentaciones';

/** Lo mínimo de un renglón para costearlo. */
export interface RenglonCosteable {
  producto_id: string;
  cantidad: number;
  gasto?: number | null;
  factor?: number | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Monto del renglón en $. En Bs se divide entre la tasa; sin tasa válida NO se convierte
 *  (quien llama debe bloquear antes: un Bs nunca puede entrar como $). */
export function gastoRenglonUsd(gasto: number | null | undefined, moneda: string | null | undefined, tasaUsd: number): number {
  const g = Number(gasto) || 0;
  if (moneda === 'Bs' && tasaUsd > 0) return r2(g / tasaUsd);
  return g;
}

/** Costo en $ de UNA unidad de uso del renglón (lo que entra a `precio_unitario`). */
export function costoUnitarioUsd(it: RenglonCosteable, moneda: string | null | undefined, tasaUsd: number): number {
  const cantidad = cantidadEnUso(it, Number(it.cantidad) || 0);
  const gastoUsd = gastoRenglonUsd(it.gasto, moneda, tasaUsd);
  return gastoUsd > 0 && cantidad > 0 ? r4(gastoUsd / cantidad) : 0;
}

/**
 * ¿La moneda de la compra ya la ELIGIÓ alguien? La base guarda 'USD' por defecto al
 * crear la compra, así que «moneda = USD» no prueba nada mientras la compra no se haya
 * montado nunca. Solo cuenta como elegida si ya se montó (o si ya salió de «En proceso»).
 */
export function monedaYaElegida(c: { moneda?: string | null; estado?: string | null; enviada_pagar_at?: string | null }): boolean {
  if (c.moneda !== 'USD' && c.moneda !== 'Bs') return false;
  return !!c.enviada_pagar_at || (c.estado != null && c.estado !== 'en_proceso');
}

/** Lo que importa del montaje para el inventario. */
export interface MontajeInventario {
  moneda: string | null | undefined;
  tasa_conversion: number | null | undefined;
  afecta_inventario: boolean | null | undefined;
  items: RenglonCosteable[];
}

/**
 * Qué hacer con el inventario al (re)montar una compra:
 *   · 'pendiente'   — todavía no entró al inventario: queda «Por recibir» (si afecta).
 *   · 'mantener'    — ya entró y no cambió nada que toque el inventario: sigue recibida.
 *   · 'revalorizar' — ya entró con los mismos materiales y cantidades, pero cambió el costo
 *                     (moneda, tasa o montos): se saca lo que entró y se vuelve a meter al
 *                     costo nuevo, sin pedirle al almacén que la reciba otra vez.
 *   · 'rehacer'     — ya entró pero cambiaron los materiales o las cantidades (o ya no
 *                     afecta inventario): se saca lo que entró y, si afecta, vuelve a
 *                     «Por recibir» para contar lo que de verdad llegó.
 */
export type PlanRemontaje = 'pendiente' | 'mantener' | 'revalorizar' | 'rehacer';

const firma = (items: RenglonCosteable[]) =>
  items
    .map((i) => `${i.producto_id}|${cantidadEnUso(i, Number(i.cantidad) || 0)}`)
    .sort()
    .join(';');

const mismaTasa = (a: number | null | undefined, b: number | null | undefined) =>
  r2(Number(a) || 0) === r2(Number(b) || 0);

export function planRemontaje(
  yaRecibida: boolean,
  antes: MontajeInventario,
  despues: MontajeInventario,
): PlanRemontaje {
  if (!yaRecibida || antes.afecta_inventario === false) return 'pendiente';
  if (despues.afecta_inventario === false) return 'rehacer';
  if (firma(antes.items) !== firma(despues.items)) return 'rehacer';
  const monedaA = antes.moneda === 'Bs' ? 'Bs' : 'USD';
  const monedaD = despues.moneda === 'Bs' ? 'Bs' : 'USD';
  const gastosIguales = antes.items.length === despues.items.length
    && antes.items.every((a, i) => r2(Number(a.gasto) || 0) === r2(Number(despues.items[i]?.gasto) || 0)
      && a.producto_id === despues.items[i]?.producto_id);
  const tasaIgual = monedaD !== 'Bs' || mismaTasa(antes.tasa_conversion, despues.tasa_conversion);
  return monedaA === monedaD && gastosIguales && tasaIgual ? 'mantener' : 'revalorizar';
}
