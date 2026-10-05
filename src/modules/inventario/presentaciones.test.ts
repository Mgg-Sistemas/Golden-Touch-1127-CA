import { describe, it, expect } from 'vitest';
import {
  aplicarPresentacion, cantidadEnUso, precioEnUso, rotuloConversion, presentacionesPara, factorItem,
  type Presentacion,
} from './presentaciones';
import type { ItemOrden } from '@/shared/lib/types';

const arroz: ItemOrden = { sku: 'VIV-001', nombre: 'ARROZ', cantidad: 100, precio: 1.2, unidad: 'KG', productoId: 'p1' };
const saco = { unidad: 'SACO', factor: 25 };

describe('presentaciones de compra', () => {
  it('sin presentación todo queda igual (factor 1)', () => {
    expect(factorItem(arroz)).toBe(1);
    expect(cantidadEnUso(arroz, 7)).toBe(7);
    expect(precioEnUso(arroz, 3)).toBe(3);
    expect(rotuloConversion(arroz, 7)).toBeNull();
  });

  it('100 KG pasan a 4 SACO y el precio por KG se mantiene', () => {
    const it2 = aplicarPresentacion(arroz, saco);
    expect(it2).toMatchObject({ cantidad: 4, precio: 30, unidad: 'SACO', unidad_uso: 'KG', factor: 25 });
    expect(precioEnUso(it2, it2.precio)).toBe(1.2);
  });

  it('al recibir 4 sacos entran 100 KG', () => {
    const it2 = aplicarPresentacion(arroz, saco);
    expect(cantidadEnUso(it2, 4)).toBe(100);
    expect(rotuloConversion(it2, 4)).toBe('4 SACO = 100 KG');
  });

  it('volver a la unidad de uso deshace la conversión', () => {
    const ida = aplicarPresentacion(arroz, saco);
    const vuelta = aplicarPresentacion(ida, null);
    expect(vuelta).toMatchObject({ cantidad: 100, precio: 1.2, unidad: 'KG' });
    expect(vuelta.factor).toBeUndefined();
    expect(vuelta.unidad_uso).toBeUndefined();
  });

  it('cambiar de un saco de 25 a uno de 50 conserva los KG', () => {
    const s25 = aplicarPresentacion(arroz, saco);
    const s50 = aplicarPresentacion(s25, { unidad: 'SACO', factor: 50 });
    expect(s50).toMatchObject({ cantidad: 2, precio: 60, unidad_uso: 'KG', factor: 50 });
  });

  it('las del proveedor van primero y tapan la general de la misma unidad', () => {
    const todas: Presentacion[] = [
      { id: 'g', producto_id: 'p1', proveedor_id: null, unidad: 'SACO', factor: 25 },
      { id: 'c', producto_id: 'p1', proveedor_id: null, unidad: 'CAJA', factor: 10 },
      { id: 'a', producto_id: 'p1', proveedor_id: 'provA', unidad: 'saco', factor: 50 },
      { id: 'x', producto_id: 'p2', proveedor_id: null, unidad: 'SACO', factor: 40 },
    ];
    expect(presentacionesPara(todas, 'p1', 'provA').map((p) => p.id)).toEqual(['a', 'c']);
    expect(presentacionesPara(todas, 'p1', 'provB').map((p) => p.id)).toEqual(['g', 'c']);
    expect(presentacionesPara(todas, undefined, 'provA')).toEqual([]);
  });
});
