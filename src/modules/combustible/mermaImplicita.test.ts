import { describe, it, expect } from 'vitest';
import {
  calcularMermaImplicitaTanque,
  DEFAULT_MERMA_IMPLICITA_PCT,
  generarObservacionMermaImplicita,
  ordenarMovimientosCronologico,
} from './mermaImplicita';
import type { MovimientoTanque } from '@/shared/lib/types';

function mockMov(data: Partial<MovimientoTanque>): MovimientoTanque {
  return {
    id: data.id || Math.random().toString(),
    tanque_id: data.tanque_id || 'tanque-1',
    fecha: data.fecha || '2026-10-01',
    hora: data.hora || '10:00:00 AM',
    tipo: data.tipo || 'uso',
    litros: data.litros ?? 100,
    tasa_usd_litro: 0.67,
    orden: data.orden ?? 1,
    created_at: data.created_at || '2026-10-01T10:00:00Z',
    ...data,
  };
}

describe('mermaImplicita', () => {
  it('maneja listas vacías sin errores', () => {
    const res = calcularMermaImplicitaTanque({ movimientos: [] });
    expect(res.totalSugerido).toBe(0);
    expect(res.totalLitrosBase).toBe(0);
    expect(res.cantidadMovimientos).toBe(0);
    expect(res.items).toHaveLength(0);
    expect(res.pctUtilizado).toBe(DEFAULT_MERMA_IMPLICITA_PCT);
  });

  it('calcula la merma implícita sugerida por defecto al 0.5%', () => {
    const movs: MovimientoTanque[] = [
      mockMov({ id: 'm1', fecha: '2026-10-01', tipo: 'uso', litros: 1000 }),
      mockMov({ id: 'm2', fecha: '2026-10-02', tipo: 'uso', litros: 500 }),
      mockMov({ id: 'm3', fecha: '2026-10-03', tipo: 'traslado', litros: 200 }),
    ];

    const res = calcularMermaImplicitaTanque({ movimientos: movs });

    // 1000 * 0.5% = 5.00
    // 500 * 0.5% = 2.50
    // 200 * 0.5% = 1.00
    // Total = 8.50
    expect(res.totalSugerido).toBe(8.5);
    expect(res.totalLitrosBase).toBe(1700);
    expect(res.cantidadMovimientos).toBe(3);
    expect(res.items[0].mermaLitros).toBe(5);
    expect(res.items[0].acumulado).toBe(5);
    expect(res.items[1].mermaLitros).toBe(2.5);
    expect(res.items[1].acumulado).toBe(7.5);
    expect(res.items[2].mermaLitros).toBe(1);
    expect(res.items[2].acumulado).toBe(8.5);
  });

  it('permite un porcentaje configurable personalizado', () => {
    const movs: MovimientoTanque[] = [
      mockMov({ id: 'm1', fecha: '2026-10-01', tipo: 'uso', litros: 1000 }),
    ];

    const res = calcularMermaImplicitaTanque({ movimientos: movs, porcentaje: 1.25 });
    // 1000 * 1.25% = 12.50
    expect(res.pctUtilizado).toBe(1.25);
    expect(res.totalSugerido).toBe(12.5);
    expect(res.items[0].mermaLitros).toBe(12.5);
  });

  it('respalda el cálculo cortando en la última merma registrada previa', () => {
    const movs: MovimientoTanque[] = [
      mockMov({ id: 'm1', fecha: '2026-10-01', tipo: 'uso', litros: 1000 }), // antes de la merma
      mockMov({ id: 'm2', fecha: '2026-10-02', tipo: 'merma', litros: 5 }),  // corte de merma
      mockMov({ id: 'm3', fecha: '2026-10-05', tipo: 'uso', litros: 600 }),  // posterior
      mockMov({ id: 'm4', fecha: '2026-10-06', tipo: 'uso', litros: 400 }),  // posterior
    ];

    const res = calcularMermaImplicitaTanque({ movimientos: movs });

    // m1 y m2 quedan fuera porque ya se asentó merma en m2.
    // Solo entran m3 (600) y m4 (400) = 1000 L.
    // 1000 * 0.5% = 5.00 L
    expect(res.cantidadMovimientos).toBe(2);
    expect(res.totalLitrosBase).toBe(1000);
    expect(res.totalSugerido).toBe(5);
    expect(res.fechaUltimaMermaPrevia).toBe('2026-10-02');
    expect(res.items.map((i) => i.id)).toEqual(['m3', 'm4']);
  });

  it('ordena cronológicamente los movimientos desordenados antes de calcular', () => {
    const movs: MovimientoTanque[] = [
      mockMov({ id: 'm3', fecha: '2026-10-03', hora: '12:00:00 PM', tipo: 'uso', litros: 100 }),
      mockMov({ id: 'm1', fecha: '2026-10-01', hora: '08:00:00 AM', tipo: 'uso', litros: 100 }),
      mockMov({ id: 'm2', fecha: '2026-10-02', hora: '09:00:00 AM', tipo: 'uso', litros: 100 }),
    ];

    const ordenados = ordenarMovimientosCronologico(movs);
    expect(ordenados.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);

    const res = calcularMermaImplicitaTanque({ movimientos: movs });
    expect(res.items.map((i) => i.id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('genera texto descriptivo para la observación de la merma', () => {
    const resumen = {
      totalSugerido: 7.5,
      pctUtilizado: 0.5,
      totalLitrosBase: 1500,
      cantidadMovimientos: 4,
      fechaUltimaMermaPrevia: '2026-10-15',
      items: [],
    };

    const obs = generarObservacionMermaImplicita(resumen);
    expect(obs).toMatch(/0[.,]5%\s*merma implícita sugerida sobre 1[.,]500 L \(4 movimientos\)/);
    expect(obs).toContain('desde el último corte del 2026-10-15');
  });
});
