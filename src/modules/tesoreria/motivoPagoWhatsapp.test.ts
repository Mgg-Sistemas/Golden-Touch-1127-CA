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
    expect(txt).toContain('💱 *Monto en Bs:* Bs 2.025,00 (tasa BCV 40,50)');
    expect(txt).toContain('📌 *Estado:* PAGADA POR TESORERIA');
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
    expect(txt).toContain('📌 *Estado:* Sin fondos en estos momentos.');
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

    expect(txt).toContain('📌 *Estado:* No procede esta compra (Precio muy elevado respecto al presupuesto)');
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

    expect(txt).toContain('📌 *Estado:* Esperando firma de autorización especial');
  });
});
