import { describe, expect, it } from 'vitest';
import { esCategoriaReal } from './categoriaReal';

describe('esCategoriaReal', () => {
  it('acepta una categoría con nombre', () => {
    expect(esCategoriaReal('REPUESTOS')).toBe(true);
    expect(esCategoriaReal('Víveres')).toBe(true);
  });

  it('rechaza vacía, solo espacios o nula', () => {
    expect(esCategoriaReal('')).toBe(false);
    expect(esCategoriaReal('   ')).toBe(false);
    expect(esCategoriaReal(null)).toBe(false);
    expect(esCategoriaReal(undefined)).toBe(false);
  });

  it('rechaza GENERAL escrita de cualquier forma', () => {
    expect(esCategoriaReal('GENERAL')).toBe(false);
    expect(esCategoriaReal('general')).toBe(false);
    expect(esCategoriaReal('  General ')).toBe(false);
  });

  it('no confunde una categoría que solo contiene la palabra', () => {
    expect(esCategoriaReal('SERVICIOS GENERALES')).toBe(true);
  });
});
