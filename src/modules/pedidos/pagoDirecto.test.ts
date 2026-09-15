import { describe, expect, it } from 'vitest';
import { errorRetencionPago, montoLegadoARevertir, netoAPagar, patasConMonto } from './pagoDirecto';

describe('errorRetencionPago', () => {
  it('una retención entre 0 y el total está bien', () => {
    expect(errorRetencionPago(200, 12)).toBeNull();
  });

  it('cero, negativa o igual/mayor que el total no se aceptan', () => {
    expect(errorRetencionPago(200, 0)).not.toBeNull();
    expect(errorRetencionPago(200, -5)).not.toBeNull();
    expect(errorRetencionPago(200, 200)).not.toBeNull();
    expect(errorRetencionPago(200, 250)).not.toBeNull();
  });

  it('compara en centavos: 199,999 se lee como 200', () => {
    expect(errorRetencionPago(200, 199.999)).not.toBeNull();
  });
});

describe('netoAPagar', () => {
  it('total − retención', () => {
    expect(netoAPagar(1160, 87)).toBe(1073);
  });

  it('sin retención, el total', () => {
    expect(netoAPagar(1160, 0)).toBe(1160);
  });

  it('una retención negativa no suma al total', () => {
    expect(netoAPagar(100, -10)).toBe(100);
  });
});

describe('montoLegadoARevertir', () => {
  it('al reabrir se devuelve el neto que salió, no el total de la factura', () => {
    expect(montoLegadoARevertir(1160, 87)).toBe(1073);
  });

  it('pagos anteriores a la retención (sin el campo) devuelven el total, como antes', () => {
    expect(montoLegadoARevertir(500, null)).toBe(500);
    expect(montoLegadoARevertir(500, undefined)).toBe(500);
  });

  it('sin gasto no devuelve nada', () => {
    expect(montoLegadoARevertir(null, 10)).toBe(0);
  });
});

describe('patasConMonto', () => {
  it('descarta las patas vacías y tolera null', () => {
    expect(patasConMonto([{ monto: 0 }, { monto: '5' }, { monto: 3 }])).toEqual([{ monto: '5' }, { monto: 3 }]);
    expect(patasConMonto(null)).toEqual([]);
  });
});
