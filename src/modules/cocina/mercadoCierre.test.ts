import { describe, it, expect } from 'vitest';
import {
  MOVIMIENTOS_VACIOS, avanceCierre, contarMovimientos, instanteDeCierre, movimientosDeViver, saldoParaElNuevo,
  tieneCongelados, validarCierre, type MovimientosCiclo,
} from './mercadoCierre';
import type { ResumenViver } from './cocinaMercado.repository';

describe('cierre manual · la fecha de cierre (27/10/2026)', () => {
  // 27/10/2026 a las 14:30 de Caracas (18:30 UTC).
  const ahora = new Date('2026-10-27T18:30:00.000Z');
  // El mercado MK-2026-0004 real: arrancó el 14/10 a las 14:41 de Caracas.
  const inicio = '2026-10-14T18:41:56.338Z';

  it('cerrar con la fecha de hoy es cerrar ahora mismo', () => {
    expect(instanteDeCierre('2026-10-27', ahora)).toBe('2026-10-27T18:30:00.000Z');
  });
  it('cerrar con un día anterior es cerrar al final de ese día en Caracas', () => {
    // 23:59:59.999 del 20/10 en Caracas = 03:59:59.999 UTC del 21.
    expect(instanteDeCierre('2026-10-20', ahora)).toBe('2026-10-21T03:59:59.999Z');
  });
  it('una fecha que no se lee no revienta', () => {
    expect(instanteDeCierre('', ahora)).toBe('');
    expect(instanteDeCierre('hoy', ahora)).toBe('');
  });

  it('por defecto se cierra hoy: fin = hoy y el siguiente arranca ahí', () => {
    const v = validarCierre('2026-10-27', inicio, ahora);
    expect(v).toEqual({ cierre: '2026-10-27T18:30:00.000Z' });
  });
  it('se puede cerrar con una fecha anterior dentro del ciclo: fin = esa fecha', () => {
    const v = validarCierre('2026-10-25', inicio, ahora);
    expect(v).toEqual({ cierre: '2026-10-26T03:59:59.999Z' });
  });
  it('el mismo día del inicio vale: el ciclo cierra al final de ese día, después del instante de apertura', () => {
    expect(validarCierre('2026-10-14', inicio, ahora)).toEqual({ cierre: '2026-10-15T03:59:59.999Z' });
  });
  it('no se cierra en el futuro ni antes del inicio', () => {
    expect(validarCierre('2026-10-28', inicio, ahora)).toMatchObject({ error: expect.stringContaining('futura') });
    expect(validarCierre('2026-10-13', inicio, ahora)).toMatchObject({ error: expect.stringContaining('14/10/2026') });
    expect(validarCierre('', inicio, ahora)).toMatchObject({ error: expect.stringContaining('fecha') });
  });
  it('un mercado abierto hoy mismo no se cierra antes de su instante de apertura', () => {
    const abiertoHoy = '2026-10-27T19:00:00.000Z'; // 15:00 de Caracas, después de «ahora».
    expect(validarCierre('2026-10-27', abiertoHoy, ahora)).toMatchObject({ error: expect.stringContaining('posterior') });
  });
});

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
