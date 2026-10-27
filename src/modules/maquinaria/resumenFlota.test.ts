import { describe, expect, it } from 'vitest';
import {
  AGRUPACIONES_RESUMEN,
  SIN_MARCA,
  SIN_PROPIETARIO,
  SIN_TIPO,
  resumenFlota,
  textoDesglose,
} from './resumenFlota';
import type { MaquinariaEquipo } from './maquinariaEquipos.repository';

let seq = 0;
const eq = (p: Partial<MaquinariaEquipo>): MaquinariaEquipo =>
  ({ id: `e${++seq}`, equipo: `Equipo ${seq}`, status: 'ACTIVO', activo: true, ...p } as MaquinariaEquipo);

/** Flota de ejemplo: 5 retroexcavadoras (3 CAT · 2 Volvo), 1 camión Volvo, 1 excavadora,
 *  1 SUV por confirmar, 1 moto inactiva y 1 equipo sin tipo ni marca dado de baja. */
function flota(): MaquinariaEquipo[] {
  return [
    eq({ tipo: 'Retroexcavadora', marca: 'CAT', propietario: 'Golden Touch' }),
    eq({ tipo: 'Retroexcavadora', marca: 'cat', propietario: 'Golden Touch' }),
    eq({ tipo: 'RETROEXCAVADORA', marca: 'CAT', propietario: 'Golden Touch' }),
    eq({ tipo: ' RETROEXCAVADORA ', marca: 'Volvo', propietario: 'GOLDEN  TOUCH ' }),
    eq({ tipo: 'Retroexcavadora', marca: 'VOLVO' }),
    eq({ tipo: 'Camión', marca: 'VOLVO', propietario: 'Mineral Group' }),
    eq({ tipo: 'Excavadora', marca: 'Komatsu' }),
    eq({ tipo: 'SUV', marca: 'Toyota', status: 'POR CONFIRMAR' }),
    eq({ tipo: 'MOTO', marca: 'Empire', status: 'INACTIVO' }),
    eq({ tipo: null, marca: null, activo: false }),
  ];
}

describe('resumenFlota · tarjetas por tipo de equipo', () => {
  it('cuenta por tipo en mayúsculas, ordena por cantidad y desglosa por marca (RETROEXCAVADORA 5: CAT 3 · VOLVO 2)', () => {
    const r = resumenFlota(flota(), 'tipo');

    expect(r.total).toBe(10);
    expect(r.agruparPor).toBe('tipo');
    expect(r.etiquetaAgrupacion).toBe('Tipo de equipo');

    // El más numeroso primero; los empates van por etiqueta en español.
    expect(r.grupos.map((g) => `${g.etiqueta} ${g.cantidad}`)).toEqual([
      'RETROEXCAVADORA 5', 'CAMIÓN 1', 'EXCAVADORA 1', 'MOTO 1', 'SIN TIPO 1', 'SUV 1',
    ]);

    const retro = r.grupos[0];
    expect(retro.clave).toBe('RETROEXCAVADORA');
    expect(retro.icono).toBe('🚜');
    expect(retro.desglose).toEqual([{ etiqueta: 'CAT', cantidad: 3 }, { etiqueta: 'VOLVO', cantidad: 2 }]);
    expect(textoDesglose(retro.desglose)).toBe('CAT 3 · VOLVO 2');
  });

  it('usa el icono del apartado del equipo en cada tarjeta', () => {
    const r = resumenFlota(flota(), 'tipo');
    const icono = (tipo: string) => r.grupos.find((g) => g.etiqueta === tipo)?.icono;
    expect(icono('SUV')).toBe('🚚');
    expect(icono('MOTO')).toBe('🏍️');
    expect(icono('EXCAVADORA')).toBe('🚜');
  });

  it('los equipos sin tipo o sin marca caen en SIN TIPO / SIN MARCA', () => {
    const r = resumenFlota(flota(), 'tipo');
    const sinTipo = r.grupos.find((g) => g.etiqueta === SIN_TIPO);
    expect(sinTipo?.cantidad).toBe(1);
    expect(sinTipo?.desglose).toEqual([{ etiqueta: SIN_MARCA, cantidad: 1 }]);

    const soloVacios = resumenFlota([eq({ tipo: '   ', marca: '' })], 'tipo');
    expect(soloVacios.grupos[0].etiqueta).toBe('SIN TIPO');
    expect(soloVacios.grupos[0].desglose[0].etiqueta).toBe('SIN MARCA');
  });

  it('calcula el porcentaje redondeado sobre el total', () => {
    const r = resumenFlota(flota(), 'tipo');
    expect(r.grupos[0].porcentaje).toBe(50);
    expect(r.grupos[1].porcentaje).toBe(10);

    const tercios = resumenFlota([eq({ tipo: 'A' }), eq({ tipo: 'A' }), eq({ tipo: 'B' })], 'tipo');
    expect(tercios.grupos.map((g) => g.porcentaje)).toEqual([67, 33]);
  });
});

describe('resumenFlota · otras agrupaciones', () => {
  it('por marca: VOLVO 3 con desglose por tipo (RETROEXCAVADORA 2 · CAMIÓN 1)', () => {
    const r = resumenFlota(flota(), 'marca');
    expect(r.etiquetaAgrupacion).toBe('Marca');
    expect(r.grupos.map((g) => `${g.etiqueta} ${g.cantidad}`)).toEqual([
      'CAT 3', 'VOLVO 3', 'EMPIRE 1', 'KOMATSU 1', 'SIN MARCA 1', 'TOYOTA 1',
    ]);
    const volvo = r.grupos.find((g) => g.etiqueta === 'VOLVO');
    expect(volvo?.desglose).toEqual([{ etiqueta: 'RETROEXCAVADORA', cantidad: 2 }, { etiqueta: 'CAMIÓN', cantidad: 1 }]);
  });

  it('por apartado: SUV y camión van a Vehículos, MOTO a Motos, el resto a Maquinaria y Equipos', () => {
    const r = resumenFlota(flota(), 'apartado');
    expect(r.etiquetaAgrupacion).toBe('Apartado');
    expect(r.grupos.map((g) => [g.clave, g.etiqueta, g.icono, g.cantidad])).toEqual([
      ['maquinaria', 'Maquinaria y Equipos', '🚜', 7],
      ['vehiculo', 'Vehículos', '🚚', 2],
      ['moto', 'Motos', '🏍️', 1],
    ]);
    expect(r.grupos[1].desglose).toEqual([{ etiqueta: 'CAMIÓN', cantidad: 1 }, { etiqueta: 'SUV', cantidad: 1 }]);
  });

  it('por estado: POR CONFIRMAR → Por confirmar; INACTIVO o activo=false → Retirada', () => {
    const r = resumenFlota(flota(), 'estado');
    expect(r.etiquetaAgrupacion).toBe('Estado');
    expect(r.grupos.map((g) => [g.clave, g.etiqueta, g.icono, g.cantidad])).toEqual([
      ['operativa', 'Operativa', '✅', 7],
      ['retirada', 'Retirada', '⬛', 2],
      ['por_confirmar', 'Por confirmar', '❔', 1],
    ]);
    expect(r.grupos[1].desglose).toEqual([{ etiqueta: 'MOTO', cantidad: 1 }, { etiqueta: SIN_TIPO, cantidad: 1 }]);
  });

  it('por propietario: une mayúsculas/minúsculas y los vacíos van a «Sin propietario asignado»', () => {
    const r = resumenFlota(flota(), 'propietario');
    expect(r.etiquetaAgrupacion).toBe('Empresa / Propietario');
    expect(r.grupos.map((g) => `${g.etiqueta} ${g.cantidad}`)).toEqual([
      `${SIN_PROPIETARIO} 5`, 'Golden Touch 4', 'Mineral Group 1',
    ]);
    expect(r.grupos[1].clave).toBe('GOLDEN TOUCH');
  });
});

describe('resumenFlota · franja de totales', () => {
  it('porApartado sigue el orden de los apartados y solo trae los que tienen equipos', () => {
    const r = resumenFlota(flota(), 'tipo');
    expect(r.porApartado).toEqual([
      { clave: 'maquinaria', etiqueta: 'Maquinaria y Equipos', icono: '🚜', cantidad: 7 },
      { clave: 'vehiculo', etiqueta: 'Vehículos', icono: '🚚', cantidad: 2 },
      { clave: 'moto', etiqueta: 'Motos', icono: '🏍️', cantidad: 1 },
    ]);
  });

  it('porEstado sigue el orden de ESTADOS_EQUIPO y solo trae los que tienen equipos', () => {
    const r = resumenFlota(flota(), 'marca');
    expect(r.porEstado).toEqual([
      { clave: 'operativa', etiqueta: 'Operativa', icono: '✅', cantidad: 7 },
      { clave: 'por_confirmar', etiqueta: 'Por confirmar', icono: '❔', cantidad: 1 },
      { clave: 'retirada', etiqueta: 'Retirada', icono: '⬛', cantidad: 2 },
    ]);
    expect(r.porEstado.reduce((a, x) => a + x.cantidad, 0)).toBe(r.total);
  });

  it('con la lista vacía devuelve total 0 y sin grupos', () => {
    const r = resumenFlota([], 'tipo');
    expect(r).toEqual({
      total: 0,
      agruparPor: 'tipo',
      etiquetaAgrupacion: 'Tipo de equipo',
      grupos: [],
      porApartado: [],
      porEstado: [],
    });
  });

  it('ofrece las cinco agrupaciones con su etiqueta', () => {
    expect(AGRUPACIONES_RESUMEN.map((a) => a.id)).toEqual(['tipo', 'marca', 'apartado', 'estado', 'propietario']);
    expect(AGRUPACIONES_RESUMEN.map((a) => a.label)).toEqual([
      'Tipo de equipo', 'Marca', 'Apartado', 'Estado', 'Empresa / Propietario',
    ]);
  });
});
