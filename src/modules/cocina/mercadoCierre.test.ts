import { describe, it, expect } from 'vitest';
import {
  MOVIMIENTOS_VACIOS, avanceCierre, contarMovimientos, movimientosDeViver, saldoParaElNuevo, tieneCongelados,
  type MovimientosCiclo,
} from './mercadoCierre';
import type { ResumenViver } from './cocinaMercado.repository';

const fila = (p: Partial<ResumenViver>): ResumenViver => ({
  producto_id: 'a', sku: 'VIV-1', nombre: 'Arroz', unidad: 'kg',
  saldo_inicial: 10, entradas: 5, disponible: 15, consumo: 3, mermas: 0, queda: 12, ...p,
});

describe('saldoParaElNuevo', () => {
  it('lo que queda pasa al mercado nuevo: no se descarta nada', () => {
    const s = saldoParaElNuevo([
      fila({ producto_id: 'a', nombre: 'Arroz', queda: 12 }),
      fila({ producto_id: 'b', nombre: 'Pollo', queda: 4.567 }),
    ]);
    expect(s).toEqual([
      { producto_id: 'a', sku: 'VIV-1', nombre: 'Arroz', unidad: 'kg', cantidad: 12 },
      { producto_id: 'b', sku: 'VIV-1', nombre: 'Pollo', unidad: 'kg', cantidad: 4.57 },
    ]);
  });
  it('lo que quedó en cero o en negativo no se arrastra', () => {
    expect(saldoParaElNuevo([fila({ queda: 0 }), fila({ producto_id: 'c', queda: -2 })])).toEqual([]);
  });
  it('sale ordenado por nombre', () => {
    const s = saldoParaElNuevo([fila({ producto_id: 'z', nombre: 'Zanahoria' }), fila({ producto_id: 'a', nombre: 'Aceite' })]);
    expect(s.map((x) => x.nombre)).toEqual(['Aceite', 'Zanahoria']);
  });
});

describe('avanceCierre', () => {
  it('cuenta qué se lleva el ciclo nuevo y qué quedó en cero', () => {
    expect(avanceCierre([fila({ queda: 12 }), fila({ producto_id: 'b', queda: 3.5 }), fila({ producto_id: 'c', queda: 0 })]))
      .toEqual({ viveresQuePasan: 2, unidadesQuePasan: 15.5, viveresEnCero: 1 });
    expect(avanceCierre([])).toEqual({ viveresQuePasan: 0, unidadesQuePasan: 0, viveresEnCero: 0 });
  });
});

describe('movimientos congelados', () => {
  const mov: MovimientosCiclo = {
    entradas: [{ producto_id: 'a', fecha: '2026-09-20T10:00:00Z', cantidad: 50, ref: 'SP-001' }],
    consumos: [
      { producto_id: 'a', fecha: '2026-09-21T12:00:00Z', cantidad: 3, valor: 6, detalle: 'almuerzo' },
      { producto_id: 'b', fecha: '2026-09-21T12:00:00Z', cantidad: 1, valor: 9 },
    ],
    mermas: [{ producto_id: 'a', fecha: '2026-09-22T09:00:00Z', cantidad: 2, detalle: 'Se dañó' }],
    congelado_at: '2026-09-28T16:00:00Z',
  };
  it('sabe si el ciclo tiene la foto', () => {
    expect(tieneCongelados({ movimientos: mov })).toBe(true);
    expect(tieneCongelados({ movimientos: MOVIMIENTOS_VACIOS })).toBe(false);
    expect(tieneCongelados(null)).toBe(false);
    expect(tieneCongelados({})).toBe(false);
  });
  it('cuenta y filtra por víver', () => {
    expect(contarMovimientos(mov)).toBe(4);
    expect(contarMovimientos(null)).toBe(0);
    const a = movimientosDeViver(mov, 'a');
    expect(a.entradas).toHaveLength(1);
    expect(a.consumos).toHaveLength(1);
    expect(a.mermas).toHaveLength(1);
    expect(a.congelado_at).toBe('2026-09-28T16:00:00Z');
    expect(movimientosDeViver(mov, 'b').consumos).toHaveLength(1);
    expect(movimientosDeViver(null, 'a')).toMatchObject({ entradas: [], consumos: [], mermas: [] });
  });
});
