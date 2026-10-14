import { describe, it, expect } from 'vitest';
import { filtrarGuias, ordenarGuias, tituloGuia, validarArchivoGuia, type Guia } from './guias';

const g = (p: Partial<Guia>): Guia => ({
  id: p.id ?? 'x', fecha: '2026-10-01', numero: null, descripcion: null, conductor_id: null, vehiculo_id: null, nota: null,
  path: 'guias/x.pdf', nombre: 'guia.pdf', tamano: 100, subido_por: null, subido_por_nombre: null, created_at: '2026-10-01T10:00:00Z', ...p,
});

describe('guías de Choferes (14/10/2026)', () => {
  const L = [
    g({ id: 'a', fecha: '2026-10-01', numero: '0012', descripcion: 'Despacho de mineral' }),
    g({ id: 'b', fecha: '2026-10-05', numero: '0013', descripcion: 'Movilización', conductor_id: 'c1' }),
    g({ id: 'c', fecha: '2026-10-05', numero: '0014', nombre: 'Guía Peramanal.pdf', created_at: '2026-10-05T15:00:00Z' }),
  ];

  it('filtra por fechas y por texto sin acentos (también chofer/vehículo)', () => {
    expect(filtrarGuias(L, { texto: '', desde: '2026-10-02', hasta: '' }).map((x) => x.id)).toEqual(['b', 'c']);
    expect(filtrarGuias(L, { texto: 'movilizacion', desde: '', hasta: '' }).map((x) => x.id)).toEqual(['b']);
    expect(filtrarGuias(L, { texto: 'peramanal', desde: '', hasta: '2026-10-05' }).map((x) => x.id)).toEqual(['c']);
    expect(filtrarGuias(L, { texto: 'pedro', desde: '', hasta: '' }, (x) => (x.conductor_id === 'c1' ? 'Pedro Pérez' : '')).map((x) => x.id)).toEqual(['b']);
  });

  it('ordena más nuevas primero y arma el título', () => {
    expect(ordenarGuias(L).map((x) => x.id)).toEqual(['c', 'b', 'a']);
    expect(tituloGuia(L[0])).toBe('Guía N° 0012 · Despacho de mineral');
    expect(tituloGuia(g({ nombre: 'scan.pdf' }))).toBe('scan.pdf');
  });

  it('solo acepta PDF de hasta 10 MB', () => {
    expect(validarArchivoGuia({ name: 'a.pdf', type: 'application/pdf', size: 1000 })).toBeNull();
    expect(validarArchivoGuia({ name: 'a.jpg', type: 'image/jpeg', size: 1000 })).toMatch(/PDF/);
    expect(validarArchivoGuia({ name: 'a.pdf', type: 'application/pdf', size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
    expect(validarArchivoGuia(null)).toMatch(/Elige/);
  });
});
