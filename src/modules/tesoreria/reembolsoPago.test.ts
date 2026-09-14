import { describe, it, expect } from 'vitest';
import { repartirPagoYReembolso } from './reembolsoPago';

// USD y USDT a la par; Bs a 50 por dólar.
const TASA = 50;
const aUsd = (m: string, n: number) => (m === 'Bs' ? Math.round((n / TASA) * 100) / 100 : n);
const desdeUsd = (m: string, u: number) => (m === 'Bs' ? Math.round(u * TASA * 100) / 100 : u);

describe('repartirPagoYReembolso', () => {
  it('sin excedente, todo es pago', () => {
    const r = repartirPagoYReembolso([{ moneda: 'USD', monto: 200 }], 200, aUsd, desdeUsd);
    expect(r.pago).toEqual([{ moneda: 'USD', monto: 200 }]);
    expect(r.reembolso).toEqual([]);
    expect(r.reembolsoUsd).toBe(0);
  });

  it('la factura es de 200 y salieron 300: paga 200, reembolsa 100', () => {
    const r = repartirPagoYReembolso([{ moneda: 'USD', monto: 300 }], 200, aUsd, desdeUsd);
    expect(r.pago).toEqual([{ moneda: 'USD', monto: 200 }]);
    expect(r.reembolso).toEqual([{ moneda: 'USD', monto: 100 }]);
    expect(r.reembolsoUsd).toBe(100);
  });

  it('las cuentas que quedan después del total van enteras al reembolso', () => {
    const r = repartirPagoYReembolso(
      [{ moneda: 'USDT', monto: 150 }, { moneda: 'USD', monto: 50 }, { moneda: 'USD', monto: 40 }],
      200, aUsd, desdeUsd,
    );
    expect(r.pago).toEqual([{ moneda: 'USDT', monto: 150 }, { moneda: 'USD', monto: 50 }]);
    expect(r.reembolso).toEqual([{ moneda: 'USD', monto: 40 }]);
    expect(r.reembolsoUsd).toBe(40);
  });

  it('parte la cuenta en Bs que cruza el total, sin perder céntimos', () => {
    // 150 USDT + 5.000 Bs (= 100 $) contra un total de 200 $: sobran 50 $ = 2.500 Bs.
    const r = repartirPagoYReembolso(
      [{ moneda: 'USDT', monto: 150 }, { moneda: 'Bs', monto: 5000 }],
      200, aUsd, desdeUsd,
    );
    expect(r.pago).toEqual([{ moneda: 'USDT', monto: 150 }, { moneda: 'Bs', monto: 2500 }]);
    expect(r.reembolso).toEqual([{ moneda: 'Bs', monto: 2500 }]);
    expect(r.reembolsoUsd).toBe(50);
  });

  it('pago + reembolso de cada cuenta suman exactamente lo cargado', () => {
    const patas = [{ moneda: 'Bs', monto: 1234.57 }, { moneda: 'USD', monto: 10 }];
    const r = repartirPagoYReembolso(patas, 20, aUsd, desdeUsd);
    for (const moneda of ['Bs', 'USD']) {
      const cargado = patas.filter((p) => p.moneda === moneda).reduce((a, p) => a + p.monto, 0);
      const salio = [...r.pago, ...r.reembolso].filter((p) => p.moneda === moneda).reduce((a, p) => a + p.monto, 0);
      expect(Math.round(salio * 100) / 100).toBe(cargado);
    }
  });

  it('conserva los demás datos de la pata (caja y cuenta)', () => {
    const r = repartirPagoYReembolso(
      [{ cajaId: 'c1', cuenta: 'general', moneda: 'USD', monto: 120 }], 100, aUsd, desdeUsd,
    );
    expect(r.reembolso).toEqual([{ cajaId: 'c1', cuenta: 'general', moneda: 'USD', monto: 20 }]);
  });

  it('ignora patas en cero', () => {
    const r = repartirPagoYReembolso([{ moneda: 'USD', monto: 0 }, { moneda: 'USD', monto: 100 }], 100, aUsd, desdeUsd);
    expect(r.pago).toEqual([{ moneda: 'USD', monto: 100 }]);
    expect(r.reembolso).toEqual([]);
  });
});
