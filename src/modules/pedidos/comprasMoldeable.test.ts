import { describe, expect, test } from 'vitest';
import {
  clasificarEstadoOrden,
  clasificarEstadoDirectaServicio,
  montoUsdBs,
  normalizarDepartamento,
  SIN_DEPARTAMENTO,
} from './comprasMoldeable';

describe('comprasMoldeable · fundamentos (T1)', () => {
  test('clasificarEstadoOrden mapea finalizadas, pendientes y excluidas', () => {
    expect(clasificarEstadoOrden('pagada')).toBe('finalizada');
    expect(clasificarEstadoOrden('recibida')).toBe('finalizada');
    expect(clasificarEstadoOrden('por_recibir')).toBe('finalizada');
    expect(clasificarEstadoOrden('oc_emitida')).toBe('pendiente');
    expect(clasificarEstadoOrden('cuenta_abierta')).toBe('pendiente');
    expect(clasificarEstadoOrden('oc_creada')).toBe('pendiente');
    expect(clasificarEstadoOrden('cancelada')).toBe('excluida');
    expect(clasificarEstadoOrden('rechazada')).toBe('excluida');
    expect(clasificarEstadoOrden('pendiente')).toBe('excluida'); // solicitud, no compra
  });

  test('clasificarEstadoDirectaServicio excluye en_proceso', () => {
    expect(clasificarEstadoDirectaServicio('finalizada')).toBe('finalizada');
    expect(clasificarEstadoDirectaServicio('por_pagar')).toBe('pendiente');
    expect(clasificarEstadoDirectaServicio('en_proceso')).toBe('excluida');
  });

  test('montoUsdBs no divide por cero sin tasa', () => {
    expect(montoUsdBs(1200, 'Bs', 0)).toEqual({ usd: 0, bs: 1200 });
    expect(montoUsdBs(100, 'USD', 40)).toEqual({ usd: 100, bs: 4000 });
    expect(montoUsdBs(4000, 'Bs', 40)).toEqual({ usd: 100, bs: 4000 });
    expect(montoUsdBs(100, 'USDT', 40)).toEqual({ usd: 100, bs: 4000 });
    expect(montoUsdBs(100, 'USD', 0)).toEqual({ usd: 100, bs: 0 });
  });

  test('normalizarDepartamento colapsa espacios y nombra el vacío', () => {
    expect(normalizarDepartamento('  Taller   Mecánico ')).toBe('Taller Mecánico');
    expect(normalizarDepartamento('   ')).toBe(SIN_DEPARTAMENTO);
    expect(normalizarDepartamento(null)).toBe(SIN_DEPARTAMENTO);
    expect(normalizarDepartamento(undefined)).toBe(SIN_DEPARTAMENTO);
  });
});
