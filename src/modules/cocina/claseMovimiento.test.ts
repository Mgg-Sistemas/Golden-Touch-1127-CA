import { describe, expect, it } from 'vitest';
import { claseMovimiento, esDeCocina, NO_COCINA_OR, REF_TIPOS_COCINA } from './claseMovimiento';

describe('qué movimientos son de la cocina', () => {
  it('las comidas y la sincronización del 30/07', () => {
    expect(esDeCocina('cocina')).toBe(true);
    expect(esDeCocina('cocina_sync')).toBe(true);
  });

  it('no le importan las mayúsculas ni los espacios', () => {
    expect(esDeCocina(' Cocina ')).toBe(true);
    expect(esDeCocina('COCINA_SYNC')).toBe(true);
  });

  it('lo de inventario no es de la cocina', () => {
    for (const r of ['orden', 'manual', 'salida_modulo', 'compra', 'compra_directa', 'ajuste', null, undefined, '']) {
      expect(esDeCocina(r)).toBe(false);
    }
  });

  it('el filtro de PostgREST nombra los dos', () => {
    expect(NO_COCINA_OR).toBe('ref_tipo.is.null,ref_tipo.not.in.(cocina,cocina_sync)');
    expect(REF_TIPOS_COCINA).toEqual(['cocina', 'cocina_sync']);
  });
});

describe('en qué cajón va cada movimiento del kardex', () => {
  it('una comida es consumo', () => {
    expect(claseMovimiento({ delta: -9, tipo: 'consumo', refTipo: 'cocina' })).toBe('consumo');
  });

  it('un reverso de comida TAMBIÉN es consumo, aunque entre', () => {
    // Antes contaba como entrada, así que inflaba lo que había y dejaba el consumo alto.
    expect(claseMovimiento({ delta: 9, tipo: 'consumo', refTipo: 'cocina' })).toBe('consumo');
  });

  it('la sincronización de cocina es consumo, no una salida de inventario', () => {
    expect(claseMovimiento({ delta: -80, tipo: 'consumo', refTipo: 'cocina_sync' })).toBe('consumo');
  });

  it('lo que entra por una orden, una compra o una carga es entrada', () => {
    expect(claseMovimiento({ delta: 55, tipo: 'entrada', refTipo: 'orden' })).toBe('entrada');
    expect(claseMovimiento({ delta: 12, tipo: 'entrada', refTipo: 'compra_directa' })).toBe('entrada');
    expect(claseMovimiento({ delta: 30, tipo: 'creacion', refTipo: 'manual' })).toBe('entrada');
  });

  it('una salida de material o una salida manual es salida', () => {
    expect(claseMovimiento({ delta: -20, tipo: 'salida', refTipo: 'salida_modulo' })).toBe('salida');
    expect(claseMovimiento({ delta: -6, tipo: 'salida', refTipo: 'manual' })).toBe('salida');
  });

  it('un ajuste se reconoce por el tipo, no por el ref_tipo', () => {
    // Los dos llegan con ref_tipo 'manual': lo que los separa es el tipo del kardex.
    expect(claseMovimiento({ delta: -7, tipo: 'ajuste', refTipo: 'manual' })).toBe('ajuste');
    expect(claseMovimiento({ delta: -7, tipo: 'ajuste', refTipo: 'ajuste' })).toBe('ajuste');
    expect(claseMovimiento({ delta: 5, tipo: 'ajuste', refTipo: 'manual' })).toBe('entrada');
  });

  it('una salida sin tipo ni origen se toma como salida', () => {
    expect(claseMovimiento({ delta: -3 })).toBe('salida');
  });
});
