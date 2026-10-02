import { describe, expect, it } from 'vitest';
import {
  FICHA_MAX, FICHA_MIN, claveFicha, compararFicha, errorFicha, errorFichaEdicion, etiquetaFicha, fichaCambia, mismaFicha,
  normalizarFicha,
} from './fichaNro';

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

  it('el mensaje de «muy corta» dice qué pasa si la dejas vacía', () => {
    expect(errorFicha('1')).toMatch(/lo dejas vacío/);
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

describe('errorFichaEdicion · la ficha se puede cambiar, pero no borrar', () => {
  it('cambiarla por otra válida está bien', () => {
    expect(errorFichaEdicion('007', '001')).toBeNull();
    expect(errorFichaEdicion('gt-07', '001')).toBeNull();
  });

  it('dejarla igual está bien', () => {
    expect(errorFichaEdicion('001', '001')).toBeNull();
  });

  it('la nueva tiene que cumplir las mismas reglas del alta', () => {
    expect(errorFichaEdicion('7', '001')).toMatch(/al menos 3/);
    expect(errorFichaEdicion('00/1', '001')).toMatch(/letras, números y guiones/);
  });

  it('vaciarla a quien YA tiene ficha, no: se avisa cuál tiene', () => {
    expect(errorFichaEdicion('', '001')).toMatch(/no puede quedar vacío.*001/);
    expect(errorFichaEdicion('   ', '001')).toMatch(/no puede quedar vacío/);
    expect(errorFichaEdicion(null, 'gt-07')).toMatch(/GT-07/);
  });

  it('a quien quedó SIN ficha, vacío lo deja como está y escribirla se la pone', () => {
    expect(errorFichaEdicion('', null)).toBeNull();
    expect(errorFichaEdicion('', '   ')).toBeNull();
    expect(errorFichaEdicion('015', null)).toBeNull();
  });
});

describe('mismaFicha · que no se repita al editarla', () => {
  it('la misma escrita igual', () => {
    expect(mismaFicha('007', '007')).toBe(true);
  });

  it('el mismo número con más o menos ceros es la misma ficha', () => {
    expect(mismaFicha('001', '0001')).toBe(true);
    expect(mismaFicha('010', '10')).toBe(true);
    expect(claveFicha('0001')).toBe('1');
  });

  it('espacios y minúsculas no la hacen distinta', () => {
    expect(mismaFicha(' gt-07 ', 'GT-07')).toBe(true);
  });

  it('números distintos no se confunden', () => {
    expect(mismaFicha('001', '010')).toBe(false);
    expect(mismaFicha('100', '1')).toBe(false);
  });

  it('en un código con letras los ceros SÍ cuentan: no es un número', () => {
    expect(mismaFicha('GT-07', 'GT-7')).toBe(false);
  });

  it('dos personas sin ficha no se repiten entre sí', () => {
    expect(mismaFicha(null, null)).toBe(false);
    expect(mismaFicha('', '   ')).toBe(false);
    expect(mismaFicha('001', null)).toBe(false);
  });
});

describe('fichaCambia · avisar antes de guardar', () => {
  it('sí cuando ya tenía una y se escribe otra', () => {
    expect(fichaCambia('007', '001')).toBe(true);
  });

  it('no cuando es la misma escrita distinto (espacios, minúsculas)', () => {
    expect(fichaCambia(' gt-07 ', 'GT-07')).toBe(false);
    expect(fichaCambia('001', '001')).toBe(false);
  });

  it('no cuando no tenía: ponérsela no es cambiarla', () => {
    expect(fichaCambia('015', null)).toBe(false);
    expect(fichaCambia('015', '')).toBe(false);
  });

  it('no cuando se deja vacía: eso es un error, no un cambio', () => {
    expect(fichaCambia('', '001')).toBe(false);
  });
});

describe('compararFicha · el orden de la lista de personal', () => {
  const ordenar = (fichas: (string | null)[]) => [...fichas].sort(compararFicha);

  it('los números van como números: la 10 después de la 2, no antes', () => {
    expect(ordenar(['10', '2', '1'])).toEqual(['1', '2', '10']);
  });

  it('con ceros adelante ordena igual', () => {
    expect(ordenar(['010', '002', '001'])).toEqual(['001', '002', '010']);
  });

  it('la misma ficha escrita distinto queda junta', () => {
    expect(ordenar(['7', '005', '007', '5'])).toEqual(['5', '005', '7', '007']);
  });

  it('las fichas con letras se ordenan por su parte numérica', () => {
    expect(ordenar(['GT-10', 'GT-2', 'GT-1'])).toEqual(['GT-1', 'GT-2', 'GT-10']);
  });

  it('los números sueltos van antes que los códigos con letra', () => {
    expect(ordenar(['GT-01', '999'])).toEqual(['999', 'GT-01']);
  });

  it('quien no tiene ficha queda al final', () => {
    expect(ordenar(['003', null, '001', '', '002'])).toEqual(['001', '002', '003', null, '']);
  });

  it('dos sin ficha empatan', () => {
    expect(compararFicha(null, '')).toBe(0);
  });

  it('los espacios y las minúsculas no cambian el orden', () => {
    expect(compararFicha(' gt-1 ', 'GT-1')).toBe(0);
  });
});
