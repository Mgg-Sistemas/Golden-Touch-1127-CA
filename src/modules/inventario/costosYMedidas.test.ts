import { describe, expect, it } from 'vitest';
import { faltaCosto } from './CostosYMedidasModal';

describe('faltaCosto (aviso de Costos y medidas)', () => {
  it('cuenta un producto con existencia y sin costo', () => {
    expect(faltaCosto({ estado: 'activo', precio: 0, stock: 5 })).toBe(true);
  });
  it('no cuenta el producto en 0 recién creado desde una solicitud de pedido', () => {
    expect(faltaCosto({ estado: 'activo', precio: 0, stock: 0 })).toBe(false);
  });
  it('no cuenta un producto con costo ni uno inactivo', () => {
    expect(faltaCosto({ estado: 'activo', precio: 12.5, stock: 5 })).toBe(false);
    expect(faltaCosto({ estado: 'inactivo', precio: 0, stock: 5 })).toBe(false);
  });
});
