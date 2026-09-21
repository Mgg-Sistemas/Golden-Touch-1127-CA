import { describe, expect, it } from 'vitest';
import {
  esPagoRegistradoSinDatos, MENSAJE_PAGO_REGISTRADO_SIN_DATOS, NOMBRE_PAGO_REGISTRADO_SIN_DATOS,
} from './pagoOcAvisos';

describe('esPagoRegistradoSinDatos', () => {
  it('reconoce el error por su nombre', () => {
    const e = new Error(MENSAJE_PAGO_REGISTRADO_SIN_DATOS);
    e.name = NOMBRE_PAGO_REGISTRADO_SIN_DATOS;
    expect(esPagoRegistradoSinDatos(e)).toBe(true);
  });

  it('no confunde un error común de pago', () => {
    expect(esPagoRegistradoSinDatos(new Error('Saldo insuficiente en Caja Bs.'))).toBe(false);
    expect(esPagoRegistradoSinDatos(null)).toBe(false);
    expect(esPagoRegistradoSinDatos('PagoRegistradoSinDatos')).toBe(false);
  });

  it('el mensaje deja claro que NO hay que volver a pagar', () => {
    expect(MENSAJE_PAGO_REGISTRADO_SIN_DATOS).toMatch(/SÍ SE REALIZÓ/);
    expect(MENSAJE_PAGO_REGISTRADO_SIN_DATOS).toMatch(/NO vuelvas a pagarla/);
  });
});
