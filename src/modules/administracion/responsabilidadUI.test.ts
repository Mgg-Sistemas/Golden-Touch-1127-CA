import { describe, it, expect } from 'vitest';
import { nombrePorEmail } from './administracionResponsabilidad';

describe('nombrePorEmail', () => {
  it('mapea email→nombre y cae al email si no hay nombre', () => {
    const m = nombrePorEmail([{ email: 'ana@gt.com', nombre: 'Ana Pérez' }, { email: 'b@gt.com', nombre: '' }]);
    expect(m.get('ana@gt.com')).toBe('Ana Pérez');
    expect(m.get('b@gt.com')).toBe('b@gt.com');
    expect(m.get('x@gt.com')).toBeUndefined();
  });
});
