import { describe, it, expect } from 'vitest';
import { planCadenaMedidor, type FilaMedidor } from './cadenaMedidor';

const mov = (id: string, ini: number, fin: number, fecha = '2026-10-01'): FilaMedidor => ({ id, fecha, hora: null, created_at: `${fecha}T12:00:00Z`, ini, fin });
const ancla = (id: string, valor: number, fecha = '2026-10-05'): FilaMedidor => ({ id, fecha, hora: null, created_at: `${fecha}T12:00:00Z`, ini: valor, fin: valor, ancla: true });

describe('cadena del medidor (contador / horómetro)', () => {
  it('una cadena continua no cambia nada', () => {
    expect(planCadenaMedidor([mov('a', 100, 120), mov('b', 120, 150)])).toEqual([]);
  });
  it('un surtido cargado fuera de orden cuelga del final anterior', () => {
    expect(planCadenaMedidor([mov('a', 100, 120), mov('c', 120, 200), mov('b', 120, 150)])).toEqual([{ id: 'c', ini: 150, fin: 200 }]);
  });
  it('el primero conserva su inicial y los finales nunca se tocan', () => {
    const r = planCadenaMedidor([mov('a', 90, 120), mov('b', 100, 150)]);
    expect(r).toEqual([{ id: 'b', ini: 120, fin: 150 }]);
  });
});

describe('anclas de Maquinaria (horómetro en dos vías)', () => {
  it('el surtido que arrancó de la lectura de Maquinaria NO vuelve al HF anterior', () => {
    // Último surtido HF 9284; Maquinaria sube 9309; el surtido siguiente arranca en 9309.
    expect(planCadenaMedidor([mov('a', 9200, 9284), ancla('m', 9309), mov('b', 9309, 9317)])).toEqual([]);
  });
  it('sin el ancla, la regla de siempre lo colgaría del HF anterior', () => {
    expect(planCadenaMedidor([mov('a', 9200, 9284), mov('b', 9309, 9317)])).toEqual([{ id: 'b', ini: 9284, fin: 9317 }]);
  });
  it('el ancla nunca se escribe, aunque quede primera', () => {
    expect(planCadenaMedidor([ancla('m', 500), mov('b', 480, 520)])).toEqual([{ id: 'b', ini: 500, fin: 520 }]);
  });
  it('un surtido que arrancó antes de la lectura y la sobrepasa sigue su cadena normal', () => {
    // a: 100→120, ancla 130, b arrancó en 120 y terminó en 140: queda colgando del ancla.
    expect(planCadenaMedidor([mov('a', 100, 120), ancla('m', 130), mov('b', 120, 140)])).toEqual([{ id: 'b', ini: 130, fin: 140 }]);
  });
});
