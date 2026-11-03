import { describe, expect, it } from 'vitest';
import {
  calcularRetencionesCompras, columnasRetencionesCompras, errorRetencionesCompras, leerRetencionesCompras,
  netoAPagarCompras, normalizarRetencionesCompras, resolverRetencionTipo, uiInicialRetenciones,
  type RetencionesUi,
} from './retencionesCompras';

// Factura típica: base 1.000, IVA 16 % = 160, IGTF 3 % sobre 1.160 = 34,80 → total 1.194,80.
const bases = { baseImponible: 1000, iva: 160, igtf: 34.8 };
const apagado = { activa: false, manual: false, monto: '', pct: '0' };
const ui = (patch: Partial<RetencionesUi>): RetencionesUi => ({ iva: apagado, islr: apagado, isae: apagado, igtf: apagado, ...patch });

describe('resolverRetencionTipo', () => {
  it('inactiva = 0 aunque tenga % cargado', () => {
    expect(resolverRetencionTipo({ activa: false, manual: false, monto: '', pct: '75' }, 160)).toEqual({ pct: 0, monto: 0 });
  });
  it('por %: el monto sale de la base', () => {
    expect(resolverRetencionTipo({ activa: true, manual: false, monto: '', pct: '75' }, 160)).toEqual({ pct: 75, monto: 120 });
  });
  it('por monto: el % se deriva del monto', () => {
    expect(resolverRetencionTipo({ activa: true, manual: true, monto: '20', pct: '2' }, 1000)).toEqual({ pct: 2, monto: 20 });
    expect(resolverRetencionTipo({ activa: true, manual: true, monto: '15', pct: '0' }, 1000)).toEqual({ pct: 1.5, monto: 15 });
  });
  it('monto directo sin base (ej. IGTF sin IGTF en la OC) deja el % en 0', () => {
    expect(resolverRetencionTipo({ activa: true, manual: true, monto: '10', pct: '100' }, 0)).toEqual({ pct: 0, monto: 10 });
  });
  it('% acotado a 0..100', () => {
    expect(resolverRetencionTipo({ activa: true, manual: false, monto: '', pct: '150' }, 160).pct).toBe(100);
    expect(resolverRetencionTipo({ activa: true, manual: false, monto: '', pct: '-5' }, 160).monto).toBe(0);
  });
});

describe('calcularRetencionesCompras', () => {
  it('cada tipo sobre su base y el total suma todo', () => {
    const r = calcularRetencionesCompras(ui({
      iva: { activa: true, manual: false, monto: '', pct: '75' },   // 75 % de 160
      islr: { activa: true, manual: false, monto: '', pct: '2' },   // 2 % de 1.000
      isae: { activa: true, manual: false, monto: '', pct: '1' },   // 1 % de 1.000
      igtf: { activa: true, manual: false, monto: '', pct: '100' }, // 100 % de 34,80
    }), bases);
    expect(r.iva.monto).toBe(120);
    expect(r.islr.monto).toBe(20);
    expect(r.isae.monto).toBe(10);
    expect(r.igtf.monto).toBe(34.8);
    expect(r.total).toBe(184.8);
    expect(netoAPagarCompras(1194.8, r.total)).toBe(1010);
  });
  it('sin checks marcados no retiene nada', () => {
    expect(calcularRetencionesCompras(ui({}), bases).total).toBe(0);
  });
});

describe('validación y normalización', () => {
  it('retenciones iguales o mayores al total son error', () => {
    expect(errorRetencionesCompras(100, 100)).toMatch(/total/);
    expect(errorRetencionesCompras(100, 99.99)).toBeNull();
    expect(errorRetencionesCompras(100, 0)).toBeNull();
    expect(() => normalizarRetencionesCompras({ islr: { monto: 200, pct: 2 } }, 100)).toThrow();
  });
  it('normaliza: redondea, descarta negativos y recalcula el total', () => {
    const r = normalizarRetencionesCompras({ iva: { monto: 120.004, pct: 75 }, islr: { monto: -3, pct: 2 } }, 1194.8);
    expect(r.iva).toEqual({ monto: 120, pct: 75 });
    expect(r.islr).toEqual({ monto: 0, pct: 0 });
    expect(r.total).toBe(120);
    expect(normalizarRetencionesCompras(null, 100).total).toBe(0);
  });
  it('columnas: null en los tipos sin monto y total 0 si no hay retenciones', () => {
    const cols = columnasRetencionesCompras(normalizarRetencionesCompras({ iva: { monto: 120, pct: 75 } }, 1000));
    expect(cols).toMatchObject({ retencion_iva_monto: 120, retencion_iva_pct: 75, retencion_islr_monto: null, retencion_compras_total: 120 });
    expect(columnasRetencionesCompras(null)).toMatchObject({ retencion_iva_monto: null, retencion_compras_total: 0 });
  });
});

describe('leerRetencionesCompras', () => {
  const oc = { comprobante_tipo: 'factura' as const, retencion_momento: 'antes_de_pagar' as const, total: 1194.8, retencion_iva_monto: 120, retencion_iva_pct: 75, retencion_islr_monto: 20, retencion_islr_pct: 2 };
  it('lee los montos por tipo y su total', () => {
    const r = leerRetencionesCompras(oc);
    expect(r?.total).toBe(140);
    expect(r?.momento).toBe('antes_de_pagar');
  });
  it('null sin factura, sin momento o sin montos', () => {
    expect(leerRetencionesCompras({ ...oc, comprobante_tipo: 'nota_entrega' })).toBeNull();
    expect(leerRetencionesCompras({ ...oc, retencion_momento: null })).toBeNull();
    expect(leerRetencionesCompras({ comprobante_tipo: 'factura', retencion_momento: 'despues_de_pagar', total: 10 })).toBeNull();
  });
  it('el formulario arranca con lo guardado (monto manda) o con los % por defecto apagados', () => {
    const u = uiInicialRetenciones(oc);
    expect(u.iva).toEqual({ activa: true, manual: true, monto: '120', pct: '75' });
    expect(u.isae).toEqual({ activa: false, manual: false, monto: '', pct: '1' });
    expect(u.igtf.pct).toBe('100');
  });
});
