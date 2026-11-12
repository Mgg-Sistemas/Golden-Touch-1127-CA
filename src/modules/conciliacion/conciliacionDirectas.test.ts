import { describe, expect, it } from 'vitest';
import type { Orden } from '@/shared/lib/types';
import {
  FILTROS_VACIOS, armarFilas, claveDoc, combinarFilas, filasDirectas, filtrarFilas,
  type ContextoConciliacion, type DocDirecto,
} from './conciliacion';
import { agrupar } from './reporteConciliacion';

const dia = (iso: string) => iso.slice(0, 10);

const base = (p: Partial<ContextoConciliacion> = {}): ContextoConciliacion => ({
  proveedores: new Map([['prov1', 'Ferretería Uno']]),
  pagos: new Map(), retenciones: new Map(), bcvPorDia: new Map([['2026-11-06', 40]]), bcvHoy: 50, dia, ...p,
});

const doc = (p: Partial<DocDirecto> & { id: string }): DocDirecto => ({
  origen: 'cd', codigo: `CD-${p.id}`, proveedor: 'Abasto Dos', estado: 'finalizada', fecha: '2026-11-06T12:00:00Z',
  moneda: 'USD', total: 80, tasaPago: null, tasaConversion: null, pagadaAt: '2026-11-06T13:00:00Z',
  retencionPago: null, retencionTipo: null, adjuntoPath: null, adjuntoNombre: null, ...p,
});

const orden = (id: string, p: Partial<Orden> = {}): Orden => ({
  id, codigo: `SP-${id}`, oc_codigo: `OC-${id}`, estado: 'finalizada', total: 100, total_moneda: 'USD',
  proveedor_id: 'prov1', created_at: '2026-11-05T12:00:00Z', ...p,
} as Orden);

describe('Conciliación · compras y servicios directos', () => {
  it('la compra directa sale con su factura, monto y tasa del pago', () => {
    const [f] = filasDirectas([doc({ id: '1', adjuntoPath: 'c1/factura.pdf', adjuntoNombre: 'factura.pdf', tasaPago: 41 })],
      base({ facturas: new Map([[claveDoc('cd', '1'), 2]]) }));
    expect(f).toMatchObject({
      origen: 'cd', tipo: 'compra_directa', codigo: 'CD-1', proveedor: 'Abasto Dos', estadoLabel: 'Finalizada',
      totalUsd: 80, totalBs: 3280, tasa: 41, fuenteTasa: 'pago', pagada: true, facturas: 3,
    });
    expect(f.facturaPrincipal).toEqual({ path: 'c1/factura.pdf', nombre: 'factura.pdf' });
  });

  it('servicio en Bs sin tasa del pago usa la BCV del día y resta la retención de lo pagado', () => {
    const [f] = filasDirectas([doc({ id: '2', origen: 'sd', moneda: 'Bs', total: 4000, retencionPago: 400 })], base());
    expect(f).toMatchObject({ tipo: 'servicio_directo', tasa: 40, fuenteTasa: 'bcv_pago', totalUsd: 100, totalBs: 4000, pagadoBs: 3600, pagadoUsd: 90 });
    expect(f.retenciones).toEqual([{ tipo: 'Retención', comprobante: null }]);
  });

  it('la referencia anotada en Conciliación se suma a la de Tesorería sin repetirse', () => {
    const notas = new Map([
      [claveDoc('oc', 'a'), { referencia: '1234', comprobantes: [{ path: 'oc/a/x.jpg', nombre: 'x.jpg' }] }],
      [claveDoc('oc', 'b'), { referencia: '9999', comprobantes: [] }],
    ]);
    const pagos = new Map([['a', [{ ordenId: 'a', monto: 100, moneda: 'USD', motivo: 'pago: Ref. Bs 1234', at: '2026-11-06T13:00:00Z' }]]]);
    const [a, b] = armarFilas([orden('a'), orden('b')], base({ notas, pagos }));
    expect(a.referencias).toEqual(['Bs 1234']);
    expect(a.comprobantesConciliacion).toHaveLength(1);
    expect(b.referencias).toEqual(['9999']);
    expect(b.referenciaManual).toBe('9999');
    // Se busca por la referencia anotada.
    expect(filtrarFilas([a, b], { ...FILTROS_VACIOS, texto: '9999' }, dia).map((r) => r.ordenId)).toEqual(['b']);
  });

  it('junta OC y directas por fecha y filtra/agrupa por tipo', () => {
    const filas = combinarFilas(armarFilas([orden('a')], base()), filasDirectas([doc({ id: '1' }), doc({ id: '2', origen: 'sd' })], base()));
    expect(filas.map((r) => [r.item, r.codigo])).toEqual([[1, 'CD-1'], [2, 'CD-2'], [3, 'OC-a']]);
    expect(filtrarFilas(filas, { ...FILTROS_VACIOS, tipo: 'compra_directa' }, dia)).toHaveLength(1);
    expect(agrupar(filas, 'tipo').map((g) => g.titulo).sort()).toEqual(['Compras directas', 'Servicios directos', 'Órdenes de compra'].sort());
  });
});
