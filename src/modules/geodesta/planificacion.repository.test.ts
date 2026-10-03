import { describe, expect, it } from 'vitest';
import { planVacio } from './planModelo';
import { filaPlanAGuardar } from './planificacion.repository';

const base = { ...planVacio('2026-10-03'), titulo: '  Muestreo bloque 3  ' };

describe('filaPlanAGuardar', () => {
  it('recorta el título', () => {
    expect(filaPlanAGuardar(base).titulo).toBe('Muestreo bloque 3');
  });
  it('los textos vacíos se guardan como null, no como cadena vacía', () => {
    const f = filaPlanAGuardar(base);
    expect(f.lugar).toBeNull();
    expect(f.nota).toBeNull();
    expect(f.estado_nota).toBeNull();
  });
  it('devuelve exactamente las columnas de la tabla', () => {
    expect(Object.keys(filaPlanAGuardar(base)).sort()).toEqual(
      ['busq', 'desde', 'estado', 'estado_nota', 'hasta', 'lugar', 'nota', 'titulo'].sort(),
    );
  });
  it('incluye el texto de búsqueda ya armado', () => {
    const f = filaPlanAGuardar({ ...base, lugar: 'Mina La Esperanza' }) as { busq: string };
    expect(f.busq).toContain('mina la esperanza');
  });
  it('conserva las fechas y el estado tal cual', () => {
    const f = filaPlanAGuardar({ ...base, estado: 'cumplida', desde: '2026-10-05', hasta: '2026-10-08' });
    expect(f.estado).toBe('cumplida');
    expect(f.desde).toBe('2026-10-05');
    expect(f.hasta).toBe('2026-10-08');
  });
});
