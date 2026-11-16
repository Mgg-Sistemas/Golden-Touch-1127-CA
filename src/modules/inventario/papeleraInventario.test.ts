import { describe, expect, it, vi } from 'vitest';
import type { Movimiento } from '@/shared/lib/types';
import { cambiarPapeleraInventario, esMovimientoInventarioReversible, revertirMovimientoInventario } from './papeleraInventario';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/shared/lib/supabase', () => ({ supabase: { rpc } }));

const manual: Movimiento = {
  id: 'mov-prueba', producto_id: 'producto', tipo: 'entrada', delta: 10,
  stock_antes: 5, stock_despues: 15, actor: 'prueba', ref_tipo: 'manual',
  at: '2026-11-16T16:00:00Z', created_at: '2026-11-16T16:00:00Z', costo_antes: 5, costo_promedio: 7,
};

describe('papelera de Inventario', () => {
  it('excluye recepciones, movimientos vinculados y entradas sin costo anterior', () => {
    expect(esMovimientoInventarioReversible(manual)).toBe(true);
    expect(esMovimientoInventarioReversible({ ...manual, costo_antes: null })).toBe(false);
    expect(esMovimientoInventarioReversible({ ...manual, tipo: 'salida', delta: -2, costo_antes: null })).toBe(true);
    expect(esMovimientoInventarioReversible({ ...manual, ref_tipo: 'recepcion' })).toBe(false);
    expect(esMovimientoInventarioReversible({ ...manual, ref_id: 'orden' })).toBe(false);
    expect(esMovimientoInventarioReversible({ ...manual, revertido_en: manual.at })).toBe(false);
    expect(esMovimientoInventarioReversible({ ...manual, reverso_de_id: 'original' })).toBe(false);
  });

  it('envía únicamente identificador y motivo al reverso atómico', async () => {
    rpc.mockReset();
    rpc.mockResolvedValueOnce({ data: 'movimiento-reverso', error: null });
    await expect(revertirMovimientoInventario(manual, ' ')).rejects.toThrow('Indica el motivo');
    await revertirMovimientoInventario(manual, ' Corrección ');
    expect(rpc.mock.calls).toEqual([
      ['inventario_revertir_movimiento_manual', { p_movimiento: manual.id, p_motivo: 'Corrección' }],
    ]);
  });

  it('detecta una restauración que no cambió filas', async () => {
    rpc.mockResolvedValueOnce({ data: 0, error: null });
    await expect(cambiarPapeleraInventario('presentacion', ['saco'], 'restaurar')).rejects.toThrow('El registro ya cambió');
  });
});
