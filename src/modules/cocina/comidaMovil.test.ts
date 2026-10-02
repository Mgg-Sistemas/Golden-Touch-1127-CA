import { describe, it, expect } from 'vitest';
import {
  HORA_COMIDA, diaCaracas, diasAtras, errorFechaComida, errorPersonas, etiquetaDia, horaCaracas, hoyCaracas,
  instanteServicio, yaCargada,
} from './comidaMovil';

describe('diaCaracas · el día del servicio se lee en Caracas', () => {
  it('una cena de las 9 de la noche es de hoy, no de mañana', () => {
    // 21:00 en Caracas del 02/10 = 01:00 UTC del 03/10
    expect(diaCaracas('2026-10-03T01:00:00Z')).toBe('2026-10-02');
    expect(horaCaracas('2026-10-03T01:00:00Z')).toBe('21:00:00');
  });

  it('un desayuno de las 7 es del mismo día', () => {
    expect(diaCaracas('2026-10-02T11:00:00Z')).toBe('2026-10-02');
  });

  it('una fecha rota no revienta', () => {
    expect(diaCaracas('no es fecha')).toBe('');
    expect(diaCaracas(null)).toBe('');
    expect(horaCaracas(undefined)).toBe('');
  });

  it('hoy sale del reloj que se le pasa', () => {
    expect(hoyCaracas(new Date('2026-10-03T02:30:00Z'))).toBe('2026-10-02');
  });
});

describe('instanteServicio · con qué hora queda la comida', () => {
  const ahora = new Date('2026-10-02T15:14:00Z'); // 11:14 en Caracas

  it('la de hoy queda con la hora en que se cargó', () => {
    expect(instanteServicio({ fecha: '2026-10-02', tipo: 'desayuno', ahora })).toBe('2026-10-02T15:14:00.000Z');
  });

  it('la de un día anterior queda con la hora habitual de esa comida', () => {
    expect(instanteServicio({ fecha: '2026-09-30', tipo: 'desayuno', ahora })).toBe('2026-09-30T11:00:00.000Z');
    expect(instanteServicio({ fecha: '2026-09-30', tipo: 'almuerzo', ahora })).toBe('2026-09-30T16:00:00.000Z');
    expect(instanteServicio({ fecha: '2026-09-30', tipo: 'cena', ahora })).toBe('2026-09-30T23:00:00.000Z');
  });

  it('la cena de un día anterior sigue siendo de ese día en Caracas', () => {
    const at = instanteServicio({ fecha: '2026-09-30', tipo: 'cena', ahora });
    expect(diaCaracas(at)).toBe('2026-09-30');
    expect(horaCaracas(at)).toBe(HORA_COMIDA.cena);
  });

  it('al editar sin cambiar el día no se toca el instante', () => {
    expect(instanteServicio({ fecha: '2026-10-01', tipo: 'almuerzo', ahora, originalAt: '2026-10-01T16:40:00Z' })).toBeUndefined();
  });

  it('al editar cambiando el día se conserva la hora original', () => {
    const at = instanteServicio({ fecha: '2026-09-29', tipo: 'almuerzo', ahora, originalAt: '2026-10-01T16:40:00Z' });
    expect(at).toBe('2026-09-29T16:40:00.000Z');
  });

  it('una fecha mal escrita no produce nada', () => {
    expect(instanteServicio({ fecha: '', tipo: 'cena', ahora })).toBeUndefined();
    expect(instanteServicio({ fecha: '02/10/2026', tipo: 'cena', ahora })).toBeUndefined();
  });
});

describe('errorFechaComida', () => {
  it('hoy y días anteriores sirven', () => {
    expect(errorFechaComida('2026-10-02', '2026-10-02')).toBeNull();
    expect(errorFechaComida('2026-09-15', '2026-10-02')).toBeNull();
  });

  it('un día que todavía no llegó, no', () => {
    expect(errorFechaComida('2026-10-03', '2026-10-02')).toMatch(/todavía no llegó/);
  });

  it('vacía, no', () => {
    expect(errorFechaComida('', '2026-10-02')).toMatch(/Indica la fecha/);
  });
});

describe('errorPersonas', () => {
  it('un número entero mayor que cero sirve', () => {
    expect(errorPersonas('24')).toBeNull();
    expect(errorPersonas(' 1 ')).toBeNull();
  });

  it('vacío, cero, negativo o letras, no', () => {
    expect(errorPersonas('')).toMatch(/cuántas personas/);
    expect(errorPersonas('0')).toMatch(/cuántas personas/);
    expect(errorPersonas('-3')).toMatch(/cuántas personas/);
    expect(errorPersonas('abc')).toMatch(/cuántas personas/);
  });

  it('media persona, no', () => {
    expect(errorPersonas('24.5')).toMatch(/sin decimales/);
    expect(errorPersonas('24,5')).toMatch(/sin decimales/);
  });
});

describe('yaCargada · avisar del doble registro', () => {
  const movs = [
    { id: 'a', at: '2026-10-02T11:10:00Z', tipo_comida: 'desayuno' as const },
    { id: 'b', at: '2026-10-03T01:00:00Z', tipo_comida: 'cena' as const },   // cena del 02 en Caracas
    { id: 'c', at: '2026-10-01T16:00:00Z', tipo_comida: 'almuerzo' as const },
  ];

  it('encuentra la comida del mismo tipo y día', () => {
    expect(yaCargada(movs, '2026-10-02', 'desayuno')?.id).toBe('a');
  });

  it('la cena de las 9 de la noche cuenta para su día de Caracas', () => {
    expect(yaCargada(movs, '2026-10-02', 'cena')?.id).toBe('b');
    expect(yaCargada(movs, '2026-10-03', 'cena')).toBeNull();
  });

  it('otro tipo u otro día no cuenta', () => {
    expect(yaCargada(movs, '2026-10-02', 'almuerzo')).toBeNull();
    expect(yaCargada(movs, '2026-09-30', 'desayuno')).toBeNull();
  });

  it('la que se está editando no se avisa a sí misma', () => {
    expect(yaCargada(movs, '2026-10-02', 'desayuno', 'a')).toBeNull();
  });
});

describe('etiquetaDia y diasAtras', () => {
  it('hoy, ayer y el resto con su fecha', () => {
    expect(etiquetaDia('2026-10-02', '2026-10-02')).toBe('Hoy');
    expect(etiquetaDia('2026-10-01', '2026-10-02')).toBe('Ayer');
    expect(etiquetaDia('2026-09-28', '2026-10-02')).toBe('28/09/2026');
  });

  it('ayer cruza el cambio de mes', () => {
    expect(etiquetaDia('2026-09-30', '2026-10-01')).toBe('Ayer');
  });

  it('diasAtras resta días de calendario', () => {
    expect(diasAtras('2026-10-02', 30)).toBe('2026-09-02');
    expect(diasAtras('2026-03-01', 1)).toBe('2026-02-28');
  });
});
