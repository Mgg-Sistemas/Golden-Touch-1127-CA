import { describe, expect, it } from 'vitest';
import { nombreArchivoReporte, reporteGastosFijosTxt } from './administracionWhatsApp';
import type { GastoTablero } from './administracionTablero';

const g = (p: Partial<GastoTablero>): GastoTablero => ({
  empresaClave: 'GT', concepto: 'Agua', empresaNombre: 'Golden Touch', categoria: 'Servicios', monto: 100, moneda: 'USD',
  periodicidad: 'mensual', diaVencimiento: 10, vigenteDesde: '2020-01-01', estado: 'activo', ...p,
});
const hoy = new Date(2026, 10, 1); // 2026-11-01

describe('reporteGastosFijosTxt', () => {
  const filas = [
    g({ concepto: 'Agua', moneda: 'Bs', monto: 1800, diaVencimiento: 5 }),
    g({ concepto: 'Alquiler de oficina', moneda: 'USD', monto: 800, diaVencimiento: 25 }),
    g({ concepto: 'Viejo', estado: 'suspendido', monto: 9999 }),
  ];
  const txt = reporteGastosFijosTxt(filas, { empresaNombre: 'Golden Touch', periodoLabel: 'Noviembre 2026', tasa: 40, hoy });

  it('lleva el marcado de WhatsApp y el encabezado con la empresa', () => {
    expect(txt).toContain('*🧾 Gastos fijos · Golden Touch*');
    expect(txt).toContain('Noviembre 2026');
    expect(txt).toContain('*Resumen*');
    expect(txt).toContain('*Detalle (2 activos)*'); // el suspendido no cuenta
  });

  it('ordena el detalle por vencimiento y marca lo que vence pronto', () => {
    const iAgua = txt.indexOf('Agua'); // vence 05/11 (≤7 días → ⚠)
    const iAlq = txt.indexOf('Alquiler de oficina'); // vence 25/11
    expect(iAgua).toBeGreaterThan(-1);
    expect(iAgua).toBeLessThan(iAlq); // agua primero
    expect(txt).toMatch(/Agua — Golden Touch — Bs 1\.800,00 — vence 05\/11 ⚠/);
    expect(txt).not.toContain('Viejo'); // suspendido fuera del detalle
  });

  it('«Todas las empresas» si no se pasa empresa', () => {
    expect(reporteGastosFijosTxt(filas, { periodoLabel: 'Noviembre 2026', tasa: 40, hoy })).toContain('Todas las empresas');
  });

  it('nombre de archivo en slug', () => {
    expect(nombreArchivoReporte('Noviembre 2026')).toBe('gastos-fijos-noviembre-2026.txt');
  });
});
