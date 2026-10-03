import { describe, expect, it } from 'vitest';
import { diaDeSubida } from './informeImagenes.repository';

describe('diaDeSubida', () => {
  it('da el día venezolano, no el del equipo ni el universal', () => {
    // Review Focus 5: 2026-10-04T01:00Z son las 21:00 del 3 en Venezuela.
    expect(diaDeSubida(new Date('2026-10-04T01:00:00Z'))).toBe('2026-10-03');
  });
  it('a media mañana coinciden', () => {
    expect(diaDeSubida(new Date('2026-10-03T14:00:00Z'))).toBe('2026-10-03');
  });
  it('justo pasada la medianoche venezolana ya es el día nuevo', () => {
    expect(diaDeSubida(new Date('2026-10-04T04:30:00Z'))).toBe('2026-10-04');
  });
});
