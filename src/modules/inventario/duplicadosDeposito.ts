/* ============================================================
   Golden Touch · Prevención de duplicados en depósitos propios

   En Mina, Reutilizables e Items Dañados un producto es de UN solo
   almacén. Crear dos fichas para lo mismo parte el inventario y el
   kardex en dos: por eso antes del alta se pregunta si ya existe.
   ============================================================ */
import type { MovimientoInput } from './movimientos.repository';
import { ALMACEN_DANADOS, ALMACEN_MINA, ALMACEN_REUTILIZABLES, normalizarSlug } from './depositos';

export const ALMACENES_CON_DUPLICADOS = [ALMACEN_MINA, ALMACEN_REUTILIZABLES, ALMACEN_DANADOS] as const;

/** Solo estos tres depósitos piden confirmación al crear un producto. */
export function requiereValidacionDuplicados(almacen?: string | null): boolean {
  const slug = normalizarSlug(almacen ?? '');
  if (!slug) return false;
  return ALMACENES_CON_DUPLICADOS.some((a) => normalizarSlug(a ?? '') === slug);
}

/** Los candidatos que se ofrecen tienen que ser del MISMO depósito: cruzar
 *  almacenes aquí crearía un movimiento en el producto equivocado. */
export function filtrarParecidosDelDeposito<T extends { almacen?: string | null }>(
  parecidos: T[],
  almacen: string,
): T[] {
  const slug = normalizarSlug(almacen ?? '');
  return parecidos.filter((p) => normalizarSlug(p.almacen ?? '') === slug);
}

/**
 * Al confirmar que el producto nuevo «es el mismo», NO se da de alta una ficha
 * nueva: solo entra el stock al producto que ya existía. Se omite
 * `precio_unitario` a propósito para no revaluar su PMP (el usuario pidió
 * «solo sumar stock»). El movimiento deja rastro en el kardex.
 */
export function movimientoSumarStockDuplicado(params: {
  productoId: string;
  almacen: string;
  cantidad: number;
  actor: string;
  actorName: string | null;
  detalle: string;
}): MovimientoInput {
  return {
    producto_id: params.productoId,
    tipo: 'entrada',
    delta: params.cantidad,
    almacen: params.almacen,
    actor: params.actor,
    actor_name: params.actorName,
    detalle: params.detalle,
  };
}
