import { describe, it, expect } from 'vitest';
import { costoUnitarioUsd, gastoRenglonUsd, monedaYaElegida, planRemontaje, type MontajeInventario } from './costoCompraDirecta';

describe('costo en $ de un renglón de compra directa', () => {
  it('en $ queda igual', () => {
    expect(gastoRenglonUsd(304.49, 'USD', 873.87)).toBe(304.49);
  });
  it('en Bs se divide entre la tasa (CD-2026-0055: 266.082 Bs a 873,87 = $304,49)', () => {
    expect(gastoRenglonUsd(266082, 'Bs', 873.87)).toBe(304.49);
    expect(costoUnitarioUsd({ producto_id: 'c', cantidad: 1, gasto: 266082 }, 'Bs', 873.87)).toBe(304.49);
  });
  it('el costo es por unidad comprada', () => {
    // CD-2026-0056: 4 tornillos por 18.794,88 Bs a 873,87 → $21,51 → $5,3775 c/u
    expect(costoUnitarioUsd({ producto_id: 't', cantidad: 4, gasto: 18794.88 }, 'Bs', 873.87)).toBe(5.3775);
  });
  it('con presentación el costo va por unidad de USO (4 SACO de 25 KG por 8.738,70 Bs → KG)', () => {
    // 8.738,70 / 873,87 = $10,00 ÷ 100 KG = $0,10 el KG
    expect(costoUnitarioUsd({ producto_id: 'h', cantidad: 4, factor: 25, gasto: 8738.7 }, 'Bs', 873.87)).toBe(0.1);
  });
  it('sin monto o sin cantidad, costo 0 (no inventa precio)', () => {
    expect(costoUnitarioUsd({ producto_id: 'x', cantidad: 0, gasto: 100 }, 'USD', 1)).toBe(0);
    expect(costoUnitarioUsd({ producto_id: 'x', cantidad: 2, gasto: 0 }, 'Bs', 800)).toBe(0);
  });
});

describe('¿la moneda ya se eligió?', () => {
  it('una compra recién creada trae USD por defecto de la base: NO cuenta como elegida', () => {
    // Antes bastaba con moneda === 'USD' y el aviso «elige la moneda» nunca salía.
    expect(monedaYaElegida({ moneda: 'USD', estado: 'en_proceso', enviada_pagar_at: null })).toBe(false);
  });
  it('si ya se montó una vez, la moneda guardada sí es una elección', () => {
    expect(monedaYaElegida({ moneda: 'USD', estado: 'por_pagar', enviada_pagar_at: '2026-10-07T16:01:36Z' })).toBe(true);
    expect(monedaYaElegida({ moneda: 'Bs', estado: 'en_proceso', enviada_pagar_at: '2026-10-07T16:01:36Z' })).toBe(true);
  });
  it('sin moneda, no', () => {
    expect(monedaYaElegida({ moneda: null, estado: 'por_pagar', enviada_pagar_at: 'x' })).toBe(false);
  });
});

describe('volver a montar una compra que ya entró al inventario', () => {
  const base: MontajeInventario = {
    moneda: 'USD', tasa_conversion: null, afecta_inventario: true,
    items: [
      { producto_id: 'contactor', cantidad: 1, gasto: 266082 },
      { producto_id: 'rele', cantidad: 1, gasto: 143946 },
    ],
  };

  it('si todavía no se recibió, queda pendiente de recepción (como siempre)', () => {
    expect(planRemontaje(false, base, base)).toBe('pendiente');
  });
  it('si ya se recibió y no cambió nada, NO se reabre la recepción (antes entraba dos veces)', () => {
    expect(planRemontaje(true, base, { ...base })).toBe('mantener');
  });
  it('CD-2026-0055: de «$» a Bs con tasa → se revaloriza, no se recibe de nuevo', () => {
    expect(planRemontaje(true, base, { ...base, moneda: 'Bs', tasa_conversion: 873.87 })).toBe('revalorizar');
  });
  it('cambia solo la tasa de una compra en Bs → revalorizar', () => {
    const bs = { ...base, moneda: 'Bs', tasa_conversion: 870 };
    expect(planRemontaje(true, bs, { ...bs, tasa_conversion: 873.87 })).toBe('revalorizar');
  });
  it('cambia un monto → revalorizar', () => {
    expect(planRemontaje(true, base, { ...base, items: [base.items[0], { ...base.items[1], gasto: 100 }] })).toBe('revalorizar');
  });
  it('cambia la cantidad o el material → se saca y se vuelve a recibir', () => {
    expect(planRemontaje(true, base, { ...base, items: [{ ...base.items[0], cantidad: 2 }, base.items[1]] })).toBe('rehacer');
    expect(planRemontaje(true, base, { ...base, items: [base.items[0]] })).toBe('rehacer');
  });
  it('pasar a «no afecta inventario» después de recibir → se saca lo que entró', () => {
    expect(planRemontaje(true, base, { ...base, afecta_inventario: false })).toBe('rehacer');
  });
  it('misma cantidad expresada en otra presentación (4 SACO de 25 = 100 KG) no es cambio de cantidad', () => {
    const kg: MontajeInventario = { ...base, items: [{ producto_id: 'harina', cantidad: 100, gasto: 10 }] };
    const sacos: MontajeInventario = { ...base, items: [{ producto_id: 'harina', cantidad: 4, factor: 25, gasto: 10 }] };
    expect(planRemontaje(true, kg, sacos)).toBe('mantener');
  });
});
