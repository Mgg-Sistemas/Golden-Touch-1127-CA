/* ============================================================
   Golden Touch · Tesorería · Test del aviso de WhatsApp del reporte
   Fija el formato puntual/neutro de textoWhatsappTesoreria: encabezado por
   ámbito, un ítem por renglón con su moneda, total consolidado bruto en $/Bs,
   respeto de los interruptores de moneda, tope de ítems y etiqueta de respaldo.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { textoWhatsappTesoreria } from './whatsappTesoreria';
import type { FilaReporteTesoreria } from './reporteTesoreriaMoldeable';

/** Fila mínima para el test; lo que el builder no usa queda en valores neutros. */
function mkFila(p: Partial<FilaReporteTesoreria>): FilaReporteTesoreria {
  return {
    id: p.id ?? 'x',
    ambito: p.ambito ?? 'por_pagar',
    fecha: p.fecha ?? '2026-11-01',
    moneda_original: p.moneda_original ?? 'USD',
    monto_original: p.monto_original ?? 0,
    tipo_movimiento: p.tipo_movimiento ?? 'egreso',
    categoria: p.categoria ?? '',
    contraparte: p.contraparte ?? '',
    concepto: p.concepto ?? '',
    origen_documento: p.origen_documento ?? 'OC',
    tasa_bcv_aplicada: p.tasa_bcv_aplicada ?? 36,
    monto_usd: p.monto_usd ?? 0,
    monto_bs: p.monto_bs ?? 0,
    ...p,
  } as FilaReporteTesoreria;
}

const RANGO = { desde: '2026-11-01', hasta: '2026-11-02' } as const;

describe('textoWhatsappTesoreria', () => {
  it('lista cada ítem en su moneda y cierra con el total consolidado bruto', () => {
    const filas = [
      mkFila({ contraparte: 'FERRETERIA CENTRAL', moneda_original: 'USD', monto_original: 100, monto_usd: 100, monto_bs: 3600 }),
      mkFila({ contraparte: 'PROVEEDOR X', moneda_original: 'Bs', monto_original: 846, monto_usd: 23.5, monto_bs: 846 }),
    ];
    const t = textoWhatsappTesoreria(filas, { ambito: 'por_pagar', ...RANGO });
    const lineas = t.split('\n');
    expect(lineas[0]).toMatch(/ — Reporte de Tesorería$/);
    expect(lineas[1]).toBe('Pendientes por pagar · 01/11/2026 al 02/11/2026');
    expect(lineas[2]).toBe('');
    expect(lineas[3]).toBe('1. FERRETERIA CENTRAL — USD 100,00');
    expect(lineas[4]).toBe('2. PROVEEDOR X — Bs 846,00');
    // Total bruto: $ 123,50 (100 + 23,5) · Bs 4.446,00 (3.600 + 846)
    expect(lineas[lineas.length - 1]).toBe('Total (2): $ 123,50 · Bs 4.446,00');
  });

  it('sin filas, avisa que no hay registros', () => {
    const t = textoWhatsappTesoreria([], { ambito: 'movimientos', ...RANGO });
    expect(t).toContain('Movimientos de caja · 01/11/2026 al 02/11/2026');
    expect(t).toContain('Sin registros en este ámbito.');
    expect(t).not.toMatch(/Total/);
  });

  it('respeta los interruptores de moneda en el total', () => {
    const filas = [mkFila({ contraparte: 'A', monto_usd: 50, monto_bs: 1800 })];
    const soloUsd = textoWhatsappTesoreria(filas, { ambito: 'por_pagar', ...RANGO, mostrarBs: false });
    expect(soloUsd).toMatch(/Total \(1\): \$ 50,00$/);
    const soloBs = textoWhatsappTesoreria(filas, { ambito: 'por_pagar', ...RANGO, mostrarUsd: false });
    expect(soloBs).toMatch(/Total \(1\): Bs 1\.800,00$/);
  });

  it('usa la categoría cuando no hay proveedor', () => {
    const filas = [mkFila({ contraparte: '—', categoria: 'Combustible', moneda_original: 'USD', monto_original: 12, monto_usd: 12, monto_bs: 432 })];
    const t = textoWhatsappTesoreria(filas, { ambito: 'movimientos', ...RANGO });
    expect(t).toContain('1. Combustible — USD 12,00');
  });

  it('corta en 40 ítems pero suma el total con todos', () => {
    const filas = Array.from({ length: 41 }, (_, i) =>
      mkFila({ id: String(i), contraparte: `P${i}`, monto_usd: 1, monto_bs: 36 }));
    const t = textoWhatsappTesoreria(filas, { ambito: 'por_pagar', ...RANGO });
    expect(t).toContain('40. P39 — USD 0,00');
    expect(t).not.toContain('41. ');
    expect(t).toContain('(+1 ítem(s) más)');
    expect(t).toMatch(/Total \(41\): \$ 41,00 · Bs 1\.476,00$/);
  });
});
