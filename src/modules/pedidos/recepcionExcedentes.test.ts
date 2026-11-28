import { expect, it } from 'vitest';
import { importeRecepcionComprada } from './recepcionExcedentes';

it('conserva el importe comprado al recibir excedente del proveedor', () => {
  expect(importeRecepcionComprada([{ cantidad: 2, cantidad_recibida: 3, precio: 10 }])).toBe(20);
});
it('descuenta faltantes sin compensarlos con excedentes de otro producto', () => {
  expect(importeRecepcionComprada([{ cantidad: 2, cantidad_recibida: 3, precio: 10 }, { cantidad: 2, cantidad_recibida: 1, precio: 5 }])).toBe(25);
});
