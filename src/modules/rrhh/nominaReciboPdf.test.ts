import { describe, expect, it, vi } from 'vitest';
import type { NominaRenglon } from '@/shared/lib/types';

vi.mock('@/shared/lib/pdfLogo', () => ({
  loadLogoPdfEmpresa: () => Promise.resolve(null),
  dibujarLogoPdf: () => undefined,
  anchoLogoPdf: (h: number) => h,
}));

import { construir } from './nominaReciboPdf';

const base = {
  id: 'r1', periodo_id: 'p1', personal_id: 'x1', nombre: 'JOSÉ ANTONIO PÉREZ RODRÍGUEZ', cargo: 'OPERADOR DE MAQUINARIA PESADA',
  departamento: 'OPERACIONES MINA', dias_trabajados: 11, dias_descanso: 4, sueldo_quincena_bs: 12345.67,
  tasa_bs: 190.5, sueldo_base_mensual: 800, bono_quincena_usd: 335.2, sueldo_pct: 16, estado: 'pagada',
  pagada_en: '2026-10-08',
} as unknown as NominaRenglon;

const meta = { periodo: { codigo: 'NOM-GT-0041', tipo: 'quincena', periodo_desde: '2026-09-16', periodo_hasta: '2026-09-30', tasa_bcv: 190.5, nombre: 'Q2 sep', empresa: 'GT' } };

describe('recibo de nómina: una hoja por persona, firmas incluidas', () => {
  it('un recibo simple ocupa una hoja', async () => {
    const doc = await construir([base], meta as never);
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('con préstamos, anticipos, asignaciones y muchos seriales sigue en una hoja', async () => {
    const cargado = {
      ...base, asignaciones: 40, deduc_prestamos: 50, deduc_anticipos: 30,
      seriales_billetes: Array.from({ length: 60 }, (_, i) => `AB${String(10000000 + i)}`),
    } as unknown as NominaRenglon;
    const doc = await construir([cargado, base, cargado], meta as never);
    expect(doc.getNumberOfPages()).toBe(3);
  });
});
