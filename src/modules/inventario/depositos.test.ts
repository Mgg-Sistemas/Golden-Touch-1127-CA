import { describe, it, expect } from 'vitest';
import {
  depositoDe,
  esDelDeposito,
  resolverDeposito,
  DEPOSITOS,
  ALMACEN_MINA,
  ALMACEN_REUTILIZABLES,
  ALMACEN_DANADOS,
} from './depositos';

describe('depósitos: General, Mina, Reutilizables, Items Dañados y Dinámicos', () => {
  it('lo que no es de otro depósito es del General', () => {
    expect(depositoDe({ almacen: 'General' })).toBe('general');
    expect(depositoDe({ almacen: null })).toBe('general');
    expect(depositoDe({})).toBe('general');
    expect(depositoDe({ almacen: ALMACEN_MINA })).toBe('mina');
    expect(depositoDe({ almacen: ALMACEN_REUTILIZABLES })).toBe('reutilizables');
    expect(depositoDe({ almacen: ALMACEN_DANADOS })).toBe('danados');
    expect(depositoDe({ almacen: 'Depósito Herramientas' })).toBe('deposito-herramientas');
  });

  it('cada pantalla ve solo su catálogo', () => {
    const productos = [
      { almacen: 'General' },
      { almacen: ALMACEN_MINA },
      { almacen: 'General' },
      { almacen: ALMACEN_REUTILIZABLES },
      { almacen: ALMACEN_DANADOS },
      { almacen: 'Depósito Herramientas' },
    ];
    expect(productos.filter((p) => esDelDeposito(p, 'general'))).toHaveLength(2);
    expect(productos.filter((p) => esDelDeposito(p, 'mina'))).toHaveLength(1);
    expect(productos.filter((p) => esDelDeposito(p, 'reutilizables'))).toHaveLength(1);
    expect(productos.filter((p) => esDelDeposito(p, 'danados'))).toHaveLength(1);
    expect(productos.filter((p) => esDelDeposito(p, 'deposito-herramientas'))).toHaveLength(1);
  });

  it('el botón agrega al almacén del depósito que se está viendo', () => {
    expect(DEPOSITOS.general.almacen).toBe('General');
    expect(DEPOSITOS.mina.almacen).toBe('Depósito Mina');
    expect(DEPOSITOS.mina.ruta).toBe('/app/inventario/deposito-mina');
    expect(DEPOSITOS.reutilizables.almacen).toBe('Depósito Reutilizables');
    expect(DEPOSITOS.reutilizables.ruta).toBe('/app/inventario/deposito-reutilizables');
    expect(DEPOSITOS.danados.almacen).toBe('Depósito Items Dañados');
    expect(DEPOSITOS.danados.ruta).toBe('/app/inventario/deposito-danados');
  });

  it('resuelve depósitos dinámicos correctamente', () => {
    const d = resolverDeposito('Depósito Explosivos');
    expect(d.almacen).toBe('Depósito Explosivos');
    expect(d.ruta).toBe('/app/inventario/deposito/deposito-explosivos');
    expect(d.rutaTelefono).toBe('/app/inventario/deposito/deposito-explosivos/telefono');
  });
});


