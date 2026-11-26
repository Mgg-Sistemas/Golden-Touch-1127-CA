import { describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  paginas: [] as Array<Array<Record<string, unknown>>>,
  rangos: [] as Array<[number, number]>,
}));

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({
          order: () => ({
            range: (desde: number, hasta: number) => {
              mock.rangos.push([desde, hasta]);
              return Promise.resolve({ data: mock.paginas.shift() ?? [], error: null });
            },
          }),
        }),
      }),
    }),
  },
}));

import { listProductosTodosLosDepositos } from './inventario.repository';

describe('carga completa del catálogo de productos', () => {
  it('pide la segunda página: no pierde los productos después de la fila 1000', async () => {
    mock.paginas = [
      Array.from({ length: 1000 }, (_, i) => ({
        id: `id-${i}`, sku: `GEN-${i}`, nombre: `A PRODUCTO ${i}`, almacen: 'General', estado: 'activo',
      })),
      [{ id: 'tiza-id', sku: 'INS-180', nombre: 'TIZA PARA HERRERÍA', almacen: 'Depósito Mina', estado: 'activo' }],
    ];
    mock.rangos = [];

    const productos = await listProductosTodosLosDepositos();

    expect(mock.rangos).toEqual([[0, 999], [1000, 1999]]);
    expect(productos).toHaveLength(1001);
    expect(productos.at(-1)).toMatchObject({ sku: 'INS-180', nombre: 'TIZA PARA HERRERÍA' });
  });
});
