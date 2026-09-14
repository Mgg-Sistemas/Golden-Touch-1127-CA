import { describe, it, expect } from 'vitest';
import { diaCaracas, inicioDelDia, primerDiaElegible, reconstruirSaldo, resolverInicio, ultimoCierre } from './mercadoInicio';

// El mercado actual de GT, descartado el 14/09 a las 15:30 de Caracas (19:30 UTC).
const DESCARTADO = { numero: 'MK-2026-0001', estado: 'cerrado', cierre_at: '2026-09-14T19:30:00.000Z' };

describe('diaCaracas', () => {
  it('lee el día en hora de Caracas, no en UTC', () => {
    // 01:30 UTC del 15 son las 21:30 del 14 en Caracas.
    expect(diaCaracas('2026-09-15T01:30:00.000Z')).toBe('2026-09-14');
    expect(diaCaracas('2026-09-15T04:00:00.000Z')).toBe('2026-09-15');
  });
});

describe('inicioDelDia', () => {
  it('son las 00:00 de Caracas, o sea las 04:00 UTC', () => {
    expect(inicioDelDia('2026-09-15')).toBe('2026-09-15T04:00:00.000Z');
  });
});

describe('ultimoCierre y primerDiaElegible', () => {
  it('toma el cierre más tardío, sin importar el orden', () => {
    const previos = [DESCARTADO, { numero: 'MK-2026-0000', estado: 'cerrado', cierre_at: '2026-08-01T12:00:00.000Z' }];
    expect(ultimoCierre(previos)?.numero).toBe('MK-2026-0001');
    expect(primerDiaElegible(previos)).toBe('2026-09-14');
  });

  it('sin ciclos cerrados no hay mínimo', () => {
    expect(ultimoCierre([])).toBeNull();
    expect(primerDiaElegible([])).toBeNull();
  });
});

describe('resolverInicio', () => {
  it('sin ciclos previos, empieza a las 00:00 del día elegido', () => {
    expect(resolverInicio('2026-09-15', [])).toEqual({ inicio_at: '2026-09-15T04:00:00.000Z', ajustadoAlCierre: false });
  });

  it('el día siguiente al último cierre no lo pisa', () => {
    expect(resolverInicio('2026-09-15', [DESCARTADO])).toEqual({ inicio_at: '2026-09-15T04:00:00.000Z', ajustadoAlCierre: false });
  });

  it('el mismo día del cierre empieza a la hora en que terminó, no a las 00:00', () => {
    // Las horas del 14 antes de las 15:30 son del mercado descartado.
    expect(resolverInicio('2026-09-14', [DESCARTADO])).toEqual({ inicio_at: '2026-09-14T19:30:00.000Z', ajustadoAlCierre: true });
  });

  it('una fecha anterior al último cierre se rechaza, aunque ese ciclo esté descartado', () => {
    const r = resolverInicio('2026-08-22', [DESCARTADO]);
    expect('error' in r && r.error).toContain('MK-2026-0001');
    expect('error' in r && r.error).toContain('14/09/2026');
  });

  it('con un mercado abierto no se inicia otro', () => {
    const r = resolverInicio('2026-09-15', [{ numero: 'MK-2026-0002', estado: 'abierto', cierre_at: null }]);
    expect('error' in r).toBe(true);
  });

  it('una fecha mal formada no se acepta', () => {
    expect('error' in resolverInicio('15/09/2026', [])).toBe(true);
    expect('error' in resolverInicio('', [])).toBe(true);
  });
});

describe('reconstruirSaldo', () => {
  const viver = (id: string, stock: number) => ({ id, sku: id.toUpperCase(), nombre: `VIVER ${id}`, unidad: 'UND', stock });

  it('stock de ahora − entradas + consumos desde el inicio', () => {
    // Hoy hay 10; desde el inicio entraron 4 y se consumieron 3 → al inicio había 9.
    const saldo = reconstruirSaldo([viver('a', 10)], new Map([['a', 4]]), new Map([['a', { cantidad: 3 }]]));
    expect(saldo).toEqual([{ producto_id: 'a', sku: 'A', nombre: 'VIVER a', unidad: 'UND', cantidad: 9 }]);
  });

  it('sin movimientos desde el inicio, el saldo es el stock', () => {
    expect(reconstruirSaldo([viver('a', 7.5)], new Map(), new Map())[0].cantidad).toBe(7.5);
  });

  it('un saldo en cero o negativo no entra, como en MGG', () => {
    // Negativo: en esos días salió algo por otra puerta.
    const saldo = reconstruirSaldo([viver('a', 2), viver('b', 0)], new Map([['a', 5]]), new Map());
    expect(saldo).toEqual([]);
  });

  it('redondea a dos decimales', () => {
    const saldo = reconstruirSaldo([viver('a', 1.1)], new Map([['a', 0.2]]), new Map([['a', { cantidad: 0.3 }]]));
    expect(saldo[0].cantidad).toBe(1.2);
  });
});
