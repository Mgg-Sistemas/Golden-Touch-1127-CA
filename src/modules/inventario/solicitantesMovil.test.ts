import { describe, expect, it } from 'vitest';
import {
  armarNotaConSolicitadoPor,
  extraerSolicitadoPorDeNota,
  normalizarNombreSolicitante,
  unirNombresSolicitantes,
} from './solicitantesMovil';

describe('solicitantesMovil · Solicitado por y alta de personas', () => {
  it('normaliza y une listas de personas sin duplicados por acento o mayúsculas', () => {
    expect(normalizarNombreSolicitante('  josé   pérez ')).toBe('JOSÉ PÉREZ');
    const unidos = unirNombresSolicitantes(
      ['Jose Perez', 'EDINSON ANGULO'],
      ['JOSÉ PÉREZ', 'carlos gomez'],
    );
    expect(unidos).toEqual(['CARLOS GOMEZ', 'EDINSON ANGULO', 'JOSE PEREZ']);
  });

  it('empaqueta y extrae Solicitado por dentro de la nota de traslados', () => {
    const soloSol = armarNotaConSolicitadoPor('', 'carlos gomez');
    expect(soloSol).toBe('Solicitado por: CARLOS GOMEZ');
    expect(extraerSolicitadoPorDeNota(soloSol)).toEqual({
      solicitadoPor: 'CARLOS GOMEZ',
      notaLimpia: null,
    });

    const conNota = armarNotaConSolicitadoPor('Lleva el chofer Luis', 'María Rodríguez');
    expect(conNota).toBe('Solicitado por: MARÍA RODRÍGUEZ · Lleva el chofer Luis');
    expect(extraerSolicitadoPorDeNota(conNota)).toEqual({
      solicitadoPor: 'MARÍA RODRÍGUEZ',
      notaLimpia: 'Lleva el chofer Luis',
    });

    expect(extraerSolicitadoPorDeNota('Nota vieja sin solicitante')).toEqual({
      solicitadoPor: null,
      notaLimpia: 'Nota vieja sin solicitante',
    });
  });
});
