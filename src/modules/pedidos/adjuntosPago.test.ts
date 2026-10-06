import { describe, expect, it } from 'vitest';
import { adjuntosDePago, comprobantesDeLaOrden } from './adjuntosPago';

describe('adjuntos del pago de una OC', () => {
  it('OC vieja: el comprobante sale de factura_path', () => {
    expect(comprobantesDeLaOrden({ factura_path: 'oc/1/factura-a.pdf', factura_nombre: null })).toEqual([
      { path: 'oc/1/factura-a.pdf', nombre: 'factura-a.pdf', etiqueta: 'Comprobante de pago' },
    ]);
  });

  it('varios comprobantes se numeran y mandan sobre factura_path', () => {
    const r = comprobantesDeLaOrden({
      factura_path: 'a.png', factura_nombre: 'a.png',
      comprobantes_pago: [{ path: 'a.png', nombre: 'a.png' }, { path: 'b.png', nombre: 'b.png' }],
    });
    expect(r.map((x) => x.etiqueta)).toEqual(['Comprobante de pago 1', 'Comprobante de pago 2']);
  });

  it('suma abonos, retención y factura del proveedor sin repetir', () => {
    const r = adjuntosDePago(
      { factura_path: 'p.pdf', factura_nombre: 'pago.pdf', retencion_path: 'r.pdf', retencion_nombre: 'ret.pdf', factura_recepcion_path: 'p.pdf' },
      [{ comprobante_path: 'ab1.jpg', comprobante_nombre: 'ab1.jpg' }, { comprobante_path: null }],
    );
    expect(r.map((x) => x.etiqueta)).toEqual(['Comprobante de pago', 'Abono 1', 'Retención']);
  });

  it('sin archivos no hay nada que mostrar', () => {
    expect(adjuntosDePago({})).toEqual([]);
  });
});
