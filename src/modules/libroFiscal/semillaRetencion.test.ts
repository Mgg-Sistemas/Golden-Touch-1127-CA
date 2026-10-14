import { describe, expect, it } from 'vitest';
import { FILTRO_OC_CON_FACTURA, aOcConFactura, type OcConFactura } from './bandeja.repository';
import { semillaDeOc } from './semillaRetencion';

// Datos inventados: ningún proveedor ni monto real.
const oc = (over: Partial<OcConFactura>): OcConFactura => ({
  id: 'oc-1', ocCodigo: 'OC-0001', opCodigo: 'OP-0001', proveedorId: 'p-1',
  proveedorNombre: 'Proveedor de prueba', proveedorRif: 'J-00000000-0', condicionLabel: 'Contado',
  moneda: 'USD', total: 0, iva: 0, igtf: 0, facturaPath: null, facturaNombre: null, enLibro: 0,
  ...over,
});

describe('semilla del 🧾 · la base es el total menos el IVA y el IGTF, con lo exento dentro', () => {
  it('OC con IVA: trae el IVA de la orden y la base queda sin él', () => {
    const s = semillaDeOc(oc({ total: 1160, iva: 160 }));
    expect(s.iva).toBe(160);
    expect(s.baseImponible).toBe(1000);
    expect(s.docKind).toBe('oc');
    expect(s.contraparteId).toBe('p-1');
  });

  it('OC con algo exento: lo exento queda dentro de la base (total − IVA)', () => {
    expect(semillaDeOc(oc({ total: 1260, iva: 160 })).baseImponible).toBe(1100);
  });

  it('OC con IGTF: el IGTF tampoco es base', () => {
    expect(semillaDeOc(oc({ total: 1190, iva: 160, igtf: 30 })).baseImponible).toBe(1000);
  });

  it('OC en bolívares: la retención se abre en Bs', () => {
    expect(semillaDeOc(oc({ moneda: 'Bs', total: 100 })).moneda).toBe('Bs');
  });
});

describe('qué OC entran a la bandeja', () => {
  it('las de soporte factura o con la factura del proveedor adjunta; nunca por el comprobante del pago', () => {
    expect(FILTRO_OC_CON_FACTURA).toContain('comprobante_tipo.eq.factura');
    expect(FILTRO_OC_CON_FACTURA).toContain('factura_recepcion_path.not.is.null');
    expect(FILTRO_OC_CON_FACTURA).not.toMatch(/(^|,)factura_path/);
  });

  it('lee las columnas de GT: IVA e IGTF con su marca, la moneda del total y lo que ya hay en el libro', () => {
    const fila = aOcConFactura(
      { id: 'oc-9', oc_codigo: 'OC-9', proveedor_id: 'p-1', total: 1190, total_moneda: 'Bs',
        iva_aplicado: true, iva_monto: 160, igtf_aplicado: false, igtf_monto: 30, factura_recepcion_path: 'oc-9/f.pdf' },
      new Map([['p-1', { nombre: 'Proveedor de prueba', rif: 'J-00000000-0' }]]),
      new Map([['oc-9', 2]]),
    );
    expect(fila).toMatchObject({ moneda: 'Bs', iva: 160, igtf: 0, proveedorNombre: 'Proveedor de prueba', enLibro: 2, facturaPath: 'oc-9/f.pdf' });
  });
});
