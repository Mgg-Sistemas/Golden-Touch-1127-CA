import { describe, expect, it } from 'vitest';
import type { MovimientoTanque, TanqueCombustible } from '@/shared/lib/types';
import {
  calcularCorteTanque,
  calcularTotalesCierre,
  obtenerPresetRango,
} from './reporteExistenciasCorte';

describe('reporteExistenciasCorte · Motor de Corte y Cierre Histórico', () => {
  const tanque1: TanqueCombustible = {
    id: 'tk-1',
    nombre: 'Tanque #1',
    tipo: 'cilindrico_horizontal',
    capacidad_litros: 36000,
    tasa_usd_litro: 0.70,
    estado: 'activo',
    es_movil: false,
    orden: 1,
    created_at: '2026-01-01',
    saldo_inicial_litros: 10000,
    saldo_inicial_usd: 7000,
    saldo_litros: 6040,
    saldo_usd: 4228,
  };

  const tanque2: TanqueCombustible = {
    id: 'tk-2',
    nombre: 'Tanque #2 Brasileros',
    tipo: 'cilindrico_horizontal',
    capacidad_litros: 40000,
    tasa_usd_litro: 0.50,
    estado: 'activo',
    es_movil: false,
    orden: 2,
    created_at: '2026-01-01',
    saldo_inicial_litros: 5000,
    saldo_inicial_usd: 2500,
    saldo_litros: 18906,
    saldo_usd: 9453,
  };

  const movsTanque1: MovimientoTanque[] = [
    // Movimiento en Septiembre (antes de Octubre)
    {
      id: 'm-sep',
      tanque_id: 'tk-1',
      fecha: '2026-09-20',
      tipo: 'entrada',
      litros: 5000,
      tasa_usd_litro: 0.70,
      monto_usd: 3500,
      orden: 1,
      created_at: '2026-09-20T10:00:00Z',
      saldo_litros: 15000, // 10000 + 5000
      saldo_usd: 10500,
    },
    // Movimientos en Octubre
    {
      id: 'm-oct-1',
      tanque_id: 'tk-1',
      fecha: '2026-10-05',
      tipo: 'uso',
      litros: 3000,
      tasa_usd_litro: 0.70,
      monto_usd: 2100,
      orden: 2,
      created_at: '2026-10-05T12:00:00Z',
      saldo_litros: 12000, // 15000 - 3000
      saldo_usd: 8400,
    },
    {
      id: 'm-oct-2',
      tanque_id: 'tk-1',
      fecha: '2026-10-20',
      tipo: 'traslado',
      litros: 4000,
      tasa_usd_litro: 0.70,
      monto_usd: 2800,
      orden: 3,
      created_at: '2026-10-20T15:00:00Z',
      saldo_litros: 8000, // 12000 - 4000
      saldo_usd: 5600,
    },
    {
      id: 'm-oct-3 (cierre de octubre)',
      tanque_id: 'tk-1',
      fecha: '2026-10-31',
      tipo: 'uso',
      litros: 500,
      tasa_usd_litro: 0.70,
      monto_usd: 350,
      orden: 4,
      created_at: '2026-10-31T18:00:00Z',
      saldo_litros: 7500, // Saldo exacto con que cerró Octubre
      saldo_usd: 5250,
    },
    // Movimiento en Noviembre (después de Octubre)
    {
      id: 'm-nov-1',
      tanque_id: 'tk-1',
      fecha: '2026-11-02',
      tipo: 'uso',
      litros: 1460,
      tasa_usd_litro: 0.70,
      monto_usd: 1022,
      orden: 5,
      created_at: '2026-11-02T10:00:00Z',
      saldo_litros: 6040, // Saldo actual de Noviembre
      saldo_usd: 4228,
    },
  ];

  it('calcula correctamente el rango para el preset mes_anterior (Octubre)', () => {
    // Si la fecha de referencia es 04/11/2026
    const rango = obtenerPresetRango('mes_anterior', '2026-11-04');
    expect(rango.desde).toBe('2026-10-01');
    expect(rango.hasta).toBe('2026-10-31');
    expect(rango.label).toContain('Octubre 2026');
  });

  it('determina exactamente con cuánto cerró Octubre el tanque (saldo al 31/10/2026)', () => {
    const corteOctubre = calcularCorteTanque(
      tanque1,
      movsTanque1,
      '2026-10-01',
      '2026-10-31',
      '2026-11-04',
    );

    // Saldo Inicial de Octubre (al 01/10/2026 venía de Septiembre con 15.000 L)
    expect(corteOctubre.saldoInicialLitros).toBe(15000);
    expect(corteOctubre.saldoInicialUsd).toBe(10500);

    // Movimientos ocurridos en Octubre
    expect(corteOctubre.movimientos.length).toBe(3);
    expect(corteOctubre.surtidosLitros).toBe(3500); // 3000 + 500
    expect(corteOctubre.trasladosLitros).toBe(4000);
    expect(corteOctubre.entradasLitros).toBe(0);

    // ¿Con cuánto cerró Octubre? Cerró con 7.500 Ltrs y $ 5.250 USD
    // (NO con los 6.040 Ltrs de Noviembre)
    expect(corteOctubre.saldoCierreLitros).toBe(7500);
    expect(corteOctubre.saldoCierreUsd).toBe(5250);
    expect(corteOctubre.esHistorico).toBe(true);
    expect(corteOctubre.variacionPeriodoLitros).toBe(-7500); // 7500 - 15000
    expect(corteOctubre.porcentajeLleno).toBeCloseTo((7500 / 36000) * 100, 1);
  });

  it('calcula los totales consolidados de la cabecera reflejando el corte histórico de Octubre', () => {
    const corteT1 = calcularCorteTanque(tanque1, movsTanque1, '2026-10-01', '2026-10-31', '2026-11-04');
    const corteT2 = calcularCorteTanque(tanque2, [], '2026-10-01', '2026-10-31', '2026-11-04');

    const totales = calcularTotalesCierre([corteT1, corteT2], 2, '2026-10-31', '2026-11-04');

    // T1 cerró con 7500 L ($ 5250) + T2 sin movs cerró con su apertura 5000 L ($ 2500) = 12500 L ($ 7750)
    expect(totales.totalLitrosCierre).toBe(12500);
    expect(totales.totalValorCierre).toBe(7750);
    expect(totales.tasaPromedioCierre).toBeCloseTo(7750 / 12500, 3);
    expect(totales.totalSurtidosLitros).toBe(3500);
    expect(totales.totalTrasladosLitros).toBe(4000);
    expect(totales.esHistorico).toBe(true);
    expect(totales.cierreFechaLabel).toBe('Cierre al 2026-10-31');
  });

  it('cuando se desmarca un tanque (checks), los totales de cabecera reaccionan dinámicamente', () => {
    const corteT1 = calcularCorteTanque(tanque1, movsTanque1, '2026-10-01', '2026-10-31', '2026-11-04');

    // Solo T1 seleccionado
    const totalesSoloT1 = calcularTotalesCierre([corteT1], 2, '2026-10-31', '2026-11-04');
    expect(totalesSoloT1.tanquesSeleccionadosCount).toBe(1);
    expect(totalesSoloT1.totalLitrosCierre).toBe(7500);
    expect(totalesSoloT1.totalValorCierre).toBe(5250);
  });
});

