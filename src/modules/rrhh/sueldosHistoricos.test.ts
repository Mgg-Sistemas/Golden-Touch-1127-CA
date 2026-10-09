import { describe, expect, it } from 'vitest';
import {
  MOTIVO_HISTORICO, analizarFilasHistorico, errorSueldoHistorico, normCedula, parseFechaExcel, parseMontoExcel, topeHistorico,
} from './sueldosHistoricos';

const HOY = '2026-10-09';

describe('topeHistorico', () => {
  it('es la fecha del último renglón que no es histórico', () => {
    expect(topeHistorico([
      { fecha: '2025-09-15', historico: false },
      { fecha: '2026-01-01', historico: false },
      { fecha: '2021-01-01', historico: true },
    ])).toBe('2026-01-01');
  });
  it('sin renglones vigentes no hay tope', () => {
    expect(topeHistorico([{ fecha: '2021-01-01', historico: true }])).toBeNull();
  });
});

describe('errorSueldoHistorico', () => {
  it('deja pasar un sueldo viejo válido', () => {
    expect(errorSueldoHistorico(150, '2022-03-01', MOTIVO_HISTORICO, '2025-09-15', HOY)).toBeNull();
  });
  it('rechaza la fecha igual o posterior al sueldo vigente', () => {
    expect(errorSueldoHistorico(150, '2025-09-15', 'x', '2025-09-15', HOY)).toMatch(/anterior al sueldo vigente/);
  });
  it('rechaza fecha futura, negativo, vacío y fecha repetida', () => {
    expect(errorSueldoHistorico(150, '2027-01-01', 'x', null, HOY)).toMatch(/futura/);
    expect(errorSueldoHistorico(-1, '2022-01-01', 'x', null, HOY)).toMatch(/negativo/);
    expect(errorSueldoHistorico(null, '2022-01-01', 'x', null, HOY)).toMatch(/Escribe/);
    expect(errorSueldoHistorico(150, '2022-01-01', 'x', null, HOY, ['2022-01-01'])).toMatch(/Ya hay/);
  });
  it('el sueldo cero sí vale (no es lo mismo que vacío)', () => {
    expect(errorSueldoHistorico(0, '2022-01-01', 'x', null, HOY)).toBeNull();
  });
});

describe('lectura del Excel', () => {
  it('fechas: dd/mm/aaaa, ISO, mm/aaaa, solo año, serie de Excel y Date', () => {
    expect(parseFechaExcel('05/03/2021')).toBe('2021-03-05');
    expect(parseFechaExcel('2021-03-05')).toBe('2021-03-05');
    expect(parseFechaExcel('03/2021')).toBe('2021-03-01');
    expect(parseFechaExcel('2021')).toBe('2021-01-01');
    expect(parseFechaExcel(2021)).toBe('2021-01-01');
    expect(parseFechaExcel(44256)).toBe('2021-03-01');
    expect(parseFechaExcel(new Date(2021, 2, 5))).toBe('2021-03-05');
    expect(parseFechaExcel('31/02/2021')).toBeNull();
    expect(parseFechaExcel('ayer')).toBeNull();
  });
  it('montos con coma o punto', () => {
    expect(parseMontoExcel('1.250,50')).toBe(1250.5);
    expect(parseMontoExcel('1,250.50')).toBe(1250.5);
    expect(parseMontoExcel('300,5')).toBe(300.5);
    expect(parseMontoExcel('$300')).toBe(300);
    expect(parseMontoExcel(280)).toBe(280);
    expect(parseMontoExcel('')).toBeNull();
  });
  it('cédula solo con dígitos', () => {
    expect(normCedula('V-12.345.678')).toBe('12345678');
    expect(normCedula(12345678)).toBe('12345678');
  });
});

describe('analizarFilasHistorico', () => {
  const personas = [{ id: 'p1', cedula: 'V-12.345.678', nombre: 'ANA' }];
  it('arma las filas válidas y marca los errores con su número de fila', () => {
    const filas = analizarFilasHistorico([
      { 'Cédula': '12345678', 'Año': 2021, 'Sueldo': '150' },
      { 'Cédula': '12345678', 'Fecha': '01/06/2023', 'Sueldo': 200, 'Motivo': 'Aumento', 'Nota': 'por desempeño' },
      { 'Cédula': '999', 'Fecha': '2022', 'Sueldo': 100 },
      { 'Cédula': '12345678', 'Año': '2021', 'Sueldo': 170 },
      { 'Cédula': '', 'Fecha': '', 'Sueldo': '' },
    ], personas, HOY);
    expect(filas).toHaveLength(4);
    expect(filas[0]).toMatchObject({ fila: 2, fecha: '2021-01-01', sueldo: 150, motivo: MOTIVO_HISTORICO, error: null });
    expect(filas[1]).toMatchObject({ fila: 3, motivo: 'Aumento', nota: 'por desempeño', error: null });
    expect(filas[2].error).toMatch(/No hay nadie/);
    expect(filas[3].error).toMatch(/repetida/);
  });
});
