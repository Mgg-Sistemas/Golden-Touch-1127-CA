import { describe, it, expect } from 'vitest';
import {
  compararMovimientos, fechaParaExcel, horaAInput, horaDesdeInput, horaLegible, horaOrden, horaSinAmPm, SIN_HORA,
} from './horaMovimiento';

const seg = (h: number, m = 0, s = 0) => h * 3600 + m * 60 + s;

describe('horaOrden', () => {
  it('lee el reloj de 12 con AM y PM', () => {
    expect(horaOrden('8:02:00 AM')).toBe(seg(8, 2));
    expect(horaOrden('2:50:00 PM')).toBe(seg(14, 50));
    expect(horaOrden('12:00:00 AM')).toBe(0);
    expect(horaOrden('12:06:00 PM')).toBe(seg(12, 6));
    expect(horaOrden('09:26:11 AM')).toBe(seg(9, 26, 11));
  });

  it('lee el reloj de 24, y un sufijo de más no la corre', () => {
    // Hay ocho filas así en la base: «13:43:43 PM». El número ya dice 13;
    // aplicarle el PM daría 25.
    expect(horaOrden('13:43:43 PM')).toBe(seg(13, 43, 43));
    expect(horaOrden('14:04:33 PM')).toBe(seg(14, 4, 33));
    expect(horaOrden('18:30')).toBe(seg(18, 30));
  });

  it('a la hora sin la letra del AM/PM la deja en su número, no al amanecer', () => {
    // Era el desorden del Excel: «6:42:08 M» caía en -1 y aparecía ANTES que
    // un movimiento de las 7 de la mañana.
    expect(horaOrden('6:42:08 M')).toBe(seg(6, 42, 8));
    expect(horaOrden('2:02:00 M')).toBe(seg(2, 2));
    expect(horaOrden('07:45:00 M')).toBe(seg(7, 45));
    expect(horaOrden('11:30:00 M')).toBe(seg(11, 30));
  });

  it('aguanta el punto y el espacio de «a. m.»', () => {
    expect(horaOrden('7:15:00 p. m.')).toBe(seg(19, 15));
    expect(horaOrden('7:15:00 a.m.')).toBe(seg(7, 15));
  });

  it('sin hora, o con una hora imposible, queda primero del día', () => {
    expect(horaOrden(null)).toBe(SIN_HORA);
    expect(horaOrden('')).toBe(SIN_HORA);
    expect(horaOrden('mediodía')).toBe(SIN_HORA);
    expect(horaOrden('25:00:00')).toBe(SIN_HORA);
    expect(horaOrden('10:75')).toBe(SIN_HORA);
  });
});

describe('avisos sobre la hora', () => {
  it('sabe cuáles no se entienden', () => {
    expect(horaLegible('8:02:00 AM')).toBe(true);
    expect(horaLegible(null)).toBe(true);        // sin hora no es un error
    expect(horaLegible('6:42:08 M')).toBe(true); // ahora sí se entiende
    expect(horaLegible('a las seis')).toBe(false);
  });

  it('marca las que perdieron la A o la P, para corregirlas a mano', () => {
    expect(horaSinAmPm('6:42:08 M')).toBe(true);
    expect(horaSinAmPm('07:45:00 M')).toBe(true);
    expect(horaSinAmPm('6:42:08 AM')).toBe(false);
    expect(horaSinAmPm('6:42:08 PM')).toBe(false);
    expect(horaSinAmPm('18:30')).toBe(false);
    expect(horaSinAmPm(null)).toBe(false);
  });
});

describe('compararMovimientos', () => {
  const f = (p: Partial<Parameters<typeof compararMovimientos>[0]>) =>
    ({ fecha: '2026-09-22', hora: null, orden: 0, created_at: '2026-09-22T06:00:00Z', id: 'a', ...p });

  it('manda la fecha por encima de todo', () => {
    expect(compararMovimientos(f({ fecha: '2026-09-21', hora: '11:00:00 PM' }), f({ fecha: '2026-09-22' }))).toBeLessThan(0);
  });

  it('dentro del día manda la hora, y sin hora va primero', () => {
    expect(compararMovimientos(f({ hora: null }), f({ hora: '7:00:00 AM' }))).toBeLessThan(0);
    expect(compararMovimientos(f({ hora: '7:00:00 AM' }), f({ hora: '2:00:00 PM' }))).toBeLessThan(0);
  });

  it('empatadas en todo, desempata por «orden», por la carga y por el id: nunca al azar', () => {
    // El bug del Excel: filas importadas idénticas en fecha, hora y carga
    // salían en el orden que la base quisiera, y el saldo cambiaba solo.
    expect(compararMovimientos(f({ orden: 1 }), f({ orden: 2 }))).toBeLessThan(0);
    expect(compararMovimientos(f({ created_at: '2026-09-22T06:00:00Z' }), f({ created_at: '2026-09-22T07:00:00Z' }))).toBeLessThan(0);
    expect(compararMovimientos(f({ id: 'a' }), f({ id: 'b' }))).toBeLessThan(0);
    expect(compararMovimientos(f({}), f({}))).toBe(0);
  });

  it('ordenar dos veces la misma lista da el mismo resultado', () => {
    const filas = [f({ id: 'c' }), f({ id: 'a' }), f({ id: 'b' })];
    const una = [...filas].sort(compararMovimientos).map((x) => x.id);
    const otra = [...filas].reverse().sort(compararMovimientos).map((x) => x.id);
    expect(una).toEqual(otra);
    expect(una).toEqual(['a', 'b', 'c']);
  });
});

describe('fechaParaExcel', () => {
  it('cae a mediodía UTC, así ningún huso la corre de día', () => {
    const d = fechaParaExcel('2026-09-25')!;
    expect(d.toISOString()).toBe('2026-09-25T12:00:00.000Z');
    // En Venezuela (UTC−4) sigue siendo el 25, que es lo que rompía antes.
    expect(new Date(d.getTime() - 4 * 3600_000).toISOString().slice(0, 10)).toBe('2026-09-25');
  });

  it('una fecha que no es fecha no rompe el Excel', () => {
    expect(fechaParaExcel(null)).toBeNull();
    expect(fechaParaExcel('')).toBeNull();
    expect(fechaParaExcel('25/09/2026')).toBeNull();
  });
});

describe('el campo de hora de la pantalla', () => {
  it('lo guardado se vuelca al selector en 24 horas', () => {
    expect(horaAInput('4:00:44 PM')).toBe('16:00:44');
    expect(horaAInput('8:02:00 AM')).toBe('08:02:00');
    expect(horaAInput('12:00:00 AM')).toBe('00:00:00');
    expect(horaAInput('12:06:00 PM')).toBe('12:06:00');
    // Las que entraron mal por el campo de texto libre también se pueden abrir.
    expect(horaAInput('6:42:08 M')).toBe('06:42:08');
    expect(horaAInput(null)).toBe('');
    expect(horaAInput('a las seis')).toBe('');
  });

  it('lo que elige el selector se guarda como lo muestra el sistema', () => {
    expect(horaDesdeInput('16:00:44')).toBe('4:00:44 PM');
    expect(horaDesdeInput('08:02')).toBe('8:02:00 AM');
    expect(horaDesdeInput('00:00')).toBe('12:00:00 AM');
    expect(horaDesdeInput('12:06')).toBe('12:06:00 PM');
    expect(horaDesdeInput('')).toBe('');
    expect(horaDesdeInput(null)).toBe('');
  });

  it('ida y vuelta no cambia la hora', () => {
    for (const h of ['4:00:44 PM', '8:02:00 AM', '12:00:00 AM', '11:59:59 PM']) {
      expect(horaDesdeInput(horaAInput(h))).toBe(h);
    }
  });
});
