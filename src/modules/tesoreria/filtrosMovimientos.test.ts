import { describe, it, expect } from 'vitest';
import { filtrarMovimientos, hayFiltros } from './filtrosMovimientos';

type Mov = { caja_id: string; moneda: string; tipo: string; at: string };

const movs: Mov[] = [
  { caja_id: 'c1', moneda: 'Bs', tipo: 'salida', at: '2026-09-01T10:00:00+00:00' },
  { caja_id: 'c1', moneda: 'USD', tipo: 'ingreso', at: '2026-09-10T23:59:00+00:00' },
  { caja_id: 'c2', moneda: 'Bs', tipo: 'ingreso', at: '2026-09-15T00:00:00+00:00' },
  { caja_id: 'c2', moneda: 'USDT', tipo: 'salida', at: '2026-10-02T08:30:00+00:00' },
];

describe('filtros del registro de movimientos', () => {
  it('sin filtros devuelve la MISMA lista (sin copiarla)', () => {
    expect(hayFiltros({})).toBe(false);
    expect(filtrarMovimientos(movs, {})).toBe(movs);
  });

  it('filtra por billetera, moneda y tipo', () => {
    expect(filtrarMovimientos(movs, { caja: 'c1' })).toHaveLength(2);
    expect(filtrarMovimientos(movs, { moneda: 'Bs' })).toHaveLength(2);
    expect(filtrarMovimientos(movs, { tipo: 'salida' })).toHaveLength(2);
  });

  it('los filtros se acumulan', () => {
    expect(filtrarMovimientos(movs, { caja: 'c1', moneda: 'Bs', tipo: 'salida' })).toHaveLength(1);
    expect(filtrarMovimientos(movs, { caja: 'c1', moneda: 'USDT' })).toHaveLength(0);
  });

  it('el rango de fechas incluye los días de los extremos', () => {
    const r = filtrarMovimientos(movs, { desde: '2026-09-01', hasta: '2026-09-15' });
    expect(r).toHaveLength(3);
    expect(filtrarMovimientos(movs, { desde: '2026-09-10', hasta: '2026-09-10' })).toHaveLength(1);
  });

  it('un movimiento del último minuto del día "hasta" entra igual', () => {
    expect(filtrarMovimientos(movs, { hasta: '2026-09-10' })).toHaveLength(2);
  });

  it('deja fuera lo anterior a "desde" y lo posterior a "hasta"', () => {
    expect(filtrarMovimientos(movs, { desde: '2026-10-01' })).toHaveLength(1);
    expect(filtrarMovimientos(movs, { hasta: '2026-08-31' })).toHaveLength(0);
  });
});
