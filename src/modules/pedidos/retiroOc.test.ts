import { describe, expect, it } from 'vitest';
import { enPendientePorRecibir, esperaRetiro, textoEventoDelivery } from './retiroOc';

const base = { estado: 'pagada' as const, tipo: 'producto' as const, oc_codigo: 'OC-2026-0001', recibida_en: null, retiro_confirmado_en: null };

describe('esperaRetiro', () => {
  it('OC de producto pagada, sin recibir ni confirmar → espera', () => {
    expect(esperaRetiro(base)).toBe(true);
  });
  it('confirmada, recibida, servicio, sin OC o no pagada → no espera', () => {
    expect(esperaRetiro({ ...base, retiro_confirmado_en: '2026-11-06T10:00:00Z' })).toBe(false);
    expect(esperaRetiro({ ...base, recibida_en: '2026-11-06T10:00:00Z' })).toBe(false);
    expect(esperaRetiro({ ...base, tipo: 'servicio' })).toBe(false);
    expect(esperaRetiro({ ...base, oc_codigo: null })).toBe(false);
    expect(esperaRetiro({ ...base, estado: 'oc_aprobada' })).toBe(false);
  });
});

describe('enPendientePorRecibir', () => {
  it('pagada sin recibir (confirmada o no) y por_recibir → sí; pagada ya recibida u otros → no', () => {
    expect(enPendientePorRecibir({ estado: 'pagada', recibida_en: null })).toBe(true);
    expect(enPendientePorRecibir({ estado: 'por_recibir', recibida_en: null })).toBe(true);
    expect(enPendientePorRecibir({ estado: 'pagada', recibida_en: '2026-11-06T10:00:00Z' })).toBe(false);
    expect(enPendientePorRecibir({ estado: 'oc_aprobada', recibida_en: null })).toBe(false);
  });
});

describe('textoEventoDelivery', () => {
  it('dice el canal y quién lo tomó', () => {
    expect(textoEventoDelivery({ evento: 'delivery_tomado', repartidor: 'HECTOR ALAGAL', canal: 'delivery' })).toBe('🛵 Delivery · tomado por HECTOR ALAGAL');
    expect(textoEventoDelivery({ evento: 'delivery_entregado', repartidor: 'JONY SALAZAR', canal: 'carga_pesada', almacen: 'General' }))
      .toBe('🚚 Carga pesada · entregado por JONY SALAZAR en General');
    expect(textoEventoDelivery({ evento: 'oc_creada' })).toBeNull();
  });
});
