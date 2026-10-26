import { describe, it, expect } from 'vitest';
import { badgeEstatusKanban, badgeImpuestoOrden } from './retencionesKanban';

describe('badgeEstatusKanban', () => {
  it('mapea correctamente estados clave del kanban de compras', () => {
    expect(badgeEstatusKanban('pagada')).toEqual({
      label: '✓ Pagada',
      className: 'badge success',
      tooltip: 'Pagada por Tesorería',
    });

    expect(badgeEstatusKanban('oc_aprobada')).toEqual({
      label: 'Confirmada pagar',
      className: 'badge warning',
      tooltip: 'En cola para pago en Tesorería',
    });

    expect(badgeEstatusKanban('por_recibir')).toEqual({
      label: 'Por recibir',
      className: 'badge info',
      tooltip: 'Esperando recepción de mercancía',
    });

    expect(badgeEstatusKanban('recibida')).toEqual({
      label: 'Recibida',
      className: 'badge info',
      tooltip: 'Mercancía recibida en almacén',
    });

    expect(badgeEstatusKanban('cuenta_abierta')).toEqual({
      label: 'Crédito',
      className: 'badge warning',
      tooltip: 'Compra a crédito (cuenta abierta)',
    });

    expect(badgeEstatusKanban('finalizada')).toEqual({
      label: 'Finalizada',
      className: 'badge',
      tooltip: 'Proceso de compra finalizado',
    });
  });

  it('maneja estados desconocidos o nulos sin romperse', () => {
    expect(badgeEstatusKanban(null)).toEqual({
      label: 'Sin estatus',
      className: 'badge',
      tooltip: undefined,
    });
    expect(badgeEstatusKanban('otro_estado')).toEqual({
      label: 'otro_estado',
      className: 'badge',
      tooltip: 'otro_estado',
    });
  });
});

describe('badgeImpuestoOrden', () => {
  it('indica con IVA cuando iva_aplicado es true y monto > 0', () => {
    const res = badgeImpuestoOrden({
      iva_aplicado: true,
      iva_monto: 2.72,
      iva_pct: 16,
      total_moneda: 'USD',
    });
    expect(res.tieneImpuesto).toBe(true);
    expect(res.label).toBe('Con IVA (16%)');
    expect(res.className).toBe('badge info');
    expect(res.tooltip).toContain('$ 2,72');
  });

  it('indica sin IVA cuando iva_aplicado es false o monto es 0/null', () => {
    const resSinIva = badgeImpuestoOrden({
      iva_aplicado: false,
      iva_monto: 0,
      iva_pct: null,
      total_moneda: 'USD',
    });
    expect(resSinIva.tieneImpuesto).toBe(false);
    expect(resSinIva.label).toBe('Sin IVA en OC');
    expect(resSinIva.className).toBe('badge');
    expect(resSinIva.tooltip).toContain('no tiene IVA registrado');
  });
});
