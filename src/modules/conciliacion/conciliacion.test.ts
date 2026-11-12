import { describe, expect, it } from 'vitest';
import type { Orden } from '@/shared/lib/types';
import {
  FILTROS_VACIOS, armarFilas, filtrarFilas, indicadores, referenciasDeMotivo, renumerar, tasaDelPago,
  textoRetencion, type ContextoConciliacion, type PagoOc, type RetencionLibro,
} from './conciliacion';
import { agrupar, celda, textoWhatsappConciliacion } from './reporteConciliacion';

const dia = (iso: string) => iso.slice(0, 10);

function orden(p: Partial<Orden> & { id: string }): Orden {
  return {
    codigo: `SP-${p.id}`, oc_codigo: `OC-${p.id}`, estado: 'recibida', total: 100, total_moneda: 'USD',
    proveedor_id: 'prov1', created_at: '2026-11-05T12:00:00Z',
    ...p,
  } as Orden;
}

function ctx(pagos: PagoOc[] = [], ret: RetencionLibro[] = [], bcv: Record<string, number> = {}): ContextoConciliacion {
  const agr = <T extends { ordenId: string }>(xs: T[]) => {
    const m = new Map<string, T[]>();
    xs.forEach((x) => m.set(x.ordenId, [...(m.get(x.ordenId) ?? []), x]));
    return m;
  };
  return {
    proveedores: new Map([['prov1', 'Ferretería Uno']]),
    pagos: agr(pagos), retenciones: agr(ret),
    bcvPorDia: new Map(Object.entries(bcv)), bcvHoy: 50, dia,
  };
}

describe('Conciliación', () => {
  it('lee las referencias que Tesorería pone en el motivo del pago', () => {
    expect(referenciasDeMotivo('Pago OC OC-1 · pago: Ref. Bs 1234 · ID Binance 5678 · nota')).toEqual(['Bs 1234', 'Binance 5678']);
    expect(referenciasDeMotivo('Pago OC OC-1 · pago: Ref. Bs (Caja A · Jurídica) 1111 · Ref. Bs (Caja B · Personal) 2222')).toEqual(['Bs 1111', 'Bs 2222']);
    expect(referenciasDeMotivo('Pago OC OC-1 · pago: transferencia')).toEqual([]);
    expect(referenciasDeMotivo(null)).toEqual([]);
  });

  it('la tasa sale de lo pagado en Bs si es coherente con la BCV del día; si no, la BCV', () => {
    const o = { total: 100, total_moneda: 'USD', retencion_monto: null } as Orden;
    const pagoBs = (monto: number): PagoOc[] => [{ ordenId: 'x', monto, moneda: 'Bs', motivo: null, at: '2026-11-05T13:00:00Z' }];
    expect(tasaDelPago(o, pagoBs(4050), 40, 50)).toEqual({ tasa: 40.5, fuente: 'pago' });
    // Muy lejos de la BCV (p. ej. pago parcial): se usa la BCV del día del pago.
    expect(tasaDelPago(o, pagoBs(2000), 40, 50)).toEqual({ tasa: 40, fuente: 'bcv_pago' });
    // Pagada en $: la BCV del día del pago.
    expect(tasaDelPago(o, [{ ordenId: 'x', monto: 100, moneda: 'USD', motivo: null, at: null }], 40, 50)).toEqual({ tasa: 40, fuente: 'bcv_pago' });
    // Sin pagar: la de hoy.
    expect(tasaDelPago(o, [], null, 50)).toEqual({ tasa: 50, fuente: 'bcv_hoy' });
  });

  it('arma la fila: montos en $ y Bs, referencia, retenciones con comprobante y estatus de Compras', () => {
    const o = orden({ id: '1', estado: 'oc_aprobada', pagada_en: '2026-11-06T15:00:00Z' });
    const filas = armarFilas([o], ctx(
      [{ ordenId: '1', monto: 4000, moneda: 'Bs', motivo: 'Pago OC OC-1 · pago: Ref. Bs 9876', at: '2026-11-06T15:00:00Z' }],
      [{ ordenId: '1', tipo: 'municipal', comprobante: '20261100000012', monto: 1, moneda: 'Bs' }],
      { '2026-11-06': 40 },
    ));
    const r = filas[0];
    expect(r.item).toBe(1);
    expect(r.codigo).toBe('OC-1');
    expect(r.proveedor).toBe('Ferretería Uno');
    expect(r.totalUsd).toBe(100);
    expect(r.totalBs).toBe(4000);
    expect(r.tasa).toBe(40);
    expect(r.referencias).toEqual(['Bs 9876']);
    expect(r.estadoLabel).toBe('Esperando pago');
    expect(r.pagada).toBe(true);
    expect(r.pagadoUsd).toBe(100);
    expect(textoRetencion(r)).toBe('ISAE N° 20261100000012');
  });

  it('una OC en Bs se convierte a $ con la tasa', () => {
    const [r] = armarFilas([orden({ id: '2', total: 5000, total_moneda: 'Bs' })], ctx());
    expect(r.totalBs).toBe(5000);
    expect(r.totalUsd).toBe(100);
    expect(r.fuenteTasa).toBe('bcv_hoy');
    expect(r.pagada).toBe(false);
    expect(textoRetencion(r)).toBe('No');
  });

  it('filtra, renumera y calcula las tarjetas sin contar las canceladas', () => {
    const filas = armarFilas([
      orden({ id: '1', estado: 'recibida', pagada_en: '2026-11-06T15:00:00Z' }),
      orden({ id: '2', estado: 'finalizada', retencion_aplicada: true }),
      orden({ id: '3', estado: 'cancelada' }),
    ], ctx([{ ordenId: '1', monto: 100, moneda: 'USD', motivo: null, at: '2026-11-06T15:00:00Z' }]));
    const visibles = renumerar(filtrarFilas(filas, FILTROS_VACIOS, dia));
    expect(visibles.map((r) => [r.item, r.codigo])).toEqual([[1, 'OC-1'], [2, 'OC-2']]);
    const k = indicadores(visibles);
    expect(k.totalOc.cantidad).toBe(2);
    expect(k.pagado).toEqual({ cantidad: 1, usd: 100, bs: 5000 });
    expect(k.conRetencion.cantidad).toBe(1);
    expect(filtrarFilas(filas, { ...FILTROS_VACIOS, incluirAnuladas: true }, dia)).toHaveLength(3);
    expect(filtrarFilas(filas, { ...FILTROS_VACIOS, retencion: 'con' }, dia).map((r) => r.codigo)).toEqual(['OC-2']);
    expect(filtrarFilas(filas, { ...FILTROS_VACIOS, texto: 'ferreteria' }, dia)).toHaveLength(2);
    expect(filtrarFilas(filas, { ...FILTROS_VACIOS, desde: '2026-11-06' }, dia)).toHaveLength(0);
  });

  it('el reporte agrupa con subtotales y arma el texto de WhatsApp', () => {
    const filas = renumerar(armarFilas([
      orden({ id: '1', estado: 'recibida' }), orden({ id: '2', estado: 'finalizada' }), orden({ id: '3', estado: 'recibida' }),
    ], ctx()));
    const g = agrupar(filas, 'estado');
    expect(g.map((x) => [x.titulo, x.filas.length, x.totalUsd])).toEqual([['Recibida', 2, 200], ['Finalizada', 1, 100]]);
    expect(celda(filas[0], 'codigo')).toBe('OC-1');
    const txt = textoWhatsappConciliacion(filas, { titulo: 'Conciliación', filtrosTexto: '', generado: 'hoy' }, 2);
    expect(txt).toContain('Total de OC: *3*');
    expect(txt).toContain('1. *OC-1* · Ferretería Uno');
    expect(txt).toContain('…y 1 OC más');
  });
});
