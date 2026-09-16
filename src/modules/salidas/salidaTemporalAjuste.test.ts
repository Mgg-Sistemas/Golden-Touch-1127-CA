import { describe, expect, it } from 'vitest';
import type { ItemSalidaTemporal } from '@/shared/lib/types';
import { ajustesPorEdicion, duracionEntre, efectosInventario, faltantesDeStock } from './salidaTemporalAjuste';

const it_ = (producto_id: string, cantidad: number, extra: Partial<ItemSalidaTemporal> = {}): ItemSalidaTemporal => ({
  producto_id, producto_nombre: producto_id.toUpperCase(), cantidad, almacen: 'General', es_nuevo: false, ...extra,
});

describe('efectosInventario', () => {
  it('pendiente no movió nada', () => {
    expect(efectosInventario([it_('a', 2)], 'pendiente').size).toBe(0);
  });
  it('en tránsito: sale lo existente, el material nuevo no', () => {
    const e = efectosInventario([it_('a', 2), it_('n', 1, { es_nuevo: true })], 'en_transito');
    expect(e.get('a|General')).toMatchObject({ salida: 2, retorno: 0 });
    expect(e.has('n|General')).toBe(false);
  });
  it('finalizada: lo existente sale y retorna; el nuevo solo retorna', () => {
    const e = efectosInventario([it_('a', 2), it_('n', 1, { es_nuevo: true })], 'finalizada');
    expect(e.get('a|General')).toMatchObject({ salida: 2, retorno: 2 });
    expect(e.get('n|General')).toMatchObject({ salida: 0, retorno: 1 });
  });
});

describe('ajustesPorEdicion', () => {
  it('sin cambios no hay movimientos', () => {
    const items = [it_('a', 2)];
    expect(ajustesPorEdicion(efectosInventario(items, 'en_transito'), efectosInventario(items, 'en_transito'))).toEqual([]);
  });
  it('en tránsito: subir la cantidad saca la diferencia; bajarla la devuelve', () => {
    const antes = efectosInventario([it_('a', 2)], 'en_transito');
    expect(ajustesPorEdicion(antes, efectosInventario([it_('a', 5)], 'en_transito')))
      .toEqual([{ producto_id: 'a', almacen: 'General', nombre: 'A', tramo: 'salida', delta: -3 }]);
    expect(ajustesPorEdicion(antes, efectosInventario([it_('a', 1)], 'en_transito')))
      .toEqual([{ producto_id: 'a', almacen: 'General', nombre: 'A', tramo: 'salida', delta: 1 }]);
  });
  it('en tránsito: cambiar de material devuelve el viejo antes de sacar el nuevo', () => {
    const aj = ajustesPorEdicion(efectosInventario([it_('a', 2)], 'en_transito'), efectosInventario([it_('b', 2)], 'en_transito'));
    expect(aj.map((x) => [x.producto_id, x.delta])).toEqual([['a', 2], ['b', -2]]);
  });
  it('finalizada: cambiar la cantidad corrige los dos tramos y el stock neto no cambia', () => {
    const aj = ajustesPorEdicion(efectosInventario([it_('a', 2)], 'finalizada'), efectosInventario([it_('a', 4)], 'finalizada'));
    expect(aj.map((x) => [x.tramo, x.delta])).toEqual([['retorno', 2], ['salida', -2]]);
    expect(faltantesDeStock(aj)).toEqual([]);
  });
  it('finalizada: bajar un material nuevo saca stock y lo marca como faltante a validar', () => {
    const n = { es_nuevo: true };
    const aj = ajustesPorEdicion(efectosInventario([it_('n', 3, n)], 'finalizada'), efectosInventario([it_('n', 1, n)], 'finalizada'));
    expect(aj).toEqual([{ producto_id: 'n', almacen: 'General', nombre: 'N', tramo: 'retorno', delta: -2 }]);
    expect(faltantesDeStock(aj)).toMatchObject([{ producto_id: 'n', salida: 2 }]);
  });
});

describe('duracionEntre', () => {
  it('minutos entre salida y retorno, nunca negativo', () => {
    expect(duracionEntre('2026-09-16T10:00:00Z', '2026-09-16T11:45:00Z')).toBe(105);
    expect(duracionEntre('2026-09-16T12:00:00Z', '2026-09-16T11:00:00Z')).toBe(0);
    expect(duracionEntre(null, '2026-09-16T11:00:00Z')).toBe(0);
  });
});
