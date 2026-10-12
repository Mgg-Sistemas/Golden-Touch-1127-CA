import { describe, it, expect } from 'vitest';
import { SERVICIOS, etiquetaServicio, trabajosDe } from './flota';

describe('¿Qué se hace? (opciones por tipo de servicio)', () => {
  it('cauchos trae cambio, reparación y caucho espichado', () => {
    expect(trabajosDe('cauchos')).toEqual(expect.arrayContaining(['Cambio de caucho', 'Reparación de caucho', 'Caucho espichado']));
  });
  it('aceite trae el cambio de aceite', () => {
    expect(trabajosDe('aceite')).toContain('Cambio de aceite de motor');
  });
  it('todos los tipos salvo «Otro» tienen opciones', () => {
    for (const s of SERVICIOS) expect(trabajosDe(s.id).length > 0).toBe(s.id !== 'otro');
  });
  it('sin tipo no hay opciones', () => {
    expect(trabajosDe(null)).toEqual([]);
  });
  it('la etiqueta suma lo marcado al tipo', () => {
    expect(etiquetaServicio('cauchos', ['Caucho espichado'])).toBe('Cauchos / neumáticos: Caucho espichado');
    expect(etiquetaServicio('cauchos', [])).toBe('Cauchos / neumáticos');
  });
});
