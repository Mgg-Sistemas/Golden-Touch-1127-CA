import { describe, expect, it } from 'vitest';
import { FICHA_MAX, FICHA_MIN, errorFicha, etiquetaFicha, fichaEditable, normalizarFicha } from './fichaNro';

describe('normalizarFicha', () => {
  it('saca los espacios de los bordes', () => {
    expect(normalizarFicha('  001  ')).toBe('001');
  });
  it('saca también los espacios de adentro', () => {
    expect(normalizarFicha('GT 07')).toBe('GT07');
  });
  it('pasa a mayúsculas, para que «gt-7» y «GT-7» sean la misma ficha', () => {
    expect(normalizarFicha('gt-7')).toBe('GT-7');
  });
  it('conserva los ceros a la izquierda: es la razón de que sea texto', () => {
    expect(normalizarFicha('001')).toBe('001');
    expect(normalizarFicha('007')).toBe('007');
  });
  it('vacío es null, que es lo que pide el correlativo automático', () => {
    expect(normalizarFicha('')).toBeNull();
    expect(normalizarFicha('   ')).toBeNull();
    expect(normalizarFicha(null)).toBeNull();
    expect(normalizarFicha(undefined)).toBeNull();
  });
});

describe('errorFicha', () => {
  it('dejarla vacía NO es un error: significa que la asigne el sistema', () => {
    expect(errorFicha('')).toBeNull();
    expect(errorFicha(null)).toBeNull();
  });

  it('menos de 3 caracteres no se acepta', () => {
    expect(errorFicha('1')).toMatch(/al menos 3 caracteres/);
    expect(errorFicha('12')).toMatch(/al menos 3 caracteres/);
  });

  it('exactamente 3 sí', () => {
    expect(errorFicha('001')).toBeNull();
    expect(errorFicha('100')).toBeNull();
  });

  it('el mensaje de «muy corta» dice qué pasa si la dejás vacía', () => {
    expect(errorFicha('1')).toMatch(/lo dejás vacío/);
  });

  it('los espacios no cuentan para llegar al mínimo', () => {
    expect(errorFicha(' 1 ')).toMatch(/al menos 3 caracteres/);
  });

  it('admite letras y guiones, no solo números', () => {
    expect(errorFicha('GT-07')).toBeNull();
    expect(errorFicha('MTO001')).toBeNull();
  });

  it('rechaza lo que no se puede imprimir como ficha', () => {
    expect(errorFicha('001/A')).toMatch(/letras, números y guiones/);
    expect(errorFicha('¿001?')).toMatch(/letras, números y guiones/);
  });

  it('no deja meter un párrafo en algo que va en el carnet', () => {
    expect(errorFicha('A'.repeat(FICHA_MAX))).toBeNull();
    expect(errorFicha('A'.repeat(FICHA_MAX + 1))).toMatch(/no puede pasar de/);
  });

  it('el mínimo y el máximo no se cruzan', () => {
    expect(FICHA_MIN).toBeLessThan(FICHA_MAX);
  });
});

describe('etiquetaFicha', () => {
  it('muestra la ficha tal como se guardó, sin rellenar', () => {
    // Antes se mostraba con padStart(4,'0'): un «1» guardado salía «0001».
    // Ahora lo que se ve es exactamente lo que se escribió.
    expect(etiquetaFicha('001')).toBe('Ficha 001');
    expect(etiquetaFicha('GT-07')).toBe('Ficha GT-07');
  });
  it('sin ficha, no inventa un texto', () => {
    expect(etiquetaFicha(null)).toBe('');
    expect(etiquetaFicha('')).toBe('');
  });
});

describe('fichaEditable · se escribe una vez y queda quieta', () => {
  it('en el alta se puede escribir', () => {
    expect(fichaEditable(true, null)).toBe(true);
  });

  it('editando a alguien que YA tiene ficha, no', () => {
    expect(fichaEditable(false, '001')).toBe(false);
  });

  it('editando a alguien que quedó SIN ficha, sí: es la forma de ponérsela', () => {
    expect(fichaEditable(false, null)).toBe(true);
    expect(fichaEditable(false, '')).toBe(true);
    expect(fichaEditable(false, '   ')).toBe(true);
  });
});
