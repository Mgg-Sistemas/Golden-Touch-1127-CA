import { describe, expect, it } from 'vitest';
import type { NominaRenglon } from '@/shared/lib/types';
import { filtrarRenglonesNomina, montoRenglonLote, totalLote } from './nominaLote';

const fila = (id: string, nombre: string, neto: number, extra: Partial<NominaRenglon> = {}) =>
  ({ id, nombre, neto_usd: neto, cargo: 'MOLINERO', departamento: 'MINA GOLDEN TOUCH', personal_id: `p-${id}`, periodo: { codigo: 'NOM-2026-0002' }, ...extra }) as unknown as NominaRenglon;

const rows = [
  fila('1', 'ADOLFO ENRIQUE BLANCO BELLORÍN', 120.5),
  fila('2', 'MARÍA PÉREZ', 80, { cargo: 'COCINERA', departamento: 'COCINA' }),
  fila('3', 'JOSÉ PÉREZ', 99.99, { periodo: { codigo: 'NOM-2026-0001' } } as never),
];

describe('buscador de la nómina por pagar', () => {
  it('sin texto se ven todos', () => {
    expect(filtrarRenglonesNomina(rows, '  ')).toHaveLength(3);
  });
  it('busca sin acentos ni mayúsculas, por varias palabras', () => {
    expect(filtrarRenglonesNomina(rows, 'bellorin').map((r) => r.id)).toEqual(['1']);
    expect(filtrarRenglonesNomina(rows, 'perez maria').map((r) => r.id)).toEqual(['2']);
  });
  it('busca por cargo, departamento, código de nómina y cédula', () => {
    expect(filtrarRenglonesNomina(rows, 'cocina').map((r) => r.id)).toEqual(['2']);
    expect(filtrarRenglonesNomina(rows, '0001').map((r) => r.id)).toEqual(['3']);
    expect(filtrarRenglonesNomina(rows, '15034153', { 'p-1': 'V-15034153' }).map((r) => r.id)).toEqual(['1']);
  });
});

describe('montos del pago por lote', () => {
  it('en $ es el neto de cada uno; en Bs, el neto a la tasa', () => {
    expect(montoRenglonLote(rows[0], 'USD', 200)).toBe(120.5);
    expect(montoRenglonLote(rows[0], 'Bs', 190.5)).toBe(22955.25);
  });
  it('el total suma lo que se le paga a cada uno', () => {
    expect(totalLote(rows, 'USD', 0)).toBe(300.49);
    expect(totalLote([rows[1], rows[2]], 'Bs', 10)).toBe(1799.9);
  });
});
