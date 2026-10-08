import { describe, expect, it } from 'vitest';
import {
  buscarDestinatario, cantidadTexto, difiereDelCatalogo, etiquetaDestinatario, numeroEnvio, renglonesValidos, totalRenglones,
  type DatosDestinatario,
} from './notaEnvio';

describe('nota de envío', () => {
  it('el correlativo va con 4 dígitos', () => {
    expect(numeroEnvio(1)).toBe('0001');
    expect(numeroEnvio(57)).toBe('0057');
    expect(numeroEnvio(12345)).toBe('12345');
    expect(numeroEnvio(null)).toBe('0000');
  });

  it('descarta renglones sin descripción y limpia espacios', () => {
    expect(renglonesValidos([
      { descripcion: '  Facturas originales  ', cantidad: 296 },
      { descripcion: '   ', cantidad: 4 },
      { descripcion: 'Contrato', cantidad: null },
    ])).toEqual([
      { descripcion: 'Facturas originales', cantidad: 296 },
      { descripcion: 'Contrato', cantidad: null },
    ]);
  });

  it('el total suma solo las cantidades de renglones válidos', () => {
    expect(totalRenglones([
      { descripcion: 'A', cantidad: 296 },
      { descripcion: 'B', cantidad: 30 },
      { descripcion: '', cantidad: 99 },
      { descripcion: 'C', cantidad: null },
    ])).toBe(326);
  });

  it('cantidad sin decimales si es entera', () => {
    expect(cantidadTexto(45)).toBe('45');
    expect(cantidadTexto(null)).toBe('');
  });
});

describe('catálogo de destinatarios', () => {
  const d = (p: Partial<DatosDestinatario>): DatosDestinatario => ({ razon_social: 'Alcaldía de Caroní', rif: null, direccion: null, atencion_a: null, condicion: null, ...p });
  it('encuentra por razón social sin importar mayúsculas, acentos ni espacios', () => {
    const lista = [d({ rif: 'G-1' }), d({ razon_social: 'Seniat' })];
    expect(buscarDestinatario(lista, '  ALCALDIA   de caroni ')?.rif).toBe('G-1');
    expect(buscarDestinatario(lista, 'otro')).toBeNull();
    expect(buscarDestinatario(lista, '')).toBeNull();
  });
  it('sabe si lo escrito cambió respecto del catálogo (vacío = null)', () => {
    const g = d({ rif: 'G-1', atencion_a: 'Ana' });
    expect(difiereDelCatalogo(d({ rif: 'g-1 ', atencion_a: 'ana', direccion: '' }), g)).toBe(false);
    expect(difiereDelCatalogo(d({ rif: 'G-1', atencion_a: 'Luis' }), g)).toBe(true);
  });
  it('etiqueta del buscador', () => {
    expect(etiquetaDestinatario(d({ rif: 'G-1', atencion_a: 'Ana' }))).toBe('Alcaldía de Caroní · G-1 · Atención: Ana');
  });
});
