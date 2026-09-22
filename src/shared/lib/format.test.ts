import { describe, it, expect } from 'vitest';
import { date, dateTime } from './format';

/* Estas dos funciones las usa TODO el sistema: tablas, tarjetas y PDFs. No
   tenían ninguna prueba, y el día que se cambió el formato no había nada que
   avisara si se rompía. */

describe('date', () => {
  it('escribe la fecha como DD-MM-AAAA', () => {
    expect(date('1973-10-21')).toBe('21-10-1973');
  });

  it('un día calendario no se corre por zona horaria', () => {
    // Sin hora, `2026-04-15` es el día 15: interpretarlo en la zona de
    // Venezuela lo mostraría como 14. Este es el caso que rompía los Excel.
    expect(date('2026-04-15')).toBe('15-04-2026');
    expect(date('2026-01-01')).toBe('01-01-2026');
  });

  it('rellena con cero el día y el mes de una cifra', () => {
    expect(date('2026-03-05')).toBe('05-03-2026');
  });

  it('sin fecha, o con una basura, devuelve una raya y no "Invalid Date"', () => {
    expect(date(null)).toBe('—');
    expect(date(undefined)).toBe('—');
    expect(date('')).toBe('—');
    expect(date('cualquier cosa')).toBe('—');
  });
});

describe('dateTime', () => {
  it('escribe fecha y hora, con la fecha en DD-MM-AAAA', () => {
    // 15:30 UTC son las 11:30 en Caracas (UTC−4).
    expect(dateTime('2026-04-15T15:30:00Z')).toBe('15-04-2026 11:30');
  });

  it('la hora va en 24 horas, sin a.m./p.m.', () => {
    expect(dateTime('2026-04-15T23:05:00Z')).toBe('15-04-2026 19:05');
  });

  it('sin fecha, o con una basura, devuelve una raya', () => {
    expect(dateTime(null)).toBe('—');
    expect(dateTime('no es una fecha')).toBe('—');
  });
});
