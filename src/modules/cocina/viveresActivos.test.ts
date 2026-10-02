import { describe, it, expect } from 'vitest';
import { consumenDeMas, mensajeViveresInactivos } from './viveresActivos';

describe('consumenDeMas · qué productos sacan algo nuevo del inventario', () => {
  it('en una comida nueva, todos', () => {
    expect(consumenDeMas([], [{ producto_id: 'arroz', cantidad: 2 }, { producto_id: 'atun', cantidad: 1 }]))
      .toEqual(['arroz', 'atun']);
    expect(consumenDeMas(null, [{ producto_id: 'arroz', cantidad: 2 }])).toEqual(['arroz']);
  });

  it('al corregir, solo los nuevos y los que suben de cantidad', () => {
    const antes = [{ producto_id: 'arroz', cantidad: 2 }, { producto_id: 'atun', cantidad: 3 }];
    const ahora = [{ producto_id: 'arroz', cantidad: 2 }, { producto_id: 'atun', cantidad: 4 }, { producto_id: 'pollo', cantidad: 1 }];
    expect(consumenDeMas(antes, ahora)).toEqual(['atun', 'pollo']);
  });

  it('bajar la cantidad o quitar un producto no saca nada nuevo', () => {
    const antes = [{ producto_id: 'arroz', cantidad: 2 }, { producto_id: 'atun', cantidad: 3 }];
    expect(consumenDeMas(antes, [{ producto_id: 'atun', cantidad: 1 }])).toEqual([]);
    expect(consumenDeMas(antes, antes)).toEqual([]);
  });

  it('suma los renglones repetidos del mismo producto', () => {
    const antes = [{ producto_id: 'arroz', cantidad: 1 }, { producto_id: 'arroz', cantidad: 1 }];
    expect(consumenDeMas(antes, [{ producto_id: 'arroz', cantidad: 2 }])).toEqual([]);
    expect(consumenDeMas(antes, [{ producto_id: 'arroz', cantidad: '2.5' }])).toEqual(['arroz']);
  });

  it('ignora renglones sin producto y cantidades vacías', () => {
    expect(consumenDeMas([], [{ producto_id: '', cantidad: 4 }, { producto_id: 'sal', cantidad: null }])).toEqual([]);
  });
});

describe('mensajeViveresInactivos', () => {
  it('con uno solo, nombra el producto', () => {
    expect(mensajeViveresInactivos(['ATUN']))
      .toBe('"ATUN" está desactivado en el inventario y no se puede cargar en una comida. Quítalo de la lista y vuelve a guardar.');
  });

  it('con varios, los lista en orden', () => {
    expect(mensajeViveresInactivos(['VINAGRE', 'ATUN']))
      .toBe('Están desactivados en el inventario y no se pueden cargar en una comida: ATUN, VINAGRE. Quítalos de la lista y vuelve a guardar.');
  });
});
