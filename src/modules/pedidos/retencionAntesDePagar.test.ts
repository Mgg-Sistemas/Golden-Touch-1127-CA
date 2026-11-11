import { describe, expect, it } from 'vitest';
import { retencionAntesDePagar } from './pedidos.repository';

// 11/11/2026 · OC-2026-0215: el WhatsApp decía «Neto a pagar $165,87» (ISLR 2 % = $2,91 ANTES
// de pagar) pero Tesorería y el tablero seguían en $168,78.
const base = {
  comprobante_tipo: 'factura' as const,
  retencion_momento: 'antes_de_pagar' as const,
  total: 168.78,
  condiciones_pago: 'contado' as const,
  retencion_aplicada: false,
  retencion_islr_pct: 2,
  retencion_islr_monto: 2.91,
  retencion_compras_total: 2.91,
};

describe('retencionAntesDePagar', () => {
  it('resta la retención de Compras cuando se retiene ANTES de pagar', () => {
    expect(retencionAntesDePagar(base, 168.78)).toBe(2.91);
  });
  it('DESPUÉS de pagar se paga completo', () => {
    expect(retencionAntesDePagar({ ...base, retencion_momento: 'despues_de_pagar' }, 168.78)).toBe(0);
  });
  it('sin factura o sin retenciones no resta nada', () => {
    expect(retencionAntesDePagar({ ...base, comprobante_tipo: 'nota_entrega' }, 168.78)).toBe(0);
    expect(retencionAntesDePagar({ ...base, retencion_islr_monto: 0 }, 168.78)).toBe(0);
  });
  it('a crédito o ya pagada con retención no se vuelve a restar', () => {
    expect(retencionAntesDePagar({ ...base, condiciones_pago: 'credito' }, 168.78)).toBe(0);
    expect(retencionAntesDePagar({ ...base, retencion_aplicada: true }, 168.78)).toBe(0);
  });
  it('nunca resta igual o más que lo que se paga', () => {
    expect(retencionAntesDePagar(base, 2.5)).toBe(0);
  });
});
