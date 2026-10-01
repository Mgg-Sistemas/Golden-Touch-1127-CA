import { describe, it, expect } from 'vitest';
import type { AnticipoPago, AnticipoPrestamo, Personal } from '@/shared/lib/types';
import {
  FILTROS_VACIOS, agruparPorTrabajador, buscarTrabajadores, errorAbono, errorAlta, filtrarAnticipos,
  filtrosActivos, normalizarTexto, ordenarPagos, pagadoDe, resumenAnticipos, trabajadoresConPendiente,
  type AltaAnticipo,
} from './anticiposResumen';

const persona = (id: string, extra: Partial<Personal> = {}): Personal => ({
  id, empresa: 'GT', nombre: 'Ana', apellido: 'Pérez', cedula: 'V-1', ficha_nro: '001', cargo: 'Operador',
  departamento: 'Planta', sueldo_base: 300, activo: true, ...extra,
} as Personal);

const prestamo = (id: string, personal_id: string, total: number, saldo: number, extra: Partial<AnticipoPrestamo> = {}): AnticipoPrestamo => ({
  id, personal_id, tipo: 'prestamo', fecha: '2026-06-10', monto_total: total, saldo,
  estado: saldo > 0 ? 'activo' : 'saldado', created_at: '2026-06-10T12:00:00Z', ...extra,
});

const personas = new Map<string, Personal>([
  ['p1', persona('p1')],
  ['p2', persona('p2', { nombre: 'José', apellido: 'Núñez', cedula: 'V-2', ficha_nro: '002', departamento: 'Taller' })],
]);

const lista: AnticipoPrestamo[] = [
  prestamo('a1', 'p1', 500, 200, { motivo: 'Reparación de moto' }),
  prestamo('a2', 'p1', 100, 0, { tipo: 'anticipo', fecha: '2026-03-01' }),
  prestamo('a3', 'p2', 1000, 1000, { historico: true, fecha: '2025-12-20' }),
  prestamo('a4', 'p9', 50, 50), // de otra nómina: no está en `personas`
];

describe('filtrarAnticipos', () => {
  it('por defecto muestra solo los activos de la nómina en pantalla', () => {
    expect(filtrarAnticipos(lista, FILTROS_VACIOS, personas).map((a) => a.id)).toEqual(['a1', 'a3']);
  });
  it('estado todos / saldados', () => {
    expect(filtrarAnticipos(lista, { ...FILTROS_VACIOS, estado: 'todos' }, personas)).toHaveLength(3);
    expect(filtrarAnticipos(lista, { ...FILTROS_VACIOS, estado: 'saldados' }, personas).map((a) => a.id)).toEqual(['a2']);
  });
  it('texto sin acentos busca en nombre, cédula, ficha, motivo', () => {
    const f = { ...FILTROS_VACIOS, estado: 'todos' as const };
    expect(filtrarAnticipos(lista, { ...f, texto: 'nunez' }, personas).map((a) => a.id)).toEqual(['a3']);
    expect(filtrarAnticipos(lista, { ...f, texto: 'reparacion' }, personas).map((a) => a.id)).toEqual(['a1']);
    expect(filtrarAnticipos(lista, { ...f, texto: '002' }, personas).map((a) => a.id)).toEqual(['a3']);
  });
  it('rango de fechas por la fecha del préstamo', () => {
    const f = { ...FILTROS_VACIOS, estado: 'todos' as const };
    expect(filtrarAnticipos(lista, { ...f, desde: '2026-01-01', hasta: '2026-05-31' }, personas).map((a) => a.id)).toEqual(['a2']);
    expect(filtrarAnticipos(lista, { ...f, hasta: '2025-12-31' }, personas).map((a) => a.id)).toEqual(['a3']);
  });
  it('tipo, origen, departamento, trabajador y montos', () => {
    const f = { ...FILTROS_VACIOS, estado: 'todos' as const };
    expect(filtrarAnticipos(lista, { ...f, tipo: 'anticipo' }, personas).map((a) => a.id)).toEqual(['a2']);
    expect(filtrarAnticipos(lista, { ...f, origen: 'historico' }, personas).map((a) => a.id)).toEqual(['a3']);
    expect(filtrarAnticipos(lista, { ...f, origen: 'sistema' }, personas)).toHaveLength(2);
    expect(filtrarAnticipos(lista, { ...f, departamento: 'Taller' }, personas).map((a) => a.id)).toEqual(['a3']);
    expect(filtrarAnticipos(lista, { ...f, personalId: 'p1' }, personas)).toHaveLength(2);
    expect(filtrarAnticipos(lista, { ...f, montoMin: '200', montoMax: '600' }, personas).map((a) => a.id)).toEqual(['a1']);
    expect(filtrarAnticipos(lista, { ...f, montoMin: 'abc' }, personas)).toHaveLength(3);
  });
});

describe('resumen y agrupación', () => {
  it('totales: prestado, pagado, pendiente y trabajadores con saldo', () => {
    const r = resumenAnticipos(filtrarAnticipos(lista, { ...FILTROS_VACIOS, estado: 'todos' }, personas));
    expect(r).toEqual({ totalPrestado: 1600, totalPagado: 400, totalPendiente: 1200, pendientes: 2, trabajadoresConPendiente: 2 });
  });
  it('pagadoDe es total menos saldo, redondeado', () => {
    expect(pagadoDe(prestamo('x', 'p1', 100.10, 33.33))).toBe(66.77);
  });
  it('agrupa por trabajador, el que más debe primero', () => {
    const g = agruparPorTrabajador(lista, personas);
    expect(g.map((x) => x.persona.id)).toEqual(['p2', 'p1']);
    expect(g[1]).toMatchObject({ totalPrestado: 600, totalPagado: 400, saldo: 200, pendientes: 1 });
    expect(g[1].anticipos.map((a) => a.id)).toEqual(['a1', 'a2']); // más reciente primero
  });
  it('trabajadores con pendiente deja afuera los saldados', () => {
    const g = trabajadoresConPendiente(lista, personas);
    expect(g.find((x) => x.persona.id === 'p1')?.anticipos.map((a) => a.id)).toEqual(['a1']);
  });
  it('buscarTrabajadores por nombre o cédula', () => {
    const g = agruparPorTrabajador(lista, personas);
    expect(buscarTrabajadores(g, 'perez').map((x) => x.persona.id)).toEqual(['p1']);
    expect(buscarTrabajadores(g, 'V-2').map((x) => x.persona.id)).toEqual(['p2']);
    expect(buscarTrabajadores(g, '')).toHaveLength(2);
  });
});

describe('reglas de carga', () => {
  const base: AltaAnticipo = {
    personal_id: 'p1', tipo: 'prestamo', fecha: '2026-06-10', monto_total: 300, cuota_sugerida: null, motivo: '',
    historico: false, abonado: null, fecha_abono: '2026-06-10',
  };
  it('alta común', () => {
    expect(errorAlta(base)).toBeNull();
    expect(errorAlta({ ...base, personal_id: '' })).toMatch(/trabajador/);
    expect(errorAlta({ ...base, monto_total: 0 })).toMatch(/monto/);
    expect(errorAlta({ ...base, fecha: '' })).toMatch(/fecha/);
    expect(errorAlta({ ...base, cuota_sugerida: 400 })).toMatch(/cuota/);
  });
  it('histórico: lo abonado no supera el total ni es anterior al préstamo', () => {
    expect(errorAlta({ ...base, historico: true, abonado: 100, fecha_abono: '2026-08-01' })).toBeNull();
    expect(errorAlta({ ...base, historico: true, abonado: 301 })).toMatch(/abonado/);
    expect(errorAlta({ ...base, historico: true, abonado: 100, fecha_abono: '2026-01-01' })).toMatch(/anterior/);
    expect(errorAlta({ ...base, historico: true, abonado: 0, fecha_abono: '' })).toBeNull();
  });
  it('abono manual', () => {
    expect(errorAbono(200, 50, '2026-07-01', '2026-06-10')).toBeNull();
    expect(errorAbono(200, 200.001, '2026-07-01')).toBeNull();
    expect(errorAbono(200, 250, '2026-07-01')).toMatch(/supera/);
    expect(errorAbono(200, null, '2026-07-01')).toMatch(/monto/);
    expect(errorAbono(200, 10, '2026-05-01', '2026-06-10')).toMatch(/anterior/);
  });
});

describe('utilidades', () => {
  it('normalizarTexto quita acentos y mayúsculas', () => {
    expect(normalizarTexto(' Núñez ÁÉ ')).toBe('nunez ae');
  });
  it('filtrosActivos cuenta los puestos (el estado por defecto no cuenta)', () => {
    expect(filtrosActivos(FILTROS_VACIOS)).toBe(0);
    expect(filtrosActivos({ ...FILTROS_VACIOS, texto: 'a', desde: '2026-01-01', estado: 'todos' })).toBe(3);
  });
  it('ordenarPagos del más viejo al más nuevo', () => {
    const pagos: AnticipoPago[] = [
      { id: '1', anticipo_id: 'a', fecha: '2026-07-01', monto: 1, origen: 'nomina', created_at: '2026-07-01T10:00:00Z' },
      { id: '2', anticipo_id: 'a', fecha: '2026-06-01', monto: 1, origen: 'manual', created_at: '2026-06-01T10:00:00Z' },
    ];
    expect(ordenarPagos(pagos).map((p) => p.id)).toEqual(['2', '1']);
  });
});
