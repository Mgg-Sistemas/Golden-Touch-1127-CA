import { describe, it, expect } from 'vitest';
import { errorHorometro, faltaHorometroFinal, horasTrabajadas } from './horometroEquipo';

describe('faltaHorometroFinal · recordatorio (no bloqueo) si el equipo ya trae horómetro', () => {
  it('con inicial y sin final, avisa', () => {
    expect(faltaHorometroFinal(91678, null)).toMatch(/Arrancó en 91678/);
  });

  it('con final, o sin horómetro previo, no exige nada', () => {
    expect(faltaHorometroFinal(91678, 91700)).toBeNull();
    expect(faltaHorometroFinal(91678, 91678)).toBeNull();
    expect(faltaHorometroFinal(null, null)).toBeNull();
    expect(faltaHorometroFinal(undefined, 50)).toBeNull();
  });
});

describe('horasTrabajadas · HF − HI', () => {
  it('el caso normal: la máquina trabajó entre surtido y surtido', () => {
    expect(horasTrabajadas(100, 108.5)).toBe(8.5);
    expect(horasTrabajadas(1245, 1253)).toBe(8);
  });

  it('cero es válido: se surtió sin que el equipo trabajara', () => {
    expect(horasTrabajadas(100, 100)).toBe(0);
  });

  it('sin una de las dos lecturas no hay nada que calcular', () => {
    expect(horasTrabajadas(null, 108)).toBeNull();
    expect(horasTrabajadas(100, null)).toBeNull();
    expect(horasTrabajadas(null, null)).toBeNull();
    expect(horasTrabajadas(undefined, undefined)).toBeNull();
  });

  it('una lectura que no es número cuenta como ausente, no revienta', () => {
    expect(horasTrabajadas(Number.NaN, 100)).toBeNull();
    expect(horasTrabajadas(100, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('los decimales del horómetro no dejan colas binarias: redondea a 2', () => {
    // 1234.5 − 1200.3 da 34.199999… en coma flotante; tiene que salir 34.2.
    expect(horasTrabajadas(1200.3, 1234.5)).toBe(34.2);
  });

  it('un final menor que el inicial da negativo (el error lo frena aparte)', () => {
    expect(horasTrabajadas(1245, 1230)).toBe(-15);
  });
});

describe('errorHorometro · el final no puede ser menor que el inicial', () => {
  it('lecturas coherentes pasan', () => {
    expect(errorHorometro(100, 108)).toBeNull();
    expect(errorHorometro(100, 100)).toBeNull();
  });

  it('un final menor que el inicial se frena con las dos lecturas en el mensaje', () => {
    const e = errorHorometro(1245, 1230);
    expect(e).toBeTruthy();
    expect(e).toContain('1230');
    expect(e).toContain('1245');
  });

  it('si falta una lectura no hay error: el horómetro es opcional', () => {
    expect(errorHorometro(null, 100)).toBeNull();
    expect(errorHorometro(100, null)).toBeNull();
    expect(errorHorometro(null, null)).toBeNull();
  });
});
