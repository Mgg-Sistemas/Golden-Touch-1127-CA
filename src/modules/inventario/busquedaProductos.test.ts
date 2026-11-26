import { describe, expect, it } from 'vitest';
import {
  coincideBusquedaProducto,
  rutaDetalleProducto,
  tokensBusquedaProducto,
} from './busquedaProductos';
import { ALMACEN_GENERAL, ALMACEN_MINA, ALMACEN_REUTILIZABLES } from './depositos';

const TIZA = {
  id: '30ac67e2-e6ea-4831-900b-1c9d3437038b',
  sku: 'INS-180',
  nombre: 'TIZA PARA HERRERÍA',
  nombre_busq: 'tiza para herreria',
  categoria: 'INSUMOS Y CONSUMIBLES',
  unidad: 'UND',
  almacen: ALMACEN_MINA,
};

describe('búsqueda de productos por palabras', () => {
  it('ignora conectores que cambian entre el nombre escrito y el cargado', () => {
    expect(tokensBusquedaProducto('TIZA DE HERRERÍA')).toEqual(['tiza', 'herreria']);
    expect(coincideBusquedaProducto(TIZA, 'TIZA DE HERRERÍA')).toBe(true);
    expect(coincideBusquedaProducto(TIZA, 'tiza herreria')).toBe(true);
  });

  it('encuentra por SKU sin importar mayúsculas y no acepta otro producto', () => {
    expect(coincideBusquedaProducto(TIZA, 'ins-180')).toBe(true);
    expect(coincideBusquedaProducto(TIZA, 'INS-181')).toBe(false);
    expect(coincideBusquedaProducto(TIZA, 'TIZA DE CARPINTERÍA')).toBe(false);
  });

  it('no convierte una búsqueda vacía o de solo conectores en «todos»', () => {
    expect(coincideBusquedaProducto(TIZA, '')).toBe(true);
    expect(tokensBusquedaProducto('de la')).toEqual(['de', 'la']);
  });
});

describe('detalle del producto en su depósito', () => {
  it('abre Mina, Reutilizables y General en rutas distintas', () => {
    expect(rutaDetalleProducto(TIZA)).toBe(`/app/inventario/deposito-mina?detalle=${TIZA.id}`);
    expect(rutaDetalleProducto({ id: 'r-1', almacen: ALMACEN_REUTILIZABLES }))
      .toBe('/app/inventario/deposito-reutilizables?detalle=r-1');
    expect(rutaDetalleProducto({ id: 'g-1', almacen: ALMACEN_GENERAL }))
      .toBe('/app/inventario?detalle=g-1');
  });
});
