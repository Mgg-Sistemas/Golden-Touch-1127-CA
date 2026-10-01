import { describe, expect, it } from 'vitest';
import { RENGLONES_EXTRA, RENGLONES_HOJA, filasConRenglones } from './minutaPdf';

const vacia = () => ({ a: '' });

describe('filasConRenglones', () => {
  it('la hoja en blanco sale con los renglones del formato de papel', () => {
    expect(filasConRenglones([], RENGLONES_HOJA.ordenDia, vacia)).toHaveLength(7);
    expect(filasConRenglones([], RENGLONES_HOJA.participantes, vacia)).toHaveLength(6);
    expect(filasConRenglones([], RENGLONES_HOJA.acuerdos, vacia)).toHaveLength(6);
    expect(filasConRenglones([], RENGLONES_HOJA.avances, vacia)).toHaveLength(4);
  });
  it('con datos cargados, agrega los renglones de cortesía al final', () => {
    const dos = [{ a: '1' }, { a: '2' }];
    const r = filasConRenglones(dos, dos.length + RENGLONES_EXTRA, vacia);
    expect(r).toHaveLength(2 + RENGLONES_EXTRA);
    expect(r[0]).toEqual({ a: '1' });
    expect(r[r.length - 1]).toEqual({ a: '' });
  });
  it('si ya hay más filas que el mínimo, no recorta ninguna', () => {
    const diez = Array.from({ length: 10 }, (_, i) => ({ a: String(i) }));
    expect(filasConRenglones(diez, 6, vacia)).toHaveLength(10);
  });
  it('una minuta muy larga conserva todas sus filas (el PDF pagina solo)', () => {
    const muchas = Array.from({ length: 120 }, (_, i) => ({ a: String(i) }));
    expect(filasConRenglones(muchas, 6, vacia)).toHaveLength(120);
  });
});

describe('RENGLONES_HOJA', () => {
  it('coincide con el formato en papel de la empresa', () => {
    expect(RENGLONES_HOJA).toEqual({
      ordenDia: 7, participantes: 6, acuerdos: 6, avances: 4, observaciones: 7,
    });
  });
});
