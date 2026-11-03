import { describe, expect, it } from 'vitest';
import { calcularFaov, tierPorTrabajadores } from './administracionParafiscal';

describe('parafiscales FAOV', () => {
  it('elige el factor por el tamaño de la nómina', () => {
    expect(tierPorTrabajadores(0).factor).toBe(165);
    expect(tierPorTrabajadores(50).factor).toBe(165);
    expect(tierPorTrabajadores(51).factor).toBe(330);
    expect(tierPorTrabajadores(100).factor).toBe(330);
    expect(tierPorTrabajadores(101).factor).toBe(1000);
    expect(tierPorTrabajadores(500).factor).toBe(1000);
  });

  it('total = factor × tasa de referencia (Bs), a 2 decimales', () => {
    expect(calcularFaov(165, 997.9222043)).toBe(164657.16);
    expect(calcularFaov(330, 1000)).toBe(330000);
    expect(calcularFaov(1000, 40)).toBe(40000);
  });
});
