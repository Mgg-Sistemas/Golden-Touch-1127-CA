import { describe, it, expect } from 'vitest';
import {
  armarResumen, bonoNeto, calcularTotales, camposResumen, filtrarGeneral, formatoCelda, lineasTotales,
  orientacionResumen, CAMPOS_BASICOS, CAMPOS_RESUMEN, type FilaResumen, type PeriodoRef,
} from './resumenNomina';

const per = (p: Partial<PeriodoRef> & { id: string }): PeriodoRef => ({
  codigo: `NOM-${p.id}`, nombre: null, empresa: 'GT', tipo: 'quincena',
  periodo_desde: null, periodo_hasta: null, tasa_bcv: 100, created_at: '2026-09-01T10:00:00Z', ...p,
});
const P1 = per({ id: 'p1', codigo: 'NOM-2026-0001', periodo_desde: '2026-09-01', periodo_hasta: '2026-09-15' });
const P2 = per({ id: 'p2', codigo: 'NOM-2026-0002', periodo_desde: '2026-09-16', periodo_hasta: '2026-09-30' });
const PM = per({ id: 'pm', codigo: 'NOM-MTO-2026-0001', empresa: 'MTO', periodo_desde: '2026-09-16', periodo_hasta: '2026-09-30' });

let k = 0;
const fila = (f: Partial<FilaResumen> & { periodo: PeriodoRef }): FilaResumen => ({
  id: `r${++k}`, periodo_id: f.periodo.id, personal_id: null, nombre: 'X', sueldo_base_mensual: 600,
  dias_trabajados: 11, dias_descanso: 4, sueldo_quincena_usd: 60, bono_quincena_usd: 240, sueldo_quincena_bs: 6000,
  salario_bruto: 300, asignaciones: 0, deduc_anticipos: 0, deduc_prestamos: 0, deducciones: [], neto_usd: 300,
  estado: 'por_pagar', created_at: '2026-09-01', ...f,
});

const ana1 = fila({ periodo: P1, personal_id: 'a', nombre: 'ANA', cedula: 'V-1', asignaciones: 10, deduc_prestamos: 50, deduc_anticipos: 20, neto_usd: 240, estado: 'pagada', monto_pagado: 240, moneda_pago: 'USD', pagada_en: '2026-09-16T15:00:00Z', caja_nombre: 'Caja $' });
const beto1 = fila({ periodo: P1, personal_id: 'b', nombre: 'BETO', estado: 'pagada', monto_pagado: 30000, moneda_pago: 'Bs' });
const ana2 = fila({ periodo: P2, personal_id: 'a', nombre: 'ANA', cedula: 'V-1' });
const mto = fila({ periodo: PM, personal_id: 'm', nombre: 'MARIO' });
const todas = [beto1, ana2, mto, ana1];

describe('resumen de nómina · columnas', () => {
  it('bono neto = bono + asignaciones − préstamos − anticipos', () => {
    expect(bonoNeto(ana1)).toBe(180);
  });
  it('las columnas salen en el orden del catálogo y «lo básico» existe en el catálogo', () => {
    expect(camposResumen(['neto', 'trabajador']).map((c) => c.clave)).toEqual(['trabajador', 'neto']);
    const claves = new Set(CAMPOS_RESUMEN.map((c) => c.clave));
    expect(CAMPOS_BASICOS.every((c) => claves.has(c))).toBe(true);
  });
  it('orientación automática según el ancho, o la elegida', () => {
    expect(orientacionResumen(['trabajador', 'neto'])).toBe('portrait');
    expect(orientacionResumen(CAMPOS_RESUMEN.map((c) => c.clave))).toBe('landscape');
    expect(orientacionResumen(['trabajador'], 'horizontal')).toBe('landscape');
  });
  it('estado y fecha de pago legibles', () => {
    const r = armarResumen([ana1, ana2], ['estado', 'fecha_pago', 'caja'], { alcance: 'general', agrupar: 'ninguno' });
    expect(r.bloques[0].filas).toEqual([['Pagada', '16-09-2026', 'Caja $'], ['Por pagar', '', '']]);
  });
});

describe('resumen de nómina · alcance general', () => {
  it('filtra por empresa, por fechas cruzadas y saca la papelera', () => {
    const borrada = fila({ periodo: per({ id: 'px', eliminado_en: '2026-10-01', periodo_desde: '2026-09-01', periodo_hasta: '2026-09-15' }) });
    expect(filtrarGeneral([...todas, borrada], { empresa: 'GT' }).length).toBe(3);
    expect(filtrarGeneral(todas, { empresa: 'ambas' }).length).toBe(4);
    expect(filtrarGeneral(todas, { empresa: 'GT', desde: '2026-09-20' }).map((f) => f.id)).toEqual([ana2.id]);
    expect(filtrarGeneral(todas, { empresa: 'ambas', hasta: '2026-09-15' }).map((f) => f.periodo.id).sort()).toEqual(['p1', 'p1']);
  });

  it('agrupa por período (viejo → nuevo) con subtotal; el acordado/mes solo se suma dentro del período', () => {
    const r = armarResumen(filtrarGeneral(todas, { empresa: 'GT' }), ['trabajador', 'total_mes', 'neto'], { alcance: 'general', agrupar: 'periodo', totales: true });
    expect(r.bloques.map((b) => b.titulo?.split(' · ')[0])).toEqual(['NOM-2026-0001', 'NOM-2026-0002']);
    expect(r.bloques[0].filas.map((f) => f[0])).toEqual(['ANA', 'BETO']);
    expect(r.bloques[0].subtotal).toEqual([null, 1200, 540]);
    // Total general: varias quincenas → el acordado/mes no se suma.
    expect(r.total).toEqual([null, null, 840]);
  });

  it('agrupa por trabajador: lo pagado a cada uno en el rango', () => {
    const r = armarResumen(filtrarGeneral(todas, { empresa: 'GT' }), ['periodo', 'neto'], { alcance: 'general', agrupar: 'trabajador' });
    expect(r.bloques.map((b) => b.titulo)).toEqual(['ANA · C.I. V-1 · 2 pago(s)', 'BETO · 1 pago(s)']);
    expect(r.bloques[0].filas).toEqual([['NOM-2026-0001', 240], ['NOM-2026-0002', 300]]);
    expect(r.bloques[0].subtotal).toEqual([null, 540]);
    expect(r.total).toBeNull();
  });
});

describe('resumen de nómina · un período', () => {
  it('no agrupa, ordena por nombre y suma también el acordado/mes', () => {
    const r = armarResumen([beto1, ana1], ['trabajador', 'total_mes', 'bono_neto'], { alcance: 'periodo', agrupar: 'trabajador', totales: true });
    expect(r.bloques).toHaveLength(1);
    expect(r.bloques[0].titulo).toBeNull();
    expect(r.bloques[0].filas.map((f) => f[0])).toEqual(['ANA', 'BETO']);
    expect(r.total).toEqual([null, 1200, 420]);
  });

  it('bloque de totales: pagado / por pagar y lo que salió de caja por moneda', () => {
    const t = calcularTotales([ana1, beto1, ana2]);
    expect(t).toMatchObject({ renglones: 3, trabajadores: 2, periodos: 2, pagados: 2, porPagar: 1, netoUsd: 840, netoPagadoUsd: 540, netoPorPagarUsd: 300, prestamosUsd: 50, anticiposUsd: 20 });
    expect(t.pagadoPorMoneda).toEqual([{ moneda: 'Bs', monto: 30000 }, { moneda: 'USD', monto: 240 }]);
    expect(lineasTotales(t).at(-1)?.[0]).toBe('Salió de caja en USD');
  });

  it('formato de celdas', () => {
    expect(formatoCelda('usd', 1234.5)).toBe('$ 1.234,50');
    expect(formatoCelda('bs', 10)).toBe('Bs 10,00');
    expect(formatoCelda('monto', '')).toBe('');
    expect(formatoCelda('num', 11)).toBe('11');
  });
});
