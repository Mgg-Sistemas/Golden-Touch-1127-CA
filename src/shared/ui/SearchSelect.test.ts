import { describe, it, expect } from 'vitest';
import { cabeceraDeGrupo, filtrarOpciones, type SearchOption } from './SearchSelect';

describe('cabeceras de grupo del desplegable', () => {
  const opts: SearchOption[] = [
    { value: 'a', label: 'L220G', group: 'Maquinaria y Equipos', groupIcon: '🚜' },
    { value: 'b', label: 'EC240', group: 'Maquinaria y Equipos', groupIcon: '🚜' },
    { value: 'c', label: 'HILUX', group: 'Vehículos', groupIcon: '🚚' },
    { value: 'd', label: 'BIDÓN', group: 'Bidones' },
  ];
  it('la cabecera va solo antes de la primera opción de cada grupo', () => {
    expect(cabeceraDeGrupo(opts, 0)).toEqual({ group: 'Maquinaria y Equipos', icon: '🚜' });
    expect(cabeceraDeGrupo(opts, 1)).toBeNull();
    expect(cabeceraDeGrupo(opts, 2)).toEqual({ group: 'Vehículos', icon: '🚚' });
    expect(cabeceraDeGrupo(opts, 3)).toEqual({ group: 'Bidones', icon: undefined });
  });
  it('sin grupo no hay cabecera (las listas de siempre siguen igual)', () => {
    const sin: SearchOption[] = [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }];
    expect(cabeceraDeGrupo(sin, 0)).toBeNull();
    expect(cabeceraDeGrupo(sin, 1)).toBeNull();
    expect(cabeceraDeGrupo(sin, 9)).toBeNull();
  });
  it('al filtrar, la cabecera sigue saliendo sobre lo que quedó visible', () => {
    const visibles = filtrarOpciones(opts, 'ec240').map((c) => c.opcion);
    expect(visibles.map((o) => o.value)).toEqual(['b']);
    expect(cabeceraDeGrupo(visibles, 0)?.group).toBe('Maquinaria y Equipos');
  });
  it('el grupo no se busca: «vehiculos» no encuentra la HILUX por el grupo', () => {
    expect(filtrarOpciones(opts, 'vehiculos')).toEqual([]);
  });
});
