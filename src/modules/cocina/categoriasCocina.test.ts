import { describe, expect, it } from 'vitest';
import { esCategoriaComida, esCategoriaViveres, esUnidadCocina, esValeCocina } from './categoriasCocina';

describe('categorías de cocina', () => {
  it('reconoce la comida sin acentos ni mayúsculas, incluidas frutas y jugos', () => {
    for (const c of ['VÍVERES', 'Viveres', 'CARNES', 'PROTEINA', 'HORTALIZAS Y LEGUMBRES', 'FRUTAS', 'JUGOS', 'BEBIDAS', 'LÁCTEOS', 'HUEVOS', 'PANADERÍA', 'ALIMENTOS'])
      expect(esCategoriaComida(c), c).toBe(true);
  });
  it('limpieza NO es comida (sale por Salidas y sí descuenta), pero sí entra al catálogo de Distribución', () => {
    expect(esCategoriaComida('LIMPIEZA')).toBe(false);
    expect(esCategoriaComida('LIMPIENZA')).toBe(false);
    expect(esCategoriaViveres('LIMPIEZA')).toBe(true);
    expect(esCategoriaViveres('FRUTAS')).toBe(true);
  });
  it('repuestos, herramientas y vacío no son de cocina', () => {
    for (const c of ['REPUESTOS', 'HERRAMIENTAS', 'ACEITES Y LUBRICANTES', 'EPP', '', null, undefined])
      expect(esCategoriaViveres(c), String(c)).toBe(false);
  });
});

describe('vale de entrega a cocina', () => {
  it('la unidad COCINA (o comedor) se reconoce sin importar cómo esté escrita', () => {
    expect(esUnidadCocina('COCINA')).toBe(true);
    expect(esUnidadCocina('cocina peramanal')).toBe(true);
    expect(esUnidadCocina('COMEDOR')).toBe(true);
    expect(esUnidadCocina('MANTENIMIENTO Y LUBRICACION')).toBe(false);
    expect(esUnidadCocina(null)).toBe(false);
  });
  it('comida a COCINA = vale (no descuenta); limpieza a COCINA o comida a otra unidad = salida normal', () => {
    expect(esValeCocina({ unidadSolicitante: 'COCINA', categoria: 'VÍVERES' })).toBe(true);
    expect(esValeCocina({ unidadSolicitante: 'COCINA', categoria: 'FRUTAS' })).toBe(true);
    expect(esValeCocina({ unidadSolicitante: 'COCINA', categoria: 'LIMPIEZA' })).toBe(false);
    expect(esValeCocina({ unidadSolicitante: 'MINA PERAMANAL', categoria: 'VÍVERES' })).toBe(false);
    expect(esValeCocina({ unidadSolicitante: null, categoria: 'VÍVERES' })).toBe(false);
  });
});
