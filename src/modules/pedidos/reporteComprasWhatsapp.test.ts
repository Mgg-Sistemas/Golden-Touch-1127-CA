/* ============================================================
   El texto de WhatsApp «Compras por estado» no pasa por ninguna
   pantalla: se copia y se pega en el grupo, y si el formato se rompe
   nadie lo ve hasta que ya se mandó. Por eso el armado vive en una
   función plana y aquí se fija el acuerdo con quien lo lee: un emoji
   por renglón, una viñeta por orden, subtotal por estado y total.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import type { EstadoOrden, Orden } from '@/shared/lib/types';
import { textoReporteComprasWhatsapp } from './reporteComprasWhatsapp';

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

describe('textoReporteComprasWhatsapp', () => {
  it('arma los cuatro renglones con emoji, viñeta, subtotal y total', () => {
    const texto = textoReporteComprasWhatsapp(
      [
        orden('oc_creada', { oc_codigo: 'OC-2026-0001', total: 100 }),
        orden('cuenta_abierta', { oc_codigo: 'OC-2026-0002', total: 1000, abonado_total: 250 }),
        orden('confirmada_metodo', { oc_codigo: 'OC-2026-0003', total: 3600, total_moneda: 'Bs' }),
        orden('oc_aprobada', { oc_codigo: 'OC-2026-0004', total: 500 }),
        // Estados ajenos al reporte no deben entrar.
        orden('pagada', { oc_codigo: 'OC-2026-9999', total: 9999 }),
      ],
      { generadoEn: '2026-10-19T12:00:00Z' },
    );

    expect(texto.startsWith('📋 *COMPRAS POR ESTADO*')).toBe(true);
    expect(texto).toContain('_GOLDEN TOUCH 1127 C.A. · 19/10/2026_');
    expect(texto).toContain('🕓 *PENDIENTE POR APROBAR (1)*');
    expect(texto).toContain('💳 *CUENTAS A CRÉDITO (1)*');
    expect(texto).toContain('🏦 *POR INDICAR MÉTODO DE PAGO (1)*');
    expect(texto).toContain('💵 *POR PAGAR (1)*');

    expect(texto).toContain('• *OC-2026-0001* — SOLICITUD DE SACOS MINEROS — $100,00');
    // Crédito: el monto es el saldo que falta por abonar y se avisa.
    expect(texto).toContain('• *OC-2026-0002* — SOLICITUD DE SACOS MINEROS — $750,00 _(saldo)_');
    // Bs se escribe en su moneda, sin inventar equivalencia.
    expect(texto).toContain('• *OC-2026-0003* — SOLICITUD DE SACOS MINEROS — Bs 3.600,00');
    expect(texto).not.toContain('9999');

    expect(texto).toContain('*TOTAL:* 4 orden(es) · $1.350,00 · Bs 3.600,00');
  });

  it('un motivo con saltos de línea no parte la viñeta', () => {
    const texto = textoReporteComprasWhatsapp(
      [orden('oc_aprobada', { notas: 'LINEA 1\nLINEA 2' })],
      { generadoEn: '2026-10-19T00:00:00Z' },
    );
    expect(texto).toContain('— LINEA 1 LINEA 2 —');
    expect(texto.split('\n').some((l) => l.trim() === 'LINEA 2')).toBe(false);
  });

  it('sin órdenes avisa que no hay pendientes y no imprime total', () => {
    const texto = textoReporteComprasWhatsapp([], { generadoEn: '2026-10-19T00:00:00Z' });
    expect(texto).toContain('No hay órdenes de compra pendientes');
    expect(texto).not.toContain('*TOTAL:*');
    expect(texto).not.toContain('🕓');
  });

  it('no lleva el selector invisible de emoji (U+FE0F), que WhatsApp pierde', () => {
    const texto = textoReporteComprasWhatsapp([orden('oc_aprobada')]);
    expect(texto).not.toContain('\uFE0F');
  });
});
