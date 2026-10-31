/* ──────────────────────────────────────────────────────────────────────────────
   Repuestos que pide Control de Maquinaria (30/10/2026).

   Maquinaria arma una SOLICITUD DE SERVICIO (SS-…) con los NOMBRES GENERALES de las
   piezas (la base: `maquinaria_pedir_compra_orden`). Cada renglón llega marcado con
   `pieza_maquinaria: true` y, si la pieza no estaba en el inventario, sin producto y
   con un sku provisional SRV-…. El analista de compras, al cargar la cotización, le
   pone a cada renglón el producto del inventario (o da de alta uno nuevo con el nombre
   que corresponde). Aquí viven las reglas puras de ese paso.
   ────────────────────────────────────────────────────────────────────────────── */
import type { ItemOrden } from '@/shared/lib/types';

/** Lo mínimo de un producto del inventario para ponérselo a un renglón. */
export interface ProductoAsignable {
  id: string;
  sku: string;
  nombre: string;
  unidad?: string | null;
}

/** ¿El renglón es un repuesto pedido desde Control de Maquinaria? */
export function esPiezaMaquinaria(it: Pick<ItemOrden, 'pieza_maquinaria'>): boolean {
  return it.pieza_maquinaria === true;
}

/** Repuestos de Maquinaria que se compran y todavía no tienen producto del inventario. */
export function piezasSinProducto<T extends Pick<ItemOrden, 'pieza_maquinaria' | 'productoId' | 'comprar'>>(items: T[]): T[] {
  return items.filter((it) => esPiezaMaquinaria(it) && it.comprar !== false && !it.productoId);
}

/**
 * ¿Ese producto ya está puesto en OTRO renglón (otro sku)? Dos piezas distintas con el
 * mismo producto quedarían con el mismo sku y la cotización las tomaría como marcas
 * alternativas (se cuenta una sola): no se permite.
 */
export function productoUsadoEnOtroRenglon(
  items: Pick<ItemOrden, 'sku' | 'productoId'>[],
  skuRenglon: string,
  productoId: string,
): boolean {
  return items.some((it) => it.sku !== skuRenglon && it.productoId === productoId);
}

/**
 * Pone el producto a todos los renglones con ese sku (el renglón y sus variantes de
 * marca/modelo). Guarda el nombre general con que se pidió (`nombre_solicitado`) y deja
 * el producto también como repuesto del equipo (`insumo_*`), que es lo que alimenta
 * «qué consume este equipo» en Maquinaria.
 */
export function asignarProducto<T extends ItemOrden>(items: T[], skuRenglon: string, p: ProductoAsignable): T[] {
  return items.map((it) => {
    if (it.sku !== skuRenglon) return it;
    const solicitado = it.nombre_solicitado ?? (it.nombre !== p.nombre ? it.nombre : null);
    return {
      ...it,
      productoId: p.id,
      sku: p.sku,
      nombre: p.nombre,
      unidad: (p.unidad ?? '').trim() || it.unidad,
      nombre_solicitado: solicitado,
      insumo_producto_id: p.id,
      insumo_nombre: p.nombre,
    };
  });
}

/**
 * Aplica a los renglones de la ORDEN los productos elegidos en la cotización
 * (clave: el sku que tenía el renglón en la orden). Así la próxima cotización de la
 * misma solicitud ya arranca con las piezas identificadas.
 */
export function aplicarVinculos(items: ItemOrden[], vinculos: Map<string, ProductoAsignable>): ItemOrden[] {
  let out = items;
  for (const [sku, p] of vinculos) {
    if (!out.some((it) => it.sku === sku && esPiezaMaquinaria(it) && it.productoId !== p.id)) continue;
    if (productoUsadoEnOtroRenglon(out, sku, p.id)) continue;
    out = asignarProducto(out, sku, p);
  }
  return out;
}
