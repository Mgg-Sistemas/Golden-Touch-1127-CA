import { describe, it, expect } from 'vitest';
import { tablaPersonal, camposElegidos, CAMPOS_POR_DEFECTO } from './exportarPersonal';
import type { Personal } from '@/shared/lib/types';

const persona = (p: Partial<Personal>): Personal => ({
  id: p.id ?? 'x', empresa: 'GT', nombre: '', apellido: '', sueldo_base: 0, activo: true, created_at: '2026-01-01', ...p,
});

describe('descargar datos del personal', () => {
  const lista = [
    persona({ id: '1', nombre: 'MARÍA', apellido: 'PÉREZ', cedula: 'V-12.345.678', cargo: 'COCINERA' }),
    persona({ id: '2', nombre: 'JOSÉ', apellido: 'ALVAREZ', cedula: 'V-9.876.543', cargo: 'CHOFER', activo: false }),
  ];

  it('por defecto salen solo nombres, apellidos y cédula', () => {
    const t = tablaPersonal(lista, CAMPOS_POR_DEFECTO);
    expect(t.encabezados).toEqual(['Nombres', 'Apellidos', 'Cédula']);
    expect(t.filas).toEqual([
      ['JOSÉ', 'ALVAREZ', 'V-9.876.543'],
      ['MARÍA', 'PÉREZ', 'V-12.345.678'],
    ]);
  });

  it('las columnas salen en el orden del catálogo, no en el que se marcaron', () => {
    expect(camposElegidos(['cedula', 'nombre']).map((c) => c.clave)).toEqual(['nombre', 'cedula']);
  });

  it('traduce los valores a texto legible', () => {
    const t = tablaPersonal(lista, ['estado', 'cargo']);
    expect(t.filas).toEqual([['CHOFER', 'Inactivo'], ['COCINERA', 'Activo']]);
  });

  it('ignora claves desconocidas', () => {
    expect(tablaPersonal(lista, ['no-existe']).encabezados).toEqual([]);
  });
});

describe('orientación de la hoja', () => {
  it('automática: pocas columnas vertical, muchas horizontal', async () => {
    const { orientacionFinal } = await import('./exportarPersonal');
    expect(orientacionFinal(['nombre', 'apellido', 'cedula'])).toBe('portrait');
    expect(orientacionFinal(['nombre', 'apellido', 'cedula', 'cargo', 'departamento', 'direccion'])).toBe('landscape');
  });
  it('lo elegido manda sobre la cantidad de columnas', async () => {
    const { orientacionFinal } = await import('./exportarPersonal');
    expect(orientacionFinal(['nombre', 'apellido', 'cedula', 'cargo', 'departamento', 'direccion'], 'vertical')).toBe('portrait');
    expect(orientacionFinal(['nombre'], 'horizontal')).toBe('landscape');
  });
  it('la letra se achica para que entren las columnas, sin bajar de 6', async () => {
    const { letraQueEntra } = await import('./exportarPersonal');
    expect(letraQueEntra(469, 53)).toBe(10);
    expect(letraQueEntra(469, 150)).toBe(6);
    expect(letraQueEntra(469, 1000)).toBe(6);
  });
});
