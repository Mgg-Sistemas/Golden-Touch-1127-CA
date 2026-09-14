import { describe, it, expect } from 'vitest';
import { MAX_RECEPCIONES_VISIBLES, filtrarRecepciones, partirRecepciones, unidadesDeOrden } from './recepcionesFinalizadas';

const orden = (codigo: string, dia: number, extra: Record<string, unknown> = {}) => ({
  codigo,
  created_at: `2026-08-${String(dia).padStart(2, '0')}T12:00:00Z`,
  oc_codigo: null as string | null,
  solicitante: null as string | null,
  items: [] as { nombre?: string; sku?: string; cantidad?: number | string }[],
  ...extra,
});

describe('partirRecepciones', () => {
  it('deja las 10 más recientes arriba y manda el resto al histórico', () => {
    // Desordenadas a propósito: días 1..12.
    const ordenes = [5, 12, 1, 9, 3, 11, 7, 2, 10, 4, 8, 6].map((d) => orden(`SP-${d}`, d));
    const { recientes, anteriores } = partirRecepciones(ordenes);
    expect(MAX_RECEPCIONES_VISIBLES).toBe(10);
    expect(recientes.map((o) => o.codigo)).toEqual(['SP-12', 'SP-11', 'SP-10', 'SP-9', 'SP-8', 'SP-7', 'SP-6', 'SP-5', 'SP-4', 'SP-3']);
    expect(anteriores.map((o) => o.codigo)).toEqual(['SP-2', 'SP-1']);
  });

  it('con 10 o menos, el histórico queda vacío', () => {
    const { recientes, anteriores } = partirRecepciones([orden('A', 1), orden('B', 2)]);
    expect(recientes).toHaveLength(2);
    expect(anteriores).toHaveLength(0);
  });

  it('no modifica la lista original', () => {
    const ordenes = [orden('A', 1), orden('B', 2)];
    partirRecepciones(ordenes);
    expect(ordenes.map((o) => o.codigo)).toEqual(['A', 'B']);
  });
});

describe('filtrarRecepciones', () => {
  const ordenes = [
    orden('SP-2026-0085', 10, { solicitante: 'EDINSON ANGULO', oc_codigo: 'OC-2026-0040', items: [{ nombre: 'CUÑETE DE PINTURA', sku: 'MAT-010', cantidad: 1 }] }),
    orden('SP-2026-0113', 11, { solicitante: 'JESÚS CAMPOS', items: [{ nombre: 'ACEITE VATEL SOYA', sku: 'GEN-179', cantidad: 12 }] }),
    orden('SP-2026-0130', 21, { solicitante: 'COCINA', items: [{ nombre: 'ZANAHORIA', sku: 'VIV-005', cantidad: 5 }, { nombre: 'ACEITE VATEL SOYA', sku: 'GEN-179', cantidad: 3 }] }),
  ];

  it('sin texto devuelve todas', () => {
    expect(filtrarRecepciones(ordenes, '   ')).toHaveLength(3);
  });

  it('busca por código, OC y SKU sin importar mayúsculas', () => {
    expect(filtrarRecepciones(ordenes, 'sp-2026-0085').map((o) => o.codigo)).toEqual(['SP-2026-0085']);
    expect(filtrarRecepciones(ordenes, 'oc-2026-0040').map((o) => o.codigo)).toEqual(['SP-2026-0085']);
    expect(filtrarRecepciones(ordenes, 'viv-005').map((o) => o.codigo)).toEqual(['SP-2026-0130']);
  });

  it('busca por solicitante sin acentos y por producto', () => {
    expect(filtrarRecepciones(ordenes, 'jesus').map((o) => o.codigo)).toEqual(['SP-2026-0113']);
    expect(filtrarRecepciones(ordenes, 'cunete').map((o) => o.codigo)).toEqual(['SP-2026-0085']);
    expect(filtrarRecepciones(ordenes, 'aceite')).toHaveLength(2);
  });

  it('con varias palabras, tienen que estar todas', () => {
    expect(filtrarRecepciones(ordenes, 'cocina aceite').map((o) => o.codigo)).toEqual(['SP-2026-0130']);
    expect(filtrarRecepciones(ordenes, 'cocina pintura')).toHaveLength(0);
  });
});

describe('unidadesDeOrden', () => {
  it('suma las cantidades, aunque vengan como texto', () => {
    expect(unidadesDeOrden({ items: [{ cantidad: 5 }, { cantidad: '3' }, { cantidad: null }] })).toBe(8);
    expect(unidadesDeOrden({ items: null })).toBe(0);
  });
});
