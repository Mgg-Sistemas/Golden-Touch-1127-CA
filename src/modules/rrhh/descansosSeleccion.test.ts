import { describe, expect, it } from 'vitest';
import { seleccionInicialPlan } from './descansosPlan';

describe('seleccionInicialPlan · con qué abre «Generar plan»', () => {
  it('sin selección guardada abre con todos', () => {
    expect([...seleccionInicialPlan([], ['a', 'b', 'c'])]).toEqual(['a', 'b', 'c']);
  });
  it('con selección guardada abre con ella', () => {
    expect([...seleccionInicialPlan(['b', 'c'], ['a', 'b', 'c'])]).toEqual(['b', 'c']);
  });
  it('omite a los que ya no están en la nómina', () => {
    expect([...seleccionInicialPlan(['b', 'zz'], ['a', 'b', 'c'])]).toEqual(['b']);
  });
  it('si ninguno de los guardados sigue activo, vuelve a todos', () => {
    expect([...seleccionInicialPlan(['x', 'y'], ['a', 'b'])]).toEqual(['a', 'b']);
  });
});
