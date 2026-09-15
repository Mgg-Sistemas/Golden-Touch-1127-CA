import { describe, it, expect } from 'vitest';
import { diaCaracas, reconstruirSaldo, resolverInicio, ultimoCierre } from './mercadoInicio';

// El mercado actual de GT, descartado el 14/09 a las 15:30 de Caracas (19:30 UTC).
const DESCARTADO = { numero: 'MK-2026-0001', estado: 'cerrado', cierre_at: '2026-09-14T19:30:00.000Z' };

describe('diaCaracas', () => {
  it('lee el día en hora de Caracas, no en UTC', () => {
    // 01:30 UTC del 15 son las 21:30 del 14 en Caracas.
    expect(diaCaracas('2026-09-15T01:30:00.000Z')).toBe('2026-09-14');
    expect(diaCaracas('2026-09-15T04:00:00.000Z')).toBe('2026-09-15');
  });
});

describe('ultimoCierre', () => {
  it('toma el cierre más tardío, sin importar el orden', () => {
    const previos = [DESCARTADO, { numero: 'MK-2026-0000', estado: 'cerrado', cierre_at: '2026-08-01T12:00:00.000Z' }];
    expect(ultimoCierre(previos)?.numero).toBe('MK-2026-0001');
  });

  it('sin ciclos cerrados no hay último cierre', () => {
    expect(ultimoCierre([])).toBeNull();
  });
});

describe('resolverInicio', () => {
  it('empieza en el instante exacto del clic, no a las 00:00 ni a la hora del descarte', () => {
    // Clic a las 16:57:12,345 de Caracas, una hora y media después del descarte.
    expect(resolverInicio('2026-09-14T20:57:12.345Z', [DESCARTADO]))
      .toEqual({ inicio_at: '2026-09-14T20:57:12.345Z', ajustadoAlCierre: false });
  });

  it('sin ciclos previos, también el instante del clic', () => {
    expect(resolverInicio('2026-09-14T20:57:12.345Z', []))
      .toEqual({ inicio_at: '2026-09-14T20:57:12.345Z', ajustadoAlCierre: false });
  });

  it('si el último cierre quedó después del clic (reloj desfasado), empieza en ese cierre', () => {
    expect(resolverInicio('2026-09-14T19:29:58.000Z', [DESCARTADO]))
      .toEqual({ inicio_at: '2026-09-14T19:30:00.000Z', ajustadoAlCierre: true });
  });

  it('con un mercado abierto no se inicia otro', () => {
    const r = resolverInicio('2026-09-14T20:57:12.345Z', [{ numero: 'MK-2026-0002', estado: 'abierto', cierre_at: null }]);
    expect('error' in r).toBe(true);
  });

  it('un instante inválido no se acepta', () => {
    expect('error' in resolverInicio('', [])).toBe(true);
    expect('error' in resolverInicio('ayer', [])).toBe(true);
  });

  it('entiende el cierre como lo devuelve Postgres, con offset', () => {
    const previo = { numero: 'MK-2026-0001', estado: 'cerrado', cierre_at: '2026-09-14T19:30:00+00:00' };
    expect(resolverInicio('2026-09-14T19:29:59.000Z', [previo]))
      .toEqual({ inicio_at: '2026-09-14T19:30:00.000Z', ajustadoAlCierre: true });
  });
});

describe('reconstruirSaldo', () => {
  const viver = (id: string, stock: number) => ({ id, sku: id.toUpperCase(), nombre: `VIVER ${id}`, unidad: 'UND', stock });

  it('stock leído − entradas + consumos desde el clic', () => {
    // Al leer hay 10; entre el clic y la lectura entraron 4 y se consumieron 3 → al clic había 9.
    const saldo = reconstruirSaldo([viver('a', 10)], new Map([['a', 4]]), new Map([['a', { cantidad: 3 }]]));
    expect(saldo).toEqual([{ producto_id: 'a', sku: 'A', nombre: 'VIVER a', unidad: 'UND', cantidad: 9 }]);
  });

  it('una merma entre el clic y la lectura vuelve al saldo: el ciclo ya la resta', () => {
    // Al leer hay 5; entre el clic y la lectura se perdieron 2 → al clic había 7.
    const saldo = reconstruirSaldo([viver('a', 5)], new Map(), new Map(), new Map([['a', 2]]));
    expect(saldo[0].cantidad).toBe(7);
  });

  it('sin movimientos desde el clic, el saldo es el stock', () => {
    expect(reconstruirSaldo([viver('a', 7.5)], new Map(), new Map())[0].cantidad).toBe(7.5);
  });

  it('un saldo en cero o negativo no entra, como en MGG', () => {
    const saldo = reconstruirSaldo([viver('a', 2), viver('b', 0)], new Map([['a', 5]]), new Map());
    expect(saldo).toEqual([]);
  });

  it('redondea a dos decimales', () => {
    const saldo = reconstruirSaldo([viver('a', 1.1)], new Map([['a', 0.2]]), new Map([['a', { cantidad: 0.3 }]]));
    expect(saldo[0].cantidad).toBe(1.2);
  });
});
