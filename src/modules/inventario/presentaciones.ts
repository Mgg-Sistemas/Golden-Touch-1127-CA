/* ============================================================
   Golden Touch · Inventario · Presentaciones de compra

   Un producto se lleva en el inventario en su unidad de USO (productos.unidad,
   que no cambia) y se puede COMPRAR en otra presentación: SACO de 25 KG, CAJA
   de 12 UND, TAMBOR de 208 L (05/10/2026, pedido del usuario). El factor puede
   cambiar por proveedor; la unidad de uso, no.

   La orden de compra va en la unidad de compra (como vende el proveedor) y la
   conversión ocurre en un solo lugar: la recepción. Entran cantidad × factor
   unidades de uso a precio ÷ factor.
   ============================================================ */
import type { ItemOrden } from '@/shared/lib/types';

export interface Presentacion {
  id: string;
  producto_id: string;
  /** null = vale para cualquier proveedor. */
  proveedor_id: string | null;
  unidad: string;
  factor: number;
}

const r = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

/** Cuántas unidades de uso trae una unidad de compra del renglón (1 si no tiene presentación). */
export function factorItem(it: Pick<ItemOrden, 'factor'>): number {
  const f = Number(it.factor);
  return f > 0 ? f : 1;
}

/** El renglón se compra en otra unidad distinta de la de uso. */
export function tienePresentacion(it: Pick<ItemOrden, 'factor'>): boolean {
  return factorItem(it) !== 1;
}

/** Lo que entra al inventario por `cantidad` unidades de compra. */
export function cantidadEnUso(it: Pick<ItemOrden, 'factor'>, cantidad: number): number {
  return r((Number(cantidad) || 0) * factorItem(it));
}

/** Costo de una unidad de uso a partir del precio de la unidad de compra. */
export function precioEnUso(it: Pick<ItemOrden, 'factor'>, precio: number): number {
  return r((Number(precio) || 0) / factorItem(it));
}

const fmt = (n: number) => n.toLocaleString('es-VE', { maximumFractionDigits: 3 });

/** Lo mínimo de un renglón (OC o compra directa) para hablar de su presentación. */
export interface ConPresentacion { unidad?: string | null; factor?: number | null; unidad_uso?: string | null }

/** «4 SACO = 100 KG» o null si el renglón no tiene presentación. */
export function rotuloConversion(it: ConPresentacion, cantidad: number): string | null {
  if (!tienePresentacion(it)) return null;
  return `${fmt(Number(cantidad) || 0)} ${it.unidad ?? ''} = ${fmt(cantidadEnUso(it, cantidad))} ${it.unidad_uso ?? ''}`.replace(/\s+/g, ' ').trim();
}

/** «SACO de 25 KG» */
export function nombrePresentacion(p: Pick<Presentacion, 'unidad' | 'factor'>, unidadUso: string | null | undefined): string {
  return `${p.unidad} de ${fmt(p.factor)} ${unidadUso ?? ''}`.trim();
}

/** Presentaciones que aplican a un proveedor: las suyas primero y luego las generales.
 *  Si el proveedor tiene una propia con la misma unidad, la general no se repite. */
export function presentacionesPara(todas: Presentacion[], productoId: string | undefined, proveedorId: string | null | undefined): Presentacion[] {
  if (!productoId) return [];
  const delProducto = todas.filter((p) => p.producto_id === productoId);
  const propias = proveedorId ? delProducto.filter((p) => p.proveedor_id === proveedorId) : [];
  const usadas = new Set(propias.map((p) => p.unidad.trim().toLowerCase()));
  const generales = delProducto.filter((p) => p.proveedor_id == null && !usadas.has(p.unidad.trim().toLowerCase()));
  return [...propias, ...generales];
}

/**
 * Cambia la presentación de un renglón. La cantidad se convierte para que siga
 * siendo lo mismo en unidades de uso (100 KG → 4 SACO de 25), y el precio, que es
 * por unidad de compra, se escala igual (el precio por KG no cambia). `null` vuelve
 * a la unidad de uso.
 */
export function aplicarPresentacion<T extends ItemOrden>(it: T, p: Pick<Presentacion, 'unidad' | 'factor'> | null): T {
  const unidadUso = it.unidad_uso ?? it.unidad ?? null;
  const fAntes = factorItem(it);
  const fDespues = p ? Number(p.factor) || 1 : 1;
  const cantUso = (Number(it.cantidad) || 0) * fAntes;
  const escala = fDespues / fAntes;
  const out: T = {
    ...it,
    cantidad: r(cantUso / fDespues, 3),
    precio: r((Number(it.precio) || 0) * escala),
    ...(it.precio_usd != null ? { precio_usd: r((Number(it.precio_usd) || 0) * escala) } : {}),
  };
  if (p && fDespues !== 1) {
    out.unidad = p.unidad;
    out.unidad_uso = unidadUso;
    out.factor = fDespues;
  } else {
    if (unidadUso) out.unidad = unidadUso;
    delete out.unidad_uso;
    delete out.factor;
  }
  return out;
}
