import { describe, expect, it } from 'vitest';
import { faltaEnLaCarga, leerMonto } from './validarCarga';

describe('lo que la carga exige antes de registrar', () => {
  it('sin N° de factura no se registra una retención de IVA, ISLR o municipal', () => {
    for (const tipo of ['iva', 'islr', 'municipal', 'regional'] as const) {
      expect(faltaEnLaCarga({ tipo, facturaNumero: '', facturaFecha: '2026-10-01' })).toContain('N° de factura requerido');
      expect(faltaEnLaCarga({ tipo, facturaNumero: '   ', facturaFecha: '2026-10-01' })).toContain('N° de factura requerido');
    }
  });

  it('con el N° de factura, no falta nada', () => {
    expect(faltaEnLaCarga({ tipo: 'iva', facturaNumero: '000123', facturaFecha: '2026-10-01' })).toBeNull();
  });

  it('el IGTF no pide factura: es una percepción por pago', () => {
    expect(faltaEnLaCarga({ tipo: 'igtf', facturaNumero: '', facturaFecha: '2026-10-01' })).toBeNull();
  });

  it('sin fecha de la factura no se registra: de ella sale el período (y en IVA la quincena)', () => {
    for (const tipo of ['iva', 'islr', 'municipal', 'regional', 'igtf'] as const) {
      expect(faltaEnLaCarga({ tipo, facturaNumero: '000123', facturaFecha: '' })).toContain('Fecha de la factura requerida');
    }
  });

  it('una fecha a medias tampoco sirve', () => {
    expect(faltaEnLaCarga({ tipo: 'islr', facturaNumero: '000123', facturaFecha: '2026-10' })).toContain('Fecha de la factura requerida');
    expect(faltaEnLaCarga({ tipo: 'islr', facturaNumero: '000123', facturaFecha: '2026-13-01' })).toContain('Fecha de la factura requerida');
  });
});

describe('montos escritos a mano', () => {
  it('entiende la coma decimal con y sin punto de miles', () => {
    expect(leerMonto('1.234,56')).toBe(1234.56);
    expect(leerMonto('1234,56')).toBe(1234.56);
    expect(leerMonto('1.234.567,8')).toBe(1234567.8);
  });
  it('entiende el punto decimal (como viene la tasa)', () => {
    expect(leerMonto('879.12')).toBe(879.12);
    expect(leerMonto('151.54')).toBe(151.54);
  });
  it('varios puntos sin coma son miles', () => {
    expect(leerMonto('1.234.567')).toBe(1234567);
  });
  it('vacío es 0', () => {
    expect(leerMonto('')).toBe(0);
    expect(leerMonto('  ')).toBe(0);
  });
  it('lo que no se entiende no se vuelve 0', () => {
    expect(leerMonto('1,234,56')).toBeNull();
    expect(leerMonto('12a')).toBeNull();
    expect(leerMonto('1.23.4,5')).toBeNull();
  });
});
