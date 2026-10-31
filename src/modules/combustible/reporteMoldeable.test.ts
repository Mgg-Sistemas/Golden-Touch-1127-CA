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
  it('calcula porcentaje con respecto al tanque (% Tanque salidas y % Capacidad nominal)', () => {
    const tanques: TanqueCombustible[] = [
      { id: 'tk-1', nombre: 'Tanque #3 (Camión)', capacidad_litros: 2000, tasa_usd_litro: 0.50 } as TanqueCombustible,
    ];

    const movs: MovimientoTanque[] = [
      {
        id: 'm-1',
        tanque_id: 'tk-1',
        equipo: 'YAMAGRO',
        litros: 1000,
        monto_usd: 500,
        horas_utilizadas: 12,
        fecha: '2026-10-30',
        tipo: 'uso',
      } as MovimientoTanque,
      {
        id: 'm-2',
        tanque_id: 'tk-1',
        equipo: 'CAT 320D',
        litros: 1000,
        monto_usd: 500,
        horas_utilizadas: 10,
        fecha: '2026-10-30',
        tipo: 'uso',
      } as MovimientoTanque,
    ];

    const enriquecidos = enriquecerMovimientos(movs, [], tanques, 'historica');
    const { filas } = procesarFilasReporte(enriquecidos, 'equipo');

    const yamagro = filas.find((f) => f.equipo === 'YAMAGRO');
    expect(yamagro).toBeDefined();
    // 1000 L de 2000 L despachados por el tanque en el período = 50%
    expect(yamagro?.pct_tanque).toBe(50);
    // 1000 L de 2000 L de capacidad física nominal del tanque = 50%
    expect(yamagro?.pct_capacidad).toBe(50);
    expect(yamagro?.horas).toBe(12);
    expect(yamagro?.litros).toBe(1000);
  });

  it('soporta agrupación por día ("dia")', () => {
    const tanques: TanqueCombustible[] = [
      { id: 'tk-1', nombre: 'Tanque #1', capacidad_litros: 10000, tasa_usd_litro: 0.50 } as TanqueCombustible,
    ];

    const movs: MovimientoTanque[] = [
      {
        id: 'm-1',
        tanque_id: 'tk-1',
        equipo: 'E1',
        litros: 300,
        horas_utilizadas: 5,
        fecha: '2026-10-29',
        tipo: 'uso',
      } as MovimientoTanque,
      {
        id: 'm-2',
        tanque_id: 'tk-1',
        equipo: 'E2',
        litros: 700,
        horas_utilizadas: 8,
        fecha: '2026-10-30',
        tipo: 'uso',
      } as MovimientoTanque,
    ];

    const enriquecidos = enriquecerMovimientos(movs, [], tanques, 'historica');
    const { filas } = procesarFilasReporte(enriquecidos, 'dia');

    expect(filas).toHaveLength(2);
    expect(filas[0].id).toBe('2026-10-29');
    expect(filas[0].litros).toBe(300);
    expect(filas[1].id).toBe('2026-10-30');
    expect(filas[1].litros).toBe(700);
  });

  it('procesa e identifica traslados entre tanques', () => {
    const tanques: TanqueCombustible[] = [
      { id: 'tk-1', nombre: 'Tanque #1 (Principal)', capacidad_litros: 10000, tasa_usd_litro: 0.50 } as TanqueCombustible,
      { id: 'tk-3', nombre: 'Tanque #3 (Camión Lubricación)', capacidad_litros: 2000, tasa_usd_litro: 0.50 } as TanqueCombustible,
    ];

    const movs: MovimientoTanque[] = [
      {
        id: 'm-tr',
        tanque_id: 'tk-1',
        tanque_destino_id: 'tk-3',
        litros: 1990,
        monto_usd: 995,
        fecha: '2026-10-30',
        tipo: 'traslado',
        observacion: 'SE SURTIÓ 1990 LITROS AL TANQUE 3 DESDE EL TANQUE 1',
      } as MovimientoTanque,
    ];

    const enriquecidos = enriquecerMovimientos(movs, [], tanques, 'historica');
    expect(enriquecidos).toHaveLength(1);
    expect(enriquecidos[0].esTraslado).toBe(true);
    expect(enriquecidos[0].equipoNombre).toContain('Traslado → Tanque #3');
    expect(enriquecidos[0].empresa).toBe('Operación Interna');
    expect(enriquecidos[0].tipoMaquina).toBe('Traslado entre Tanques');

    const { filas } = procesarFilasReporte(enriquecidos, 'equipo');
    expect(filas).toHaveLength(1);
    expect(filas[0].es_traslado).toBe(true);
    expect(filas[0].litros).toBe(1990);
    expect(filas[0].pct_tanque).toBe(100);
    expect(filas[0].pct_capacidad).toBeCloseTo((1990 / 10000) * 100, 1);
  });
  it('descarta horas de horómetro en vehículos o valores anómalos de odómetro (>500 h)', () => {
    const fichas: MaquinariaEquipo[] = [
      {
        id: 'eq-encava',
        equipo: 'ENCAVA EP-01',
        combustible_equipo: 'ENCAVA EP-01',
        propietario: 'MINERAL GROUP GUAYANA',
        tipo: 'VEHÍCULO',
        clase: 'vehiculo',
        activo: true,
      } as unknown as MaquinariaEquipo,
    ];

    const movs: MovimientoTanque[] = [
      {
        id: 'm-encava',
        tanque_id: 'tk-1',
        equipo: 'ENCAVA EP-01',
        litros: 542,
        horas_utilizadas: 352478, // odómetro guardado por error en horas
        horometro_ini: 0,
        horometro_fin: 352478,
        fecha: '2026-10-28',
        tipo: 'uso',
      } as MovimientoTanque,
    ];

    const enriquecidos = enriquecerMovimientos(movs, fichas, [], 'historica');
    expect(enriquecidos[0].horas).toBe(0); // debe ser 0 para no distorsionar

    const { filas } = procesarFilasReporte(enriquecidos, 'equipo');
    expect(filas[0].horas).toBe(0);
    expect(filas[0].rendimiento).toBeNull();
  });
});
