import { describe, it, expect } from 'vitest';
import {
  conNivelAlmacen,
  esAlmacenGeneral,
  normalizarPermisosAlmacenes,
  puedeEscribirAlmacen,
  puedeVerAlmacen,
  type ContextoAlmacen,
} from './permisosAlmacen';

const ctx = (over: Partial<ContextoAlmacen> = {}): ContextoAlmacen => ({
  isAdmin: false,
  almacenes: {},
  inventario: { lectura: false, escritura: false },
  ...over,
});

describe('normalizarPermisosAlmacenes', () => {
  it('deja solo lectura/escritura con nombre', () => {
    expect(normalizarPermisosAlmacenes({
      'Depósito Mina': 'escritura', 'Depósito Reutilizables': 'lectura', 'Depósito Items Dañados': 'full', '  ': 'lectura',
    })).toEqual({ 'Depósito Mina': 'escritura', 'Depósito Reutilizables': 'lectura' });
  });
  it('el General no va en el mapa (lo da el módulo Inventario)', () => {
    expect(normalizarPermisosAlmacenes({ General: 'escritura' })).toEqual({});
  });
  it('lo que no es un objeto (columna aún sin crear, null, lista) queda vacío', () => {
    expect(normalizarPermisosAlmacenes(undefined)).toEqual({});
    expect(normalizarPermisosAlmacenes(null)).toEqual({});
    expect(normalizarPermisosAlmacenes(['Depósito Mina'])).toEqual({});
  });
});

describe('puedeVerAlmacen / puedeEscribirAlmacen', () => {
  it('sin clave en el mapa = sin acceso', () => {
    expect(puedeVerAlmacen('Depósito Mina', ctx())).toBe(false);
    expect(puedeEscribirAlmacen('Depósito Mina', ctx())).toBe(false);
  });
  it('el módulo Inventario NO da los depósitos', () => {
    const c = ctx({ inventario: { lectura: true, escritura: true } });
    expect(puedeVerAlmacen('Depósito Mina', c)).toBe(false);
    expect(puedeVerAlmacen('Depósito Reutilizables', c)).toBe(false);
  });
  it('lectura ve pero no carga; escritura hace las dos', () => {
    const c = ctx({ almacenes: { 'Depósito Mina': 'lectura', 'Depósito Reutilizables': 'escritura' } });
    expect(puedeVerAlmacen('Depósito Mina', c)).toBe(true);
    expect(puedeEscribirAlmacen('Depósito Mina', c)).toBe(false);
    expect(puedeVerAlmacen('Depósito Reutilizables', c)).toBe(true);
    expect(puedeEscribirAlmacen('Depósito Reutilizables', c)).toBe(true);
    expect(puedeVerAlmacen('Depósito Items Dañados', c)).toBe(false);
  });
  it('el General (o vacío) sigue el módulo Inventario', () => {
    const lector = ctx({ inventario: { lectura: true, escritura: false } });
    expect(puedeVerAlmacen('General', lector)).toBe(true);
    expect(puedeVerAlmacen('', lector)).toBe(true);
    expect(puedeVerAlmacen(null, lector)).toBe(true);
    expect(puedeEscribirAlmacen('General', lector)).toBe(false);
    const soloMina = ctx({ almacenes: { 'Depósito Mina': 'escritura' } });
    expect(puedeVerAlmacen('General', soloMina)).toBe(false);
  });
  it('el administrador ve y carga en todos', () => {
    const a = ctx({ isAdmin: true });
    expect(puedeVerAlmacen('Depósito Mina', a)).toBe(true);
    expect(puedeEscribirAlmacen('Cualquier depósito nuevo', a)).toBe(true);
    expect(puedeEscribirAlmacen('General', a)).toBe(true);
  });
});

describe('esAlmacenGeneral', () => {
  it('General y vacío son el General; los depósitos no', () => {
    expect(esAlmacenGeneral('General')).toBe(true);
    expect(esAlmacenGeneral(' ')).toBe(true);
    expect(esAlmacenGeneral('Depósito Mina')).toBe(false);
  });
});

describe('conNivelAlmacen · editor de roles', () => {
  it('pone, cambia y quita el nivel sin tocar el original', () => {
    const base = { 'Depósito Mina': 'lectura' as const };
    const sube = conNivelAlmacen(base, 'Depósito Mina', 'escritura');
    expect(sube).toEqual({ 'Depósito Mina': 'escritura' });
    expect(base).toEqual({ 'Depósito Mina': 'lectura' });
    expect(conNivelAlmacen(sube, 'Depósito Reutilizables', 'lectura'))
      .toEqual({ 'Depósito Mina': 'escritura', 'Depósito Reutilizables': 'lectura' });
    expect(conNivelAlmacen(sube, 'Depósito Mina', 'sin')).toEqual({});
  });
});
