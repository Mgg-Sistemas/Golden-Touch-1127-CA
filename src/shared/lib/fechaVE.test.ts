import { describe, it, expect } from 'vitest';
import {
  errorFechaVe, fechaIsoValida, formatearMientrasEscribe, isoAVe, veAIso,
} from './fechaVE';

describe('isoAVe', () => {
  it('pasa a formato venezolano', () => {
    expect(isoAVe('1973-10-21')).toBe('21-10-1973');
  });

  it('acepta una marca de tiempo completa', () => {
    expect(isoAVe('1973-10-21T00:00:00Z')).toBe('21-10-1973');
  });

  it('sin fecha devuelve vacío, no "Invalid Date"', () => {
    expect(isoAVe(null)).toBe('');
    expect(isoAVe('')).toBe('');
    expect(isoAVe('cualquier cosa')).toBe('');
  });
});

describe('veAIso', () => {
  it('pasa a lo que guarda la base', () => {
    expect(veAIso('21-10-1973')).toBe('1973-10-21');
  });

  it('acepta un solo dígito en día y mes', () => {
    expect(veAIso('1-3-1990')).toBe('1990-03-01');
  });

  it('sigue aceptando barras y puntos: lo ya escrito así no se rompe', () => {
    expect(veAIso('21/10/1973')).toBe('1973-10-21');
    expect(veAIso('21.10.1973')).toBe('1973-10-21');
    expect(veAIso('1/3/1990')).toBe('1990-03-01');
  });

  it('rechaza una fecha que no existe, con cualquier separador', () => {
    expect(veAIso('31-02-2000')).toBeNull();
    expect(veAIso('32-01-2000')).toBeNull();
    expect(veAIso('15-13-2000')).toBeNull();
  });

  it('el 29 de febrero vale solo en año bisiesto', () => {
    expect(veAIso('29-02-2024')).toBe('2024-02-29');
    expect(veAIso('29-02-2023')).toBeNull();
    expect(veAIso('29-02-2000')).toBe('2000-02-29'); // 2000 es bisiesto
    expect(veAIso('29-02-1900')).toBeNull();         // 1900 no lo es
  });

  it('a medio escribir todavía no es una fecha', () => {
    expect(veAIso('21-10')).toBeNull();
    expect(veAIso('21-10-19')).toBeNull();
    expect(veAIso('')).toBeNull();
  });

  it('no confunde el formato americano: 10-21 no es octubre 21', () => {
    // Si alguien escribe 10-21-1973 (mes primero), el mes 21 no existe.
    expect(veAIso('10-21-1973')).toBeNull();
  });
});

describe('formatearMientrasEscribe', () => {
  it('va poniendo los guiones solo', () => {
    expect(formatearMientrasEscribe('2')).toBe('2');
    expect(formatearMientrasEscribe('21')).toBe('21');
    expect(formatearMientrasEscribe('211')).toBe('21-1');
    expect(formatearMientrasEscribe('2110')).toBe('21-10');
    expect(formatearMientrasEscribe('21101973')).toBe('21-10-1973');
  });

  it('descarta lo que no es dígito, así pegar una fecha funciona', () => {
    expect(formatearMientrasEscribe('21-10-1973')).toBe('21-10-1973');
    // Pegada con barras (de un Excel, de otro sistema) queda igual con guiones.
    expect(formatearMientrasEscribe('21/10/1973')).toBe('21-10-1973');
  });

  it('no deja pasar de ocho dígitos', () => {
    expect(formatearMientrasEscribe('2110197399')).toBe('21-10-1973');
  });

  it('borrar hacia atrás no se traba', () => {
    expect(formatearMientrasEscribe('21-')).toBe('21');
    expect(formatearMientrasEscribe('')).toBe('');
  });
});

describe('fechaIsoValida', () => {
  it('reconoce una fecha real', () => {
    expect(fechaIsoValida('1973-10-21')).toBe(true);
  });

  it('rechaza lo que no existe o está fuera de rango', () => {
    expect(fechaIsoValida('2000-02-31')).toBe(false);
    expect(fechaIsoValida('1800-01-01')).toBe(false);
    expect(fechaIsoValida('')).toBe(false);
    expect(fechaIsoValida(null)).toBe(false);
  });
});

describe('errorFechaVe', () => {
  it('en blanco no es un error: el campo puede ser opcional', () => {
    expect(errorFechaVe('')).toBeNull();
    expect(errorFechaVe('   ')).toBeNull();
  });

  it('una fecha buena no se queja', () => {
    expect(errorFechaVe('21-10-1973')).toBeNull();
    expect(errorFechaVe('21/10/1973')).toBeNull();
  });

  it('distingue "mal escrita" de "no existe"', () => {
    expect(errorFechaVe('21 de octubre')).toMatch(/DD-MM-AAAA/);
    expect(errorFechaVe('31-02-2000')).toMatch(/no existe/i);
  });
});
