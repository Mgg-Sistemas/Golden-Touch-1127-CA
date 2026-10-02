import { describe, it, expect } from 'vitest';
import { RUTA_TELEFONO, VISTAS_TELEFONO, inicioTelefono, normalizarVistas, vistasPermitidas } from './vistasTelefono';
import type { ModuleKey } from '@/modules/usuarios/permisos.repository';

const conModulos = (...mods: ModuleKey[]) => (m: ModuleKey) => mods.includes(m);
const claves = (vs: { key: string }[]) => vs.map((v) => v.key);

describe('vistasPermitidas · pantalla dada Y lectura en su módulo', () => {
  it('un rol con surtidor y comidas, y los dos módulos, ve las dos', () => {
    expect(claves(vistasPermitidas(['surtidor', 'comidas'], conModulos('combustible', 'cocina'), false)))
      .toEqual(['surtidor', 'comidas']);
  });

  it('sin lectura en el módulo, la pantalla no se abre aunque esté dada', () => {
    expect(claves(vistasPermitidas(['surtidor', 'comidas'], conModulos('cocina'), false))).toEqual(['comidas']);
  });

  it('con el módulo pero sin la pantalla, tampoco', () => {
    expect(claves(vistasPermitidas(['comidas'], conModulos('combustible', 'cocina'), false))).toEqual(['comidas']);
    expect(vistasPermitidas([], conModulos('combustible', 'cocina'), false)).toEqual([]);
  });

  it('el administrador las tiene todas', () => {
    expect(vistasPermitidas([], conModulos(), true)).toEqual(VISTAS_TELEFONO);
  });
});

describe('inicioTelefono · adónde entra un rol solo teléfono', () => {
  it('con una sola pantalla, directo a ella', () => {
    const [surtidor] = VISTAS_TELEFONO;
    expect(inicioTelefono([surtidor])).toBe('/app/combustible/surtidor');
  });

  it('con varias, o con ninguna, al menú de pantallas', () => {
    expect(inicioTelefono(VISTAS_TELEFONO)).toBe(RUTA_TELEFONO);
    expect(inicioTelefono([])).toBe(RUTA_TELEFONO);
  });
});

describe('normalizarVistas', () => {
  it('deja solo claves conocidas, sin repetir', () => {
    expect(normalizarVistas(['comidas', 'geodesta', 'comidas', 3, null])).toEqual(['comidas']);
  });

  it('lo que no es una lista queda vacío', () => {
    expect(normalizarVistas(null)).toEqual([]);
    expect(normalizarVistas('surtidor')).toEqual([]);
  });
});
