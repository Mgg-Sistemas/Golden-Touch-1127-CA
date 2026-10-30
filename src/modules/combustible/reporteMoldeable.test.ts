import { describe, it, expect } from 'vitest';
import {
  horasDeMovimiento,
  valorUsdDeMovimiento,
  enriquecerMovimientos,
  filtrarMovimientos,
  procesarFilasReporte,
} from './reporteMoldeable';
import type { MovimientoTanque, TanqueCombustible } from '@/shared/lib/types';
import type { MaquinariaEquipo } from '@/modules/maquinaria/maquinariaEquipos.repository';

describe('reporteMoldeable', () => {
  it('calcula horas de movimiento por horas_utilizadas o delta de horómetro', () => {
    const m1 = { horas_utilizadas: 5.5, horometro_ini: 100, horometro_fin: 110 } as MovimientoTanque;
    expect(horasDeMovimiento(m1)).toBe(5.5);

    const m2 = { horas_utilizadas: null, horometro_ini: 100, horometro_fin: 108.2 } as MovimientoTanque;
    expect(horasDeMovimiento(m2)).toBeCloseTo(8.2, 1);

    const m3 = { horas_utilizadas: null, horometro_ini: null, horometro_fin: 100 } as MovimientoTanque;
    expect(horasDeMovimiento(m3)).toBe(0);
  });

  it('calcula valor USD con tasa histórica vs tasa actual', () => {
    const mov = {
      litros: 100,
      tasa_usd_litro: 0.50,
      monto_usd: 50,
    } as MovimientoTanque;

    // Tasa histórica
    expect(valorUsdDeMovimiento(mov, 'historica', 0.65)).toBe(50);

    // Tasa actual
    expect(valorUsdDeMovimiento(mov, 'actual', 0.65)).toBe(65);
  });

  it('enriquece movimientos cruzando con maquinaria_equipos', () => {
    const fichas: MaquinariaEquipo[] = [
      {
        id: 'eq-1',
        equipo: 'VOLVO EC240-40144',
        combustible_equipo: 'VOLVO EC240-40144',
        propietario: 'GOLDEN TOUCH',
        tipo: 'RETROEXCAVADORA',
        clase: 'maquinaria',
        ubicacion: 'MINA GOLDEN TOUCH',
        activo: true,
      } as unknown as MaquinariaEquipo,
    ];

    const tanques: TanqueCombustible[] = [
      { id: 'tk-1', nombre: 'Tanque #1', tasa_usd_litro: 0.55 } as TanqueCombustible,
    ];

    const movs: MovimientoTanque[] = [
      {
        id: 'm-1',
        tanque_id: 'tk-1',
        equipo: 'VOLVO EC240-40144',
        litros: 200,
        monto_usd: 100,
        tasa_usd_litro: 0.50,
        horometro_ini: 1000,
        horometro_fin: 1010,
        horas_utilizadas: 10,
        fecha: '2026-10-15',
        tipo: 'uso',
      } as MovimientoTanque,
      {
        id: 'm-2',
        tanque_id: 'tk-1',
        equipo: 'PATROL ALQUILADO',
        litros: 50,
        monto_usd: 25,
        tasa_usd_litro: 0.50,
        fecha: '2026-10-16',
        tipo: 'uso',
      } as MovimientoTanque,
    ];

    const enriquecidos = enriquecerMovimientos(movs, fichas, tanques, 'historica');
    expect(enriquecidos).toHaveLength(2);

    // Matcheado
    expect(enriquecidos[0].empresa).toBe('GOLDEN TOUCH');
    expect(enriquecidos[0].tipoMaquina).toBe('RETROEXCAVADORA');
    expect(enriquecidos[0].litros).toBe(200);
    expect(enriquecidos[0].horas).toBe(10);

    // No matcheado (fallback seguro)
    expect(enriquecidos[1].empresa).toBe('Sin empresa asignada');
    expect(enriquecidos[1].tipoMaquina).toBe('Otros / No clasificado');
    expect(enriquecidos[1].litros).toBe(50);
  });

  it('procesa y agrupa correctamente por equipo con totales y KPIs', () => {
    const fichas: MaquinariaEquipo[] = [
      {
        id: 'eq-1',
        equipo: 'VOLVO EC240-40144',
        combustible_equipo: 'VOLVO EC240-40144',
        propietario: 'GOLDEN TOUCH',
        tipo: 'RETROEXCAVADORA',
        activo: true,
      } as unknown as MaquinariaEquipo,
    ];

    const tanques: TanqueCombustible[] = [
      { id: 'tk-1', nombre: 'Tanque #1', tasa_usd_litro: 0.50 } as TanqueCombustible,
    ];

    const movs: MovimientoTanque[] = [
      {
        id: 'm-1',
        tanque_id: 'tk-1',
        equipo: 'VOLVO EC240-40144',
        litros: 150,
        monto_usd: 75,
        tasa_usd_litro: 0.50,
        horometro_ini: 100,
        horometro_fin: 105,
        horas_utilizadas: 5,
        fecha: '2026-10-15',
        tipo: 'uso',
      } as MovimientoTanque,
      {
        id: 'm-2',
        tanque_id: 'tk-1',
        equipo: 'VOLVO EC240-40144',
        litros: 250,
        monto_usd: 125,
        tasa_usd_litro: 0.50,
        horometro_ini: 105,
        horometro_fin: 115,
        horas_utilizadas: 10,
        fecha: '2026-10-16',
        tipo: 'uso',
      } as MovimientoTanque,
    ];

    const enriquecidos = enriquecerMovimientos(movs, fichas, tanques, 'historica');
    const { filas, resumen } = procesarFilasReporte(enriquecidos, 'equipo');

    expect(filas).toHaveLength(1);
    expect(filas[0].equipo).toBe('VOLVO EC240-40144');
    expect(filas[0].litros).toBe(400);
    expect(filas[0].usd).toBe(200);
    expect(filas[0].horas).toBe(15);
    expect(filas[0].surtidos).toBe(2);
    expect(filas[0].rendimiento).toBeCloseTo(400 / 15, 2);
    expect(filas[0].horometro_ini).toBe(100);
    expect(filas[0].horometro_fin).toBe(115);

    expect(resumen.totalLitros).toBe(400);
    expect(resumen.totalUsd).toBe(200);
    expect(resumen.totalHoras).toBe(15);
    expect(resumen.totalSurtidos).toBe(2);
    expect(resumen.topConsumidores[0].nombre).toBe('VOLVO EC240-40144');
  });

  it('filtra por empresas y tipos seleccionados', () => {
    const enriquecidos = [
      { empresa: 'GOLDEN TOUCH', tipoMaquina: 'RETROEXCAVADORA', equipoNombre: 'E1', litros: 100 } as any,
      { empresa: 'CONTRATISTA X', tipoMaquina: 'CAMIÓN', equipoNombre: 'E2', litros: 200 } as any,
    ];

    const filtrados = filtrarMovimientos(enriquecidos, { empresasSel: ['GOLDEN TOUCH'] });
    expect(filtrados).toHaveLength(1);
    expect(filtrados[0].equipoNombre).toBe('E1');
  });
});

