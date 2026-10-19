/* ============================================================
   El Excel «Compras por estado» se arma con ExcelJS (para colores y
   bordes como los demás Excel del sistema). Aquí se vuelve a leer el
   archivo generado y se comprueba lo que el usuario verá: título,
   encabezado, un bloque por estado, subtotales y total general.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import type { EstadoOrden, Orden } from '@/shared/lib/types';
import { construirReporteComprasExcel } from './reporteComprasExcel';

const orden = (estado: EstadoOrden, patch: Record<string, unknown> = {}): Orden => ({
  id: patch.oc_codigo ?? crypto.randomUUID(),
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

async function leer(bytes: ArrayBuffer) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  return wb.worksheets[0];
}

describe('construirReporteComprasExcel', () => {
  it('arma la hoja con título, encabezado y los cuatro bloques pedidos', async () => {
    const bytes = await construirReporteComprasExcel({
      ordenes: [
        orden('oc_creada', { oc_codigo: 'OC-1', total: 100 }),
        orden('cuenta_abierta', { oc_codigo: 'OC-2', total: 1000, abonado_total: 250 }),
        orden('confirmada_metodo', { oc_codigo: 'OC-3', total: 50 }),
        orden('oc_aprobada', { oc_codigo: 'OC-4', total: 3600, total_moneda: 'Bs' }),
      ],
      tasa: 36,
      generadoEn: '2026-10-19T12:00:00Z',
    });
    expect(bytes.byteLength).toBeGreaterThan(0);

    const ws = await leer(bytes);
    expect(String(ws.getCell('A1').value)).toContain('COMPRAS POR ESTADO');
    expect(ws.getCell('A4').value).toBe('TIPO');
    expect(ws.getCell('F4').value).toBe('MONTO Bs');

    const codigos = ws.getColumn(2).values.map((v) => String(v ?? ''));
    for (const c of ['OC-1', 'OC-2', 'OC-3', 'OC-4']) expect(codigos).toContain(c);

    const textos = ws.getColumn(1).values.map((v) => String(v ?? ''));
    expect(textos).toContain('PENDIENTE POR APROBAR (1)');
    expect(textos).toContain('CUENTAS A CRÉDITO (1)');
    expect(textos).toContain('POR INDICAR MÉTODO DE PAGO (1)');
    expect(textos).toContain('POR PAGAR (1)');
  });

  it('en la celda de la OC a crédito va el saldo, no el total', async () => {
    const ws = await leer(await construirReporteComprasExcel({
      ordenes: [orden('cuenta_abierta', { oc_codigo: 'OC-2', total: 1000, abonado_total: 250 })],
      tasa: 36,
    }));
    const fila = ws.getColumn(2).values.findIndex((v) => v === 'OC-2');
    expect(fila).toBeGreaterThan(0);
    expect(ws.getCell(fila, 4).value).toBe(750);
  });

  it('el total general suma $ y Bs convirtiendo a la tasa BCV', async () => {
    const ws = await leer(await construirReporteComprasExcel({
      ordenes: [
        orden('oc_creada', { oc_codigo: 'OC-1', total: 100 }),
        orden('oc_aprobada', { oc_codigo: 'OC-4', total: 3600, total_moneda: 'Bs' }),
      ],
      tasa: 36,
    }));
    const filaTotal = ws.getColumn(1).values.findIndex((v) => v === 'TOTAL GENERAL');
    expect(filaTotal).toBeGreaterThan(0);
    expect(ws.getCell(filaTotal, 1).value).toBe('TOTAL GENERAL');
    // 100 $ + 3600 Bs/36 = 100 $ → 200 $; 3600 + 100·36 = 7200 Bs.
    expect(ws.getCell(filaTotal, 5).value).toBe(200);
    expect(ws.getCell(filaTotal, 6).value).toBe(7200);
  });

  it('sin tasa no rompe: deja en blanco la columna de la otra moneda', async () => {
    const ws = await leer(await construirReporteComprasExcel({
      ordenes: [orden('oc_aprobada', { oc_codigo: 'OC-4', total: 3600, total_moneda: 'Bs' })],
      tasa: 0,
    }));
    const fila = ws.getColumn(2).values.findIndex((v) => v === 'OC-4');
    expect(ws.getCell(fila, 4).value).toBe(3600);
    // Sin tasa, la otra moneda va vacía (no se inventa un 0 que parezca un monto).
    expect(ws.getCell(fila, 5).value).toBe('');
  });
});
