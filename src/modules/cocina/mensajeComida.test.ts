import { describe, it, expect } from 'vitest';
import { EMOJI_COMIDA, TITULO_COMIDA, mensajeComida } from './mensajeComida';
import type { CocinaItem, TipoComida } from './cocina.repository';

const item = (x: Partial<CocinaItem>): CocinaItem => ({
  producto_id: 'p1', sku: 'VIV-001', nombre: 'ARROZ BLANCO', cantidad: 2, precio: 1.5, ...x,
});

const mov = (x: Partial<{ tipo_comida: TipoComida; platos: number; items: CocinaItem[]; nota: string | null; codigo: string | null; at: string }>) => ({
  tipo_comida: 'almuerzo' as TipoComida, platos: 24, items: [item({})], nota: null, codigo: 'CK-2026-0123',
  at: '2026-10-02T16:00:00Z', ...x,
});

describe('mensajeComida', () => {
  it('el almuerzo: título, personas, fecha, registro y consumo', () => {
    const t = mensajeComida({ mov: mov({}), unidades: { p1: 'KG' }, registradoPor: 'ANTHONY' });
    expect(t.split('\n')).toEqual([
      '🍲 *ALMUERZO SERVIDO*',
      '',
      '👥 *Personas:* 24',
      '📅 *Fecha:* 02/10/2026',
      '🧾 *Registro:* CK-2026-0123',
      '',
      '🥘 *Consumo:*',
      '🔸 2 KG · ARROZ BLANCO',
      '',
      '🏢 GOLDEN TOUCH 1127 C.A. · Cargado por ANTHONY',
    ]);
  });

  it('cada comida abre con su emoji y su título', () => {
    expect(mensajeComida({ mov: mov({ tipo_comida: 'desayuno' }) })).toContain('🍳 *DESAYUNO SERVIDO*');
    expect(mensajeComida({ mov: mov({ tipo_comida: 'cena' }) })).toContain('🌙 *CENA SERVIDA*');
  });

  it('la cena de las 9 de la noche lleva la fecha de su día en Caracas', () => {
    expect(mensajeComida({ mov: mov({ tipo_comida: 'cena', at: '2026-10-03T01:00:00Z' }) })).toContain('📅 *Fecha:* 02/10/2026');
  });

  it('varios víveres, con decimales con coma y la unidad del propio renglón primero', () => {
    const t = mensajeComida({
      mov: mov({ items: [item({ cantidad: 2.5, unidad: 'KG' }), item({ producto_id: 'p2', nombre: 'HUEVOS', cantidad: 30 })] }),
      unidades: { p1: 'SACO', p2: 'UND' },
    });
    expect(t).toContain('🔸 2,5 KG · ARROZ BLANCO');
    expect(t).toContain('🔸 30 UND · HUEVOS');
  });

  it('sin unidad conocida no deja un espacio de más', () => {
    expect(mensajeComida({ mov: mov({}) })).toContain('🔸 2 · ARROZ BLANCO');
  });

  it('la nota va si existe', () => {
    expect(mensajeComida({ mov: mov({ nota: '  Se sirvió tarde  ' }) })).toContain('📝 *Nota:* Se sirvió tarde');
  });

  it('no escribe los renglones de lo que no hay', () => {
    const t = mensajeComida({ mov: mov({ items: [], nota: null, codigo: null }) });
    expect(t).not.toContain('Consumo');
    expect(t).not.toContain('Nota');
    expect(t).not.toContain('Registro');
    expect(t).not.toContain('Cargado por');
    expect(t).not.toContain('undefined');
    expect(t).not.toContain('null');
  });

  it('el costo no viaja en el mensaje', () => {
    const t = mensajeComida({ mov: mov({}) });
    expect(t).not.toContain('$');
    expect(t).not.toContain('1,5');
  });
});

/* Igual que en combustible: un emoji que dependa del selector invisible
   U+FE0F llega al teléfono como un cuadrito. */
describe('los emojis llegan al teléfono', () => {
  const todos = (['desayuno', 'almuerzo', 'cena'] as const).map((tipo_comida) =>
    mensajeComida({ mov: mov({ tipo_comida, nota: 'Nota' }), unidades: { p1: 'KG' }, registradoPor: 'PRUEBA' }));

  it('ningún renglón usa el selector de presentación U+FE0F', () => {
    for (const t of todos) expect(t).not.toMatch(/️/);
    for (const e of Object.values(EMOJI_COMIDA)) expect(e).not.toMatch(/️/);
  });

  it('el almuerzo no usa el plato con cubiertos, que es un símbolo de texto', () => {
    expect(EMOJI_COMIDA.almuerzo).not.toBe('\u{1F37D}');
    for (const t of todos) expect(t).not.toContain('\u{1F37D}');
  });

  it('hay título para las tres comidas', () => {
    expect(Object.keys(TITULO_COMIDA).sort()).toEqual(['almuerzo', 'cena', 'desayuno']);
  });
});
