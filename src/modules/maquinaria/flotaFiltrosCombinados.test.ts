import { describe, it, expect } from 'vitest';
import { normalizarUbicacion, UBICACION_UNIFICADA_GT } from './exportarEquipos';
import type { MaquinariaEquipo } from './maquinariaEquipos.repository';

const crearEq = (datos: Partial<MaquinariaEquipo>): MaquinariaEquipo => ({
  id: 'eq-default',
  equipo: 'EQUIPO',
  clase: 'maquinaria',
  tipo: 'EXCAVADORA',
  marca: 'CAT',
  modelo: '',
  serial: '',
  placa: '',
  propietario: '',
  ubicacion: '',
  status: 'OPERATIVO',
  activo: true,
  anio: null,
  color: null,
  motor_modelo: null,
  motor_serial: null,
  combustible_tipo: null,
  combustible_equipo: null,
  tanque_capacidad_l: null,
  tanque_origen: null,
  encargado_responsable: null,
  encargado_documento: null,
  encargado_telefono: null,
  mantenimiento_base_hrs: null,
  mantenimiento_cada_hrs: null,
  mantenimiento_base_km: null,
  mantenimiento_cada_km: null,
  estado_nota: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...datos,
} as MaquinariaEquipo);

describe('flotaFiltrosCombinados · Lógica de alternadores y filtros combinados', () => {
  const dummyEquipos: MaquinariaEquipo[] = [
    crearEq({
      id: 'eq-1',
      equipo: 'EXCAVADORA CAT 320D',
      clase: 'maquinaria',
      tipo: 'EXCAVADORA',
      marca: 'CATERPILLAR',
      modelo: '320D',
      serial: 'CAT320D001',
      propietario: 'GOLDEN TOUCH 1127 C.A.',
      ubicacion: 'GT PERAMANAL',
    }),
    crearEq({
      id: 'eq-2',
      equipo: 'CAMIÓN VOLTEO MACK',
      clase: 'vehiculo',
      tipo: 'CAMIÓN',
      marca: 'MACK',
      modelo: 'GRANITE',
      serial: 'MCK002',
      placa: 'A12BC3',
      propietario: 'RANCHO JHENZAEN C.A.',
      ubicacion: 'Mina Golden Touch',
    }),
    crearEq({
      id: 'eq-3',
      equipo: 'CAMIÓN CAVA NPR',
      clase: 'vehiculo',
      tipo: 'CAMIÓN CAVA',
      marca: 'CHEVROLET',
      modelo: 'NPR',
      serial: 'NPR003',
      placa: 'B45CD6',
      propietario: 'GOLDEN TOUCH 1127 C.A.',
      ubicacion: 'CAMPAMENTO LA ESPERANZA',
    }),
    crearEq({
      id: 'eq-4',
      equipo: 'MOTO YAMAHA 125',
      clase: 'moto',
      tipo: 'MOTO',
      marca: 'YAMAHA',
      modelo: 'XTZ 125',
      serial: 'YAM004',
      placa: 'MOTO01',
      propietario: 'GOLDEN TOUCH 1127 C.A.',
      ubicacion: '',
    }),
    crearEq({
      id: 'eq-5',
      equipo: 'GENERADOR CUMMINS 150KVA',
      clase: 'maquinaria',
      tipo: 'GENERADOR',
      marca: 'CUMMINS',
      modelo: '150KVA',
      serial: 'CUM005',
      propietario: '',
      ubicacion: 'Peramanal',
    }),
  ];

  it('normaliza ubicaciones agrupando Peramanal y Mina Golden Touch', () => {
    expect(normalizarUbicacion('GT PERAMANAL')).toBe(UBICACION_UNIFICADA_GT);
    expect(normalizarUbicacion('Mina Golden Touch')).toBe(UBICACION_UNIFICADA_GT);
    expect(normalizarUbicacion('CAMPAMENTO LA ESPERANZA')).toBe('CAMPAMENTO LA ESPERANZA');
    expect(normalizarUbicacion('')).toBe('');
    expect(normalizarUbicacion(null)).toBe('');
  });

  it('filtra por ubicación unificada y combinación con clase', () => {
    // Filtrar por MINA GOLDEN TOUCH / PERAMANAL
    const enMina = dummyEquipos.filter((e) => normalizarUbicacion(e.ubicacion) === UBICACION_UNIFICADA_GT);
    expect(enMina.map((e) => e.id)).toEqual(['eq-1', 'eq-2', 'eq-5']);

    // Filtrar por MINA GOLDEN TOUCH / PERAMANAL + Clase Vehículo
    const vehiculosEnMina = enMina.filter((e) => e.clase === 'vehiculo');
    expect(vehiculosEnMina.map((e) => e.id)).toEqual(['eq-2']);

    // Filtrar por equipos sin ubicación asignada
    const sinUbic = dummyEquipos.filter((e) => !normalizarUbicacion(e.ubicacion));
    expect(sinUbic.map((e) => e.id)).toEqual(['eq-4']);
  });

  it('filtra por propietario y equipos sin propietario asignado', () => {
    const deGT = dummyEquipos.filter((e) => (e.propietario ?? '').trim() === 'GOLDEN TOUCH 1127 C.A.');
    expect(deGT.map((e) => e.id)).toEqual(['eq-1', 'eq-3', 'eq-4']);

    const sinProp = dummyEquipos.filter((e) => !(e.propietario ?? '').trim());
    expect(sinProp.map((e) => e.id)).toEqual(['eq-5']);
  });

  it('combina clase + ubicación + propietario', () => {
    // Clase: vehiculo, Ubicación: CAMPAMENTO LA ESPERANZA, Propietario: GOLDEN TOUCH 1127 C.A.
    const resultado = dummyEquipos.filter((e) => {
      if (e.clase !== 'vehiculo') return false;
      if (normalizarUbicacion(e.ubicacion) !== 'CAMPAMENTO LA ESPERANZA') return false;
      if ((e.propietario ?? '').trim() !== 'GOLDEN TOUCH 1127 C.A.') return false;
      return true;
    });
    expect(resultado.map((e) => e.id)).toEqual(['eq-3']);
  });

  it('calcula conteos cruzados correctamente respetando la combinación', () => {
    // Si la clase activa es 'vehiculo', ¿cuántos hay por ubicación?
    const vehiculos = dummyEquipos.filter((e) => e.clase === 'vehiculo');
    const conteosUbic = new Map<string, number>();
    for (const v of vehiculos) {
      const u = normalizarUbicacion(v.ubicacion) || '__sin__';
      conteosUbic.set(u, (conteosUbic.get(u) ?? 0) + 1);
    }
    expect(conteosUbic.get(UBICACION_UNIFICADA_GT)).toBe(1);
    expect(conteosUbic.get('CAMPAMENTO LA ESPERANZA')).toBe(1);
    expect(conteosUbic.get('__sin__')).toBeUndefined();
  });
});
