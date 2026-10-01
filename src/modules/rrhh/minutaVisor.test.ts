import { describe, expect, it } from 'vitest';
import {
  ESCALA_MAX, ESCALA_MIN, escalaSiguiente, esImagenAdjunto, giroSiguiente, repartirTanda, anchoVisor,
} from './minutaVisor';

describe('escalaSiguiente', () => {
  it('sube y baja de a 0,25', () => {
    expect(escalaSiguiente(1, 1)).toBe(1.25);
    expect(escalaSiguiente(1, -1)).toBe(0.75);
  });
  it('no pasa de 0,5 ni de 4', () => {
    expect(escalaSiguiente(0.5, -1)).toBe(0.5);
    expect(escalaSiguiente(4, 1)).toBe(4);
    expect(ESCALA_MIN).toBe(0.5);
    expect(ESCALA_MAX).toBe(4);
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

describe('anchoVisor', () => {
  it('el zoom se expresa como porcentaje de ancho', () => {
    expect(anchoVisor(1.5)).toBe('150%');
    expect(anchoVisor(0.5)).toBe('50%');
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
