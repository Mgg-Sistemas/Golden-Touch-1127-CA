import { describe, it, expect } from 'vitest';
import { rotuloMarcaModelo, tieneMarcaModelo, descripcionConMarcaModelo } from './marcaModelo';

describe('rotuloMarcaModelo', () => {
  it('arma el rótulo con los dos datos', () => {
    expect(rotuloMarcaModelo({ marca: 'DONALDSON', modelo: 'P553771' }))
      .toBe('Marca: DONALDSON · Modelo: P553771');
  });

  it('con uno solo, no deja el separador colgando', () => {
    expect(rotuloMarcaModelo({ marca: 'DONALDSON' })).toBe('Marca: DONALDSON');
    expect(rotuloMarcaModelo({ modelo: 'P553771' })).toBe('Modelo: P553771');
  });

  it('los espacios en blanco no cuentan como dato', () => {
    expect(rotuloMarcaModelo({ marca: '   ', modelo: null })).toBe('');
    expect(rotuloMarcaModelo({})).toBe('');
    expect(tieneMarcaModelo({ marca: '  ' })).toBe(false);
    expect(tieneMarcaModelo({ modelo: 'P553771' })).toBe(true);
  });

  it('recorta lo que el usuario tecleó de más', () => {
    expect(rotuloMarcaModelo({ marca: '  DONALDSON  ' })).toBe('Marca: DONALDSON');
  });
});

describe('descripcionConMarcaModelo', () => {
  it('sin marca ni modelo no hay nada que agregar', () => {
    expect(descripcionConMarcaModelo('Para motor Cummins.', {})).toBeNull();
    expect(descripcionConMarcaModelo(null, { marca: ' ' })).toBeNull();
  });

  it('en una descripción vacía queda solo el rótulo', () => {
    expect(descripcionConMarcaModelo(null, { marca: 'DONALDSON' })).toBe('Marca: DONALDSON');
    expect(descripcionConMarcaModelo('   ', { modelo: 'P553771' })).toBe('Modelo: P553771');
  });

  it('NUNCA pisa lo que la descripción ya decía', () => {
    expect(descripcionConMarcaModelo('Para motor Cummins.', { marca: 'DONALDSON', modelo: 'P553771' }))
      .toBe('Para motor Cummins.\nMarca: DONALDSON · Modelo: P553771');
  });

  it('no repite un rótulo que ya está', () => {
    const desc = 'Para motor Cummins.\nMarca: DONALDSON · Modelo: P553771';
    expect(descripcionConMarcaModelo(desc, { marca: 'DONALDSON', modelo: 'P553771' })).toBeNull();
  });

  it('el acento y la mayúscula no hacen que se repita', () => {
    const desc = 'Filtro.\nmarca: donaldson · modelo: p553771';
    expect(descripcionConMarcaModelo(desc, { marca: 'DONALDSON', modelo: 'P553771' })).toBeNull();
  });

  it('un producto comprado a otra marca suma la nueva, no la reemplaza', () => {
    const desc = 'Filtro.\nMarca: DONALDSON';
    expect(descripcionConMarcaModelo(desc, { marca: 'FLEETGUARD' }))
      .toBe('Filtro.\nMarca: DONALDSON\nMarca: FLEETGUARD');
  });
});
