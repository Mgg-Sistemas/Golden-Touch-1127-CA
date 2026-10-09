/* ============================================================
   Golden Touch · Cocina · Lo que se puede consumir (09/10/2026)

   Pedido del usuario: «los productos en 0 no salen en la lista de consumos» y
   «no se puede consumir más de lo que hay». Antes la lista mostraba todo el
   catálogo de víveres, incluso los que estaban en 0, y la cocina podía cargar
   una comida que se llevaba más de lo que había: el inventario quedaba en 0 y
   la diferencia se perdía.

   Aquí viven las reglas, sin base ni React, para que la PC y el teléfono digan
   lo mismo. La base repite el tope (trigger trg_cocina_consumo_no_supera_stock).
   ============================================================ */

/** Margen para los decimales (3 × 0,1 no da exactamente 0,3). */
export const TOLERANCIA_STOCK = 1e-4;

const n = (v: unknown) => Number(v) || 0;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

/**
 * Lo que la comida puede usar de un víver: el stock de hoy (nunca negativo) más lo
 * que esta misma comida ya tenía consumido, que al corregirla vuelve al inventario.
 */
export function disponibleParaConsumo(stock: unknown, yaConsumido = 0): number {
  return r4(Math.max(n(stock), 0) + Math.max(n(yaConsumido), 0));
}

/** ¿La cantidad pedida pasa de lo que hay? */
export function superaStock(cantidad: unknown, disponible: unknown): boolean {
  return n(cantidad) > n(disponible) + TOLERANCIA_STOCK;
}

/**
 * Los víveres que se ofrecen para cargar una comida: los que tienen algo para
 * consumir. Un víver en 0 (o menos) no sale, salvo que ya esté en la comida (al
 * corregirla, o si se acabó con el formulario abierto): así se puede bajar su
 * cantidad o quitarlo, pero nadie lo toma de nuevo para dejar el saldo negativo.
 */
export function viveresConsumibles<T extends { id: string; stock?: unknown }>(
  viveres: T[],
  yaConsumido: ReadonlyMap<string, number> = new Map(),
  enLaComida: Iterable<string> = [],
): T[] {
  const dentro = new Set(enLaComida);
  return viveres.filter((p) =>
    dentro.has(p.id) || disponibleParaConsumo(p.stock, yaConsumido.get(p.id) ?? 0) > TOLERANCIA_STOCK);
}

const fmt = (v: number) => r4(v).toLocaleString('es-VE', { maximumFractionDigits: 4 });

/** El aviso cuando la comida pide más de lo que hay: «hay X, quieres usar Y». */
export function mensajeExcedeStock(o: { nombre: string; hay: unknown; quiere: unknown; unidad?: string | null }): string {
  const u = o.unidad?.trim() ? ` ${o.unidad.trim()}` : '';
  return `No alcanza ${o.nombre}: hay ${fmt(Math.max(n(o.hay), 0))}${u} y quieres usar ${fmt(n(o.quiere))}${u}.`;
}

/** La primera línea que pide más de lo que hay, con su aviso; `null` si todas alcanzan. */
export function primerExcesoDeStock(
  lineas: { nombre: string; cantidad: unknown; disponible: unknown; unidad?: string | null }[],
): string | null {
  const l = lineas.find((x) => superaStock(x.cantidad, x.disponible));
  return l ? mensajeExcedeStock({ nombre: l.nombre, hay: l.disponible, quiere: l.cantidad, unidad: l.unidad }) : null;
}
