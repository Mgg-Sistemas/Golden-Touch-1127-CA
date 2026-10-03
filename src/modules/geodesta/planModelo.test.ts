import { describe, expect, it } from 'vitest';
import {
  ESTADOS_PLAN, borradorDesdePlan, componerBusqPlan, errorPlan, etiquetaEstado, notaDeEstado, planVacio,
} from './planModelo';
import type { PlanificacionGeodesta } from '@/shared/lib/types';

describe('planVacio', () => {
  it('sin día arranca hoy, en los dos extremos', () => {
    const b = planVacio('2026-10-03');
    expect(b.desde).toBe('2026-10-03');
    expect(b.hasta).toBe('2026-10-03');
    expect(b.estado).toBe('planificada');
    expect(b.titulo).toBe('');
  });
  it('planificar desde un día del calendario deja ese día en los dos extremos', () => {
    const b = planVacio('2026-12-25');
    expect(b.desde).toBe('2026-12-25');
    expect(b.hasta).toBe('2026-12-25');
  });
});

describe('borradorDesdePlan', () => {
  const p: PlanificacionGeodesta = {
    id: 'p1', titulo: 'Muestreo bloque 3', desde: '2026-10-05', hasta: '2026-10-08',
    lugar: null, nota: null, estado: 'cumplida', estado_nota: null, creado_en: '',
  };
  it('los nulos se vuelven texto vacío: el formulario no muestra «null»', () => {
    const b = borradorDesdePlan(p);
    expect(b.lugar).toBe('');
    expect(b.nota).toBe('');
    expect(b.estado_nota).toBe('');
  });
  it('conserva lo guardado', () => {
    const b = borradorDesdePlan(p);
    expect(b.titulo).toBe('Muestreo bloque 3');
    expect(b.desde).toBe('2026-10-05');
    expect(b.hasta).toBe('2026-10-08');
    expect(b.estado).toBe('cumplida');
  });
  it('sin actividad es un alta en el día que se pase', () => {
    expect(borradorDesdePlan(null, '2026-10-09').desde).toBe('2026-10-09');
  });
});

describe('errorPlan', () => {
  const base = planVacio('2026-10-03');
  it('con título se puede guardar', () => {
    expect(errorPlan({ ...base, titulo: 'Muestreo' })).toBeNull();
  });
  it('sin título no se guarda', () => {
    expect(errorPlan(base)).toMatch(/t[íi]tulo/i);
    expect(errorPlan({ ...base, titulo: '   ' })).toMatch(/t[íi]tulo/i);
  });
  it('el final no puede ser anterior al inicio', () => {
    const e = errorPlan({ ...base, titulo: 'X', desde: '2026-10-05', hasta: '2026-10-01' });
    expect(e).toMatch(/termina|anterior|despu[ée]s/i);
  });
  it('un solo día es válido', () => {
    expect(errorPlan({ ...base, titulo: 'X', desde: '2026-10-05', hasta: '2026-10-05' })).toBeNull();
  });
  it('sin fechas no se guarda', () => {
    expect(errorPlan({ ...base, titulo: 'X', desde: '' })).toMatch(/fecha/i);
    expect(errorPlan({ ...base, titulo: 'X', hasta: '' })).toMatch(/fecha/i);
  });
});

describe('componerBusqPlan', () => {
  it('junta título, lugar y notas sin acentos ni mayúsculas', () => {
    const b = { ...planVacio('2026-10-03'), titulo: 'Exploración', lugar: 'Mina La Esperanza', nota: 'Con PERFORADORA' };
    const s = componerBusqPlan(b);
    expect(s).toContain('exploracion');
    expect(s).toContain('mina la esperanza');
    expect(s).toContain('con perforadora');
  });
});

describe('ESTADOS_PLAN y etiquetaEstado', () => {
  it('son los tres que acepta la base', () => {
    expect(ESTADOS_PLAN.map((e) => e.valor)).toEqual(['planificada', 'cumplida', 'no_se_hizo']);
  });
  it('cada estado tiene su etiqueta legible', () => {
    expect(etiquetaEstado('no_se_hizo')).toMatch(/no se hizo/i);
    expect(etiquetaEstado('planificada')).toBeTruthy();
  });
});

describe('notaDeEstado', () => {
  it('conserva el motivo (recortado) cuando no se hizo', () => {
    expect(notaDeEstado('no_se_hizo', '  Llovió  ')).toBe('Llovió');
  });
  it('lo descarta en cumplida y en planificada', () => {
    expect(notaDeEstado('cumplida', 'Llovió')).toBeNull();
    expect(notaDeEstado('planificada', 'Llovió')).toBeNull();
  });
  it('vacío, en blanco o ausente es null', () => {
    expect(notaDeEstado('no_se_hizo', '')).toBeNull();
    expect(notaDeEstado('no_se_hizo', '   ')).toBeNull();
    expect(notaDeEstado('no_se_hizo', null)).toBeNull();
    expect(notaDeEstado('no_se_hizo', undefined)).toBeNull();
  });
});
