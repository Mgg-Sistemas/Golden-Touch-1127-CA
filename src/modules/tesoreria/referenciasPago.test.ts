import { describe, expect, it } from 'vitest';
import {
  errorReferencias, motivoConReferencias, referenciaValida, textoReferencias, tipoReferencia, ultimos4,
  type PataReferencia,
} from './referenciasPago';

describe('Referencia del pago en Tesorería', () => {
  it('Bs pide referencia bancaria, USDT pide ID de Binance y USD no pide nada', () => {
    expect(tipoReferencia('Bs')).toBe('bs');
    expect(tipoReferencia('USDT')).toBe('binance');
    expect(tipoReferencia('USD')).toBeNull();
    expect(tipoReferencia(null)).toBeNull();
  });

  it('Bs en efectivo no pide referencia; si también hay transferencia o pago móvil, sí', () => {
    expect(tipoReferencia('Bs', [{ metodo: 'efectivo_bs' }])).toBeNull();
    expect(tipoReferencia('Bs', [{ metodo: 'efectivo_bs' }, { metodo: 'pago_movil' }])).toBe('bs');
    expect(tipoReferencia('Bs', [{ metodo: 'transferencia' }])).toBe('bs');
    expect(tipoReferencia('USDT', [{ metodo: 'efectivo_bs' }])).toBe('binance');
  });

  it('se queda con los últimos 4 dígitos aunque peguen la referencia completa', () => {
    expect(ultimos4('000123456789')).toBe('6789');
    expect(ultimos4('12-34')).toBe('1234');
    expect(ultimos4('12')).toBe('12');
    expect(referenciaValida('1234')).toBe(true);
    expect(referenciaValida('123')).toBe(false);
    expect(referenciaValida('')).toBe(false);
    // Para Bs solo acepta dígitos
    expect(ultimos4('AB12CD', 'bs')).toBe('12');
    expect(referenciaValida('12AB', 'bs')).toBe(false);
  });

  it('Binance permite letras y dígitos en mayúsculas (alfanumérico)', () => {
    expect(ultimos4('BINANCE-ORD-7A9B', 'binance')).toBe('7A9B');
    expect(ultimos4('ord_xy3z', 'binance')).toBe('XY3Z');
    expect(ultimos4('1234', 'binance')).toBe('1234');
    expect(referenciaValida('7A9B', 'binance')).toBe(true);
    expect(referenciaValida('xy3z', 'binance')).toBe(true);
    expect(referenciaValida('1234', 'binance')).toBe(true);
    expect(referenciaValida('123', 'binance')).toBe(false);
    expect(referenciaValida('12-3', 'binance')).toBe(false);
  });

  const patas: PataReferencia[] = [
    { key: 'a', tipo: 'bs', etiqueta: 'jurídica' },
    { key: 'b', tipo: 'binance' },
  ];

  it('avisa lo que falta y no deja pasar referencias incompletas', () => {
    expect(errorReferencias(patas, {})).toBe('Indica la referencia de la transferencia / pago móvil y el ID de la orden de Binance: los últimos 4 dígitos (o letras en Binance).');
    expect(errorReferencias(patas, { a: '1234', b: '56' })).toBe('Indica el ID de la orden de Binance: los últimos 4 dígitos o letras.');
    expect(errorReferencias(patas, { a: '1234', b: '5678' })).toBeNull();
    expect(errorReferencias(patas, { a: '1234', b: '7A9B' })).toBeNull();
    expect(errorReferencias([], {})).toBeNull();
  });

  it('arma el motivo con las referencias primero y la nota después', () => {
    const refs = { a: '1234', b: '5678' };
    expect(textoReferencias(patas, refs)).toBe('Ref. Bs (jurídica) 1234 · ID Binance 5678');
    expect(motivoConReferencias('  pago parcial ', patas, refs)).toBe('Ref. Bs (jurídica) 1234 · ID Binance 5678 · pago parcial');
    expect(motivoConReferencias('', [], {})).toBeNull();
    expect(motivoConReferencias('nota', [], {})).toBe('nota');
  });
});
