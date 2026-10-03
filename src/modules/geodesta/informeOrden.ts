/* ============================================================
   Golden Touch · Geodesta · reordenar y editar la forma del cuadro

   Lógica pura. La usan tanto el arrastrar y soltar del navegador como los
   botones de subir y bajar, así que el comportamiento es el mismo por las
   dos vías y se prueba una sola vez.
   ============================================================ */
import type { ApartadoCuadro, ColumnaCuadro, TipoColumna } from '@/shared/lib/types';
import { columnaVacia } from './informeModelo';

/** A partir de acá el cuadro empieza a quedar apretado en una hoja A4. */
export const MAX_COLUMNAS_COMODAS = 6;

/**
 * Mueve el elemento de `desde` a `hacia`, devolviendo una lista nueva.
 * Los índices se recortan al rango válido: soltar fuera de la lista mueve al
 * extremo, nunca pierde ni duplica.
 */
export function mover<T>(lista: T[], desde: number, hacia: number): T[] {
  const n = lista.length;
  if (n < 2) return [...lista];
  const d = Math.min(Math.max(desde, 0), n - 1);
  const h = Math.min(Math.max(hacia, 0), n - 1);
  if (d === h) return [...lista];
  const copia = [...lista];
  const [x] = copia.splice(d, 1);
  copia.splice(h, 0, x);
  return copia;
}

/** Cuántas celdas de esa columna tienen algo escrito (para avisar antes de borrarla). */
export function celdasConDatoEnColumna(a: ApartadoCuadro, colId: string): number {
  return a.filas.filter((f) => (f.celdas[colId] ?? '').trim() !== '').length;
}

/** Saca la columna del encabezado y su celda de todas las filas. */
export function quitarColumna(a: ApartadoCuadro, colId: string): ApartadoCuadro {
  return {
    ...a,
    columnas: a.columnas.filter((c) => c.id !== colId),
    filas: a.filas.map((f) => {
      const celdas = { ...f.celdas };
      delete celdas[colId];
      return { ...f, celdas };
    }),
  };
}

/** Agrega una columna al final y su celda vacía en todas las filas. */
export function agregarColumna(a: ApartadoCuadro, nombre = '', tipo: TipoColumna = 'texto'): ApartadoCuadro {
  const col: ColumnaCuadro = columnaVacia(nombre, tipo);
  return {
    ...a,
    columnas: [...a.columnas, col],
    filas: a.filas.map((f) => ({ ...f, celdas: { ...f.celdas, [col.id]: '' } })),
  };
}

/** Cambia el tipo de una columna VACIANDO sus celdas: el dato de un tipo no significa nada en el otro. */
export function cambiarTipoColumna(a: ApartadoCuadro, colId: string, tipo: TipoColumna): ApartadoCuadro {
  // Mismo tipo: nada que cambiar ni vaciar. Se devuelve el mismo objeto.
  if (a.columnas.find((c) => c.id === colId)?.tipo === tipo) return a;
  return {
    ...a,
    columnas: a.columnas.map((c) => (c.id === colId ? { ...c, tipo } : c)),
    filas: a.filas.map((f) => ({ ...f, celdas: { ...f.celdas, [colId]: '' } })),
  };
}
