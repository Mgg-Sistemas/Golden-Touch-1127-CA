import { describe, it, expect } from 'vitest';
import {
  diasDesde, textoHace, ultimoLavado, tipoLavadoValido, accionesEquipo,
} from './flota';

describe('lavados', () => {
  const hoy = new Date(2026, 9, 9, 15, 30);
  it('días desde el último lavado (días de calendario)', () => {
    expect(diasDesde(new Date(2026, 9, 9, 7, 0), hoy)).toBe(0);
    expect(diasDesde(new Date(2026, 9, 8, 23, 59), hoy)).toBe(1);
    expect(diasDesde(new Date(2026, 8, 29, 10, 0), hoy)).toBe(10);
    expect(diasDesde(null, hoy)).toBeNull();
    expect(diasDesde('no es fecha', hoy)).toBeNull();
  });
  it('una fecha futura no da días negativos', () => {
    expect(diasDesde(new Date(2026, 9, 12), hoy)).toBe(0);
  });
  it('texto «hace N días»', () => {
    expect(textoHace(0)).toBe('hoy');
    expect(textoHace(1)).toBe('ayer');
    expect(textoHace(7)).toBe('hace 7 días');
    expect(textoHace(null)).toBe('sin registro');
  });
  it('el último lavado es el de fecha más reciente, venga en el orden que venga', () => {
    const l = [{ fecha: '2026-10-01T10:00:00Z' }, { fecha: '2026-10-08T09:00:00Z' }, { fecha: '2026-09-20T09:00:00Z' }];
    expect(ultimoLavado(l)?.fecha).toBe('2026-10-08T09:00:00Z');
    expect(ultimoLavado([])).toBeNull();
  });
  it('tipo: de la lista o escrito, mínimo 3 letras', () => {
    expect(tipoLavadoValido('Completo')).toBe(true);
    expect(tipoLavadoValido('Tolva y balde')).toBe(true);
    expect(tipoLavadoValido(' x ')).toBe(false);
    expect(tipoLavadoValido(null)).toBe(false);
  });
  it('registrar lavado: solo con escritura en Maquinaria y si no está retirado', () => {
    expect(accionesEquipo({ maquinaria: true, combustible: false }, 'operativa')).toContain('lavado');
    expect(accionesEquipo({ maquinaria: true, combustible: false }, 'taller')).toContain('lavado');
    expect(accionesEquipo({ maquinaria: false, combustible: true }, 'operativa')).not.toContain('lavado');
    expect(accionesEquipo({ maquinaria: true, combustible: true }, 'retirada')).not.toContain('lavado');
  });
});
