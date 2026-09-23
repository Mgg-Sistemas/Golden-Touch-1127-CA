import { describe, expect, it } from 'vitest';
import {
  calcularDespiece, cortesListos, erroresDespiece, esResEnCanal,
  mermaQueCuadra, nombreCorte, resumenDespiece, type CorteListo,
} from './despieceRes';

const corte = (nombre: string, kg: number): CorteListo => ({ nombre, kg, productoId: null });

describe('esResEnCanal', () => {
  it('reconoce el producto escrito de cualquier forma', () => {
    expect(esResEnCanal('RES EN CANAL')).toBe(true);
    expect(esResEnCanal('Res en Canal')).toBe(true);
    expect(esResEnCanal('CARNE DE RES EN CANAL')).toBe(true);
  });
  it('no confunde otros productos', () => {
    expect(esResEnCanal('CARNE MOLIDA')).toBe(false);
    expect(esResEnCanal('CANAL DE RIEGO')).toBe(false);
    expect(esResEnCanal(null)).toBe(false);
  });
});

describe('nombreCorte', () => {
  it('deja el nombre como entra al inventario', () => {
    expect(nombreCorte('  carne   mechada ')).toBe('CARNE MECHADA');
    expect(nombreCorte(null)).toBe('');
  });
});

describe('calcularDespiece', () => {
  // 100 kg a $2 el kg = $200. Salen 92 kg de cortes y 8 kg de merma.
  const base = {
    kgCanal: 100,
    precioCanal: 2,
    cortes: [corte('CARNE MECHADA', 40), corte('CARNE MOLIDA', 30), corte('CARNE PARA BISTEC', 22)],
    merma: 8,
  };

  it('suma los cortes y cuadra con la merma', () => {
    const c = calcularDespiece(base);
    expect(c.kgCortes).toBe(92);
    expect(c.sinAsignar).toBe(0);
    expect(c.cuadra).toBe(true);
    expect(c.rendimientoPct).toBe(92);
  });

  it('el costo de la merma lo absorben los cortes', () => {
    const c = calcularDespiece(base);
    expect(c.costoTotal).toBe(200);
    // $200 / 92 kg = $2,1739 — NO los $2 del kilo de canal.
    expect(c.costoPorKgCorte).toBe(2.1739);
    // Lo que entra al inventario vale lo que se pagó (± el redondeo del PMP).
    expect(c.costoPorKgCorte * c.kgCortes).toBeCloseTo(200, 1);
  });

  it('avisa cuando faltan kilos por repartir', () => {
    const c = calcularDespiece({ ...base, merma: 3 });
    expect(c.sinAsignar).toBe(5);
    expect(c.cuadra).toBe(false);
  });

  it('avisa cuando los cortes pasan la canal', () => {
    const c = calcularDespiece({ ...base, cortes: [corte('CARNE MECHADA', 120)], merma: 0 });
    expect(c.sinAsignar).toBe(-20);
    expect(c.cuadra).toBe(false);
  });

  it('sin cortes el costo por kilo es 0, no infinito', () => {
    const c = calcularDespiece({ kgCanal: 100, precioCanal: 2, cortes: [], merma: 100 });
    expect(c.costoPorKgCorte).toBe(0);
    expect(c.rendimientoPct).toBe(0);
    expect(c.cuadra).toBe(true);
  });

  it('tolera el redondeo de los decimales', () => {
    const c = calcularDespiece({
      kgCanal: 63.4, precioCanal: 3.5,
      cortes: [corte('A', 20.13), corte('B', 18.27), corte('C', 21.5)], merma: 3.5,
    });
    expect(c.kgCortes).toBe(59.9);
    expect(c.cuadra).toBe(true);
  });
});

describe('cortesListos', () => {
  it('descarta el renglón en blanco y normaliza el nombre', () => {
    const r = cortesListos([
      { key: 1, nombre: ' carne mechada ', kg: '40' },
      { key: 2, nombre: '', kg: '' },
      { key: 3, nombre: 'carne molida', kg: '30.5' },
    ]);
    expect(r).toEqual([
      { nombre: 'CARNE MECHADA', kg: 40, productoId: null },
      { nombre: 'CARNE MOLIDA', kg: 30.5, productoId: null },
    ]);
  });
  it('conserva el renglón con kilos pero sin nombre (para que lo marque el error)', () => {
    expect(cortesListos([{ key: 1, nombre: '', kg: '12' }])).toHaveLength(1);
  });
});

describe('erroresDespiece', () => {
  const ok = {
    kgCanal: 100, precioCanal: 2,
    cortes: [corte('CARNE MECHADA', 60), corte('CARNE MOLIDA', 32)], merma: 8,
  };

  it('un despiece que cuadra no tiene errores', () => {
    expect(erroresDespiece(ok)).toEqual([]);
  });
  it('pide al menos un corte', () => {
    expect(erroresDespiece({ ...ok, cortes: [], merma: 100 })[0]).toMatch(/al menos un corte/);
  });
  it('marca el corte sin nombre', () => {
    const e = erroresDespiece({ ...ok, cortes: [corte('', 60), corte('CARNE MOLIDA', 32)] });
    expect(e.some((m) => /sin nombre/.test(m))).toBe(true);
  });
  it('marca el corte sin kilos', () => {
    const e = erroresDespiece({ ...ok, cortes: [...ok.cortes, corte('CARNE PARA BISTEC', 0)] });
    expect(e.some((m) => /no tiene kilos/.test(m))).toBe(true);
  });
  it('no deja cargar el mismo corte dos veces', () => {
    const e = erroresDespiece({
      ...ok, cortes: [corte('CARNE MECHADA', 60), corte('Carne Mechada', 32)],
    });
    expect(e.some((m) => /dos veces/.test(m))).toBe(true);
  });
  it('explica cuántos kilos faltan', () => {
    const e = erroresDespiece({ ...ok, merma: 3 });
    expect(e.some((m) => /Faltan 5 kg/.test(m))).toBe(true);
  });
  it('explica cuántos kilos sobran', () => {
    const e = erroresDespiece({ ...ok, merma: 20 });
    expect(e.some((m) => /Sobran 12 kg/.test(m))).toBe(true);
  });
});

describe('mermaQueCuadra', () => {
  it('es el resto de la canal', () => {
    expect(mermaQueCuadra(100, [corte('A', 40), corte('B', 30)])).toBe(30);
  });
  it('nunca es negativa', () => {
    expect(mermaQueCuadra(100, [corte('A', 140)])).toBe(0);
  });
});

describe('resumenDespiece', () => {
  it('arma la línea que va a la traza', () => {
    const cortes = [corte('CARNE MECHADA', 40), corte('CARNE MOLIDA', 30), corte('CARNE PARA BISTEC', 22)];
    const calc = calcularDespiece({ kgCanal: 100, precioCanal: 2, cortes, merma: 8 });
    expect(resumenDespiece(calc, cortes)).toBe(
      '100 kg de res en canal → CARNE MECHADA 40 kg · CARNE MOLIDA 30 kg · CARNE PARA BISTEC 22 kg · merma 8 kg (rendimiento 92 %)',
    );
  });
});
