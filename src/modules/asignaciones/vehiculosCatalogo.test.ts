import { describe, expect, it } from 'vitest';
import {
  descripcionVehiculo, erroresVehiculo, etiquetaVehiculo, filtrarVehiculos, formVehiculoVacio, payloadVehiculo, vigenciaAutorizacion,
  type VehiculoCatalogo,
} from './vehiculosCatalogo';

const v = (p: Partial<VehiculoCatalogo>): VehiculoCatalogo => ({ id: 'x', placa: 'AB381AA', activo: true, ...p });

describe('catálogo de vehículos', () => {
  it('pide placa y marca, y no deja repetir la placa (sin importar espacios ni mayúsculas)', () => {
    const f = formVehiculoVacio();
    expect(erroresVehiculo(f, [])).toEqual(['Escribe la placa.', 'Indica la marca.']);
    const otros = [v({ id: 'a', placa: 'AB381AA' })];
    expect(erroresVehiculo({ ...f, placa: 'ab 381aa', marca: 'Toyota' }, otros).join(' ')).toContain('ya está en el catálogo');
    // Al editar el mismo vehículo no choca consigo mismo.
    expect(erroresVehiculo({ ...f, placa: 'AB381AA', marca: 'Toyota' }, otros, 'a')).toEqual([]);
  });
  it('valida el año', () => {
    const f = { ...formVehiculoVacio(), placa: 'A1', marca: 'Toyota' };
    expect(erroresVehiculo({ ...f, anio: '15' }, []).join(' ')).toContain('año');
    expect(erroresVehiculo({ ...f, anio: '2015' }, [])).toEqual([]);
  });
  it('payload: placa normalizada y vacíos en null', () => {
    const p = payloadVehiculo({ ...formVehiculoVacio(), placa: ' ab 381 aa ', marca: 'Toyota', anio: '2015' });
    expect(p.placa).toBe('AB381AA');
    expect(p.anio).toBe(2015);
    expect(p.color).toBeNull();
  });
  it('etiqueta, descripción y búsqueda', () => {
    const m = v({ alias: 'MACHITO PLATA', marca: 'TOYOTA', modelo: 'LAND CRUISER', anio: 2015, tipo: 'CAMIONETA' });
    expect(etiquetaVehiculo(m)).toBe('AB381AA · MACHITO PLATA · TOYOTA LAND CRUISER 2015');
    expect(descripcionVehiculo(m)).toBe('MACHITO PLATA');
    expect(descripcionVehiculo(v({ tipo: 'CAMIONETA', marca: 'TOYOTA', modelo: 'HILUX' }))).toBe('CAMIONETA TOYOTA HILUX');
    const lista = [m, v({ id: 'b', placa: 'A18AS7G', marca: 'MITSUBISHI', activo: false })];
    expect(filtrarVehiculos(lista, 'mitsu').map((x) => x.id)).toEqual(['b']);
    // Los activos primero.
    expect(filtrarVehiculos(lista, '').map((x) => x.id)).toEqual(['x', 'b']);
  });
});

describe('vigencia de la autorización', () => {
  it('vigente, vencida o sin efecto', () => {
    expect(vigenciaAutorizacion({ estado: 'asignado', autorizacion_hasta: null }, '2026-10-07')).toBe('vigente');
    expect(vigenciaAutorizacion({ estado: 'asignado', autorizacion_hasta: '2026-10-07' }, '2026-10-07')).toBe('vigente');
    expect(vigenciaAutorizacion({ estado: 'asignado', autorizacion_hasta: '2026-10-06' }, '2026-10-07')).toBe('vencida');
    expect(vigenciaAutorizacion({ estado: 'devuelto', autorizacion_hasta: null }, '2026-10-07')).toBe('sin_efecto');
  });
});
