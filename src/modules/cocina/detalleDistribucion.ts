/* ============================================================
   Golden Touch · Cocina · El detalle del reporte de distribución

   Pedido del usuario (29/09/2026): «ese reporte que diga el detallado, que se
   pueda filtrar por rangos de fecha» y «será resumen más detallado, así será el
   reporte».

   El resumen dice CUÁNTO; el detalle dice DE DÓNDE. Sin él, un «Ajustes 120» en
   la tarjeta obliga a irse a Inventario a buscar cuáles fueron los ajustes, con
   qué motivo y quién los hizo. Con él, el mismo papel trae el número y los
   renglones que lo forman.

   Piezas puras: se prueban sin base ni React.
   ============================================================ */
import type { ClaseMovimiento } from './claseMovimiento';
import type { MovimientoDetalle } from './controlDistribucion.repository';

const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Qué cajón se está mirando en el detalle, o «todas» para no recortar. */
export type FiltroClase = ClaseMovimiento | 'todas';

/** Los cajones en el orden en que se leen. */
export const CLASES: ClaseMovimiento[] = ['entrada', 'consumo', 'salida', 'ajuste'];

/** Deja solo los movimientos de ese cajón. */
export function filtrarClase(filas: MovimientoDetalle[], clase: FiltroClase): MovimientoDetalle[] {
  return clase === 'todas' ? filas : filas.filter((f) => f.clase === clase);
}

/** Deja solo los movimientos de esos víveres. Un conjunto vacío no recorta nada. */
export function filtrarViveres(filas: MovimientoDetalle[], ids: Set<string>): MovimientoDetalle[] {
  return ids.size ? filas.filter((f) => ids.has(f.producto_id)) : filas;
}

/** Busca por víver, código, comprobante, motivo, responsable, origen o fecha, sin acentos. */
export function buscarDetalle(filas: MovimientoDetalle[], texto: string): MovimientoDetalle[] {
  const q = norm(texto).trim();
  if (!q) return filas;
  return filas.filter((f) => norm([
    f.nombre, f.sku, f.comprobante, f.motivo, f.responsable, f.origen, f.fecha.slice(0, 10),
  ].filter(Boolean).join(' ')).includes(q));
}

export interface TotalesDetalle {
  entradas: number;
  consumo: number;
  salidas: number;
  ajustes: number;
  /** Cuántos renglones quedaron. */
  filas: number;
}

/**
 * Lo que suma el detalle, por cajón. Tiene que dar lo mismo que el resumen de
 * arriba cuando no hay recorte: es la forma de comprobar que el papel cuadra.
 *
 * El consumo se neteaba en el resumen (un reverso de comida resta), y acá se hace
 * igual: un movimiento de cocina que ENTRA resta del consumo.
 */
export function totalesDetalle(filas: MovimientoDetalle[]): TotalesDetalle {
  const t: TotalesDetalle = { entradas: 0, consumo: 0, salidas: 0, ajustes: 0, filas: filas.length };
  for (const f of filas) {
    switch (f.clase) {
      case 'entrada': t.entradas = r2(t.entradas + f.cantidad); break;
      case 'consumo': t.consumo = r2(t.consumo + f.cantidad); break;
      case 'salida': t.salidas = r2(t.salidas + f.cantidad); break;
      default: t.ajustes = r2(t.ajustes + f.cantidad); break;
    }
  }
  return t;
}

/**
 * El rango de fechas del reporte, ya saneado: sin vacíos y sin el revés.
 *
 * Si se invierten, se dan vuelta en vez de devolver una lista vacía: quien está
 * eligiendo el segundo día ve un rango al revés a medio camino, y vaciarle la
 * pantalla en ese momento parece un error del sistema.
 */
export function rangoValido(desde: string, hasta: string, porDefecto: { desde: string; hasta: string }): {
  desde: string; hasta: string;
} {
  const d = (desde ?? '').slice(0, 10) || porDefecto.desde;
  const h = (hasta ?? '').slice(0, 10) || porDefecto.hasta;
  return d > h ? { desde: h, hasta: d } : { desde: d, hasta: h };
}
