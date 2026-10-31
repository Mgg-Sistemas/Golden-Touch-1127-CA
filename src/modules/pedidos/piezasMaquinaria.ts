/* ──────────────────────────────────────────────────────────────────────────────
   Repuestos que pide Control de Maquinaria (30/10/2026).

   Maquinaria arma una SOLICITUD DE SERVICIO (SS-…) con los NOMBRES GENERALES de las
   piezas (la base: `maquinaria_pedir_compra_orden`). Cada renglón llega marcado con
   `pieza_maquinaria: true` y, si la pieza no estaba en el inventario, sin producto y
   con un sku provisional SRV-…. El analista de compras, al cargar la cotización, le
   pone a cada renglón el producto del inventario (o da de alta uno nuevo con el nombre
   que corresponde). Aquí viven las reglas puras de ese paso.

   31/10/2026: el mismo paso sirve para las SOLICITUDES DE PEDIDO con nombres genéricos
   (flujo nuevo con revisión de Almacén: la SP que monta quien no es analista de compras
   llega con `nombre_generico: true` y sin producto). `requiereAsignarProducto` junta los
   dos casos; lo propio de Maquinaria (repuesto del equipo) sigue con `esPiezaMaquinaria`.
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

/** ¿El renglón es de una Solicitud de Pedido escrita con nombre genérico? */
export function esNombreGenerico(it: Pick<ItemOrden, 'nombre_generico'>): boolean {
  return it.nombre_generico === true;
}

/**
 * ¿Al cotizar hay que ponerle el producto del inventario? Repuestos de Maquinaria y
 * renglones de SP con nombre genérico: los dos llegan con un nombre general.
 */
export function requiereAsignarProducto(it: Pick<ItemOrden, 'pieza_maquinaria' | 'nombre_generico'>): boolean {
  return esPiezaMaquinaria(it) || esNombreGenerico(it);
}

/** Rótulo de origen del renglón en la cotización. */
export function etiquetaRenglonPorAsignar(it: Pick<ItemOrden, 'pieza_maquinaria' | 'nombre_generico'>): string {
  return esPiezaMaquinaria(it) ? '🚜 Repuesto de Maquinaria' : '📝 Nombre genérico de la solicitud';
}

/** Renglones con nombre general (Maquinaria o SP genérica) que se compran y todavía no tienen producto. */
export function piezasSinProducto<T extends Pick<ItemOrden, 'pieza_maquinaria' | 'nombre_generico' | 'productoId' | 'comprar'>>(items: T[]): T[] {
  return items.filter((it) => requiereAsignarProducto(it) && it.comprar !== false && !it.productoId);
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
 * marca/modelo). Guarda el nombre general con que se pidió (`nombre_solicitado`). En los
 * repuestos de Maquinaria deja el producto también como repuesto del equipo (`insumo_*`),
 * que es lo que alimenta «qué consume este equipo» en Maquinaria; una SP genérica no tiene
 * equipo y no lo lleva.
 */
export function asignarProducto<T extends ItemOrden>(items: T[], skuRenglon: string, p: ProductoAsignable): T[] {
  return items.map((it) => {
    if (it.sku !== skuRenglon) return it;
    const solicitado = it.nombre_solicitado ?? (it.nombre !== p.nombre ? it.nombre : null);
    const base = {
      ...it,
      productoId: p.id,
      sku: p.sku,
      nombre: p.nombre,
      unidad: (p.unidad ?? '').trim() || it.unidad,
      nombre_solicitado: solicitado,
    };
    return esPiezaMaquinaria(it) ? { ...base, insumo_producto_id: p.id, insumo_nombre: p.nombre } : base;
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
    if (!out.some((it) => it.sku === sku && requiereAsignarProducto(it) && it.productoId !== p.id)) continue;
    if (productoUsadoEnOtroRenglon(out, sku, p.id)) continue;
    out = asignarProducto(out, sku, p);
  }
  return out;
}
