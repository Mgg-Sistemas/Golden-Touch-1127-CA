import { describe, it, expect } from 'vitest';
import { convertirRetencion } from './retencionPago';

describe('convertirRetencion', () => {
  it('retención en Bs sobre una OC en $: se divide por la tasa', () => {
    const r = convertirRetencion(1825, 'Bs', 36.5, 'USD');
    expect(r.enBs).toBe(1825);
    expect(r.enUsd).toBe(50);
    expect(r.enMonedaOc).toBe(50);
    expect(r.faltaTasa).toBe(false);
  });

  it('retención en $ sobre una OC en Bs: se multiplica por la tasa', () => {
    const r = convertirRetencion(50, 'USD', 36.5, 'Bs');
    expect(r.enBs).toBe(1825);
    expect(r.enUsd).toBe(50);
    expect(r.enMonedaOc).toBe(1825);
  });

  it('misma moneda que la OC: no necesita tasa', () => {
    const r = convertirRetencion(120, 'USD', 0, 'USD');
    expect(r.enMonedaOc).toBe(120);
    expect(r.faltaTasa).toBe(false);
    expect(convertirRetencion(900, 'Bs', 0, 'Bs').enMonedaOc).toBe(900);
  });

  it('distinta moneda y sin tasa: avisa y no inventa un monto', () => {
    const r = convertirRetencion(1825, 'Bs', 0, 'USD');
    expect(r.faltaTasa).toBe(true);
    expect(r.enUsd).toBe(0);
    expect(r.enMonedaOc).toBe(0);
  });

  it('la tasa modificada manda sobre la del día', () => {
    expect(convertirRetencion(1000, 'Bs', 40, 'USD').enMonedaOc).toBe(25);
    expect(convertirRetencion(1000, 'Bs', 50, 'USD').enMonedaOc).toBe(20);
  });

  it('redondea a céntimos', () => {
    expect(convertirRetencion(100, 'Bs', 36.55, 'USD').enUsd).toBe(2.74);
  });

  it('sin monto no falta nada', () => {
    expect(convertirRetencion(0, 'Bs', 0, 'USD').faltaTasa).toBe(false);
  });
});
