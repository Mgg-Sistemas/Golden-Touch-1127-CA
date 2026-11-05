/* Precios que ya traen el IVA (05/11/2026, traído de MGG f7ce86f8). */
import { describe, expect, it } from 'vitest';
import { baseIgtfDe, ivaDeclarado, ivaDesdePorcentaje, ivaQueSuma, porcentajeDesdeIva, totalDesdePartes } from './impuestosOc';
import { baseNetaDesdeTotal, ivaCambio, recomponerConIva, recomponerImpuestos } from './impuestosOrden';

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
