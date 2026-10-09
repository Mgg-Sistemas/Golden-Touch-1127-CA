import { describe, it, expect } from 'vitest';
import { aplicarA, coincideTrabajador, enPapelera, nominaCerrada, quincenaAbierta } from './nominaReglas';

describe('nominaCerrada / enPapelera', () => {
  it('cerrada solo si está pagada completa', () => {
    expect(nominaCerrada({ estado: 'pagada' })).toBe(true);
    expect(nominaCerrada({ estado: 'en_pago' })).toBe(false);
    expect(nominaCerrada({ estado: 'cargada' })).toBe(false);
  });
  it('papelera por la fecha de eliminación', () => {
    expect(enPapelera({ eliminado_en: '2026-10-09T10:00:00Z' })).toBe(true);
    expect(enPapelera({ eliminado_en: null })).toBe(false);
    expect(enPapelera({})).toBe(false);
  });
});

describe('quincenaAbierta', () => {
  const base = { tipo: 'quincena', eliminado_en: null };
  it('devuelve la quincena pendiente de la misma empresa', () => {
    const ps = [
      { ...base, codigo: 'NOM-1', empresa: 'GT', estado: 'pagada', created_at: '2026-09-01' },
      { ...base, codigo: 'NOM-2', empresa: 'GT', estado: 'en_pago', created_at: '2026-09-16' },
      { ...base, codigo: 'NOM-MTO-1', empresa: 'MTO', estado: 'cargada', created_at: '2026-09-16' },
    ];
    expect(quincenaAbierta(ps, 'GT')?.codigo).toBe('NOM-2');
    expect(quincenaAbierta(ps, 'MTO')?.codigo).toBe('NOM-MTO-1');
  });
  it('no cuentan las cerradas, las de la papelera ni vacaciones/liquidaciones', () => {
    const ps = [
      { ...base, codigo: 'A', empresa: 'GT', estado: 'pagada' },
      { ...base, codigo: 'B', empresa: 'GT', estado: 'cargada', eliminado_en: '2026-10-01' },
      { codigo: 'C', empresa: 'GT', tipo: 'vacaciones', estado: 'cargada' },
      { codigo: 'D', empresa: 'GT', tipo: 'liquidacion', estado: 'cargada' },
    ];
    expect(quincenaAbierta(ps, 'GT')).toBeNull();
  });
  it('si hay varias abiertas devuelve la más antigua', () => {
    const ps = [
      { ...base, codigo: 'NUEVA', empresa: 'GT', estado: 'cargada', created_at: '2026-10-01' },
      { ...base, codigo: 'VIEJA', empresa: 'GT', estado: 'cargada', created_at: '2026-09-01' },
    ];
    expect(quincenaAbierta(ps, 'GT')?.codigo).toBe('VIEJA');
  });
});

describe('coincideTrabajador', () => {
  const p = { nombre: 'María José', apellido: 'Núñez', cedula: 'V-12.345.678', cargo: 'Operador de Maquinaria', departamento: 'Mina' };
  it('vacío no filtra', () => { expect(coincideTrabajador(p, '  ')).toBe(true); });
  it('sin acentos ni mayúsculas', () => {
    expect(coincideTrabajador(p, 'maria')).toBe(true);
    expect(coincideTrabajador(p, 'NUNEZ')).toBe(true);
  });
  it('por cédula con o sin puntos', () => {
    expect(coincideTrabajador(p, '12345678')).toBe(true);
    expect(coincideTrabajador(p, '12.345')).toBe(true);
  });
  it('por cargo y departamento, varias palabras', () => {
    expect(coincideTrabajador(p, 'operador mina')).toBe(true);
    expect(coincideTrabajador(p, 'maria cocina')).toBe(false);
  });
});

describe('aplicarA', () => {
  it('cambia solo las filas indicadas', () => {
    const filas = [{ id: 'a', on: false }, { id: 'b', on: false }, { id: 'c', on: false }];
    const r = aplicarA(filas, new Set(['a', 'c']), (f) => f.id, (f) => ({ ...f, on: true }));
    expect(r.map((f) => f.on)).toEqual([true, false, true]);
    expect(r[1]).toBe(filas[1]);
  });
});
