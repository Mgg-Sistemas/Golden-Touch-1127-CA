import { describe, it, expect } from 'vitest';
import { claveDescarte, confirmacionValida, esDescartado, motivoValido, MOTIVO_DESCARTE_MIN } from './mercadoDescarte';

describe('claveDescarte', () => {
  it('es «MERCADO» y el número, como en MGG', () => {
    expect(claveDescarte('MK-2026-0001')).toBe('MERCADO MK-2026-0001');
  });

  it('sin número no queda vacía: una clave vacía se confirmaría con cualquier cosa', () => {
    expect(claveDescarte(null)).toBe('DESCARTAR MERCADO');
    expect(claveDescarte('   ')).toBe('DESCARTAR MERCADO');
  });
});

describe('confirmacionValida', () => {
  const clave = claveDescarte('MK-2026-0001');

  it('acepta la clave tal cual', () => {
    expect(confirmacionValida('MERCADO MK-2026-0001', clave)).toBe(true);
  });

  it('no distingue mayúsculas ni espacios de sobra', () => {
    expect(confirmacionValida('  mercado   mk-2026-0001 ', clave)).toBe(true);
  });

  it('rechaza el número solo, otro número o uno a medias', () => {
    expect(confirmacionValida('MK-2026-0001', clave)).toBe(false);
    expect(confirmacionValida('MERCADO MK-2026-0002', clave)).toBe(false);
    expect(confirmacionValida('MERCADO MK-2026', clave)).toBe(false);
  });

  it('en blanco nunca confirma, ni siquiera contra una clave vacía', () => {
    expect(confirmacionValida('', clave)).toBe(false);
    expect(confirmacionValida('   ', '')).toBe(false);
    expect(confirmacionValida(null, clave)).toBe(false);
  });
});

describe('motivoValido', () => {
  it(`exige al menos ${MOTIVO_DESCARTE_MIN} caracteres`, () => {
    expect(motivoValido('a'.repeat(MOTIVO_DESCARTE_MIN - 1))).toBe(false);
    expect(motivoValido('a'.repeat(MOTIVO_DESCARTE_MIN))).toBe(true);
  });

  it('los espacios de sobra no cuentan', () => {
    expect(motivoValido(`    ${'a'.repeat(MOTIVO_DESCARTE_MIN - 1)}    `)).toBe(false);
  });

  it('tolera null', () => {
    expect(motivoValido(null)).toBe(false);
  });
});

describe('esDescartado', () => {
  it('solo cuando la marca está en true', () => {
    expect(esDescartado(null)).toBe(false);
    expect(esDescartado({ totales: null })).toBe(false);
    expect(esDescartado({ totales: {} })).toBe(false);
    expect(esDescartado({ totales: { descartado: false } })).toBe(false);
    expect(esDescartado({ totales: { descartado: true } })).toBe(true);
  });
});
