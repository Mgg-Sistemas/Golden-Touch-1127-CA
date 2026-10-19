import { describe, it, expect } from 'vitest';
import type { Orden } from '@/shared/lib/types';
import {
  agruparReporteCompras,
  aDolaresYBolivares,
  motivoReporteCompras,
  montoReporteCompras,
  GRUPOS_REPORTE_COMPRAS,
} from './reporteCompras';

const orden = (patch: Record<string, unknown>): Orden => ({
  id: patch.codigo ?? 'id',
  codigo: 'SP-2026-0001',
  estado: 'oc_creada',
  total: 100,
  total_moneda: 'USD',
  items: [],
  historial: [],
  solicitante_email: 'x@y.z',
  proveedor_id: null,
  created_at: '2026-10-01T00:00:00Z',
  ...patch,
} as unknown as Orden);

describe('reporte de compras por estado', () => {
  it('siempre trae los cuatro renglones, en el orden pedido', () => {
    const grupos = agruparReporteCompras([]);
    expect(grupos.map((g) => g.estado)).toEqual([
      'oc_creada', 'cuenta_abierta', 'confirmada_metodo', 'oc_aprobada',
    ]);
    expect(grupos.map((g) => g.titulo)).toEqual(GRUPOS_REPORTE_COMPRAS.map((g) => g.titulo));
    expect(grupos.every((g) => g.filas.length === 0)).toBe(true);
  });

  it('reparte cada OC en su renglón y descarta estados ajenos', () => {
    const grupos = agruparReporteCompras([
      orden({ codigo: 'A', oc_codigo: 'OC-3', estado: 'oc_creada' }),
      orden({ codigo: 'B', oc_codigo: 'OC-1', estado: 'oc_aprobada' }),
      orden({ codigo: 'C', oc_codigo: 'OC-2', estado: 'cuenta_abierta' }),
      orden({ codigo: 'D', oc_codigo: 'OC-4', estado: 'confirmada_metodo' }),
      orden({ codigo: 'E', oc_codigo: 'OC-5', estado: 'pagada' }),
      orden({ codigo: 'F', oc_codigo: 'OC-6', estado: 'cancelada' }),
    ]);
    expect(grupos.find((g) => g.estado === 'oc_creada')?.filas.map((f) => f.codigo)).toEqual(['OC-3']);
    expect(grupos.find((g) => g.estado === 'cuenta_abierta')?.filas.map((f) => f.codigo)).toEqual(['OC-2']);
    expect(grupos.find((g) => g.estado === 'confirmada_metodo')?.filas.map((f) => f.codigo)).toEqual(['OC-4']);
    expect(grupos.find((g) => g.estado === 'oc_aprobada')?.filas.map((f) => f.codigo)).toEqual(['OC-1']);
    expect(grupos.reduce((a, g) => a + g.filas.length, 0)).toBe(4);
  });

  it('ordena por código de forma natural y usa el código de la OC', () => {
    const grupos = agruparReporteCompras([
      orden({ codigo: 'SP-9', oc_codigo: 'OC-2026-0010', estado: 'oc_aprobada' }),
      orden({ codigo: 'SP-8', oc_codigo: 'OC-2026-0002', estado: 'oc_aprobada' }),
      orden({ codigo: 'SP-7', oc_codigo: null, estado: 'oc_aprobada' }),
    ]);
    expect(grupos.find((g) => g.estado === 'oc_aprobada')?.filas.map((f) => f.codigo))
      .toEqual(['OC-2026-0002', 'OC-2026-0010', 'SP-7']);
  });

  it('el motivo sale de la orden, de la nota de la solicitud o de lo que se pide', () => {
    expect(motivoReporteCompras(orden({ motivo: 'Reparar la bomba', finalidad: 'Mantenimiento' })))
      .toBe('Reparar la bomba · Mantenimiento');
    expect(motivoReporteCompras(orden({ motivo: null, finalidad: 'Mantenimiento' })))
      .toBe('Mantenimiento');
    // En la práctica el porqué vive en `notas`: gana sobre los renglones.
    expect(motivoReporteCompras(orden({ motivo: null, finalidad: null, notas: 'SOLICITUD DE SACOS MINEROS', items: [
      { nombre: 'Saco', finalidad: 'Cambio' },
    ] }))).toBe('SOLICITUD DE SACOS MINEROS');
    expect(motivoReporteCompras(orden({ motivo: null, finalidad: null, items: [
      { nombre: 'Caucho', finalidad: 'Cambio de caucho' },
      { nombre: 'Aceite', finalidad: 'Cambio de caucho' },
    ] }))).toBe('Cambio de caucho');
    expect(motivoReporteCompras(orden({ motivo: null, finalidad: null, items: [
      { nombre: 'Caucho' }, { nombre: 'Aceite' },
    ] }))).toBe('Caucho, Aceite');
    expect(motivoReporteCompras(orden({ motivo: null, finalidad: null, notas: 'Urgente' }))).toBe('Urgente');
    expect(motivoReporteCompras(orden({ motivo: null, finalidad: null, notas: null }))).toBe('—');
  });

  it('en cuentas a crédito muestra el saldo que falta por abonar', () => {
    expect(montoReporteCompras(orden({ estado: 'cuenta_abierta', total: 1000, abonado_total: 250 })))
      .toBe(750);
    expect(montoReporteCompras(orden({ estado: 'cuenta_abierta', total: 1000, abonado_total: 1200 })))
      .toBe(0);
    expect(montoReporteCompras(orden({ estado: 'oc_aprobada', total: 1000, abonado_total: 250 })))
      .toBe(1000);
  });

  it('respeta la moneda de la orden y convierte a la tasa BCV', () => {
    const enBs = agruparReporteCompras([
      orden({ codigo: 'B', estado: 'oc_aprobada', total: 3600, total_moneda: 'Bs' }),
    ])[3].filas[0];
    expect(enBs.moneda).toBe('Bs');
    expect(aDolaresYBolivares(enBs.monto, enBs.moneda, 36)).toEqual({ usd: 100, bs: 3600 });
    expect(aDolaresYBolivares(100, 'USD', 36)).toEqual({ usd: 100, bs: 3600 });
    // Sin tasa no se inventa un equivalente: queda en 0 y el PDF imprime «—».
    expect(aDolaresYBolivares(100, 'USD', 0)).toEqual({ usd: 100, bs: 0 });
  });
});
