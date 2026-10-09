import { describe, expect, it } from 'vitest';
import type { Personal } from '@/shared/lib/types';
import {
  cargosFaltantes, claveCargo, conteoPorCargo, errorTabulador, etiquetaRango, filtrarHistorialSalarial,
  normalizarCargo, planAplicarTabulador, type FilaHistorialSalarial,
} from './tabulador';

const p = (id: string, cargo: string, sueldo: number, extra: Partial<Personal> = {}): Personal =>
  ({ id, nombre: id, apellido: '', cargo, sueldo_base: sueldo, activo: true, empresa: 'GT', ...extra }) as Personal;

describe('cargos', () => {
  it('normaliza espacios y mayúsculas', () => {
    expect(normalizarCargo('  operador   mixto ')).toBe('OPERADOR MIXTO');
  });
  it('compara sin tildes', () => {
    expect(claveCargo('Geólogo ')).toBe(claveCargo('GEOLOGO'));
    expect(claveCargo('topógrafo')).toBe('TOPOGRAFO');
  });
});

describe('errorTabulador', () => {
  const existentes = [{ id: 'a', cargo: 'GEÓLOGO' }];
  it('pide cargo y monto', () => {
    expect(errorTabulador('  ', 10, [])).toMatch(/cargo/);
    expect(errorTabulador('X', null, [])).toMatch(/monto/);
    expect(errorTabulador('X', -1, [])).toMatch(/negativo/);
  });
  it('no deja duplicar un cargo, aunque cambie la tilde', () => {
    expect(errorTabulador('geologo', 900, existentes)).toMatch(/ya está/);
  });
  it('al editar el mismo renglón no es duplicado', () => {
    expect(errorTabulador('Geólogo', 900, existentes, 'a')).toBeNull();
  });
});

describe('planAplicarTabulador', () => {
  const tab = [
    { empresa: 'GT' as const, cargo: 'MOLINERO', monto: 320 },
    { empresa: 'GT' as const, cargo: 'GEÓLOGO', monto: 1000 },
    { empresa: 'MTO' as const, cargo: 'MOLINERO', monto: 999 },
  ];
  const gente = [
    p('a', 'Molinero', 300),
    p('b', 'MOLINERO', 320),
    p('c', 'GEOLOGO', 900),
    p('d', 'SOLDADOR', 400),
    p('e', 'MOLINERO', 300, { activo: false }),
    p('f', 'MOLINERO', 300, { empresa: 'MTO' }),
  ];
  const plan = planAplicarTabulador(gente, tab, 'GT');
  it('solo activos de la nómina, de cuánto a cuánto', () => {
    expect(plan.cambios.map((c) => [c.persona.id, c.antes, c.despues])).toEqual([
      ['c', 900, 1000],
      ['a', 300, 320],
    ]);
  });
  it('separa los que ya están al día y los cargos sin tabulador', () => {
    expect(plan.alDia.map((x) => x.id)).toEqual(['b']);
    expect(plan.sinTabulador.map((x) => x.id)).toEqual(['d']);
  });
  it('MTO usa su propio tabulador', () => {
    const mto = planAplicarTabulador(gente, tab, 'MTO');
    expect(mto.cambios.map((c) => [c.persona.id, c.despues])).toEqual([['f', 999]]);
  });
  it('compara con dos decimales (no cambia por centavos de redondeo)', () => {
    const r = planAplicarTabulador([p('x', 'MOLINERO', 320.004)], tab, 'GT');
    expect(r.cambios).toHaveLength(0);
  });
});

describe('conteo y faltantes', () => {
  const gente = [p('a', 'Molinero', 300), p('b', 'MOLINERO', 320), p('c', 'SOLDADOR', 400), p('d', 'PINTOR', 1, { activo: false })];
  it('cuenta activos por cargo', () => {
    expect(conteoPorCargo(gente, 'GT').get('MOLINERO')).toEqual({ activos: 2, sueldos: [300, 320] });
  });
  it('sugiere los cargos de activos que faltan', () => {
    expect(cargosFaltantes(gente, [{ cargo: 'molinero' }], 'GT')).toEqual(['SOLDADOR']);
  });
});

describe('histórico salarial general', () => {
  const fila = (id: string, persona: string, empresa: 'GT' | 'MTO', fecha: string): FilaHistorialSalarial => ({
    id, personal_id: persona, sueldo_anterior: 1, sueldo_nuevo: 2, motivo: 'x', fecha, created_at: fecha,
    persona: { id: persona, nombre: persona, apellido: '', empresa, cedula: null, cargo: null, ficha_nro: null, activo: true },
  });
  const filas = [
    fila('1', 'Zoe', 'GT', '2026-09-01'),
    fila('2', 'Ana', 'GT', '2026-10-05'),
    fila('3', 'Ana', 'GT', '2026-08-01'),
    fila('4', 'Luis', 'MTO', '2026-10-01'),
  ];
  it('filtra por empresa y rango, ordena por persona y fecha', () => {
    expect(filtrarHistorialSalarial(filas, { empresa: 'GT', desde: '2026-08-15' }).map((r) => r.id)).toEqual(['2', '1']);
    expect(filtrarHistorialSalarial(filas, { empresa: 'todas' }).map((r) => r.id)).toEqual(['3', '2', '4', '1']);
    expect(filtrarHistorialSalarial(filas, { hasta: '2026-09-30', personalId: 'Ana' }).map((r) => r.id)).toEqual(['3']);
  });
  it('etiqueta del rango', () => {
    expect(etiquetaRango('2026-10-01', '2026-10-09')).toBe('01/10/2026 al 09/10/2026');
    expect(etiquetaRango(null, null)).toBe('todo el histórico');
    expect(etiquetaRango('2026-10-01', '')).toBe('desde el 01/10/2026');
  });
});
