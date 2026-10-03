import { describe, it, expect } from 'vitest';
import { MARGEN_MERMA_DEFECTO, mermaDeRecepcion, observacionMerma } from './mermaRecepcion';

describe('mermaDeRecepcion · lo enviado menos lo que llegó', () => {
  it('el caso normal: llegó un poco menos', () => {
    expect(mermaDeRecepcion(20000, 19700, 10)).toEqual({ ok: { merma: 300, pct: 1.5, excede: false }, error: null });
  });

  it('si no se midió, no hay merma ni error', () => {
    expect(mermaDeRecepcion(20000, null, 10)).toEqual({ ok: null, error: null });
    expect(mermaDeRecepcion(20000, undefined, 10)).toEqual({ ok: null, error: null });
  });

  it('llegó todo: merma 0', () => {
    expect(mermaDeRecepcion(500, 500, 10).ok).toEqual({ merma: 0, pct: 0, excede: false });
  });

  it('justo en el margen no lo pasa; un poco más, sí', () => {
    expect(mermaDeRecepcion(1000, 900, 10).ok?.excede).toBe(false);
    expect(mermaDeRecepcion(1000, 899, 10).ok?.excede).toBe(true);
  });

  it('cada tanque tiene su margen; sin margen vale el 10%', () => {
    expect(mermaDeRecepcion(1000, 970, 2).ok?.excede).toBe(true);
    expect(mermaDeRecepcion(1000, 905, null).ok?.excede).toBe(false);
    expect(MARGEN_MERMA_DEFECTO).toBe(10);
  });

  it('no pueden llegar más litros de los enviados, ni negativos', () => {
    expect(mermaDeRecepcion(1000, 1001, 10).error).toMatch(/más litros/);
    expect(mermaDeRecepcion(1000, -1, 10).error).toMatch(/negativos/);
    expect(mermaDeRecepcion(0, 0, 10).error).toMatch(/mayores que 0/);
  });
});

describe('observacionMerma', () => {
  it('dice de dónde sale y el porcentaje; si pasa el margen lleva ⚠ y el motivo', () => {
    expect(observacionMerma('entrada', 'del 02/10', { merma: 300, pct: 1.5, excede: false }))
      .toBe('Merma de la entrada del 02/10 · 1,5% de lo enviado');
    expect(observacionMerma('traslado', 'desde Tanque #1', { merma: 150, pct: 15, excede: true }, 'válvula abierta'))
      .toBe('⚠ Merma del traslado desde Tanque #1 · 15% de lo enviado · válvula abierta');
  });
});
