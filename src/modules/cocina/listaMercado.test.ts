import { describe, it, expect, vi } from 'vitest';

vi.mock('@/modules/salidas/adjuntosSalida.repository', () => ({ crearRepoAdjuntos: () => ({}) }));

const { errorListaMercado, libresListaMercado } = await import('./listaMercado');

const foto = (n = 'lista.jpg') => ({ tipo: 'image/jpeg', nombre: n });
const pdf = (n = 'lista.pdf') => ({ tipo: 'application/pdf', nombre: n });

describe('lista física del mercado · 4 fotos o 1 PDF', () => {
  it('hasta 4 fotos entran', () => {
    expect(errorListaMercado([], [foto(), foto(), foto(), foto()])).toBeNull();
    expect(errorListaMercado([foto(), foto()], [foto(), foto()])).toBeNull();
  });

  it('la quinta foto no', () => {
    expect(errorListaMercado([foto(), foto(), foto(), foto()], [foto()])).toMatch(/hasta 4 fotos/);
  });

  it('un PDF solo entra; dos no', () => {
    expect(errorListaMercado([], [pdf()])).toBeNull();
    expect(errorListaMercado([pdf()], [pdf()])).toMatch(/un solo PDF/);
  });

  it('PDF y fotos juntos no', () => {
    expect(errorListaMercado([foto()], [pdf()])).toMatch(/no las dos cosas/);
    expect(errorListaMercado([pdf()], [foto()])).toMatch(/no las dos cosas/);
  });

  it('reconoce el PDF por la extensión si falta el tipo', () => {
    expect(errorListaMercado([{ tipo: '', nombre: 'LISTA.PDF' }], [foto()])).toMatch(/no las dos cosas/);
  });

  it('cuántos más entran', () => {
    expect(libresListaMercado([])).toBe(4);
    expect(libresListaMercado([foto(), foto(), foto()])).toBe(1);
    expect(libresListaMercado([pdf()])).toBe(0);
  });
});
