import { describe, it, expect } from 'vitest';
import { convertirConTasa, errorTasaPago, requiereTasa, textoTasaPago } from './tasaPago';

describe('¿hace falta tasa?', () => {
  it('misma moneda, no', () => {
    expect(requiereTasa('USD', 'USD')).toBe(false);
    expect(requiereTasa('Bs', 'Bs')).toBe(false);
  });
  it('el USDT se paga como dólar', () => {
    expect(requiereTasa('USD', 'USDT')).toBe(false);
    expect(requiereTasa('USDT', 'USD')).toBe(false);
  });
  it('cruzar Bs con dólar, sí', () => {
    expect(requiereTasa('USD', 'Bs')).toBe(true);
    expect(requiereTasa('Bs', 'USDT')).toBe(true);
  });
});

describe('cuánto sale de la billetera', () => {
  it('sin conversión sale el mismo monto', () => {
    expect(convertirConTasa(120.5, 'USD', 'USD', 0)).toBe(120.5);
  });
  it('de $ a Bs multiplica por la tasa', () => {
    expect(convertirConTasa(100, 'USD', 'Bs', 36.5)).toBe(3650);
  });
  it('de Bs a $ divide por la tasa', () => {
    expect(convertirConTasa(3650, 'Bs', 'USD', 36.5)).toBe(100);
  });
  it('redondea a dos decimales', () => {
    expect(convertirConTasa(100, 'Bs', 'USD', 36.53)).toBe(2.74);
  });
  it('sin tasa no inventa un monto', () => {
    expect(convertirConTasa(100, 'USD', 'Bs', 0)).toBe(0);
  });
  it('un par que la tasa BCV no cubre devuelve 0', () => {
    expect(convertirConTasa(100, 'USD', 'COP', 36.5)).toBe(0);
  });
  it('monto en cero o negativo no mueve nada', () => {
    expect(convertirConTasa(0, 'USD', 'Bs', 36.5)).toBe(0);
    expect(convertirConTasa(-5, 'USD', 'Bs', 36.5)).toBe(0);
  });
});

describe('el error que ve el usuario', () => {
  it('sin conversión no hay error', () => {
    expect(errorTasaPago('USD', 'USDT', 0)).toBeNull();
  });
  it('falta la tasa', () => {
    expect(errorTasaPago('USD', 'Bs', 0)).toContain('tasa de pago');
  });
  it('con tasa, adelante', () => {
    expect(errorTasaPago('USD', 'Bs', 36.5)).toBeNull();
  });
  it('un par que la tasa no cubre se explica', () => {
    expect(errorTasaPago('USD', 'COP', 36.5)).toContain('bolívares y dólares');
  });
});

describe('cómo se lee en la ficha', () => {
  it('sin tasa no dice nada', () => {
    expect(textoTasaPago(null, 40)).toBe('');
    expect(textoTasaPago(0, 40)).toBe('');
  });
  it('si es la misma del montaje, la dice una sola vez', () => {
    expect(textoTasaPago(36.5, 36.5)).toBe('36,50 Bs/$');
  });
  it('si cambió, aclara a cuánto se había montado', () => {
    expect(textoTasaPago(38.2, 36.5)).toBe('38,20 Bs/$ al pagar (se montó a 36,50)');
  });
  it('sin tasa de montaje solo muestra la del pago', () => {
    expect(textoTasaPago(38.2, null)).toBe('38,20 Bs/$');
  });
});
