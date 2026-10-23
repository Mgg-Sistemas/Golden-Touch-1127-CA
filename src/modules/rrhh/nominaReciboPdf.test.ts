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

  it('el recibo en Bs es SOLO Bs: no lleva nada en $ (15/10/2026); el de bonificación sí', async () => {
    const soloBs = (await construir([base], { ...meta, tipos: ['sueldo'] } as never)).output();
    expect(soloBs).not.toContain('$');
    expect(soloBs).toContain('Sueldo quincenal');
    expect(soloBs).toContain('Sueldo diario');
    // Conformidad dictada por RRHH: la totalidad del salario del período, sin «% del total acordado».
    expect(soloBs).toContain('totalidad de mi salario');
    expect(soloBs).toContain('16-09-2026 al 30-09-2026');
    expect(soloBs).not.toContain('total acordado');
    const bono = (await construir([base], { ...meta, tipos: ['bono'] } as never)).output();
    expect(bono).toContain('$');
    // Y el de bonificación es SOLO $: ni montos en Bs, ni la tasa, ni el total mezclado.
    expect(bono).not.toMatch(/Bs\s/);
    expect(bono).not.toContain('Tasa de cierre');
    expect(bono).not.toContain('TOTAL DE LA QUINCENA');
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

/* ───────── Real brasileño (23/10/2026) ───────── */
describe('empresas con moneda de pago Real brasileño: el recibo 2 sale en $ y en R$', () => {
  const r = { ...base, asignaciones: 40, deduc_prestamos: 50, deduc_anticipos: 30 } as unknown as NominaRenglon;
  const TASA = 5.0428;

  it('los montos en R$ son los de $ por la tasa (20 $ = R$ 100,86)', () => {
    const m = montosRecibo(r, 190.5, null, TASA);
    expect(m.esReal).toBe(true);
    expect(m.tasaBrl).toBe(TASA);
    expect(m.bonoBrl).toBe(1690.35);            // 335,20 × 5,0428
    expect(m.asignacionesBrl).toBe(201.71);     // 40 × 5,0428
    expect(m.bonoBrutoBrl).toBe(1892.06);
    expect(m.prestamosBrl).toBe(252.14);
    expect(m.anticiposBrl).toBe(151.28);
    expect(m.bonoNetoBrl).toBe(1488.64);
    // Y lo de $ no cambia.
    expect(m.bonoNetoUsd).toBe(295.2);
    expect(montosRecibo({ ...base, bono_quincena_usd: 20 } as unknown as NominaRenglon, 190.5, null, TASA).bonoBrl).toBe(100.86);
  });

  it('sin tasa del Real, o pagando en otra moneda, no hay R$', () => {
    expect(montosRecibo(r, 190.5).esReal).toBe(false);
    expect(montosRecibo(r, 190.5, null, 0).bonoBrl).toBe(0);
    expect(montosRecibo(r, 190.5, 'Bs', TASA).esReal).toBe(false);
    expect(montosRecibo(r, 190.5, 'USDT', TASA).esReal).toBe(false);
  });

  it('el neto en R$ nunca es negativo', () => {
    expect(montosRecibo({ ...base, bono_quincena_usd: 10, deduc_prestamos: 50 } as unknown as NominaRenglon, 190.5, null, TASA).bonoNetoBrl).toBe(0);
  });

  const metaBrl = { periodo: { ...meta.periodo, tasa_brl: TASA, tasa_brl_fecha: '2026-10-23' } };

  it('el recibo de bonificación lleva las columnas en R$, el neto en las dos monedas y la tasa', async () => {
    const bono = (await construir([r], { ...metaBrl, tipos: ['bono'] } as never)).output();
    expect(bono).toContain('R$');
    expect(bono).toContain('ASIGNACI');
    expect(bono).toContain('R$ 1.488,64');           // neto en reales
    expect(bono).toContain('TASA DE CAMBIO');
    expect(bono).toContain('1 $ = R$ 5,0428');
    expect(bono).toContain('23-10-2026');
    expect(bono).toContain('equivalente a R$ 1.488,64 en Real brasile');
    // Sigue siendo SOLO divisas: nada en Bs.
    expect(bono).not.toMatch(/Bs\s/);
  });

  it('el recibo del sueldo en Bs no cambia: ni $ ni R$', async () => {
    const sueldo = (await construir([r], { ...metaBrl, tipos: ['sueldo'] } as never)).output();
    expect(sueldo).not.toContain('R$');
    expect(sueldo).not.toContain('$');
  });

  it('una nómina sin tasa del Real sale como siempre, sin R$', async () => {
    const bono = (await construir([r], { ...meta, tipos: ['bono'] } as never)).output();
    expect(bono).not.toContain('R$');
    expect(bono).not.toContain('TASA DE CAMBIO');
  });

  it('con muchos seriales y descuentos sigue cabiendo en una hoja por recibo', async () => {
    const cargado = { ...r, seriales_billetes: Array.from({ length: 60 }, (_, i) => `AB${String(10000000 + i)}`) } as unknown as NominaRenglon;
    const doc = await construir([cargado, base], { ...metaBrl, tipos: ['bono'] } as never);
    expect(doc.getNumberOfPages()).toBe(2);
  });
});
