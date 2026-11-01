import { beforeEach, describe, expect, it, vi } from 'vitest';

// Respuesta simulada de `sistema_interruptores` (datos inventados).
let respuesta: { data: unknown; error: unknown } = { data: null, error: null };
let lanza = false;

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    from: () => {
      if (lanza) throw new Error('sin red');
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => respuesta,
      };
      return q;
    },
  },
}));
vi.mock('@/shared/lib/useRealtime', () => ({ useRealtime: () => {} }));

import { aplicaAOrden, interruptorDesde } from './interruptores';

describe('aplicaAOrden (flujo nuevo solo para órdenes nuevas)', () => {
  const desde = '2026-10-31T15:00:00Z';

  it('aplica a la orden creada después (o justo al) encender', () => {
    expect(aplicaAOrden(desde, '2026-10-31T15:00:01Z')).toBe(true);
    expect(aplicaAOrden(desde, '2026-10-31T15:00:00Z')).toBe(true);
    expect(aplicaAOrden(desde, '2026-11-02T09:00:00-04:00')).toBe(true);
  });

  it('no aplica a la orden pendiente de antes', () => {
    expect(aplicaAOrden(desde, '2026-10-31T14:59:59Z')).toBe(false);
    expect(aplicaAOrden(desde, '2026-10-20T10:00:00Z')).toBe(false);
  });

  it('compara instantes, no texto (zonas horarias distintas)', () => {
    // 11:30 en Venezuela (-04:00) = 15:30 UTC → después de encender.
    expect(aplicaAOrden(desde, '2026-10-31T11:30:00-04:00')).toBe(true);
    // 10:30 en Venezuela = 14:30 UTC → antes.
    expect(aplicaAOrden(desde, '2026-10-31T10:30:00-04:00')).toBe(false);
  });

  it('interruptor apagado → nunca aplica', () => {
    expect(aplicaAOrden(null, '2026-12-01T00:00:00Z')).toBe(false);
  });

  it('sin fecha de la orden o fechas ilegibles → no aplica', () => {
    expect(aplicaAOrden(desde, null)).toBe(false);
    expect(aplicaAOrden(desde, undefined)).toBe(false);
    expect(aplicaAOrden(desde, '')).toBe(false);
    expect(aplicaAOrden(desde, 'ayer')).toBe(false);
    expect(aplicaAOrden('???', '2026-12-01T00:00:00Z')).toBe(false);
  });
});

describe('interruptorDesde', () => {
  beforeEach(() => { respuesta = { data: null, error: null }; lanza = false; });

  it('encendido → devuelve activado_en', async () => {
    respuesta = { data: { activo: true, activado_en: '2026-10-31T15:00:00Z' }, error: null };
    expect(await interruptorDesde('compras_retencion_momento')).toBe('2026-10-31T15:00:00Z');
  });

  it('apagado → null aunque tenga fecha guardada', async () => {
    respuesta = { data: { activo: false, activado_en: '2026-10-31T15:00:00Z' }, error: null };
    expect(await interruptorDesde('x')).toBeNull();
  });

  it('encendido sin fecha, sin fila, error o falla de red → null', async () => {
    respuesta = { data: { activo: true, activado_en: null }, error: null };
    expect(await interruptorDesde('x')).toBeNull();
    respuesta = { data: null, error: null };
    expect(await interruptorDesde('x')).toBeNull();
    respuesta = { data: null, error: { message: 'column activado_en does not exist' } };
    expect(await interruptorDesde('x')).toBeNull();
    lanza = true;
    expect(await interruptorDesde('x')).toBeNull();
  });
});
