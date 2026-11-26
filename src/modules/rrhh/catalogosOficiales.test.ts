import { describe, it, expect } from 'vitest';
import {
  CATALOGOS_OFICIALES,
  CATALOGO_CODIGOS_POSTALES,
  CATALOGO_EDO_CIVIL,
  CATALOGO_MUNICIPIOS,
  CATALOGO_NIVEL_EDUCACION,
  CATALOGO_PAISES,
  CATALOGO_PARROQUIAS,
  CATALOGO_PROFESIONES,
  CATALOGO_TIPOS_CARGO,
} from './catalogosOficiales';
import {
  CATALOGO_MUNICIPIOS_PRINCIPALES,
  CATALOGO_PAISES_ISO2,
  CATALOGO_PARROQUIAS_PRINCIPALES,
  CATALOGO_PROFESIONES_MAP,
} from './cargaMasivaNomina';

describe('catálogos oficiales de nómina importados del Excel', () => {
  it('trae todas las filas del Excel, no las copias recortadas de antes', () => {
    expect(CATALOGO_PAISES).toHaveLength(223);
    expect(CATALOGO_MUNICIPIOS).toHaveLength(129);
    expect(CATALOGO_PARROQUIAS).toHaveLength(1128);
    expect(CATALOGO_CODIGOS_POSTALES).toHaveLength(2500);
    expect(CATALOGO_PROFESIONES).toHaveLength(184);
    expect(CATALOGO_TIPOS_CARGO).toHaveLength(79);
    expect(CATALOGO_EDO_CIVIL).toHaveLength(5);
  });

  it('los reportes usan las listas completas a través de los alias históricos', () => {
    expect(CATALOGO_PAISES_ISO2).toBe(CATALOGO_PAISES);
    expect(CATALOGO_MUNICIPIOS_PRINCIPALES).toBe(CATALOGO_MUNICIPIOS);
    expect(CATALOGO_PARROQUIAS_PRINCIPALES).toBe(CATALOGO_PARROQUIAS);
    expect(Object.keys(CATALOGO_PROFESIONES_MAP)).toHaveLength(184);
  });

  it('nivel de educación incluye primaria y bachiller con su código', () => {
    expect(CATALOGO_NIVEL_EDUCACION).toEqual([
      { codigo: '01', descripcion: 'PRIMARIA' },
      { codigo: '02', descripcion: 'BACHILLERATO' },
      { codigo: '03', descripcion: 'TECNICO MEDIO' },
      { codigo: '04', descripcion: 'TECNICO SUPERIOR' },
      { codigo: '05', descripcion: 'UNIVERSITARIO' },
      { codigo: '06', descripcion: 'POST GRADO' },
      { codigo: '07', descripcion: 'DOCTORADO' },
    ]);
  });

  it('todos los catálogos del panel tienen códigos y el de educación va primero', () => {
    expect(CATALOGOS_OFICIALES.length).toBeGreaterThanOrEqual(21);
    expect(CATALOGOS_OFICIALES[0].clave).toBe('educacion');
    for (const catalogo of CATALOGOS_OFICIALES) {
      expect(catalogo.items.length).toBeGreaterThan(0);
      for (const item of catalogo.items) {
        expect(item.codigo).not.toBe('');
        expect(item.descripcion).not.toBe('');
      }
    }
  });
});
