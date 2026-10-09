import { describe, expect, it, vi } from 'vitest';
import type { NominaRenglon } from '@/shared/lib/types';

vi.mock('@/shared/lib/pdfLogo', () => ({
  loadLogoPdfEmpresa: () => Promise.resolve(null),
  dibujarLogoPdf: () => undefined,
  anchoLogoPdf: (h: number) => h,
}));

import { construir, montosRecibo } from './nominaReciboPdf';

const base = {
  id: 'r1', periodo_id: 'p1', personal_id: 'x1', nombre: 'JOSÉ ANTONIO PÉREZ RODRÍGUEZ', cargo: 'OPERADOR DE MAQUINARIA PESADA',
  departamento: 'OPERACIONES MINA', dias_trabajados: 11, dias_descanso: 4, sueldo_quincena_bs: 12345.67,
  tasa_bs: 190.5, sueldo_base_mensual: 800, bono_quincena_usd: 335.2, sueldo_pct: 16, estado: 'pagada',
  pagada_en: '2026-10-08',
} as unknown as NominaRenglon;

const meta = { periodo: { codigo: 'NOM-GT-0041', tipo: 'quincena', periodo_desde: '2026-09-16', periodo_hasta: '2026-09-30', tasa_bcv: 190.5, nombre: 'Q2 sep', empresa: 'GT' } };

describe('recibos de nómina: dos por persona (sueldo en Bs y bonificación), una hoja cada uno', () => {
  it('una persona: dos hojas (sueldo en Bs y bonificación)', async () => {
    const doc = await construir([base], meta as never);
    expect(doc.getNumberOfPages()).toBe(2);
  });

  it('se puede pedir uno solo de los dos', async () => {
    expect((await construir([base, base], { ...meta, tipos: ['sueldo'] } as never)).getNumberOfPages()).toBe(2);
    expect((await construir([base], { ...meta, tipos: ['bono'] } as never)).getNumberOfPages()).toBe(1);
  });

  it('con préstamos, anticipos, asignaciones y muchos seriales sigue en una hoja', async () => {
    const cargado = {
      ...base, asignaciones: 40, deduc_prestamos: 50, deduc_anticipos: 30,
      seriales_billetes: Array.from({ length: 60 }, (_, i) => `AB${String(10000000 + i)}`),
    } as unknown as NominaRenglon;
    const doc = await construir([cargado, base, cargado], meta as never);
    expect(doc.getNumberOfPages()).toBe(6);
  });
});

describe('montos de los dos recibos', () => {
  const r = { ...base, asignaciones: 40, deduc_prestamos: 50, deduc_anticipos: 30 } as unknown as NominaRenglon;
  const m = montosRecibo(r, 999);
  it('recibo 1: días trabajados + descanso suman exacto el sueldo en Bs, sin préstamos ni asignaciones', () => {
    expect(m.trabajadosBs + m.descansoBs).toBeCloseTo(12345.67, 2);
    expect(m.netoBs).toBe(12345.67);
    expect(m.netoBsEnUsd).toBe(64.81);
  });
  it('recibo 2: bono + asignaciones − préstamos − anticipos', () => {
    expect(m.bonoBrutoUsd).toBe(375.2);
    expect(m.bonoNetoUsd).toBe(295.2);
  });
  it('el total de la quincena cuenta las asignaciones una sola vez', () => {
    expect(m.totalUsd).toBe(360.01);
  });
  it('la tasa del renglón manda sobre la del período; el bono neto nunca es negativo', () => {
    expect(m.tasa).toBe(190.5);
    expect(montosRecibo({ ...base, bono_quincena_usd: 10, deduc_prestamos: 50 } as unknown as NominaRenglon).bonoNetoUsd).toBe(0);
  });
});
