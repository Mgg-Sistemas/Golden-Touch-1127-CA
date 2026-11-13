/* Precios que ya traen el IVA (05/11/2026). */
import { describe, expect, it } from 'vitest';
import {
  baseGravadaDeItems,
  baseIgtfDe,
  ivaDeclarado,
  ivaDesdePorcentaje,
  ivaQueSuma,
  montoExentoDeItems,
  porcentajeDesdeIva,
  totalDesdePartes,
} from './impuestosOc';
import { baseNetaDesdeTotal, ivaCambio, recomponerConIva, recomponerImpuestos } from './impuestosOrden';

describe('ítems exentos y base gravada de IVA', () => {
  it('discrimina correctamente renglones gravados y exentos', () => {
    const items = [
      { cantidad: 2, precio: 50, exento: false },
      { cantidad: 1, precio: 30, exento: true },
      { cantidad: 3, precio: 20, exento: false, comprar: false }, // no se compra
    ];
    expect(montoExentoDeItems(items)).toBe(30);
    expect(baseGravadaDeItems(items)).toBe(100);
  });

  it('respeta precios en USD cuando tieneUsd es true', () => {
    const items = [
      { cantidad: 1, precio: 4000, precio_usd: 100, exento: false },
      { cantidad: 2, precio: 1000, precio_usd: 25, exento: true },
    ];
    expect(montoExentoDeItems(items, true)).toBe(50);
    expect(baseGravadaDeItems(items, true)).toBe(100);
  });
});

describe('IVA incluido en los precios', () => {
  it('el IVA se guarda pero no suma al total', () => {
    const o = { iva_aplicado: true, iva_monto: 16, iva_incluido: true };
    expect(ivaDeclarado(o)).toBe(16);
    expect(ivaQueSuma(o)).toBe(0);
    expect(totalDesdePartes({ subtotal: 116, iva: 16, iva_incluido: true })).toBe(116);
    expect(totalDesdePartes({ subtotal: 100, iva: 16 })).toBe(116);
  });
  it('el % va sobre la base sin IVA: 116 con 16% adentro = 16 de IVA', () => {
    expect(ivaDesdePorcentaje(116, 16, true)).toBe(16);
    expect(ivaDesdePorcentaje(100, 16, false)).toBe(16);
    expect(porcentajeDesdeIva(116, 16, true)).toBe(16);
    expect(baseIgtfDe(116, 16, true)).toBe(116);
  });
  it('editar la OC con IVA incluido no vuelve a sumar el IVA', () => {
    const prev = { ivaAplicado: true, ivaPct: 16, ivaMonto: 16, ivaIncluido: true, igtfAplicado: false, igtfPct: 0, igtfMonto: 0 };
    expect(baseNetaDesdeTotal(116, prev)).toBe(116);
    const r = recomponerImpuestos(116, 232, prev);
    expect(r.ivaMonto).toBe(32);
    expect(r.total).toBe(232);
    const c = recomponerConIva(116, 116, { ...prev, ivaIncluido: false }, { aplicado: true, pct: 16, monto: 16, incluido: true });
    expect(c.ivaIncluido).toBe(true);
    expect(c.total).toBe(116);
    expect(ivaCambio({ ...prev, ivaIncluido: false }, { ivaAplicado: true, ivaMonto: 16, ivaIncluido: true })).toBe(true);
  });
});
