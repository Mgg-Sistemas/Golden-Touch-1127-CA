import { describe, it, expect } from 'vitest';
import { depositoDe, esDelDeposito, DEPOSITOS, ALMACEN_MINA, ALMACEN_REUTILIZABLES } from './depositos';

describe('depósitos: Inventario General, Depósito Mina y Depósito Reutilizables', () => {
  it('lo que no es de la Mina ni Reutilizables es del General', () => {
    expect(depositoDe({ almacen: 'General' })).toBe('general');
    expect(depositoDe({ almacen: null })).toBe('general');
    expect(depositoDe({})).toBe('general');
    expect(depositoDe({ almacen: ALMACEN_MINA })).toBe('mina');
    expect(depositoDe({ almacen: ALMACEN_REUTILIZABLES })).toBe('reutilizables');
  });

  it('cada pantalla ve solo su catálogo', () => {
    const productos = [
      { almacen: 'General' },
      { almacen: ALMACEN_MINA },
      { almacen: 'General' },
      { almacen: ALMACEN_REUTILIZABLES },
    ];
    expect(productos.filter((p) => esDelDeposito(p, 'general'))).toHaveLength(2);
    expect(productos.filter((p) => esDelDeposito(p, 'mina'))).toHaveLength(1);
    expect(productos.filter((p) => esDelDeposito(p, 'reutilizables'))).toHaveLength(1);
  });

  it('el botón agrega al almacén del depósito que se está viendo', () => {
    expect(DEPOSITOS.general.almacen).toBe('General');
    expect(DEPOSITOS.mina.almacen).toBe('Depósito Mina');
    expect(DEPOSITOS.mina.ruta).toBe('/app/inventario/deposito-mina');
    expect(DEPOSITOS.reutilizables.almacen).toBe('Depósito Reutilizables');
    expect(DEPOSITOS.reutilizables.ruta).toBe('/app/inventario/deposito-reutilizables');
  });
});

