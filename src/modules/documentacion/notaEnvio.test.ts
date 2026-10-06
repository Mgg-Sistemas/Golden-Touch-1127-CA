import { describe, expect, it } from 'vitest';
import { cantidadTexto, numeroEnvio, renglonesValidos, totalRenglones } from './notaEnvio';

describe('nota de envío', () => {
  it('el correlativo va con 4 dígitos', () => {
    expect(numeroEnvio(1)).toBe('0001');
    expect(numeroEnvio(57)).toBe('0057');
    expect(numeroEnvio(12345)).toBe('12345');
    expect(numeroEnvio(null)).toBe('0000');
  });

  it('descarta renglones sin descripción y limpia espacios', () => {
    expect(renglonesValidos([
      { descripcion: '  Facturas originales  ', cantidad: 296 },
      { descripcion: '   ', cantidad: 4 },
      { descripcion: 'Contrato', cantidad: null },
    ])).toEqual([
      { descripcion: 'Facturas originales', cantidad: 296 },
      { descripcion: 'Contrato', cantidad: null },
    ]);
  });

  it('el total suma solo las cantidades de renglones válidos', () => {
    expect(totalRenglones([
      { descripcion: 'A', cantidad: 296 },
      { descripcion: 'B', cantidad: 30 },
      { descripcion: '', cantidad: 99 },
      { descripcion: 'C', cantidad: null },
    ])).toBe(326);
  });

  it('cantidad sin decimales si es entera', () => {
    expect(cantidadTexto(45)).toBe('45');
    expect(cantidadTexto(null)).toBe('');
  });
});
