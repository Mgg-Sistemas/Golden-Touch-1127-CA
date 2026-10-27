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

/**
 * La ventana que mira la vista Distribución del mercado ABIERTO.
 *
 * Arranca donde arrancó el ciclo y, mientras el mercado siga abierto, llega hasta HOY:
 * el mercado no tiene fin hasta que una persona lo cierra (27/10/2026). `hoy` se pasa
 * de afuera y se calcula EN CADA LECTURA, nunca una sola vez al abrir la pantalla.
 *
 * POR QUÉ (incidente del 18 al 27/10/2026). La pantalla de Cocina queda abierta días
 * enteros en la PC (es multiusuario, se refresca sola con Realtime). El «hasta» del
 * reporte se tomaba una sola vez al montar el panel —el 18/10, el día del corte— y
 * cada refresco volvía a leer con ese mismo tope: las comidas cargadas desde el
 * teléfono del 19 al 27 estaban en la base, pero el libro de la PC terminaba el 18 y
 * «Queda» era el stock reconstruido a esa fecha. Un campo vacío significa «el del
 * ciclo» (desde) o «hoy» (hasta), y nunca se mira más allá de hoy.
 */
export function ventanaDelReporte(
  inicioCiclo: string | null | undefined, elegido: { desde: string; hasta: string }, hoy: string,
): { desde: string; hasta: string; esDelCiclo: boolean } {
  const delCiclo = { desde: (inicioCiclo ?? '').slice(0, 10) || hoy, hasta: hoy };
  const r = rangoValido(elegido.desde, elegido.hasta, delCiclo);
  const hasta = r.hasta > hoy ? hoy : r.hasta;
  const desde = r.desde > hasta ? hasta : r.desde;
  return { desde, hasta, esDelCiclo: desde === delCiclo.desde && hasta === hoy };
}
