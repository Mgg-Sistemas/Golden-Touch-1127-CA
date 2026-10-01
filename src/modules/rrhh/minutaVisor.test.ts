import { describe, expect, it } from 'vitest';
import {
  ESCALA_MAX, ESCALA_MIN, escalaSiguiente, esImagenAdjunto, giroSiguiente, repartirTanda, transformVisor,
} from './minutaVisor';

describe('escalaSiguiente', () => {
  it('sube y baja de a 0,25', () => {
    expect(escalaSiguiente(1, 1)).toBe(1.25);
    expect(escalaSiguiente(1, -1)).toBe(0.75);
  });
  it('no pasa de 0,5 ni de 4', () => {
    expect(escalaSiguiente(ESCALA_MIN, -1)).toBe(ESCALA_MIN);
    expect(escalaSiguiente(ESCALA_MAX, 1)).toBe(ESCALA_MAX);
  });
  it('no arrastra decimales tras muchos pasos', () => {
    let e = 1;
    for (let i = 0; i < 20; i++) e = escalaSiguiente(e, 1);
    expect(e).toBe(4);
  });
});

describe('giroSiguiente', () => {
  it('suma 90 y da la vuelta a los 360', () => {
    expect(giroSiguiente(0)).toBe(90);
    expect(giroSiguiente(270)).toBe(0);
  });
});

describe('transformVisor', () => {
  it('arma escala y giro en un solo texto', () => {
    expect(transformVisor(1.5, 90)).toBe('scale(1.5) rotate(90deg)');
  });
});

describe('esImagenAdjunto', () => {
  it('distingue imágenes de PDF', () => {
    expect(esImagenAdjunto('image/png')).toBe(true);
    expect(esImagenAdjunto('application/pdf')).toBe(false);
    expect(esImagenAdjunto(null)).toBe(false);
  });
});

describe('repartirTanda', () => {
  it('un archivo malo no saca a los demás', () => {
    const r = repartirTanda([{ name: 'a.png' }, { name: 'b.exe' }, { name: 'c.pdf' }],
      (f) => (f.name.endsWith('.exe') ? 'tipo no permitido' : null));
    expect(r.validos.map((f) => f.name)).toEqual(['a.png', 'c.pdf']);
    expect(r.rechazados).toEqual([{ nombre: 'b.exe', motivo: 'tipo no permitido' }]);
  });
});
