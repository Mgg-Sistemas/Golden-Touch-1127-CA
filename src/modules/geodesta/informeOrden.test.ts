import { describe, expect, it } from 'vitest';
import { apartadoCuadroVacio, filaVaciaDe } from './informeModelo';
import {
  MAX_COLUMNAS_COMODAS, agregarColumna, celdasConDatoEnColumna, mover, quitarColumna,
} from './informeOrden';

describe('mover', () => {
  const l = ['a', 'b', 'c', 'd'];
  it('mueve hacia abajo', () => {
    expect(mover(l, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });
  it('mueve hacia arriba', () => {
    expect(mover(l, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });
  it('no cambia nada si el destino es el origen', () => {
    expect(mover(l, 2, 2)).toEqual(l);
  });
  it('NUNCA pierde ni duplica un elemento, pase lo que pase', () => {
    // Review Focus 4: soltar fuera, índices negativos, más allá del final.
    for (const [d, h] of [[0, 99], [99, 0], [-5, 2], [2, -5], [0, 4], [3, 3]] as [number, number][]) {
      const r = mover(l, d, h);
      expect(r).toHaveLength(l.length);
      expect([...r].sort()).toEqual([...l].sort());
    }
  });
  it('con un solo elemento devuelve lo mismo', () => {
    expect(mover(['solo'], 0, 1)).toEqual(['solo']);
  });
  it('no modifica la lista original', () => {
    const orig = [...l];
    mover(l, 0, 3);
    expect(l).toEqual(orig);
  });
});

describe('celdasConDatoEnColumna', () => {
  it('cuenta solo las celdas con algo escrito', () => {
    // Review Focus 2: antes de borrar una columna hay que saber qué se pierde.
    const a = apartadoCuadroVacio();
    const col = a.columnas[1].id;
    a.filas = [filaVaciaDe(a.columnas), filaVaciaDe(a.columnas), filaVaciaDe(a.columnas)];
    a.filas[0].celdas[col] = 'Calicatas';
    a.filas[1].celdas[col] = '   ';
    a.filas[2].celdas[col] = 'Muestreo';
    expect(celdasConDatoEnColumna(a, col)).toBe(2);
  });
  it('una columna recién creada no tiene nada que perder', () => {
    const a = apartadoCuadroVacio();
    expect(celdasConDatoEnColumna(a, a.columnas[0].id)).toBe(0);
  });
});

describe('quitarColumna', () => {
  it('saca la columna y su celda de todas las filas', () => {
    const a = apartadoCuadroVacio();
    const col = a.columnas[1].id;
    const r = quitarColumna(a, col);
    expect(r.columnas.map((c) => c.id)).not.toContain(col);
    r.filas.forEach((f) => expect(Object.keys(f.celdas)).not.toContain(col));
  });
  it('deja intactas las demás celdas', () => {
    const a = apartadoCuadroVacio();
    const [c0, c1] = a.columnas;
    a.filas[0].celdas[c0.id] = 'enero';
    a.filas[0].celdas[c1.id] = 'se borra';
    const r = quitarColumna(a, c1.id);
    expect(r.filas[0].celdas[c0.id]).toBe('enero');
  });
  it('no modifica el apartado original', () => {
    const a = apartadoCuadroVacio();
    const antes = a.columnas.length;
    quitarColumna(a, a.columnas[0].id);
    expect(a.columnas).toHaveLength(antes);
  });
});

describe('agregarColumna', () => {
  it('agrega la columna y su celda vacía a todas las filas', () => {
    const a = apartadoCuadroVacio();
    a.filas = [filaVaciaDe(a.columnas), filaVaciaDe(a.columnas)];
    const r = agregarColumna(a, 'Plano', 'imagen');
    const nueva = r.columnas[r.columnas.length - 1];
    expect(nueva.nombre).toBe('Plano');
    expect(nueva.tipo).toBe('imagen');
    r.filas.forEach((f) => expect(f.celdas[nueva.id]).toBe(''));
  });
});

describe('MAX_COLUMNAS_COMODAS', () => {
  it('existe un tope a partir del cual la pantalla avisa', () => {
    // Review Focus 1: con demasiadas columnas el PDF queda ilegible.
    expect(MAX_COLUMNAS_COMODAS).toBeGreaterThan(3);
    expect(MAX_COLUMNAS_COMODAS).toBeLessThan(12);
  });
});
