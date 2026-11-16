import { describe, expect, it, vi } from 'vitest';
import type { MovimientoCaja } from '@/shared/lib/types';
import { cambiarPapeleraTesoreria, puedeRevertirMovimiento, revertirMovimiento } from './papeleraTesoreria';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/shared/lib/supabase', () => ({ supabase: { rpc } }));

const ingreso: MovimientoCaja = {
  id: 'manual', caja_id: 'caja', tipo: 'ingreso', categoria: 'ingreso',
  moneda: 'USD', monto: 15, saldo_antes: 0, saldo_despues: 15,
  at: '2026-11-16T16:00:00Z', actor: 'prueba',
};

describe('reversos de Tesorería', () => {
  it('excluye pares, pagos, asientos revertidos, Acopio y cierres', () => {
    expect(puedeRevertirMovimiento(ingreso)).toBe(true);
    expect(puedeRevertirMovimiento({ ...ingreso, tipo: 'traslado_entrada' })).toBe(false);
    expect(puedeRevertirMovimiento({ ...ingreso, categoria: 'conversion' })).toBe(false);
    expect(puedeRevertirMovimiento({ ...ingreso, ref_venta_id: 'venta' })).toBe(false);
    expect(puedeRevertirMovimiento({ ...ingreso, ref_nomina_renglon_id: 'nómina' })).toBe(false);
    expect(puedeRevertirMovimiento({ ...ingreso, revertido_en: ingreso.at })).toBe(false);
    expect(puedeRevertirMovimiento({ ...ingreso, reverso_de_id: 'original' })).toBe(false);
    expect(puedeRevertirMovimiento({ ...ingreso, reflejar_acopio: true })).toBe(false);
    expect(puedeRevertirMovimiento({ ...ingreso, cierre_id: 'cierre' })).toBe(false);
  });

  it('envía solo el identificador y el motivo a la operación atómica', async () => {
    rpc.mockReset();
    rpc.mockResolvedValueOnce({ data: 'reverso-uno', error: null });
    await expect(revertirMovimiento(ingreso, '   ')).rejects.toThrow('Indica por qué');
    await revertirMovimiento(ingreso, ' Corrección ');
    expect(rpc.mock.calls).toEqual([
      ['tesoreria_revertir_movimiento', { p_movimiento: 'manual', p_motivo: 'Corrección' }],
    ]);
  });

  it('informa cuando el registro no se pudo restaurar', async () => {
    rpc.mockReset();
    rpc.mockResolvedValueOnce({ data: 0, error: null });
    await expect(cambiarPapeleraTesoreria('categoria', ['cat'], 'restaurar')).rejects.toThrow('El registro ya cambió');
  });
});
