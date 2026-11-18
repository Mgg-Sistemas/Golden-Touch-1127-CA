import { describe, expect, it } from 'vitest';
import { conCategoria, crearPreferenciasOrbita, PREFIJO_ORBITA, PREFIJO_ORBITA_DEMO, type Almacen } from './orbitaPreferencias';

function memoria(inicial: Record<string, string> = {}): Almacen & { datos: Record<string, string> } {
  const datos = { ...inicial };
  return { datos, getItem: (k) => (k in datos ? datos[k] : null), setItem: (k, v) => { datos[k] = v; }, removeItem: (k) => { delete datos[k]; } };
}
const roto: Almacen = {
  getItem: () => { throw new Error('modo privado'); },
  setItem: () => { throw new Error('cuota'); },
  removeItem: () => { throw new Error('modo privado'); },
};

describe('preferencias de la Órbita', () => {
  it('sin nada guardado: categorías null, sin traspasos, cuadrícula y mapa', () => {
    const p = crearPreferenciasOrbita(PREFIJO_ORBITA, memoria());
    expect(p.leerCategorias()).toBeNull();
    expect(p.leerTraspasos()).toEqual([]);
    expect(p.leerVista()).toBe('cards');
    expect(p.leerEntrada()).toBe('mindmap');
  });

  it('la demo y lo real no se mezclan: cada uno con su prefijo', () => {
    const m = memoria();
    crearPreferenciasOrbita(PREFIJO_ORBITA_DEMO, m).guardarCategorias({ e1: 'propio' });
    expect(crearPreferenciasOrbita(PREFIJO_ORBITA, m).leerCategorias()).toBeNull();
    expect(Object.keys(m.datos)).toEqual([`${PREFIJO_ORBITA_DEMO}categorias`]);
  });

  it('una categoría que no existe descarta el valor entero', () => {
    const p = crearPreferenciasOrbita(PREFIJO_ORBITA, memoria({ [`${PREFIJO_ORBITA}categorias`]: '{"e1":"propio","e2":"robado"}' }));
    expect(p.leerCategorias()).toEqual({});
  });

  it('sin localStorage (o si falla) no rompe', () => {
    for (const a of [null, roto]) {
      const p = crearPreferenciasOrbita(PREFIJO_ORBITA, a);
      expect(() => p.guardarVista('tabla')).not.toThrow();
      expect(p.leerVista()).toBe('cards');
      expect(p.leerCategorias()).toBeNull();
    }
  });

  it('asignar y quitar la categoría de un equipo, sin tocar el original', () => {
    const a = { e1: 'propio' as const };
    const b = conCategoria(a, 'e2', 'alquilado');
    expect(b).toEqual({ e1: 'propio', e2: 'alquilado' });
    expect(conCategoria(b, 'e1', 'por_asignar')).toEqual({ e2: 'alquilado' });
    expect(a).toEqual({ e1: 'propio' });
  });
});
