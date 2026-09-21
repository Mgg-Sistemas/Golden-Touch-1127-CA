import { describe, it, expect } from 'vitest';
import { avisoFueraDelCiclo, finDelCiclo, fueraDelCiclo, type VentanaMercado } from './fechaComida';

const mercado: VentanaMercado = { numero: 'MK-2026-0002', inicio_at: '2026-09-15T12:47:21Z' };

describe('fin del ciclo', () => {
  it('son 21 días desde la apertura', () => {
    expect(finDelCiclo('2026-09-15T12:47:21Z')).toBe('2026-10-06');
  });
  it('cruza el fin de mes', () => {
    expect(finDelCiclo('2026-09-25T00:00:00Z')).toBe('2026-10-16');
  });
  it('una fecha inválida no revienta', () => {
    expect(finDelCiclo('')).toBe('');
  });
});

describe('fecha de la comida contra el mercado abierto', () => {
  it('dentro del ciclo no avisa', () => {
    expect(fueraDelCiclo('2026-09-15', mercado)).toBeNull();
    expect(fueraDelCiclo('2026-09-21', mercado)).toBeNull();
    expect(fueraDelCiclo('2026-10-06', mercado)).toBeNull();
  });

  it('el día anterior a la apertura ya es «antes»', () => {
    expect(fueraDelCiclo('2026-09-14', mercado)).toBe('antes');
  });

  it('el caso real: las comidas del 13 y 14/09 cargadas el 19', () => {
    expect(fueraDelCiclo('2026-09-13', mercado)).toBe('antes');
    expect(fueraDelCiclo('2026-09-14', mercado)).toBe('antes');
  });

  it('pasado el día 21 es «despues»', () => {
    expect(fueraDelCiclo('2026-10-07', mercado)).toBe('despues');
  });

  it('sin mercado abierto no hay con qué comparar', () => {
    expect(fueraDelCiclo('2026-09-13', null)).toBeNull();
    expect(fueraDelCiclo('', mercado)).toBeNull();
  });
});

describe('el aviso', () => {
  it('el de «antes» nombra el riesgo del doble descuento', () => {
    const t = avisoFueraDelCiclo('antes', mercado);
    expect(t).toContain('MK-2026-0002');
    expect(t).toContain('15/09/2026');
    expect(t).toContain('dos veces');
  });

  it('el de «despues» dice hasta cuándo llega el ciclo', () => {
    expect(avisoFueraDelCiclo('despues', mercado)).toContain('06/10/2026');
  });

  it('sin caso no hay texto', () => {
    expect(avisoFueraDelCiclo(null, mercado)).toBe('');
    expect(avisoFueraDelCiclo('antes', null)).toBe('');
  });
});
