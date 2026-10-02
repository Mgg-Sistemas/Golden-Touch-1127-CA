import { describe, it, expect } from 'vitest';
import { completarContador, contadorFinalPropuesto, pasaPorSurtidor } from './contadorSurtidor';

describe('pasaPorSurtidor', () => {
  it('el surtido y el traslado salen por la manguera', () => {
    expect(pasaPorSurtidor('uso')).toBe(true);
    expect(pasaPorSurtidor('traslado')).toBe(true);
  });

  it('la entrada, el retorno y la merma no mueven el contador', () => {
    expect(pasaPorSurtidor('entrada')).toBe(false);
    expect(pasaPorSurtidor('retorno')).toBe(false);
    expect(pasaPorSurtidor('merma')).toBe(false);
  });
});

describe('contadorFinalPropuesto · inicial + litros', () => {
  it('el caso del Tanque #3: arrancó en 434150 y salieron 80 L', () => {
    expect(contadorFinalPropuesto(434150, 80)).toBe(434230);
  });

  it('con decimales no arrastra basura de coma flotante', () => {
    expect(contadorFinalPropuesto(100.1, 0.2)).toBe(100.3);
  });

  it('sin inicial no hay de dónde sumar', () => {
    expect(contadorFinalPropuesto(null, 80)).toBeNull();
    expect(contadorFinalPropuesto(undefined, 80)).toBeNull();
  });

  it('con litros en cero o negativos el surtidor no avanzó', () => {
    expect(contadorFinalPropuesto(434150, 0)).toBeNull();
    expect(contadorFinalPropuesto(434150, -20)).toBeNull();
  });
});

describe('completarContador · el final de uno es el inicio del siguiente', () => {
  it('final vacío: se guarda inicial + litros', () => {
    expect(completarContador({ tipo: 'uso', litros: 80, ini: 434150, fin: null })).toEqual({ ini: 434150, fin: 434230 });
  });

  it('el siguiente arranca donde terminó el anterior', () => {
    const primero = completarContador({ tipo: 'uso', litros: 80, ini: 434150 });
    const segundo = completarContador({ tipo: 'uso', litros: 65, ultimo: primero.fin });
    expect(segundo).toEqual({ ini: 434230, fin: 434295 });
  });

  it('si escribieron la lectura real, vale la lectura aunque no coincida con los litros', () => {
    expect(completarContador({ tipo: 'uso', litros: 80, ini: 434150, fin: 434233 })).toEqual({ ini: 434150, fin: 434233 });
  });

  it('sin inicial en el formulario, arranca del último del tanque', () => {
    expect(completarContador({ tipo: 'traslado', litros: 998, ultimo: 181224 })).toEqual({ ini: 181224, fin: 182222 });
  });

  it('el inicial del formulario manda sobre el último del tanque', () => {
    expect(completarContador({ tipo: 'uso', litros: 10, ini: 500, ultimo: 900 })).toEqual({ ini: 500, fin: 510 });
  });

  it('tanque sin ningún contador cargado: queda vacío, no se inventa', () => {
    expect(completarContador({ tipo: 'uso', litros: 80 })).toEqual({ ini: null, fin: null });
  });

  it('la entrada, el retorno y la merma quedan como vinieron', () => {
    expect(completarContador({ tipo: 'entrada', litros: 1000, ultimo: 434150 })).toEqual({ ini: null, fin: null });
    expect(completarContador({ tipo: 'merma', litros: 25, ultimo: 434150 })).toEqual({ ini: null, fin: null });
    expect(completarContador({ tipo: 'retorno', litros: 30, ini: 10, fin: 40, ultimo: 434150 })).toEqual({ ini: 10, fin: 40 });
  });
});
