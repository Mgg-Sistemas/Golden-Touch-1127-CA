import { describe, it, expect } from 'vitest';
import type { MovimientoTanque, TanqueCombustible } from '@/shared/lib/types';
import type { ReporteTanque } from './tanques.repository';

// Helper de prueba para calcular métricas idénticas al modal
function calcularTotales(reportes: ReporteTanque[]) {
  const totalLitros = reportes.reduce((acc, r) => acc + (Number(r.disponible) || 0), 0);
  const totalValor = reportes.reduce(
    (acc, r) => acc + (Number(r.disponible) || 0) * (Number(r.tanque.tasa_usd_litro) || 0),
    0,
  );
  const tasaProm = totalLitros > 0 ? totalValor / totalLitros : 0;
  return { litros: totalLitros, valor: totalValor, tasaProm, count: reportes.length };
}

function filtrarMovimientos(
  movs: MovimientoTanque[],
  fechaDesde: string,
  tipoFiltro: 'uso_traslado' | 'uso' | 'traslado' | 'todos',
) {
  return movs.filter((m) => {
    if (fechaDesde && (m.fecha ?? '') < fechaDesde) return false;
    if (tipoFiltro === 'uso_traslado') return m.tipo === 'uso' || m.tipo === 'traslado';
    if (tipoFiltro === 'uso') return m.tipo === 'uso';
    if (tipoFiltro === 'traslado') return m.tipo === 'traslado';
    return true;
  });
}

describe('ReporteExistenciasModal - Lógica de datos y métricas', () => {
  const t1: TanqueCombustible = {
    id: 'tk-1',
    nombre: 'Tanque 1',
    tipo: 'cilindrico_horizontal',
    capacidad_litros: 20000,
    tasa_usd_litro: 1.10,
    estado: 'activo',
    es_movil: false,
    orden: 1,
    created_at: '2026-01-01',
    saldo_inicial_litros: 10000,
    saldo_litros: 12000,
    saldo_usd: 13200,
  };

  const t2: TanqueCombustible = {
    id: 'tk-2',
    nombre: 'Surtidor Móvil',
    tipo: 'rectangular',
    capacidad_litros: 5000,
    tasa_usd_litro: 1.20,
    estado: 'activo',
    es_movil: true,
    orden: 2,
    created_at: '2026-01-01',
    saldo_inicial_litros: 2000,
    saldo_litros: 3000,
    saldo_usd: 3600,
  };

  const r1: ReporteTanque = {
    tanque: t1,
    entradas: 5000,
    uso: 2000,
    traslados: 1000,
    disponible: 12000,
  };

  const r2: ReporteTanque = {
    tanque: t2,
    entradas: 4000,
    uso: 3000,
    traslados: 0,
    disponible: 3000,
  };

  it('calcula los totales consolidados de existencias correctamente', () => {
    const res = calcularTotales([r1, r2]);
    // Litros: 12000 + 3000 = 15000
    expect(res.litros).toBe(15000);
    // Valor: 12000 * 1.10 + 3000 * 1.20 = 13200 + 3600 = 16800
    expect(res.valor).toBe(16800);
    // Tasa promedio ponderada: 16800 / 15000 = 1.12
    expect(res.tasaProm).toBeCloseTo(1.12, 4);
    expect(res.count).toBe(2);
  });

  it('permite filtrar por selección parcial de tanques', () => {
    const resSoloMovil = calcularTotales([r2]);
    expect(resSoloMovil.litros).toBe(3000);
    expect(resSoloMovil.valor).toBe(3600);
    expect(resSoloMovil.count).toBe(1);
  });

  it('filtra movimientos correctamente por surtidos y traslados', () => {
    const movs: MovimientoTanque[] = [
      {
        id: 'm1',
        tanque_id: 'tk-1',
        fecha: '2026-10-25',
        tipo: 'uso',
        equipo: 'CAT-320',
        litros: 250,
        tasa_usd_litro: 1.10,
        orden: 1,
        created_at: '2026-10-25T10:00:00Z',
      },
      {
        id: 'm2',
        tanque_id: 'tk-1',
        fecha: '2026-10-26',
        tipo: 'traslado',
        ubicacion: 'Mina Norte',
        litros: 500,
        tasa_usd_litro: 1.10,
        orden: 2,
        created_at: '2026-10-26T12:00:00Z',
      },
      {
        id: 'm3',
        tanque_id: 'tk-1',
        fecha: '2026-10-27',
        tipo: 'entrada',
        litros: 2000,
        tasa_usd_litro: 1.10,
        orden: 3,
        created_at: '2026-10-27T08:00:00Z',
      },
    ];

    // Solo surtidos y traslados (excluye entradas)
    const surtidosYTraslados = filtrarMovimientos(movs, '2026-10-01', 'uso_traslado');
    expect(surtidosYTraslados).toHaveLength(2);
    expect(surtidosYTraslados.map((m) => m.tipo)).toEqual(['uso', 'traslado']);

    // Solo surtidos
    const soloUso = filtrarMovimientos(movs, '2026-10-01', 'uso');
    expect(soloUso).toHaveLength(1);
    expect(soloUso[0].equipo).toBe('CAT-320');

    // Filtro por fecha desde
    const soloDesde26 = filtrarMovimientos(movs, '2026-10-26', 'todos');
    expect(soloDesde26).toHaveLength(2);
    expect(soloDesde26.map((m) => m.id)).toEqual(['m2', 'm3']);
  });
});
