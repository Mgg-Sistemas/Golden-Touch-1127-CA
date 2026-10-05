import { describe, it, expect } from 'vitest';
import { venceEn, estadoCarnet, fechaCarnet } from './vigenciaCarnet';

describe('vencimiento del carnet', () => {
  it('suma días y semanas', () => {
    expect(venceEn('2026-10-05', 10, 'dias')).toBe('2026-10-15');
    expect(venceEn('2026-12-28', 1, 'semanas')).toBe('2027-01-04');
  });

  it('meses y años respetan el fin de mes', () => {
    expect(venceEn('2026-01-31', 1, 'meses')).toBe('2026-02-28');
    expect(venceEn('2026-10-05', 3, 'meses')).toBe('2027-01-05');
    expect(venceEn('2028-02-29', 1, 'anios')).toBe('2029-02-28');
  });

  it('una cantidad vacía o en cero no da fecha', () => {
    expect(venceEn('2026-10-05', 0, 'dias')).toBeNull();
    expect(venceEn('', 3, 'meses')).toBeNull();
  });

  it('estado según hoy', () => {
    expect(estadoCarnet('2026-12-31', '2026-10-05')).toBe('vigente');
    expect(estadoCarnet('2026-10-20', '2026-10-05')).toBe('por_vencer');
    expect(estadoCarnet('2026-10-04', '2026-10-05')).toBe('vencido');
    expect(estadoCarnet(null, '2026-10-05')).toBeNull();
  });

  it('se imprime dd/mm/aaaa', () => {
    expect(fechaCarnet('2026-12-31')).toBe('31/12/2026');
    expect(fechaCarnet(null)).toBe('');
  });
});
