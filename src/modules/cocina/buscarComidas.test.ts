import { describe, it, expect } from 'vitest';
import { buscarComidas, textoBuscableComida, type ComidaBuscable } from './buscarComidas';

const rotulos: Record<string, string> = { desayuno: 'Desayuno', almuerzo: 'Almuerzo', cena: 'Cena' };
const categorias: Record<string, string> = { p1: 'Proteínas', p2: 'Víveres' };
const ctx = {
  rotuloTipo: (t: string) => rotulos[t] ?? t,
  categoriaDe: (id: string) => categorias[id],
};

const movs: (ComidaBuscable & { id: string })[] = [
  {
    id: 'a', codigo: 'CK-2026-0101', tipo_comida: 'almuerzo', platos: 24, valor_total: 55.5,
    nota: 'Se sirvió tarde', actor_name: 'María Pérez', at: '2026-10-08T16:30:00Z', origen: 'telefono',
    items: [{ producto_id: 'p1', sku: 'VIV-010', nombre: 'Pollo entero', cantidad: 2.5, unidad: 'KG' }],
  },
  {
    id: 'b', codigo: 'CK-2026-0102', tipo_comida: 'cena', platos: 18, valor_total: 30,
    actor_name: 'José', at: '2026-10-09T01:00:00Z', origen: 'pc', verificado_at: '2026-10-09T12:00:00Z', verificado_por: 'Ana',
    items: [{ producto_id: 'p2', sku: 'VIV-001', nombre: 'Arroz', cantidad: 3, unidad: 'KG' }],
  },
];
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('buscarComidas', () => {
  it('sin filtros salen todas', () => {
    expect(ids(buscarComidas(movs, {}, ctx))).toEqual(['a', 'b']);
    expect(ids(buscarComidas(movs, { texto: '   ' }, ctx))).toEqual(['a', 'b']);
  });

  it('filtra por tipo de movimiento', () => {
    expect(ids(buscarComidas(movs, { tipo: 'cena' }, ctx))).toEqual(['b']);
  });

  it('busca por víver, categoría, código y SKU, sin acentos', () => {
    expect(ids(buscarComidas(movs, { texto: 'pollo' }, ctx))).toEqual(['a']);
    expect(ids(buscarComidas(movs, { texto: 'proteinas' }, ctx))).toEqual(['a']);
    expect(ids(buscarComidas(movs, { texto: 'viveres' }, ctx))).toEqual(['b']);
    expect(ids(buscarComidas(movs, { texto: 'ck-2026-0102' }, ctx))).toEqual(['b']);
    expect(ids(buscarComidas(movs, { texto: 'VIV-010' }, ctx))).toEqual(['a']);
  });

  it('busca por quién, nota, verificación y origen', () => {
    expect(ids(buscarComidas(movs, { texto: 'maria perez' }, ctx))).toEqual(['a']);
    expect(ids(buscarComidas(movs, { texto: 'sirvio' }, ctx))).toEqual(['a']);
    expect(ids(buscarComidas(movs, { texto: 'verificada' }, ctx))).toEqual(['b']);
    expect(ids(buscarComidas(movs, { texto: 'ana' }, ctx))).toEqual(['b']);
    expect(ids(buscarComidas(movs, { texto: 'telefono' }, ctx))).toEqual(['a']);
  });

  it('busca por fecha de Caracas (la cena de la noche es del día anterior en UTC)', () => {
    expect(ids(buscarComidas(movs, { texto: '08/10/2026' }, ctx))).toEqual(['a', 'b']);
    expect(ids(buscarComidas(movs, { texto: '2026-10-09' }, ctx))).toEqual([]);
  });

  it('busca por cantidades y platos, con coma o punto', () => {
    expect(ids(buscarComidas(movs, { texto: '2,5' }, ctx))).toEqual(['a']);
    expect(ids(buscarComidas(movs, { texto: '2.5' }, ctx))).toEqual(['a']);
    expect(ids(buscarComidas(movs, { texto: '18 platos' }, ctx))).toEqual(['b']);
  });

  it('con varias palabras pide todas, en cualquier orden', () => {
    expect(ids(buscarComidas(movs, { texto: 'almuerzo pollo' }, ctx))).toEqual(['a']);
    expect(ids(buscarComidas(movs, { texto: 'arroz almuerzo' }, ctx))).toEqual([]);
  });

  it('combina tipo y texto', () => {
    expect(ids(buscarComidas(movs, { tipo: 'almuerzo', texto: 'arroz' }, ctx))).toEqual([]);
  });
});

describe('textoBuscableComida', () => {
  it('usa la fecha tal como se ve en la tabla', () => {
    const t = textoBuscableComida(movs[0], { ...ctx, fechaVisible: () => '8 oct 2026, 12:30' });
    expect(t).toContain('8 oct 2026, 12:30');
  });
});
