import { describe, expect, it } from 'vitest';
import type { Personal } from '@/shared/lib/types';
import {
  ajustarPorcentaje, filasDesdeCargos, filasReporteTabulador, leerMonto, loteParaGuardar, montoAnteriorDelCargo,
  sueldoMasComun, totalesReporteTabulador, type TabuladorCargo, type TabuladorHistorial,
} from './tabulador';

const p = (id: string, cargo: string, sueldo: number, extra: Partial<Personal> = {}): Personal =>
  ({ id, nombre: id, apellido: '', cargo, sueldo_base: sueldo, activo: true, empresa: 'GT', ...extra }) as Personal;
const t = (id: string, cargo: string, monto: number, empresa: 'GT' | 'MTO' = 'GT'): TabuladorCargo =>
  ({ id, empresa, cargo, monto, nota: null, created_at: '', updated_at: '' });

describe('crear el tabulador desde los cargos', () => {
  const personas = [
    p('a', 'Molinero', 300), p('b', 'MOLINERO', 300), p('c', 'molinero ', 280),
    p('d', 'Geólogo', 900), p('e', 'Chofer', 400, { activo: false }), p('f', 'Chofer', 450, { empresa: 'MTO' }),
  ];
  it('trae los cargos de los activos de la nómina con el sueldo que más se repite', () => {
    const f = filasDesdeCargos(personas, [], 'GT');
    expect(f.map((x) => x.cargo)).toEqual(['GEÓLOGO', 'MOLINERO']);
    const m = f.find((x) => x.cargo === 'MOLINERO')!;
    expect(m).toMatchObject({ id: null, activos: 3, anterior: 300, minHoy: 280, maxHoy: 300 });
  });
  it('los que ya están en el tabulador traen su monto y no se repiten', () => {
    const f = filasDesdeCargos(personas, [t('t1', 'GEOLOGO', 950), t('t2', 'PERFORISTA', 500), t('t3', 'MOLINERO', 1, 'MTO')], 'GT');
    expect(f.map((x) => [x.cargo, x.id, x.anterior, x.activos])).toEqual([
      ['GEOLOGO', 't1', 950, 1], ['MOLINERO', null, 300, 3], ['PERFORISTA', 't2', 500, 0],
    ]);
  });
  it('sueldo más común: en empate, el mayor', () => {
    expect(sueldoMasComun([])).toBeNull();
    expect(sueldoMasComun([280, 300])).toBe(300);
    expect(sueldoMasComun([280, 280, 300])).toBe(280);
  });
});

describe('sueldo nuevo', () => {
  it('lee montos con coma o punto', () => {
    expect(leerMonto('')).toBeNull();
    expect(leerMonto('350')).toBe(350);
    expect(leerMonto('350,5')).toBe(350.5);
    expect(leerMonto('1.250,75')).toBe(1250.75);
    expect(Number.isNaN(leerMonto('abc'))).toBe(true);
  });
  it('ajuste por porcentaje', () => {
    expect(ajustarPorcentaje(300, 10)).toBe(330);
    expect(ajustarPorcentaje(333.33, 5)).toBe(350);
  });
  it('guarda lo nuevo y lo que cambia; lo igual no', () => {
    const base = { nota: null, activos: 1, minHoy: null, maxHoy: null };
    const r = loteParaGuardar([
      { fila: { ...base, id: 't1', cargo: 'GEOLOGO', anterior: 950 }, nuevo: 950 },
      { fila: { ...base, id: 't2', cargo: 'PERFORISTA', anterior: 500 }, nuevo: 520.004 },
      { fila: { ...base, id: null, cargo: 'MOLINERO', anterior: 300 }, nuevo: 300 },
    ]);
    expect(r.error).toBeNull();
    expect(r.guardar).toEqual([
      { id: 't2', cargo: 'PERFORISTA', monto: 520, nota: null },
      { id: null, cargo: 'MOLINERO', monto: 300, nota: null },
    ]);
  });
  it('pide el sueldo de cada cargo marcado y avisa si no hay cambios', () => {
    const fila = { id: 't1', cargo: 'GEOLOGO', nota: null, activos: 1, anterior: 950, minHoy: null, maxHoy: null };
    expect(loteParaGuardar([{ fila, nuevo: null }]).error).toMatch(/Falta el sueldo nuevo de GEOLOGO/);
    expect(loteParaGuardar([{ fila, nuevo: -1 }]).error).toMatch(/negativo/);
    expect(loteParaGuardar([{ fila, nuevo: 950 }]).error).toMatch(/No hay cambios/);
  });
});

describe('reporte: sueldo anterior y nuevo', () => {
  const h = (tabulador_id: string, antes: number | null, despues: number, created_at: string): TabuladorHistorial =>
    ({ id: created_at, tabulador_id, empresa: 'GT', cargo: 'X', accion: antes == null ? 'alta' : 'cambio', monto_anterior: antes, monto_nuevo: despues, created_at });
  it('el anterior es el del último cambio de monto', () => {
    const hist = [h('t1', null, 300, '2026-10-01'), h('t1', 300, 320, '2026-10-05'), h('t1', 320, 320, '2026-10-06'), h('t2', 100, 110, '2026-10-07')];
    expect(montoAnteriorDelCargo({ id: 't1' }, hist)).toBe(300);
    expect(montoAnteriorDelCargo({ id: 't3' }, hist)).toBeNull();
  });
  it('filas y costo mensual de los activos', () => {
    const f = filasReporteTabulador([t('t1', 'MOLINERO', 320), t('t2', 'GEOLOGO', 900)],
      [h('t1', 300, 320, '2026-10-05')], [p('a', 'Molinero', 300), p('b', 'molinero', 300), p('c', 'Geólogo', 900)], 'GT');
    expect(f.map((x) => [x.cargo, x.activos, x.anterior, x.nuevo])).toEqual([['GEOLOGO', 1, null, 900], ['MOLINERO', 2, 300, 320]]);
    expect(totalesReporteTabulador(f)).toEqual({ activos: 3, antes: 1500, despues: 1540 });
  });
});
