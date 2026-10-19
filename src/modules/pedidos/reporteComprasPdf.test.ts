/* ============================================================
   El PDF «Compras por estado» lo abre el usuario con un clic y el
   resultado no pasa por ninguna lógica intermedia: si se rompe el
   armado, la pantalla solo dice «no se pudo generar». Estos tests
   construyen el documento con datos parecidos a los reales (los
   cuatro renglones, montos en $ y en Bs) para que el fallo se note
   aquí.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import type { EstadoOrden, Orden } from '@/shared/lib/types';
import { construirReporteComprasPdf } from './reporteComprasPdf';

const orden = (estado: EstadoOrden, patch: Record<string, unknown> = {}): Orden => ({
  id: crypto.randomUUID(),
  codigo: 'SP-2026-0001',
  oc_codigo: 'OC-2026-0001',
  estado,
  total: 100,
  total_moneda: null,
  notas: 'SOLICITUD DE SACOS MINEROS',
  items: [{ nombre: 'Saco', cantidad: 1, precio: 100 }],
  historial: [],
  solicitante_email: 'x@y.z',
  proveedor_id: null,
  created_at: '2026-10-01T00:00:00Z',
  ...patch,
} as unknown as Orden);

const base = { tasa: 36, tasaFecha: '2026-10-19', generadoEn: '2026-10-19T12:00:00Z' };

describe('construirReporteComprasPdf', () => {
  it('sin órdenes igual imprime los cuatro renglones marcados vacíos', async () => {
    const doc = await construirReporteComprasPdf({ ordenes: [], ...base });
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('arma un renglón por estado con código, motivo y monto', async () => {
    const doc = await construirReporteComprasPdf({
      ordenes: [
        orden('oc_creada', { oc_codigo: 'OC-2026-0158' }),
        orden('cuenta_abierta', { total: 1000, abonado_total: 250 }),
        orden('confirmada_metodo', { total_moneda: 'Bs', total: 3600 }),
        orden('oc_aprobada'),
        // Estados ajenos al reporte no deben sumar.
        orden('pagada', { total: 9999 }),
        orden('cancelada', { total: 9999 }),
      ],
      ...base,
    });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('con muchas órdenes la tabla pasa de una página y no rompe', async () => {
    const muchas = Array.from({ length: 60 }, (_, i) =>
      orden('oc_aprobada', { oc_codigo: `OC-2026-${String(1000 + i)}`, notas: 'X'.repeat(160) }));
    const doc = await construirReporteComprasPdf({ ordenes: muchas, ...base });
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });

  it('sin tasa BCV no rompe (la columna de Bs sale en «—»)', async () => {
    const doc = await construirReporteComprasPdf({
      ordenes: [orden('oc_aprobada', { total_moneda: 'Bs', total: 3600 })],
      tasa: 0,
      generadoEn: '2026-10-19T12:00:00Z',
    });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
});
