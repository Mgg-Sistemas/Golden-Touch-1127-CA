import { describe, it, expect } from 'vitest';
import {
  calcularCubicacionTanque,
  detectarClaveTanque,
  generarTablaVarilla,
} from './calculadoraCubicacion';

describe('calculadoraCubicacion · réplica exacta de calculadora.xlsx', () => {
  it('TANQUE #1 a 10 cm da exactamente 524,04 Litros (valor de calculadora.xlsx)', () => {
    const res = calcularCubicacionTanque('TANQUE #1', 10);
    expect(res.alturaCm).toBe(10);
    expect(res.alturaM).toBe(0.1);
    expect(res.volumenLitros).toBeCloseTo(524.04, 1);
    expect(res.capacidad100Litros).toBeCloseTo(36302.28, 1);
    expect(res.estado).toBe('NORMAL');
    expect(res.altura100Cm).toBe(238);
    expect(res.altura200Cm).toBe(476);
  });

  it('TANQUE #1 a 238 cm (100%) da su capacidad completa de 36.302,28 L', () => {
    const res = calcularCubicacionTanque('TANQUE #1', 238);
    expect(res.volumenLitros).toBeCloseTo(36302.28, 0);
    expect(res.nivelPct).toBeCloseTo(1, 2);
  });

  it('TANQUE #1 por encima de 238 cm supera la capacidad y extrapola linealmente', () => {
    const res = calcularCubicacionTanque('TANQUE #1', 300);
    expect(res.volumenLitros).toBeGreaterThan(36302.28);
    expect(res.estado).toBe('SUPERA LA CAPACIDAD (extrapolado al 200%)');
    expect(res.nivelPct).toBeGreaterThan(1);
  });

  it('TANQUE #2 a 10 cm da ~494,53 Litros', () => {
    const res = calcularCubicacionTanque('TANQUE #2', 10);
    expect(res.volumenLitros).toBeCloseTo(494.53, 1);
    expect(res.capacidad100Litros).toBeCloseTo(40643.33, 1);
    expect(res.altura100Cm).toBe(267);
  });

  it('TANQUE #2 a 267 cm (100%) da su capacidad completa de ~40.648,92 L', () => {
    const res = calcularCubicacionTanque('TANQUE #2', 267);
    expect(res.volumenLitros).toBeCloseTo(40648.92, 1);
  });

  it('TANQUE #3 calcula a 20 L/cm (2 m³ por metro)', () => {
    const res10 = calcularCubicacionTanque('TANQUE #3', 10);
    expect(res10.volumenLitros).toBe(200);

    const res99 = calcularCubicacionTanque('TANQUE #3', 99);
    expect(res99.volumenLitros).toBe(1980);
    expect(res99.estado).toBe('LLENO AL 100%');
    expect(res99.altura100Cm).toBe(99);
  });

  it('GEP-150 calcula a 10,64 L/cm', () => {
    const res10 = calcularCubicacionTanque('GEP-150', 10);
    expect(res10.volumenLitros).toBe(106.4);

    const res30 = calcularCubicacionTanque('GEP-150', 30);
    expect(res30.volumenLitros).toBe(319.2);
    expect(res30.estado).toBe('LLENO AL 100%');
    expect(res30.altura100Cm).toBe(30);
  });

  it('detectarClaveTanque reconoce los nombres usuales', () => {
    expect(detectarClaveTanque('Tanque #1 Principal')).toBe('TANQUE #1');
    expect(detectarClaveTanque('Tanque 2')).toBe('TANQUE #2');
    expect(detectarClaveTanque('Camión de servicio (Tanque 3)')).toBe('TANQUE #3');
    expect(detectarClaveTanque('Generador GEP 150')).toBe('GEP-150');
  });

  it('generarTablaVarilla produce la lista completa para varilla', () => {
    const tabla = generarTablaVarilla('TANQUE #1', 10);
    expect(tabla.length).toBe(10);
    expect(tabla[0].cm).toBe(1);
    expect(tabla[0].litros).toBeCloseTo(16.8, 0);
    expect(tabla[9].cm).toBe(10);
    expect(tabla[9].litros).toBeCloseTo(524.04, 0);
  });
});
