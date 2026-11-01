import { describe, it, expect } from 'vitest';
import { empresaPorDefecto } from './empresaActual';
import type { EmpresaReceptora } from './empresasReceptoras.repository';

/** Fábrica mínima: solo los campos que mira empresaPorDefecto. */
function emp(over: Partial<EmpresaReceptora> & { id: string }): EmpresaReceptora {
  return {
    clave: over.clave ?? over.id, nombre: over.id, rif: 'J-0', colorBadge: '#000',
    activo: true, orden: 1, ...over,
  } as EmpresaReceptora;
}

describe('empresaPorDefecto', () => {
  it('null si no hay empresas', () => {
    expect(empresaPorDefecto([], 'x')).toBeNull();
  });

  it('respeta la guardada si sigue activa', () => {
    const lista = [emp({ id: 'a', clave: 'empresa-golden-touch' }), emp({ id: 'b' })];
    expect(empresaPorDefecto(lista, 'b')).toBe('b');
  });

  it('ignora la guardada si ya no existe y cae en GT', () => {
    const lista = [emp({ id: 'a' }), emp({ id: 'gt', clave: 'empresa-golden-touch' })];
    expect(empresaPorDefecto(lista, 'zzz')).toBe('gt');
  });

  it('ignora la guardada si está inactiva', () => {
    const lista = [emp({ id: 'a' }), emp({ id: 'b', activo: false })];
    expect(empresaPorDefecto(lista, 'b')).toBe('a');
  });

  it('sin guardada ni GT, toma la primera activa (ya vienen ordenadas)', () => {
    const lista = [emp({ id: 'uno' }), emp({ id: 'dos' })];
    expect(empresaPorDefecto(lista, null)).toBe('uno');
  });

  it('prefiere GT sobre la primera cuando no hay guardada', () => {
    const lista = [emp({ id: 'mto' }), emp({ id: 'gt', clave: 'empresa-golden-touch' })];
    expect(empresaPorDefecto(lista, null)).toBe('gt');
  });

  it('si todas están inactivas, igual elige una (no deja al módulo sin empresa)', () => {
    const lista = [emp({ id: 'a', activo: false }), emp({ id: 'b', activo: false })];
    expect(empresaPorDefecto(lista, null)).toBe('a');
  });
});
