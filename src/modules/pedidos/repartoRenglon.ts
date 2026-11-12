/* ============================================================
   Reparto multiproveedor · el renglón de cada ítem (12/11/2026).

   El precio de una oferta es por la unidad en que la COTIZÓ el proveedor
   (PAILA, SACO…), así que la OC hija nace con esa misma cantidad y unidad:
   2 PAILA × $230 = $460, no 5 GALON × $230. Antes el modal mezclaba la
   cantidad/unidad de la OP con el precio de la oferta.

   Compras puede cambiar la unidad en el reparto:
     · cotizada → la del proveedor (PAILA de 5 GALON); el factor se puede corregir
     · uso      → la del inventario (GALON): la cantidad y el precio se convierten
     · otra     → cualquier presentación (CAJA de 12…) con su factor
   El precio por unidad de USO (lo que cuesta un GALON) no cambia al convertir.
   ============================================================ */
import type { ItemOrden } from '@/shared/lib/types';
import { factorItem } from '@/modules/inventario/presentaciones';

export type ModoUnidad = 'cotizada' | 'uso' | 'otra';

export interface AjusteRenglon {
  modo: ModoUnidad;
  cantidad: number;
  /** Cuántas unidades de uso trae la unidad cotizada (PAILA = 5 GALON). */
  factorCotizada: number;
  otraUnidad: string;
  otraFactor: number;
}

const r = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
const norm = (s: string | null | undefined) => (s ?? '').trim().toUpperCase();
const pos = (n: unknown, def = 1) => (Number(n) > 0 ? Number(n) : def);

/** Unidad del inventario (GALON). */
export function unidadUsoDe(it: ItemOrden, ofertado?: ItemOrden | null): string {
  return (it.unidad_uso || ofertado?.unidad_uso || it.unidad || ofertado?.unidad || '').trim();
}

/** Unidad en la que cotizó el proveedor (PAILA). */
export function unidadCotizadaDe(it: ItemOrden, ofertado?: ItemOrden | null): string {
  return (ofertado?.unidad || it.unidad || '').trim();
}

/** La unidad cotizada es distinta de la del inventario. */
export function cotizaEnOtraUnidad(it: ItemOrden, ofertado?: ItemOrden | null): boolean {
  return norm(unidadCotizadaDe(it, ofertado)) !== norm(unidadUsoDe(it, ofertado));
}

export function factorDe(aj: AjusteRenglon): number {
  if (aj.modo === 'cotizada') return pos(aj.factorCotizada);
  if (aj.modo === 'otra') return pos(aj.otraFactor);
  return 1;
}

export function unidadDe(aj: AjusteRenglon, it: ItemOrden, ofertado?: ItemOrden | null): string {
  if (aj.modo === 'cotizada') return unidadCotizadaDe(it, ofertado);
  if (aj.modo === 'otra') return norm(aj.otraUnidad) || unidadUsoDe(it, ofertado);
  return unidadUsoDe(it, ofertado);
}

/** Arranque: exactamente lo que cotizó el proveedor (cantidad, unidad y factor). */
export function ajusteInicial(it: ItemOrden, ofertado?: ItemOrden | null): AjusteRenglon {
  const f = ofertado ? factorItem(ofertado) : 1;
  const modo: ModoUnidad = ofertado && (f !== 1 || cotizaEnOtraUnidad(it, ofertado)) ? 'cotizada' : 'uso';
  const cantOf = Number(ofertado?.cantidad);
  const cantUsoOp = (Number(it.cantidad) || 0) * factorItem(it);
  return {
    modo,
    cantidad: cantOf > 0 ? cantOf : r(cantUsoOp / (modo === 'cotizada' ? f : 1), 3),
    factorCotizada: f,
    otraUnidad: '',
    otraFactor: 1,
  };
}

/** Cambia de unidad sin cambiar lo que entra al inventario (2 PAILA → 10 GALON). */
export function cambiarModo(aj: AjusteRenglon, modo: ModoUnidad): AjusteRenglon {
  if (aj.modo === modo) return aj;
  const cantUso = (Number(aj.cantidad) || 0) * factorDe(aj);
  const next = { ...aj, modo };
  return { ...next, cantidad: r(cantUso / factorDe(next), 3) };
}

/** Precio por unidad de compra del renglón, a partir del de la oferta. */
export function precioDe(aj: AjusteRenglon, ofertado?: ItemOrden | null): number {
  const precioOf = Number(ofertado?.precio) || 0;
  if (aj.modo === 'cotizada') return precioOf;
  const precioUso = precioOf / pos(aj.factorCotizada);
  return r(precioUso * factorDe(aj));
}

/** Precio de una unidad de USO (para comparar proveedores: $46 / GALON). */
export function precioUsoDe(aj: AjusteRenglon, ofertado?: ItemOrden | null): number {
  return r(precioDe(aj, ofertado) / factorDe(aj));
}

/** Le falta el factor: cotizó en PAILA pero no dice cuántos GALON trae. */
export function faltaFactor(aj: AjusteRenglon, it: ItemOrden, ofertado?: ItemOrden | null): boolean {
  return aj.modo === 'cotizada' && cotizaEnOtraUnidad(it, ofertado) && factorDe(aj) === 1;
}

/** El renglón que va a la OC hija (cantidad, unidad, factor y precio coherentes). */
export function renglonReparto(it: ItemOrden, ofertado: ItemOrden | null | undefined, aj: AjusteRenglon): ItemOrden {
  const f = factorDe(aj);
  const uso = unidadUsoDe(it, ofertado);
  const out: ItemOrden = {
    ...it,
    cantidad: r(Number(aj.cantidad) || 0, 3),
    precio: precioDe(aj, ofertado),
    unidad: unidadDe(aj, it, ofertado) || undefined,
  };
  if (f !== 1) {
    out.factor = f;
    out.unidad_uso = uso || null;
  } else {
    delete out.factor;
    delete out.unidad_uso;
  }
  return out;
}
