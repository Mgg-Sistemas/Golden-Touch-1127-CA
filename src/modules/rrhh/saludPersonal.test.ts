import { describe, expect, it } from 'vitest';
import {
  etiquetaSiNo, haySalud, lineasSaludQr, normalizarCondicion, textoCondicion,
} from './saludPersonal';

describe('normalizarCondicion', () => {
  it('recorta el detalle', () => {
    expect(normalizarCondicion(true, '  penicilina  ')).toEqual({ tiene: true, detalle: 'penicilina' });
  });

  it('si la respuesta es NO, el detalle se borra', () => {
    expect(normalizarCondicion(false, 'penicilina')).toEqual({ tiene: false, detalle: null });
  });

  it('si nadie contestó, el detalle tampoco queda', () => {
    expect(normalizarCondicion(null, 'penicilina')).toEqual({ tiene: null, detalle: null });
    expect(normalizarCondicion(undefined, 'penicilina')).toEqual({ tiene: null, detalle: null });
  });

  it('un sí sin detalle es un sí', () => {
    expect(normalizarCondicion(true, '   ')).toEqual({ tiene: true, detalle: null });
  });
});

describe('etiquetaSiNo · los tres estados', () => {
  it('sí, no, y sin preguntar', () => {
    expect(etiquetaSiNo(true)).toBe('Sí');
    expect(etiquetaSiNo(false)).toBe('No');
    expect(etiquetaSiNo(null)).toBe('—');
    expect(etiquetaSiNo(undefined)).toBe('—');
  });
});

describe('textoCondicion', () => {
  it('con detalle, lo dice', () => {
    expect(textoCondicion(true, 'penicilina')).toBe('Sí · penicilina');
  });

  it('un sí a medio cargar se muestra como incompleto, no como un sí a secas', () => {
    expect(textoCondicion(true, null)).toBe('Sí (sin detallar)');
  });

  it('el no es un no', () => {
    expect(textoCondicion(false, null)).toBe('No');
  });

  it('lo que nadie preguntó queda en raya, no en «No»', () => {
    expect(textoCondicion(null, null)).toBe('—');
  });
});

describe('haySalud', () => {
  it('con una respuesta cargada, ya hay algo que mostrar', () => {
    expect(haySalud({ tiene_alergias: false })).toBe(true);
    expect(haySalud({ tiene_enfermedad: true })).toBe(true);
  });

  it('sin nada cargado, no', () => {
    expect(haySalud({})).toBe(false);
    expect(haySalud({ tiene_alergias: null, tiene_enfermedad: null })).toBe(false);
  });
});

describe('lineasSaludQr · lo que se lee al escanear el carnet', () => {
  it('pone el detalle, que es lo que sirve en una emergencia', () => {
    expect(lineasSaludQr({ tiene_alergias: true, alergias_detalle: 'PENICILINA' }))
      .toEqual(['Alergias: PENICILINA']);
  });

  it('el «no» también va: saber que no tiene alergias sirve', () => {
    expect(lineasSaludQr({ tiene_alergias: false, tiene_enfermedad: false }))
      .toEqual(['Alergias: no', 'Enfermedad: no']);
  });

  it('lo que nadie contestó no ocupa lugar en el QR', () => {
    expect(lineasSaludQr({})).toEqual([]);
    expect(lineasSaludQr({ tiene_alergias: true, alergias_detalle: 'MANÍ', tiene_enfermedad: null }))
      .toEqual(['Alergias: MANÍ']);
  });

  it('un sí sin detalle igual avisa', () => {
    expect(lineasSaludQr({ tiene_enfermedad: true })).toEqual(['Enfermedad: SÍ']);
  });
});
