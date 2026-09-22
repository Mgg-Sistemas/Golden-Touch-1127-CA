import { describe, it, expect } from 'vitest';
import {
  DIAS_QUINCENA, SUELDO_PCT_DEFECTO, aBs, aUsd, avisosQuincena, calcularQuincena, pctValido,
} from './nominaCalculo';

/* Los números de estas pruebas salen de la planilla real del Drive
   («RECIBOS DE PAGOS … 09-2026 1 QUINCENA»), para que el sistema dé
   exactamente lo mismo que viene dando el Excel. */

describe('calcularQuincena · casos de la planilla', () => {
  it('Keimer Valero: $800 al mes, 20 %, tasa 842,2 → Bs 67.376 de sueldo quincenal', () => {
    const q = calcularQuincena({ totalMesUsd: 800, sueldoPct: 20, tasaBs: 842.2, diasTrabajados: 11, diasDescanso: 4 });
    expect(q.sueldoMesUsd).toBe(160);
    expect(q.bonoMesUsd).toBe(640);
    expect(q.sueldoQuincenaUsd).toBe(80);
    expect(q.bonoQuincenaUsd).toBe(320);
    expect(q.totalQuincenaUsd).toBe(400);
    expect(q.sueldoQuincenaBs).toBe(67376);
  });

  it('Jesús Torres: $400 al mes → Bs 33.688', () => {
    const q = calcularQuincena({ totalMesUsd: 400, sueldoPct: 20, tasaBs: 842.2 });
    expect(q.sueldoQuincenaUsd).toBe(40);
    expect(q.sueldoQuincenaBs).toBe(33688);
    expect(q.totalQuincenaUsd).toBe(200);
  });

  it('Jesús Ramírez: $360 al mes → Bs 30.319,20 (no da redondo, y está bien)', () => {
    const q = calcularQuincena({ totalMesUsd: 360, sueldoPct: 20, tasaBs: 842.2 });
    expect(q.sueldoQuincenaUsd).toBe(36);
    expect(q.sueldoQuincenaBs).toBe(30319.2);
  });

  it('el recibo reparte el sueldo en 11 días trabajados + 4 de descanso', () => {
    const q = calcularQuincena({ totalMesUsd: 800, sueldoPct: 20, tasaBs: 842.2, diasTrabajados: 11, diasDescanso: 4 });
    // 67376 / 15 = 4491,733…
    expect(q.trabajadosBs).toBe(49409.07);
    expect(q.descansoBs).toBe(17966.93);
    // Los dos renglones tienen que devolver el sueldo quincenal completo.
    expect(q.devengadoBs).toBe(q.sueldoQuincenaBs);
  });

  it('con la quincena completa trabajada, el devengado es el sueldo entero', () => {
    const q = calcularQuincena({ totalMesUsd: 800, sueldoPct: 20, tasaBs: 842.2, diasTrabajados: 15, diasDescanso: 0 });
    expect(q.devengadoBs).toBe(67376);
  });
});

describe('calcularQuincena · bordes', () => {
  it('sin tasa, los bolívares son cero pero los dólares siguen estando', () => {
    const q = calcularQuincena({ totalMesUsd: 800, sueldoPct: 20, diasTrabajados: 15 });
    expect(q.sueldoQuincenaBs).toBe(0);
    expect(q.sueldoQuincenaUsd).toBe(80);
    expect(q.totalQuincenaUsd).toBe(400);
  });

  it('el bono es el resto, así sueldo + bono siempre dan el total', () => {
    // Con 33 %, calcular el bono como «total × 67 %» dejaría de cuadrar.
    const q = calcularQuincena({ totalMesUsd: 333.33, sueldoPct: 33 });
    expect(q.sueldoMesUsd + q.bonoMesUsd).toBeCloseTo(333.33, 2);
  });

  it('al 100 % no hay bono: todo es sueldo', () => {
    const q = calcularQuincena({ totalMesUsd: 500, sueldoPct: 100, tasaBs: 100 });
    expect(q.bonoMesUsd).toBe(0);
    expect(q.sueldoQuincenaUsd).toBe(250);
    expect(q.sueldoQuincenaBs).toBe(25000);
  });

  it('un total en cero no rompe nada', () => {
    const q = calcularQuincena({ totalMesUsd: 0, sueldoPct: 20, tasaBs: 842.2, diasTrabajados: 11 });
    expect(q.sueldoQuincenaBs).toBe(0);
    expect(q.trabajadosBs).toBe(0);
  });

  it('un total negativo se trata como cero: nadie cobra en contra', () => {
    const q = calcularQuincena({ totalMesUsd: -500, sueldoPct: 20, tasaBs: 842.2 });
    expect(q.sueldoQuincenaUsd).toBe(0);
  });

  it('sin porcentaje indicado usa el de la planilla', () => {
    const q = calcularQuincena({ totalMesUsd: 800, tasaBs: 842.2 });
    expect(q.sueldoQuincenaUsd).toBe(800 * (SUELDO_PCT_DEFECTO / 100) / 2);
  });
});

describe('pctValido', () => {
  it('acota a 0–100 en vez de pagar de más', () => {
    expect(pctValido(150)).toBe(100);
    expect(pctValido(-20)).toBe(0);
    expect(pctValido(20)).toBe(20);
  });

  it('sin valor, el de la planilla', () => {
    expect(pctValido(null)).toBe(SUELDO_PCT_DEFECTO);
    expect(pctValido(undefined)).toBe(SUELDO_PCT_DEFECTO);
  });
});

describe('conversión entre monedas', () => {
  it('pasa de bolívares a dólares', () => {
    expect(aUsd(67376, 842.2)).toBe(80);
  });

  it('pasa de dólares a bolívares', () => {
    expect(aBs(80, 842.2)).toBe(67376);
  });

  it('con tasa cero devuelve cero, no infinito', () => {
    expect(aUsd(67376, 0)).toBe(0);
    expect(Number.isFinite(aUsd(1, 0))).toBe(true);
  });
});

describe('avisosQuincena', () => {
  it('avisa si los días pasan de la quincena', () => {
    const a = avisosQuincena({ totalMesUsd: 800, tasaBs: 842.2, diasTrabajados: 15, diasDescanso: 4 });
    expect(a.join(' ')).toMatch(new RegExp(`19 días.*${DIAS_QUINCENA}`));
  });

  it('avisa si falta la tasa', () => {
    const a = avisosQuincena({ totalMesUsd: 800, diasTrabajados: 11, diasDescanso: 4 });
    expect(a.join(' ')).toMatch(/tasa de cierre/i);
  });

  it('una quincena normal no tiene nada que avisar', () => {
    expect(avisosQuincena({ totalMesUsd: 800, tasaBs: 842.2, diasTrabajados: 11, diasDescanso: 4 })).toEqual([]);
  });
});
