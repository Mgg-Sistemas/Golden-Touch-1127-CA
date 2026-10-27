import { describe, expect, it } from 'vitest';
import {
  normalizarUbicacion,
  UBICACION_UNIFICADA_GT,
  agruparEquipos,
  CAMPOS_EQUIPO,
} from './exportarEquipos';
import type { MaquinariaEquipo } from './maquinariaEquipos.repository';

describe('exportarEquipos · normalizarUbicacion y unificación Peramanal/Golden Touch', () => {
  it('unifica "GT Peramanal", "GT PERAMANAL" y "MINA GOLDEN TOUCH" en la misma denominación', () => {
    expect(normalizarUbicacion('GT Peramanal')).toBe(UBICACION_UNIFICADA_GT);
    expect(normalizarUbicacion('GT PERAMANAL')).toBe(UBICACION_UNIFICADA_GT);
    expect(normalizarUbicacion('MINA GOLDEN TOUCH')).toBe(UBICACION_UNIFICADA_GT);
    expect(normalizarUbicacion('Peramanal')).toBe(UBICACION_UNIFICADA_GT);
    expect(normalizarUbicacion('Mina Peramanal')).toBe(UBICACION_UNIFICADA_GT);
    expect(normalizarUbicacion('Golden Touch')).toBe(UBICACION_UNIFICADA_GT);
  });

  it('mantiene y normaliza en mayúsculas otras ubicaciones sin duplicados por casing', () => {
    expect(normalizarUbicacion('La Guaira')).toBe('LA GUAIRA');
    expect(normalizarUbicacion('la guaira')).toBe('LA GUAIRA');
    expect(normalizarUbicacion('METAL FÉNIX')).toBe('METAL FÉNIX');
    expect(normalizarUbicacion('c.a. la esperanza')).toBe('C.A. LA ESPERANZA');
    expect(normalizarUbicacion('GLOBAL MINERAL TIN')).toBe('GLOBAL MINERAL TIN');
    expect(normalizarUbicacion(null)).toBe('');
    expect(normalizarUbicacion('')).toBe('');
  });

  it('agrupa por ubicación reuniendo todos los equipos de Peramanal y Golden Touch en una sola sección', () => {
    const eq1 = { id: '1', equipo: 'Excavadora 1', ubicacion: 'GT Peramanal' } as MaquinariaEquipo;
    const eq2 = { id: '2', equipo: 'Camión 1', ubicacion: 'MINA GOLDEN TOUCH' } as MaquinariaEquipo;
    const eq3 = { id: '3', equipo: 'Planta 1', ubicacion: 'GT PERAMANAL' } as MaquinariaEquipo;
    const eq4 = { id: '4', equipo: 'Tractor 1', ubicacion: 'LA GUAIRA' } as MaquinariaEquipo;
    const eq5 = { id: '5', equipo: 'Moto 1', ubicacion: null } as MaquinariaEquipo;

    const grupos = agruparEquipos([eq1, eq2, eq3, eq4, eq5], 'ubicacion');

    expect(grupos.has(UBICACION_UNIFICADA_GT)).toBe(true);
    expect(grupos.get(UBICACION_UNIFICADA_GT)?.length).toBe(3);
    expect(grupos.get(UBICACION_UNIFICADA_GT)?.map((x) => x.id)).toEqual(['1', '2', '3']);

    expect(grupos.has('LA GUAIRA')).toBe(true);
    expect(grupos.get('LA GUAIRA')?.length).toBe(1);

    expect(grupos.has('SIN UBICACIÓN ASIGNADA')).toBe(true);
    expect(grupos.get('SIN UBICACIÓN ASIGNADA')?.length).toBe(1);
  });

  it('el campo Ubicación/Garaje en la tabla exportada devuelve la ubicación unificada', () => {
    const campoUbicacion = CAMPOS_EQUIPO.find((c) => c.clave === 'ubicacion');
    expect(campoUbicacion).toBeDefined();

    const eq = { id: '1', equipo: 'D6', ubicacion: 'GT Peramanal' } as MaquinariaEquipo;
    expect(campoUbicacion?.valor(eq)).toBe(UBICACION_UNIFICADA_GT);
  });
});
