import { describe, expect, it } from 'vitest';
import type { Orden, Proveedor } from '@/shared/lib/types';
import { impuestoEnBs, impuestosEnBs, normalizarImpuestosMoneda } from './impuestosMoneda';
import { textoOrdenPagar } from './confirmadasPagarTxt';

// Factura típica en $: base 1.000, IVA 16 % = 160, IGTF 3 % = 34,80 → total 1.194,80.
const factura = {
  oc_codigo: 'OC-2026-0200',
  total: 1194.8,
  total_moneda: 'USD',
  comprobante_tipo: 'factura',
  retencion_momento: 'antes_de_pagar',
  iva_aplicado: true, iva_pct: 16, iva_monto: 160,
  igtf_aplicado: true, igtf_pct: 3, igtf_monto: 34.8,
  retencion_iva_monto: 120, retencion_iva_pct: 75,
  retencion_islr_monto: 20, retencion_islr_pct: 2,
  metodo_pago: [{ metodo: 'zelle', moneda: 'USD', monto: 0 }],
};

describe('normalizarImpuestosMoneda', () => {
  it('guarda solo los que van en Bs; null si ninguno', () => {
    expect(normalizarImpuestosMoneda({ iva: 'Bs', igtf: 'USD', islr: 'Bs', otro: 'Bs' })).toEqual({ iva: 'Bs', islr: 'Bs' });
    expect(normalizarImpuestosMoneda({ iva: 'USD' })).toBeNull();
    expect(normalizarImpuestosMoneda(null)).toBeNull();
  });
  it('descarta los impuestos que no están activos en la OC', () => {
    expect(normalizarImpuestosMoneda({ iva: 'Bs', isae: 'Bs' }, ['iva'])).toEqual({ iva: 'Bs' });
  });
});

describe('impuestosEnBs', () => {
  it('sin nada en Bs no hay renglones', () => {
    const r = impuestosEnBs(factura as never, 40);
    expect(r.lineas).toEqual([]);
    expect(r.totalPagarBs).toBe(0);
  });
  it('IVA en Bs: el IVA de la factura y su retención, convertidos a la tasa', () => {
    const r = impuestosEnBs({ ...factura, impuestos_moneda: { iva: 'Bs' } } as never, 40);
    expect(r.lineas.map((l) => [l.concepto, l.monto, l.bs])).toEqual([
      ['IVA (16%)', 160, 6400],
      ['Retención IVA (75%)', 120, 4800],
    ]);
    expect(r.totalPagarBs).toBe(6400);
    expect(r.totalRetenidoBs).toBe(4800);
  });
  it('ISLR en Bs: solo la retención; IGTF en Bs: el IGTF de la orden', () => {
    const r = impuestosEnBs({ ...factura, impuestos_moneda: { islr: 'Bs', igtf: 'Bs' } } as never, 40);
    expect(r.lineas.map((l) => l.concepto)).toEqual(['IGTF (3%)', 'Retención ISLR (2%)']);
  });
  it('sin tasa (OC en $) no inventa bolívares', () => {
    const r = impuestosEnBs({ ...factura, impuestos_moneda: { iva: 'Bs' } } as never, 0);
    expect(r.lineas[0].bs).toBeNull();
    expect(r.totalPagarBs).toBeNull();
  });
  it('OC ya en Bs: el monto es el mismo', () => {
    const r = impuestosEnBs({ ...factura, total_moneda: 'Bs', impuestos_moneda: { iva: 'Bs' } } as never, null);
    expect(r.lineas[0].bs).toBe(160);
  });
  it('impuestoEnBs tolera columnas vacías o raras', () => {
    expect(impuestoEnBs({}, 'iva')).toBe(false);
    expect(impuestoEnBs({ impuestos_moneda: null }, 'iva')).toBe(false);
    expect(impuestoEnBs({ impuestos_moneda: { iva: 'Bs' } }, 'iva')).toBe(true);
  });
});

describe('WhatsApp de la orden · impuestos en Bs (08/11/2026)', () => {
  const proveedor = { razon_social: 'PROVEEDOR X' } as Proveedor;
  it('las retenciones de un impuesto en Bs NO salen en el mensaje; el resto igual', () => {
    const txt = textoOrdenPagar({ ...factura, impuestos_moneda: { iva: 'Bs' } } as unknown as Orden, proveedor);
    expect(txt).not.toContain('Retención IVA');
    expect(txt).toContain('🔻 *Retención ISLR (2%):* −$20,00');
    // Los montos no cambian: el neto sigue siendo total − retenciones.
    expect(txt).toContain('✅ *Neto a pagar:* $1.054,80');
  });
  it('todo en $: el mensaje queda como antes', () => {
    const txt = textoOrdenPagar(factura as unknown as Orden, proveedor);
    expect(txt).toContain('🔻 *Retención IVA (75%):* −$120,00');
  });
});
