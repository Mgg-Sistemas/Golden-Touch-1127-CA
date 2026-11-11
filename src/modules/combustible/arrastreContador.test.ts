import { describe, it, expect } from 'vitest';
import { cambioVigente, aAcumulado, aLecturaFisica, motivoNoRegistrable, type CambioContador } from './arrastreContador';

/** El caso real del Tanque #1 (10/11/2026): el contador viejo cerró en 208.861
 *  y el nuevo arrancó en cero. */
const TANQUE1: CambioContador[] = [
  { fecha: '2026-11-10', acumuladoCierre: 208861, lecturaNueva: 0 },
];

describe('cambioVigente · qué arrastre le toca a cada movimiento', () => {
  it('un movimiento ANTERIOR al cambio no tiene arrastre: la historia no se toca', () => {
    expect(cambioVigente(TANQUE1, '2026-11-08')).toBeNull();
  });

  it('un movimiento del mismo día del cambio ya usa el arrastre', () => {
    expect(cambioVigente(TANQUE1, '2026-11-10')).toEqual(TANQUE1[0]);
  });

  it('un movimiento posterior usa el arrastre', () => {
    expect(cambioVigente(TANQUE1, '2026-11-20')).toEqual(TANQUE1[0]);
  });

  it('sin cambios registrados no hay arrastre', () => {
    expect(cambioVigente([], '2026-11-20')).toBeNull();
  });

  it('con varios cambios manda el último que ya había ocurrido', () => {
    const dos: CambioContador[] = [
      { fecha: '2026-11-10', acumuladoCierre: 208861, lecturaNueva: 0 },
      { fecha: '2027-03-01', acumuladoCierre: 215000, lecturaNueva: 0 },
    ];
    expect(cambioVigente(dos, '2027-02-28')?.acumuladoCierre).toBe(208861);
    expect(cambioVigente(dos, '2027-03-05')?.acumuladoCierre).toBe(215000);
  });

  it('no se cree el orden en que vengan los cambios', () => {
    const desordenados: CambioContador[] = [
      { fecha: '2027-03-01', acumuladoCierre: 215000, lecturaNueva: 0 },
      { fecha: '2026-11-10', acumuladoCierre: 208861, lecturaNueva: 0 },
    ];
    expect(cambioVigente(desordenados, '2026-12-01')?.acumuladoCierre).toBe(208861);
  });

  it('sin fecha no se adivina: no hay arrastre', () => {
    expect(cambioVigente(TANQUE1, null)).toBeNull();
  });
});

describe('aAcumulado · lo que marca el surtidor → lo que guarda el sistema', () => {
  it('el caso real: el surtidor marca 30 y el sistema guarda 208.891', () => {
    expect(aAcumulado(30, TANQUE1[0])).toBe(208891);
  });

  it('sin arrastre, lo que marca el surtidor ES el acumulado (como hasta hoy)', () => {
    expect(aAcumulado(208861, null)).toBe(208861);
  });

  it('el contador nuevo recién puesto, en cero, da justo el acumulado de cierre', () => {
    expect(aAcumulado(0, TANQUE1[0])).toBe(208861);
  });

  it('si el contador nuevo no arrancó en cero, se descuenta su arranque', () => {
    const cambio: CambioContador = { fecha: '2026-11-10', acumuladoCierre: 208861, lecturaNueva: 45 };
    expect(aAcumulado(75, cambio)).toBe(208891);
  });

  it('sin lectura no inventa nada', () => {
    expect(aAcumulado(null, TANQUE1[0])).toBeNull();
  });

  it('redondea a dos decimales, no arrastra basura', () => {
    expect(aAcumulado(30.005, TANQUE1[0])).toBe(208891.01);
  });
});

describe('aLecturaFisica · lo que guarda el sistema → lo que marca el surtidor', () => {
  it('el caso real: el sistema tiene 208.891 y el surtidor marca 30', () => {
    expect(aLecturaFisica(208891, TANQUE1[0])).toBe(30);
  });

  it('es el camino de vuelta exacto', () => {
    expect(aLecturaFisica(aAcumulado(1234.56, TANQUE1[0]), TANQUE1[0])).toBe(1234.56);
  });

  it('sin arrastre devuelve el mismo número', () => {
    expect(aLecturaFisica(208861, null)).toBe(208861);
  });

  it('sin acumulado no inventa nada', () => {
    expect(aLecturaFisica(null, TANQUE1[0])).toBeNull();
  });
});

describe('motivoNoRegistrable \u00b7 cu\u00e1ndo NO se puede asentar un cambio de contador', () => {
  const ok = { fecha: '2026-11-10', ultimaFechaMovimiento: '2026-11-08', acumuladoCierre: 208861, lecturaNueva: 0 };

  it('un cambio bien hecho no da motivo', () => {
    expect(motivoNoRegistrable(ok)).toBeNull();
  });

  it('el mismo d\u00eda del \u00faltimo movimiento vale', () => {
    expect(motivoNoRegistrable({ ...ok, fecha: '2026-11-08' })).toBeNull();
  });

  it('ANTES del \u00faltimo movimiento no: esos movimientos se recalcular\u00edan mal', () => {
    const m = motivoNoRegistrable({ ...ok, fecha: '2026-11-07' });
    expect(m).toContain('2026-11-08');
  });

  it('sin fecha no se puede', () => {
    expect(motivoNoRegistrable({ ...ok, fecha: '' })).toContain('d\u00eda');
  });

  it('sin el cierre del contador viejo no se puede', () => {
    expect(motivoNoRegistrable({ ...ok, acumuladoCierre: null })).toContain('viejo');
  });

  it('sin el arranque del nuevo no se puede', () => {
    expect(motivoNoRegistrable({ ...ok, lecturaNueva: null })).toContain('nuevo');
  });

  it('un contador no marca negativo', () => {
    expect(motivoNoRegistrable({ ...ok, lecturaNueva: -5 })).toContain('nuevo');
  });

  it('sin movimientos previos, cualquier fecha vale', () => {
    expect(motivoNoRegistrable({ ...ok, ultimaFechaMovimiento: null })).toBeNull();
  });
});
