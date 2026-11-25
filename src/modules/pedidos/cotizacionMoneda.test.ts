import { describe, expect, it } from 'vitest';
import {
  cotizacionAUsd,
  detalleCotizacionEur,
  factorEuroUsd,
  simboloCotizacion,
  usdACotizacion,
} from './cotizacionMoneda';

describe('cotización $ o € a tasa BCV', () => {
  const tasas = { usd: 40, eur: 44 };

  it('USD pasa tal cual al precio canónico', () => {
    expect(cotizacionAUsd(123.45, 'USD', tasas)).toBe(123.45);
    expect(usdACotizacion(123.45, 'USD', tasas)).toBe(123.45);
    expect(simboloCotizacion('USD')).toBe('$');
  });

  it('EUR se convierte a USD con la razón de las tasas BCV', () => {
    expect(factorEuroUsd(tasas)).toBe(1.1);
    expect(cotizacionAUsd(100, 'EUR', tasas)).toBe(110);
    expect(usdACotizacion(110, 'EUR', tasas)).toBe(100);
    expect(simboloCotizacion('EUR')).toBe('€');
  });

  it('no inventa tasa si falta USD o EUR', () => {
    expect(factorEuroUsd({ usd: 40, eur: 0 })).toBe(0);
    expect(factorEuroUsd({ usd: 0, eur: 44 })).toBe(0);
    expect(cotizacionAUsd(100, 'EUR', { usd: 40, eur: 0 })).toBe(0);
    expect(usdACotizacion(110, 'EUR', { usd: 0, eur: 44 })).toBe(0);
  });

  it('la comparativa describe la cotización en euro a tasa BCV', () => {
    const detalle = detalleCotizacionEur(110, tasas);
    expect(detalle).toContain('€ 100,00');
    expect(detalle).toContain('44,00 Bs/€');
    expect(detalle).toContain('$110,00');
    expect(detalleCotizacionEur(0, tasas)).toBeNull();
  });
});
