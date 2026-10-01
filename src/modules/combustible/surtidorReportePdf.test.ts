import { describe, it, expect } from 'vitest';
import { detalleMovimiento, encajar, resumenPorTipo, tituloMovimiento } from './surtidorReportePdf';
import type { MovimientoTanque } from '@/shared/lib/types';

const mov = (p: Partial<MovimientoTanque>): MovimientoTanque => ({
  id: 'x', tanque_id: 't1', fecha: '2026-09-22', tipo: 'uso', litros: 10, tasa_usd_litro: 0.7, orden: 1, created_at: '', ...p,
});

describe('resumenPorTipo', () => {
  it('cuenta y suma litros por tipo en el orden del reporte, sin tipos vacíos', () => {
    const r = resumenPorTipo([
      mov({ tipo: 'entrada', litros: 10000 }), mov({ tipo: 'uso', litros: 5 }), mov({ tipo: 'uso', litros: 7.5 }), mov({ tipo: 'merma', litros: 2 }),
    ]);
    expect(r.map((x) => x.tipo)).toEqual(['uso', 'entrada', 'merma']);
    expect(r[0]).toEqual({ tipo: 'uso', cantidad: 2, litros: 12.5 });
    expect(r[1].litros).toBe(10000);
  });
  it('vacío si no hay movimientos', () => { expect(resumenPorTipo([])).toEqual([]); });
});

describe('tituloMovimiento / detalleMovimiento', () => {
  it('prefiere el equipo, luego la observación, luego el tipo', () => {
    expect(tituloMovimiento(mov({ equipo: 'ET8 A94EE8P', observacion: 'algo' }))).toBe('ET8 A94EE8P');
    expect(tituloMovimiento(mov({ tipo: 'entrada', observacion: 'ENTRADA TANQUE 1' }))).toBe('ENTRADA TANQUE 1');
    expect(tituloMovimiento(mov({ tipo: 'merma' }))).toBe('Mermas');
  });
  it('arma la segunda línea con fecha, hora, tanque, autorizado y observación', () => {
    const d = detalleMovimiento(mov({ hora: '14:34', equipo: 'ET8', autorizado_por: 'EDINSON ANGULO', observacion: 'prueba' }), 'Tanque #1');
    expect(d).toBe('22/09/2026 14:34  ·  Tanque #1  ·  Aut.: EDINSON ANGULO  ·  prueba');
    expect(detalleMovimiento(mov({}), null)).toBe('22/09/2026');
  });
});

describe('encajar', () => {
  it('mantiene la proporción dentro de la caja', () => {
    expect(encajar(900, 600, 120, 110)).toEqual({ w: 120, h: 80 });
    expect(encajar(600, 900, 120, 110)).toEqual({ w: 600 * (110 / 900), h: 110 });
  });
  it('agranda una foto chica hasta llenar la caja', () => {
    expect(encajar(60, 60, 120, 110)).toEqual({ w: 110, h: 110 });
  });
});
