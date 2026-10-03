import { describe, expect, it } from 'vitest';
import {
  DIAS_SEMANA, MESES, diaDeLaSemana, diasDe, difDias, fechasEntre, mesAnterior,
  mesSiguiente, primerDiaDelMes, seCruzan, sumarDias, ultimoDiaDelMes,
} from './dias';

describe('sumarDias', () => {
  it('suma y resta días', () => {
    expect(sumarDias('2026-10-03', 1)).toBe('2026-10-04');
    expect(sumarDias('2026-10-03', -1)).toBe('2026-10-02');
    expect(sumarDias('2026-10-03', 0)).toBe('2026-10-03');
  });
  it('cruza el fin de mes y el fin de año', () => {
    expect(sumarDias('2026-10-31', 1)).toBe('2026-11-01');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDias('2027-01-01', -1)).toBe('2026-12-31');
  });
  it('conoce los años bisiestos', () => {
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29');
    expect(sumarDias('2026-02-28', 1)).toBe('2026-03-01');
  });
  it('NO se corre un día por la zona horaria del equipo', () => {
    // Con `new Date('2026-10-03')` y getDate() local, al oeste de Londres esto daría el 2.
    for (const f of ['2026-01-01', '2026-06-15', '2026-12-31']) {
      expect(sumarDias(f, 0)).toBe(f);
    }
  });
});

describe('difDias y diasDe', () => {
  it('cuenta los días entre dos fechas', () => {
    expect(difDias('2026-10-01', '2026-10-03')).toBe(2);
    expect(difDias('2026-10-03', '2026-10-01')).toBe(-2);
    expect(difDias('2026-10-03', '2026-10-03')).toBe(0);
  });
  it('un rango cuenta sus dos extremos', () => {
    expect(diasDe({ desde: '2026-10-03', hasta: '2026-10-03' })).toBe(1);
    expect(diasDe({ desde: '2026-10-01', hasta: '2026-10-03' })).toBe(3);
  });
});

describe('fechasEntre', () => {
  it('devuelve todas las fechas, extremos incluidos', () => {
    expect(fechasEntre('2026-10-01', '2026-10-03')).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
  });
  it('un solo día devuelve ese día', () => {
    expect(fechasEntre('2026-10-03', '2026-10-03')).toEqual(['2026-10-03']);
  });
  it('un rango al revés devuelve vacío, no revienta', () => {
    expect(fechasEntre('2026-10-03', '2026-10-01')).toEqual([]);
  });
});

describe('seCruzan', () => {
  const a = { desde: '2026-10-05', hasta: '2026-10-10' };
  it('se pisan cuando comparten aunque sea un día', () => {
    expect(seCruzan(a, { desde: '2026-10-10', hasta: '2026-10-15' })).toBe(true);
    expect(seCruzan(a, { desde: '2026-10-01', hasta: '2026-10-05' })).toBe(true);
    expect(seCruzan(a, { desde: '2026-10-06', hasta: '2026-10-07' })).toBe(true);
  });
  it('no se pisan cuando quedan separados', () => {
    expect(seCruzan(a, { desde: '2026-10-11', hasta: '2026-10-20' })).toBe(false);
    expect(seCruzan(a, { desde: '2026-09-01', hasta: '2026-10-04' })).toBe(false);
  });
});

describe('diaDeLaSemana', () => {
  it('cuenta desde el domingo, como el resto del sistema', () => {
    // 2026-10-04 fue domingo
    expect(diaDeLaSemana('2026-10-04')).toBe(0);
    expect(diaDeLaSemana('2026-10-05')).toBe(1);
    expect(diaDeLaSemana('2026-10-10')).toBe(6);
  });
  it('la etiqueta sale de DIAS_SEMANA', () => {
    expect(DIAS_SEMANA[diaDeLaSemana('2026-10-04')]).toBe('D');
    expect(DIAS_SEMANA).toHaveLength(7);
  });
});

describe('primerDiaDelMes y ultimoDiaDelMes', () => {
  it('da los dos extremos del mes', () => {
    expect(primerDiaDelMes(2026, 10)).toBe('2026-10-01');
    expect(ultimoDiaDelMes(2026, 10)).toBe('2026-10-31');
  });
  it('conoce los meses de 30 y febrero', () => {
    expect(ultimoDiaDelMes(2026, 11)).toBe('2026-11-30');
    expect(ultimoDiaDelMes(2026, 2)).toBe('2026-02-28');
    expect(ultimoDiaDelMes(2028, 2)).toBe('2028-02-29');
  });
  it('rellena con cero el mes de un dígito', () => {
    expect(primerDiaDelMes(2026, 3)).toBe('2026-03-01');
  });
});

describe('mesAnterior y mesSiguiente', () => {
  it('se mueve dentro del año', () => {
    expect(mesSiguiente(2026, 10)).toEqual({ anio: 2026, mes: 11 });
    expect(mesAnterior(2026, 10)).toEqual({ anio: 2026, mes: 9 });
  });
  it('cruza el fin de año en los dos sentidos', () => {
    expect(mesSiguiente(2026, 12)).toEqual({ anio: 2027, mes: 1 });
    expect(mesAnterior(2026, 1)).toEqual({ anio: 2025, mes: 12 });
  });
  it('el nombre del mes sale de MESES', () => {
    expect(MESES[9]).toBe('Octubre');
    expect(MESES).toHaveLength(12);
  });
});
