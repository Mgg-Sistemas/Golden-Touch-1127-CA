import { describe, it, expect } from 'vitest';
import { sumarRetencionBs } from './retencionRegistrada';
import type { RetencionPracticada } from '../libroFiscal/retencionesFiscal.repository';

/** Fábrica mínima: solo los campos que mira el sumador. */
function linea(over: Partial<RetencionPracticada>): RetencionPracticada {
  return {
    direccion: 'practicada', anulada: false, montoRetenido: 100, montoBs: 100, moneda: 'Bs',
    ...over,
  } as RetencionPracticada;
}

describe('sumarRetencionBs', () => {
  it('null cuando no hay ninguna línea', () => {
    expect(sumarRetencionBs([])).toBeNull();
  });

  it('suma varias líneas practicadas en Bs', () => {
    const reg = sumarRetencionBs([
      linea({ montoBs: 120 }),
      linea({ montoBs: 20 }),
    ]);
    expect(reg).toEqual({ montoBs: 140, lineas: 2 });
  });

  it('ignora las anuladas y las de monto 0', () => {
    const reg = sumarRetencionBs([
      linea({ montoBs: 120 }),
      linea({ montoBs: 999, anulada: true }),
      linea({ montoRetenido: 0, montoBs: 0 }),
    ]);
    expect(reg).toEqual({ montoBs: 120, lineas: 1 });
  });

  it('ignora las recibidas (solo practicadas)', () => {
    const reg = sumarRetencionBs([
      linea({ montoBs: 50 }),
      linea({ direccion: 'recibida', montoBs: 777 }),
    ]);
    expect(reg).toEqual({ montoBs: 50, lineas: 1 });
  });

  it('usa montoRetenido cuando la moneda es Bs y no hay montoBs', () => {
    const reg = sumarRetencionBs([
      linea({ moneda: 'Bs', montoBs: null, montoRetenido: 80 }),
    ]);
    expect(reg).toEqual({ montoBs: 80, lineas: 1 });
  });

  it('toma montoBs de una línea en $ (ya convertida)', () => {
    const reg = sumarRetencionBs([
      linea({ moneda: 'USD', montoRetenido: 10, montoBs: 400 }),
    ]);
    expect(reg).toEqual({ montoBs: 400, lineas: 1 });
  });

  it('null si una línea en $ no se puede expresar en Bs (sin montoBs): no se fuerza nada', () => {
    const reg = sumarRetencionBs([
      linea({ montoBs: 120 }),
      linea({ moneda: 'USD', montoRetenido: 10, montoBs: null }),
    ]);
    expect(reg).toBeNull();
  });
});
