import { describe, it, expect } from 'vitest';
import { MODULES, defaultsFor, normalizeRolePermisos, type ModuleKey, type RolePermisos } from './permisos.repository';

const LECTURA_ESCRITURA = { lectura: true, escritura: true, full: false };
const NADA = { lectura: false, escritura: false, full: false };

describe('MODULES · Solicitud de Pedido y Compras (31/10/2026)', () => {
  const claves = MODULES.map((m) => m.key);

  it('trae los dos permisos nuevos, junto al viejo `pedidos` y en ese orden', () => {
    const i = claves.indexOf('solicitud_pedido');
    expect(i).toBeGreaterThan(-1);
    expect(claves.slice(i, i + 3)).toEqual(['solicitud_pedido', 'compras', 'pedidos']);
    expect(MODULES[i].label).toBe('Solicitud de Pedido');
    expect(MODULES[i + 1].label).toBe('Compras');
  });

  it('el viejo `pedidos` queda re-etiquetado como base y explica que ya no decide Compras', () => {
    const base = MODULES.find((m) => m.key === 'pedidos')!;
    expect(base.label).toBe('Pedidos · base (pagos, recepción y retenciones)');
    expect(base.ayuda).toMatch(/Tesorería, Recepción e Impuestos/);
    expect(base.ayuda).toMatch(/ya no decide quién ve Compras/i);
  });

  it('no hay claves repetidas', () => {
    expect(new Set(claves).size).toBe(claves.length);
  });
});

describe('defaultsFor · permisos por defecto', () => {
  it('el admin tiene todo, incluidos los dos nuevos', () => {
    const p = defaultsFor('admin');
    for (const m of MODULES) expect(p[m.key]).toEqual({ lectura: true, escritura: true, full: true });
  });

  it.each(['analista', 'obrero', 'almacenista', 'analista_de_compras', 'rol_nuevo'])(
    '%s: Solicitud de Pedido sí (lectura y escritura); Compras no',
    (rol) => {
      const p = defaultsFor(rol);
      expect(p.solicitud_pedido).toEqual(LECTURA_ESCRITURA);
      expect(p.compras).toEqual(NADA);
    },
  );

  it('los defaults que ya existían no cambian (el analista y el obrero conservan `pedidos`)', () => {
    expect(defaultsFor('analista').pedidos).toEqual(LECTURA_ESCRITURA);
    expect(defaultsFor('obrero').pedidos).toEqual(LECTURA_ESCRITURA);
    expect(defaultsFor('rol_nuevo').pedidos).toEqual(NADA);
    expect(defaultsFor('rol_nuevo').dashboard).toEqual({ lectura: true, escritura: false, full: false });
  });
});

describe('normalizeRolePermisos · filas guardadas antes de los permisos nuevos', () => {
  const vieja = { dashboard: { lectura: true, escritura: false, full: false }, pedidos: NADA } as Partial<RolePermisos>;

  it('con rol: los módulos que faltan caen al default del rol', () => {
    const p = normalizeRolePermisos(vieja, 'obrero');
    expect(p.solicitud_pedido).toEqual(LECTURA_ESCRITURA);
    expect(p.compras).toEqual(NADA);
    expect(p.pedidos).toEqual(NADA); // lo guardado manda
  });

  it('lo guardado en la base manda sobre el default', () => {
    const guardada = { ...vieja, compras: { lectura: true, escritura: true, full: true }, solicitud_pedido: NADA } as Partial<RolePermisos>;
    const p = normalizeRolePermisos(guardada, 'obrero');
    expect(p.compras.full).toBe(true);
    expect(p.solicitud_pedido).toEqual(NADA);
  });

  it('devuelve todas las claves de MODULES', () => {
    const p = normalizeRolePermisos({}, 'obrero');
    expect(Object.keys(p).sort()).toEqual(MODULES.map((m) => m.key as ModuleKey).sort());
  });
});
