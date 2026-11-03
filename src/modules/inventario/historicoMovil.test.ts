import { describe, expect, it } from 'vitest';
import type { SolicitudSalida } from '@/shared/lib/types';
import {
  agruparTraslados, errorRangoHistorico, filtrarHistoricoTraslados, limitesIsoRango, mensajeSalidaPc, notaDeDetalleTraslado,
  rangoHistoricoPorDefecto, unirHistoricoSalidas, type MovimientoTraslado,
} from './historicoMovil';
import type { SalidaMina } from './salidasMina';

const movs: MovimientoTraslado[] = [
  { id: 'm1', ref_codigo: 'TRA-0001', almacen: 'General', destino: 'Depósito Mina', delta: '-48', stock_despues: '52', detalle: 'Traslado TRA-0001 a Depósito Mina · Para la mina (teléfono)', actor: 'a@gt.com', actor_name: 'ADMIN', at: '2026-10-29T20:49:36Z', producto_id: 'p1', producto: { sku: 'EPP-007', nombre: 'GUANTES', unidad: 'UND' } },
  { id: 'm2', ref_codigo: 'TRA-0001', almacen: 'Depósito Mina', destino: null, delta: '48', stock_despues: '48', detalle: 'Traslado TRA-0001 desde General · Para la mina (teléfono)', actor: 'a@gt.com', actor_name: 'ADMIN', at: '2026-10-29T20:49:36Z', producto_id: 'p2', producto: { sku: 'EPP-011', nombre: 'GUANTES', unidad: 'UND' } },
];

describe('Histórico del teléfono', () => {
  it('rango por defecto: últimos 30 días; límites en hora de Venezuela', () => {
    expect(rangoHistoricoPorDefecto('2026-11-03')).toEqual({ desde: '2026-10-05', hasta: '2026-11-03' });
    expect(limitesIsoRango('2026-10-05', '2026-11-03')).toEqual({ desdeIso: '2026-10-05T00:00:00-04:00', hastaIso: '2026-11-04T00:00:00-04:00' });
    expect(errorRangoHistorico('2026-11-04', '2026-11-03', '2026-11-03')).toMatch(/después/);
    expect(errorRangoHistorico('2026-11-01', '2026-11-03', '2026-11-03')).toBeNull();
  });
  it('un traslado se arma con sus dos movimientos', () => {
    const [t] = agruparTraslados(movs);
    expect(t).toMatchObject({ codigo: 'TRA-0001', cantidad: 48, origen: 'General', destino: 'Depósito Mina', sku_origen: 'EPP-007', sku_destino: 'EPP-011', stock_origen: 52, stock_destino: 48, nota: 'Para la mina' });
    expect(agruparTraslados([movs[1]])[0]).toMatchObject({ origen: 'General', destino: 'Depósito Mina' });
    expect(notaDeDetalleTraslado('Traslado TRA-0002 a General (teléfono)')).toBeNull();
    expect(filtrarHistoricoTraslados(agruparTraslados(movs), 'guantes tra-0001')).toHaveLength(1);
    expect(filtrarHistoricoTraslados(agruparTraslados(movs), 'aceite')).toHaveLength(0);
  });
  it('junta teléfono y módulo Salidas, de la más reciente a la más vieja; aviso de la PC', () => {
    const sol = { id: 'x', codigo: 'SAL-0100', scope: 'salida', tipo: 'material', estado: 'ejecutada', solicitante: 'Isner', actor: 'isner@gt.com', historial: [], created_at: '2026-11-02T10:00:00Z', almacen_origen: null, motivo: 'Mantenimiento', items: [{ producto_id: 'p', producto_nombre: 'ACEITE', unidad: 'lt', cantidad: 4, precio_unit: 3 }] } as SolicitudSalida;
    const tel = { id: 's', codigo: 'SIG-0001', created_at: '2026-11-03T10:00:00Z' } as SalidaMina;
    expect(unirHistoricoSalidas([tel], [sol]).map((f) => f.tipo)).toEqual(['telefono', 'pc']);
    const m = mensajeSalidaPc(sol, 'Isner Orence');
    expect(m).toContain('📤 *SALIDA DE INVENTARIO GENERAL*');
    expect(m).toContain('🔖 *N°:* SAL-0100');
    expect(m).toContain('🔢 *Cantidad:* 4 lt');
    expect(m).toContain('👷 *Registrado por:* Isner Orence');
    expect(m).not.toMatch(/️/);
  });
});
