import { describe, expect, it } from 'vitest';
import type { Orden } from '@/shared/lib/types';
import { construirTextoMotivoPagoWhatsapp } from './motivoPagoWhatsapp';

const mockOrden: Orden = {
  id: 'o-1',
  codigo: 'SP-2026-0230',
  oc_codigo: 'OC-2026-0132',
  solicitante: 'EDINSON ANGULO',
  solicitante_email: 'edinson@gt.com',
  unidad_solicitante: 'MINA PERAMANAL',
  oc_creada_por: 'analista@gt.com',
  oc_seleccion_observacion: 'FARMATODO REALIZO PRIMERA COMPRA CON UN DESCUENTO DEL 15%',
  total: 50,
  estado: 'oc_aprobada',
  proveedor_id: 'p-1',
  items: [],
  historial: [],
  pago_en_divisa: true,
  total_divisa: 50,
  tipo: 'producto',
  created_at: '2026-09-29T15:07:00Z',
  updated_at: '2026-09-29T17:29:00Z',
};

describe('construirTextoMotivoPagoWhatsapp', () => {
  it('genera formato correcto cuando la OC es pagada por Tesorería', () => {
    const txt = construirTextoMotivoPagoWhatsapp({
      orden: mockOrden,
      proveedorNombre: 'FARMATODO',
      tasaUsd: 40.5,
      pagada: true,
    });

    expect(txt).toContain('💸 *PAGO DE ORDEN DE COMPRA*');
    expect(txt).toContain('🔹 *ORDEN:* OC-2026-0132');
    expect(txt).toContain('👤 *Solicitante:* EDINSON ANGULO · MINA PERAMANAL');
    expect(txt).toContain('🛒 *Analista encargado:*');
    expect(txt).toContain('📝 *Nota del analista:* FARMATODO REALIZO PRIMERA COMPRA CON UN DESCUENTO DEL 15%');
    expect(txt).toContain('💵 *Total:* $50,00');
    expect(txt).not.toContain('Monto en Bs');
    expect(txt).toContain('📌 *Estado:* *PAGADA POR TESORERIA*');
  });

  it('genera formato correcto cuando NO se pagará: Sin fondos', () => {
    const txt = construirTextoMotivoPagoWhatsapp({
      orden: mockOrden,
      proveedorNombre: 'FARMATODO',
      tasaUsd: 40,
      pagada: false,
      motivoTipo: 'Sin fondos en estos momentos.',
    });

    expect(txt).toContain('⚠️ *NOTIFICACIÓN DE PAGO DE OC*');
    expect(txt).toContain('📌 *Estado:* *Sin fondos en estos momentos.*');
  });

  it('genera formato y acción requerida cuando NO procede la compra', () => {
    const txt = construirTextoMotivoPagoWhatsapp({
      orden: mockOrden,
      proveedorNombre: 'FARMATODO',
      tasaUsd: 40,
      pagada: false,
      motivoTipo: 'No procede esta compra',
      motivoDetalle: 'Precio muy elevado respecto al presupuesto',
    });

    expect(txt).toContain('📌 *Estado:* *No procede esta compra (Precio muy elevado respecto al presupuesto)*');
    expect(txt).toContain('🚨 *ACCIÓN REQUERIDA:* Notificación al analista encargado para que cancele la orden o busque otra cotización.');
  });

  it('genera formato para motivo Otro', () => {
    const txt = construirTextoMotivoPagoWhatsapp({
      orden: mockOrden,
      proveedorNombre: 'FARMATODO',
      tasaUsd: 40,
      pagada: false,
      motivoTipo: 'Otro',
      motivoDetalle: 'Esperando firma de autorización especial',
    });

    expect(txt).toContain('📌 *Estado:* *Esperando firma de autorización especial*');
  });
});

describe('WhatsApp por lote de las OC pendientes por pagar (04/11/2026)', () => {
  it('código, proveedor y monto de cada OC, el total, el estado y la fecha', async () => {
    const { construirTextoMotivoPagoLote } = await import('./motivoPagoWhatsapp');
    const t = construirTextoMotivoPagoLote({
      ordenes: [
        { codigo: 'OC-2026-0189', proveedor: 'HIERROS SAN FELIX', monto: 174.9 },
        { codigo: 'OC-2026-0191', proveedor: 'HIERROS SAN FELIX', monto: 1510.32 },
      ],
      pagada: true, fecha: '2026-11-04T23:15:00Z',
    });
    const l = t.split('\n');
    expect(l[0]).toBe('🧾 *RESUMEN · ÓRDENES POR PAGAR*');
    expect(l[1]).toMatch(/^📅 \*Generado:\* 04\/11\/2026 07:15/);
    expect(t).toContain('1. 🔹 *OC-2026-0189* · HIERROS SAN FELIX\n    💵 *A pagar:* $174,90 · ✅ *Se pagará*');
    expect(t).toContain('💰 *Total (2 órdenes):* *$1.685,22*');
    expect(t.endsWith('🏢 *GOLDEN TOUCH 1127 C.A.*')).toBe(true);
    const mix = construirTextoMotivoPagoLote({
      ordenes: [
        { codigo: 'OC-1', proveedor: 'X', monto: 5, motivo: 'si' },
        { codigo: 'OC-2', proveedor: 'Y', monto: 10, motivo: 'Sin fondos en estos momentos.' },
      ],
      fecha: '2026-11-04T23:15:00Z',
    });
    expect(mix).toContain('💵 *A pagar:* $10,00 · ⏸ *No se pagará* · Sin fondos en estos momentos');
    expect(mix).toContain('✅ *Se pagarán (1):* *$5,00*');
    expect(mix).toContain('⏸ *No se pagarán (1):* *$10,00*');
  });
});
