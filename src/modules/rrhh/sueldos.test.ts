import { describe, it, expect } from 'vitest';
import {
  MOTIVOS_SUELDO, errorCambioSueldo, etiquetaVariacion, motivoFinal, variacionSueldo,
} from './sueldos';

describe('variacionSueldo', () => {
  it('un aumento da el monto y el porcentaje', () => {
    const v = variacionSueldo(300, 350);
    expect(v.monto).toBe(50);
    expect(v.porcentaje).toBe(16.7);
    expect(v.sentido).toBe('sube');
  });

  it('una rebaja da monto y porcentaje negativos', () => {
    const v = variacionSueldo(400, 360);
    expect(v.monto).toBe(-40);
    expect(v.porcentaje).toBe(-10);
    expect(v.sentido).toBe('baja');
  });

  it('sin sueldo anterior no hay porcentaje: no se divide entre cero', () => {
    const v = variacionSueldo(0, 300);
    expect(v.monto).toBe(300);
    expect(v.porcentaje).toBeNull();
    expect(v.sentido).toBe('sube');
  });

  it('el primer sueldo (anterior nulo) se trata igual que cero', () => {
    expect(variacionSueldo(null, 250).porcentaje).toBeNull();
    expect(variacionSueldo(undefined, 250).monto).toBe(250);
  });

  it('el mismo monto no es cambio', () => {
    expect(variacionSueldo(300, 300).sentido).toBe('igual');
  });

  it('redondea a dos decimales, que es lo que guarda la base', () => {
    expect(variacionSueldo(100.005, 200.004).monto).toBe(99.99);
  });

  it('un texto que no es número se lee como cero', () => {
    expect(variacionSueldo('x' as unknown as number, 100).monto).toBe(100);
  });
});

describe('errorCambioSueldo', () => {
  it('deja pasar un cambio con monto distinto y motivo', () => {
    expect(errorCambioSueldo(300, 350, 'Aumento')).toBeNull();
  });

  it('rechaza el sueldo negativo', () => {
    expect(errorCambioSueldo(300, -1, 'Aumento')).toMatch(/negativo/i);
  });

  it('rechaza lo que no es número', () => {
    expect(errorCambioSueldo(300, NaN, 'Aumento')).toMatch(/Escribí/i);
    expect(errorCambioSueldo(300, null, 'Aumento')).toMatch(/Escribí/i);
  });

  it('rechaza el mismo monto aunque haya motivo', () => {
    expect(errorCambioSueldo(300, 300, 'Aumento')).toMatch(/mismo/i);
    expect(errorCambioSueldo(300, 300.004, 'Aumento')).toMatch(/mismo/i);
  });

  it('se queja del monto ANTES que del motivo: no manda a llenar un campo al pedo', () => {
    expect(errorCambioSueldo(300, 300, '')).toMatch(/mismo/i);
  });

  it('exige el motivo cuando el monto sí cambió', () => {
    expect(errorCambioSueldo(300, 350, '')).toMatch(/motivo/i);
    expect(errorCambioSueldo(300, 350, '   ')).toMatch(/motivo/i);
  });

  it('bajar a cero es un cambio válido si se explica', () => {
    expect(errorCambioSueldo(300, 0, 'Reducción acordada')).toBeNull();
  });
});

describe('etiquetaVariacion', () => {
  it('muestra el signo, el monto y el porcentaje', () => {
    expect(etiquetaVariacion(variacionSueldo(300, 350))).toBe('+50,00 USD (+16,7%)');
  });

  it('una baja lleva el signo menos en las dos partes', () => {
    expect(etiquetaVariacion(variacionSueldo(400, 360))).toBe('−40,00 USD (−10%)');
  });

  it('sin porcentaje muestra solo el monto', () => {
    expect(etiquetaVariacion(variacionSueldo(0, 300))).toBe('+300,00 USD');
  });

  it('sin cambio lo dice con todas las letras', () => {
    expect(etiquetaVariacion(variacionSueldo(300, 300))).toBe('Sin cambio');
  });
});

describe('motivoFinal', () => {
  it('con un motivo de la lista devuelve ese', () => {
    expect(motivoFinal('Aumento', '')).toBe('Aumento');
  });

  it('la nota escrita no ensucia el motivo elegido', () => {
    expect(motivoFinal('Ascenso', 'pasa a supervisor')).toBe('Ascenso');
  });

  it('con «Otro» vale lo escrito a mano', () => {
    expect(motivoFinal('Otro', '  acuerdo de la junta  ')).toBe('acuerdo de la junta');
  });

  it('«Otro» sin escribir nada queda vacío, para que la validación lo pida', () => {
    expect(motivoFinal('Otro', '   ')).toBe('');
    expect(errorCambioSueldo(300, 350, motivoFinal('Otro', ''))).toMatch(/motivo/i);
  });

  it('«Otro» es la última opción de la lista', () => {
    expect(MOTIVOS_SUELDO[MOTIVOS_SUELDO.length - 1]).toBe('Otro');
  });
});
