import { describe, expect, it } from 'vitest';
import type { InformeGeodesta } from '@/shared/lib/types';
import { FILTROS_VACIOS, filtrarInformes } from './informeFiltros';

const inf = (id: string, fecha: string, estado: 'borrador' | 'finalizado', busq: string): InformeGeodesta =>
  ({ id, codigo: `C-${id}`, codigo_anio: 2026, codigo_nro: 1, fecha, estado,
     ciudad: null, para_nombre: null, para_cargo: null, de_nombre: null, de_cargo: null,
     firma_nombre: null, firma_cargo: null, direccion_pie: null,
     logo_gt: true, logo_cvm: true, apartados: [], busq, creado_en: '' });

const lista = [
  inf('a', '2026-03-01', 'borrador',   'calicatas del bloque 3'),
  inf('b', '2026-06-15', 'finalizado', 'muestreo de canal'),
  inf('c', '2026-09-30', 'finalizado', 'exploracion con perforacion'),
];

describe('filtrarInformes', () => {
  it('sin filtros devuelve todo', () => {
    expect(filtrarInformes(lista, FILTROS_VACIOS)).toHaveLength(3);
  });
  it('el rango de fechas incluye los extremos', () => {
    const r = filtrarInformes(lista, { ...FILTROS_VACIOS, desde: '2026-03-01', hasta: '2026-06-15' });
    expect(r.map((x) => x.id)).toEqual(['a', 'b']);
  });
  it('filtra por estado', () => {
    expect(filtrarInformes(lista, { ...FILTROS_VACIOS, estado: 'finalizado' }).map((x) => x.id)).toEqual(['b', 'c']);
  });
  it('la palabra ignora acentos y mayúsculas', () => {
    expect(filtrarInformes(lista, { ...FILTROS_VACIOS, palabra: 'EXPLORACIÓN' }).map((x) => x.id)).toEqual(['c']);
  });
  it('un informe sin texto de búsqueda no rompe el filtro', () => {
    const sinBusq = { ...inf('d', '2026-01-01', 'borrador', ''), busq: null };
    expect(() => filtrarInformes([sinBusq], { ...FILTROS_VACIOS, palabra: 'algo' })).not.toThrow();
  });
  it('combina estado y palabra', () => {
    const r = filtrarInformes(lista, { ...FILTROS_VACIOS, estado: 'finalizado', palabra: 'canal' });
    expect(r.map((x) => x.id)).toEqual(['b']);
  });
});
