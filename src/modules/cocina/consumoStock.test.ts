import { describe, it, expect } from 'vitest';
import {
  disponibleParaConsumo, mensajeExcedeStock, primerExcesoDeStock, superaStock, viveresConsumibles,
} from './consumoStock';

const viveres = [
  { id: 'arroz', stock: 10 },
  { id: 'pollo', stock: 0 },
  { id: 'sal', stock: -2 },
  { id: 'aceite', stock: '3' },
];

describe('viveresConsumibles', () => {
  it('los víveres en 0 o menos no salen en la lista', () => {
    expect(viveresConsumibles(viveres).map((p) => p.id)).toEqual(['arroz', 'aceite']);
  });

  it('al corregir una comida, lo que ya consumía cuenta como disponible', () => {
    const ya = new Map([['pollo', 4]]);
    expect(viveresConsumibles(viveres, ya).map((p) => p.id)).toEqual(['arroz', 'pollo', 'aceite']);
  });

  it('un víver que ya está en la comida no desaparece aunque se haya acabado', () => {
    expect(viveresConsumibles(viveres, new Map(), ['sal']).map((p) => p.id)).toEqual(['arroz', 'sal', 'aceite']);
  });

  it('sin víveres, lista vacía', () => {
    expect(viveresConsumibles([])).toEqual([]);
  });
});

describe('disponibleParaConsumo', () => {
  it('stock negativo cuenta como 0', () => {
    expect(disponibleParaConsumo(-2)).toBe(0);
    expect(disponibleParaConsumo(-2, 3)).toBe(3);
  });

  it('suma lo que la comida ya tenía', () => {
    expect(disponibleParaConsumo('5', 2.5)).toBe(7.5);
    expect(disponibleParaConsumo(null)).toBe(0);
  });
});

describe('superaStock', () => {
  it('pasarse es más de lo que hay; igual alcanza', () => {
    expect(superaStock(6, 5)).toBe(true);
    expect(superaStock(5, 5)).toBe(false);
    expect(superaStock(0.1 + 0.2, 0.3)).toBe(false);
  });
});

describe('mensajeExcedeStock', () => {
  it('dice cuánto hay y cuánto se quiere usar', () => {
    expect(mensajeExcedeStock({ nombre: 'Arroz', hay: 2, quiere: 5, unidad: 'KG' }))
      .toBe('No alcanza Arroz: hay 2 KG y quieres usar 5 KG.');
  });

  it('sin unidad y con stock negativo, muestra 0', () => {
    expect(mensajeExcedeStock({ nombre: 'Sal', hay: -1, quiere: 3 })).toBe('No alcanza Sal: hay 0 y quieres usar 3.');
  });
});

describe('primerExcesoDeStock', () => {
  it('nombra la primera línea que no alcanza', () => {
    expect(primerExcesoDeStock([
      { nombre: 'Arroz', cantidad: 2, disponible: 10 },
      { nombre: 'Pollo', cantidad: 8, disponible: 4, unidad: 'KG' },
    ])).toBe('No alcanza Pollo: hay 4 KG y quieres usar 8 KG.');
  });

  it('si todo alcanza, null', () => {
    expect(primerExcesoDeStock([{ nombre: 'Arroz', cantidad: 10, disponible: 10 }])).toBeNull();
  });
});
