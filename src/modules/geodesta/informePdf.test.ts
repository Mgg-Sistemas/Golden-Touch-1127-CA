import { describe, expect, it } from 'vitest';
import { apartadoCuadroVacio, apartadoTextoVacio, columnaVacia, filaVaciaDe } from './informeModelo';
import type { InformeGeodesta } from '@/shared/lib/types';
import { ANCHO_UTIL, anchosDeColumnas, construirInformePdf } from './informePdf';

const informe = (apartados: InformeGeodesta['apartados']): InformeGeodesta => ({
  id: 'i1', codigo: 'Dpto-Geol-2026-0001-02', codigo_anio: 2026, codigo_nro: 1,
  fecha: '2026-10-02', estado: 'borrador', ciudad: 'Puerto Ordaz',
  para_nombre: 'Ender Mejías', para_cargo: 'Representante Legal',
  de_nombre: 'Marco Romero', de_cargo: 'Departamento de Geología',
  firma_nombre: 'Ing. Marco Romero', firma_cargo: 'Geólogo',
  direccion_pie: 'Sector La Esperanza', logo_gt: true, logo_cvm: true,
  apartados, creado_en: '2026-10-02T12:00:00Z',
});

describe('anchosDeColumnas', () => {
  it('reparte el ancho útil entre las columnas', () => {
    const a = anchosDeColumnas([columnaVacia('A'), columnaVacia('B')]);
    expect(a).toHaveLength(2);
    expect(a.reduce((s, x) => s + x, 0)).toBeLessThanOrEqual(ANCHO_UTIL);
  });
  it('NUNCA se pasa del ancho de la hoja, ni con doce columnas', () => {
    // Review Focus 1: el usuario define las columnas y puede crear muchas.
    for (const n of [1, 3, 6, 12]) {
      const cols = Array.from({ length: n }, (_, i) => columnaVacia(`C${i}`));
      const suma = anchosDeColumnas(cols).reduce((s, x) => s + x, 0);
      expect(suma).toBeLessThanOrEqual(ANCHO_UTIL);
    }
  });
  it('ninguna columna queda en cero o negativa', () => {
    const cols = Array.from({ length: 12 }, (_, i) => columnaVacia(`C${i}`));
    anchosDeColumnas(cols).forEach((w) => expect(w).toBeGreaterThan(0));
  });
  it('sin columnas devuelve una lista vacía, sin dividir por cero', () => {
    expect(anchosDeColumnas([])).toEqual([]);
  });
});

describe('construirInformePdf', () => {
  it('un informe vacío se construye y tiene al menos una página', async () => {
    const doc = await construirInformePdf(informe([]));
    expect(doc.getNumberOfPages()).toBeGreaterThan(0);
  });
  it('un informe con un cuadro y un texto se construye sin lanzar', async () => {
    const c = apartadoCuadroVacio();
    c.titulo = 'Exploración';
    const t = { ...apartadoTextoVacio(), texto: 'Reciba un cordial saludo.' };
    const doc = await construirInformePdf(informe([c, t]));
    expect(doc.getNumberOfPages()).toBeGreaterThan(0);
  });
  it('un cuadro de 150 filas ocupa más de una página', async () => {
    const c = apartadoCuadroVacio();
    c.filas = Array.from({ length: 150 }, () => filaVaciaDe(c.columnas));
    const doc = await construirInformePdf(informe([c]));
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });
  it('una celda que apunta a una imagen que ya no existe NO rompe', async () => {
    // Review Focus 5: la imagen se borró pero la celda sigue apuntándole.
    const c = apartadoCuadroVacio();
    c.columnas[2].tipo = 'imagen';
    c.filas[0].celdas[c.columnas[2].id] = 'id-que-no-existe';
    const doc = await construirInformePdf(informe([c]), {});
    expect(doc.getNumberOfPages()).toBeGreaterThan(0);
  });
  it('se construye igual con los dos logos apagados', async () => {
    const inf = { ...informe([]), logo_gt: false, logo_cvm: false };
    const doc = await construirInformePdf(inf);
    expect(doc.getNumberOfPages()).toBeGreaterThan(0);
  });
  it('una imagen válida y una corrupta conviven sin romper (celda y texto)', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const c = apartadoCuadroVacio();
    c.columnas[0].tipo = 'imagen'; c.columnas[1].tipo = 'imagen';
    c.filas[0].celdas[c.columnas[0].id] = 'ok';
    c.filas[0].celdas[c.columnas[1].id] = 'mala';
    const t = { ...apartadoTextoVacio(), texto: 'x', imagenes: [{ imagen_id: 'ok', pie: 'Foto' }, { imagen_id: 'mala', pie: '' }] };
    const fallidas = new Set<string>();
    const doc = await construirInformePdf(informe([c, t]), { ok: png, mala: 'data:image/png;base64,@@@' }, fallidas);
    expect(doc.getNumberOfPages()).toBeGreaterThan(0);
    expect(fallidas.has('mala')).toBe(true);
    expect(fallidas.has('ok')).toBe(false);
  });
});
