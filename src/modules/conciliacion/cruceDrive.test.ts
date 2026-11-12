import { describe, expect, it } from 'vitest';
import type { FilaConciliacion } from './conciliacion';
import { cruzarDrive, detectarColumnas, leerMatrizDrive, mismaReferencia, parseMontoBs, parsearCsv } from './cruceDrive';

const fila = (p: Partial<FilaConciliacion> & { codigo: string }): FilaConciliacion => ({
  item: 1, ordenId: p.codigo, origen: 'oc', tipo: 'compra', proveedor: 'P', estado: 'pagada', estadoLabel: 'Pagada', estadoClase: 'success',
  fecha: '2026-11-01', monedaOc: 'Bs', totalUsd: 10, totalBs: 1000, tasa: 100, fuenteTasa: null, pagada: true, fechaPago: '2026-11-02',
  pagadoUsd: 10, pagadoBs: 1000, referencias: [], referenciaManual: null, comprobantesTesoreria: [], comprobantesConciliacion: [],
  facturas: 0, facturaPrincipal: null, llevaRetencion: false, retenciones: [], anulada: false, drive: null, ...p,
});

describe('archivo del Drive', () => {
  it('lee montos en formato venezolano, con punto decimal y números de Excel', () => {
    expect(parseMontoBs('1.234.567,89')).toBe(1234567.89);
    expect(parseMontoBs('Bs 1.250,00')).toBe(1250);
    expect(parseMontoBs('1234567.89')).toBe(1234567.89);
    expect(parseMontoBs('1,234.50')).toBe(1234.5);
    expect(parseMontoBs('1.234')).toBe(1234);
    expect(parseMontoBs('-2.500,00')).toBe(2500);
    expect(parseMontoBs(1500.5)).toBe(1500.5);
    expect(parseMontoBs('abc')).toBeNull();
    expect(parseMontoBs('')).toBeNull();
  });

  it('CSV con punto y coma, comillas y encabezados con acentos', () => {
    const m = parsearCsv('Código OC;Referencia;"Monto Bs"\r\nOC-1;"00123456";"1.250,00"\r\n\r\n');
    expect(m).toEqual([['Código OC', 'Referencia', 'Monto Bs'], ['OC-1', '00123456', '1.250,00']]);
    expect(detectarColumnas(m[0])).toEqual({ oc: 0, referencia: 1, monto: 2 });
  });

  it('encuentra el encabezado aunque arriba venga el banco, y valida las filas', () => {
    const l = leerMatrizDrive([
      ['Banco de Venezuela'], ['Cuenta 0102...'],
      ['Codigo OC', 'Referencia', 'Monto Bs'],
      ['OC-1', '123456', '1.000,00'],
      ['', '', '5.000,00'], // saldo: se ignora
      ['OC-2', '999', 'xx'],
    ]);
    expect(l.filas.map((f) => [f.fila, f.ignorada, f.errores])).toEqual([
      [4, false, []], [5, true, []], [6, false, ['Monto Bs no es un número']],
    ]);
    expect(() => leerMatrizDrive([['Nombre', 'Fecha'], ['x', 'y']])).toThrow(/columnas/);
  });

  it('referencias: mismos dígitos, ceros a la izquierda y los últimos 6+', () => {
    expect(mismaReferencia('Bs 00123456', '123456')).toBe(true);
    expect(mismaReferencia('Binance 9988776655', '8776655')).toBe(true);
    expect(mismaReferencia('12345', '2345')).toBe(false);
    expect(mismaReferencia('123456', '654321')).toBe(false);
  });
});

describe('cruce por código de OC y por referencia', () => {
  const sistema = [
    fila({ codigo: 'OC-1', referencias: ['Bs 123456'], pagadoBs: 1000, totalBs: 1000 }),
    fila({ codigo: 'OC-2', ordenId: 'b', referencias: ['Bs 777777'], pagadoBs: 2000, totalBs: 2000 }),
    fila({ codigo: 'OC-3', ordenId: 'c', referencias: ['Bs 555555', 'Bs 666666'], pagadoBs: 3000, totalBs: 3000 }),
  ];
  const leer = (filas: unknown[][]) => leerMatrizDrive([['Codigo OC', 'Referencia', 'Monto Bs'], ...filas]);

  it('CUADRA con referencia y monto; NO CUADRA si falla alguno', () => {
    const c = cruzarDrive(leer([
      ['OC-1', '123456', '1.000,50'], // dentro de la tolerancia de 1 Bs
      ['OC-2', '777777', '2.500,00'], // monto distinto
    ]), sistema);
    expect(c.porDoc.get('oc:OC-1')?.estado).toBe('cuadra');
    expect(c.porDoc.get('oc:b')?.estado).toBe('no_cuadra');
    expect(c.porDoc.get('oc:b')?.detalle).toMatch(/monto/);
    expect(c.estado).toBe('Con observaciones');
  });

  it('sin código: cruza por referencia; referencia distinta = NO CUADRA', () => {
    const c = cruzarDrive(leer([['', '777777', '2000'], ['OC-1', '000111', '1000']]), sistema);
    expect(c.filas[0].por).toBe('referencia');
    expect(c.porDoc.get('oc:b')?.estado).toBe('cuadra');
    expect(c.porDoc.get('oc:OC-1')?.estado).toBe('no_cuadra');
    expect(c.porDoc.get('oc:OC-1')?.detalle).toMatch(/referencia 000111/);
  });

  it('pago en dos partes: cuadra si la suma da el monto', () => {
    const c = cruzarDrive(leer([['OC-3', '555555', '1.000,00'], ['OC-3', '666666', '2.000,00']]), sistema);
    expect(c.porDoc.get('oc:c')?.estado).toBe('cuadra');
    expect(c.cuadran).toBe(2);
  });

  it('lo que no está en Conciliación y las filas con error se informan', () => {
    const c = cruzarDrive(leer([['OC-99', '', '10'], ['OC-1', '123456', '']]), sistema);
    expect(c.noEncontradas).toBe(1);
    expect(c.conError).toBe(1);
    expect(c.estado).toBe('Error');
    expect(c.porDoc.size).toBe(0);
  });
});
