import { describe, expect, it } from 'vitest';
import type { ItemOrden } from '@/shared/lib/types';
import { ajusteInicial, cambiarModo, faltaFactor, precioUsoDe, renglonReparto } from './repartoRenglon';

const op: ItemOrden = { sku: 'INS-163', nombre: 'SHELL RIMULA R4X 15W-40', cantidad: 5, precio: 0, unidad: 'GALON', productoId: 'p1' };
const pailas: ItemOrden = { ...op, cantidad: 2, precio: 230, unidad: 'PAILA', factor: 5, unidad_uso: 'GALON' };

describe('reparto multiproveedor · renglón', () => {
  it('mantiene lo cotizado: 2 PAILA × $230 = $460 (no 5 GALON × $230)', () => {
    const aj = ajusteInicial(op, pailas);
    const r = renglonReparto(op, pailas, aj);
    expect(aj.modo).toBe('cotizada');
    expect(r).toMatchObject({ cantidad: 2, unidad: 'PAILA', factor: 5, unidad_uso: 'GALON', precio: 230 });
    expect(r.cantidad * r.precio).toBe(460);
    expect(precioUsoDe(aj, pailas)).toBe(46);
  });

  it('pasar a la unidad del inventario convierte cantidad y precio', () => {
    const aj = cambiarModo(ajusteInicial(op, pailas), 'uso');
    const r = renglonReparto(op, pailas, aj);
    expect(r).toMatchObject({ cantidad: 10, unidad: 'GALON', precio: 46 });
    expect(r.factor).toBeUndefined();
    expect(r.unidad_uso).toBeUndefined();
    expect(r.cantidad * r.precio).toBe(460);
  });

  it('otra presentación conserva el precio por unidad de uso', () => {
    let aj = cambiarModo(ajusteInicial(op, pailas), 'uso');
    aj = cambiarModo({ ...aj, otraUnidad: 'tambor', otraFactor: 55 }, 'otra');
    const r = renglonReparto(op, pailas, aj);
    expect(r).toMatchObject({ unidad: 'TAMBOR', factor: 55, unidad_uso: 'GALON', precio: 2530 });
    expect(r.cantidad).toBeCloseTo(10 / 55, 3);
  });

  it('cotizado en PAILA sin factor: avisa y se puede indicar', () => {
    const sinFactor: ItemOrden = { ...op, cantidad: 2, precio: 230, unidad: 'PAILA' };
    const aj = ajusteInicial(op, sinFactor);
    expect(aj.modo).toBe('cotizada');
    expect(faltaFactor(aj, op, sinFactor)).toBe(true);
    const conFactor = { ...aj, factorCotizada: 5 };
    expect(faltaFactor(conFactor, op, sinFactor)).toBe(false);
    expect(renglonReparto(op, sinFactor, conFactor)).toMatchObject({ cantidad: 2, unidad: 'PAILA', factor: 5, precio: 230 });
  });

  it('misma unidad: usa la cantidad cotizada y el precio de la oferta', () => {
    const igual: ItemOrden = { ...op, cantidad: 4, precio: 50 };
    const aj = ajusteInicial(op, igual);
    expect(aj.modo).toBe('uso');
    expect(renglonReparto(op, igual, aj)).toMatchObject({ cantidad: 4, unidad: 'GALON', precio: 50 });
  });

  it('la cantidad se puede editar', () => {
    const aj = { ...ajusteInicial(op, pailas), cantidad: 3 };
    expect(renglonReparto(op, pailas, aj)).toMatchObject({ cantidad: 3, precio: 230 });
  });
});
