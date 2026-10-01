import { describe, it, expect } from 'vitest';
import {
  esGradoValido, labelGrado, normalizarInstruccion, normalizarTrabajo, resumenTrabajo,
  tieneTrabajoAnterior, TRABAJO_VACIO,
} from './instruccionYTrabajo';

describe('grado de instrucción', () => {
  it('reconoce los tres grados de la hoja y rechaza el resto', () => {
    expect(esGradoValido('primaria')).toBe(true);
    expect(esGradoValido('bachiller')).toBe(true);
    expect(esGradoValido('universitario')).toBe(true);
    expect(esGradoValido('doctorado')).toBe(false);
    expect(esGradoValido(null)).toBe(false);
  });

  it('los dice en palabras', () => {
    expect(labelGrado('bachiller')).toBe('Bachiller');
    expect(labelGrado(null)).toBe('—');
  });

  it('el título cuelga del grado: sin grado no se guarda título', () => {
    expect(normalizarInstruccion('universitario', '  Ingeniero Industrial  '))
      .toEqual({ grado: 'universitario', titulo: 'Ingeniero Industrial' });
    expect(normalizarInstruccion(null, 'Ingeniero')).toEqual({ grado: null, titulo: null });
    expect(normalizarInstruccion('doctorado', 'PhD')).toEqual({ grado: null, titulo: null });
    expect(normalizarInstruccion('primaria', '   ')).toEqual({ grado: 'primaria', titulo: null });
  });
});

describe('último trabajo', () => {
  it('limpia los cuatro datos', () => {
    expect(normalizarTrabajo({ empresa: '  PDVSA ', cargo: ' Operador ', duracion: ' 3 años ', sueldo: '250.5' }))
      .toEqual({ empresa: 'PDVSA', cargo: 'Operador', duracion: '3 años', sueldo: 250.5 });
  });

  it('un sueldo que no es número, o negativo, queda vacío; el cero se respeta', () => {
    expect(normalizarTrabajo({ sueldo: 'nada' }).sueldo).toBeNull();
    expect(normalizarTrabajo({ sueldo: '' }).sueldo).toBeNull();
    expect(normalizarTrabajo({ sueldo: null }).sueldo).toBeNull();
    expect(normalizarTrabajo({ sueldo: -5 }).sueldo).toBeNull();
    expect(normalizarTrabajo({ sueldo: 0 }).sueldo).toBe(0);
  });

  it('sabe si hay algo cargado', () => {
    expect(tieneTrabajoAnterior(TRABAJO_VACIO)).toBe(false);
    expect(tieneTrabajoAnterior({ ...TRABAJO_VACIO, sueldo: 0 })).toBe(true);
    expect(tieneTrabajoAnterior({ ...TRABAJO_VACIO, empresa: 'PDVSA' })).toBe(true);
  });

  it('arma la línea sin separadores sueltos', () => {
    expect(resumenTrabajo({ empresa: 'PDVSA', cargo: 'Operador', duracion: '3 años', sueldo: 250 }))
      .toBe('PDVSA · Operador · 3 años');
    expect(resumenTrabajo({ empresa: 'PDVSA', cargo: null, duracion: null, sueldo: null })).toBe('PDVSA');
    expect(resumenTrabajo(TRABAJO_VACIO)).toBe('');
  });
});
