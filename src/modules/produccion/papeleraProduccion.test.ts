import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eliminarCatalogoAcopio, eliminarContrato, cambiarPapeleraProduccion } from './contratos.repository';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/shared/lib/supabase', () => ({ supabase: { rpc } }));
vi.mock('@/modules/inventario/movimientos.repository', () => ({ registrarMovimiento: vi.fn() }));
vi.mock('@/modules/acopio/caja.repository', () => ({ tasaActualAcopio: vi.fn() }));

describe('Papelera de Producción', () => {
  beforeEach(() => rpc.mockReset());

  it('envía contratos y catálogos por la operación recuperable', async () => {
    rpc.mockResolvedValue({ data: 1, error: null });
    await eliminarContrato('contrato-demo');
    await eliminarCatalogoAcopio('catalogo-demo');
    expect(rpc.mock.calls).toEqual([
      ['produccion_papelera_cambiar', { p_tipo: 'contrato', p_ids: ['contrato-demo'], p_accion: 'enviar' }],
      ['produccion_papelera_cambiar', { p_tipo: 'catalogo', p_ids: ['catalogo-demo'], p_accion: 'enviar' }],
    ]);
  });

  it('informa errores del servidor y cero filas al restaurar', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Falta el reverso de inventario' } });
    await expect(eliminarContrato('contrato-demo')).rejects.toThrow('Falta el reverso de inventario');
    rpc.mockResolvedValueOnce({ data: 0, error: null });
    await expect(cambiarPapeleraProduccion('catalogo', ['catalogo-demo'], 'restaurar')).rejects.toThrow('El registro ya cambió');
  });

  it('vacía solo los registros solicitados y devuelve el número retirado', async () => {
    expect(await cambiarPapeleraProduccion('contrato', [], 'vaciar')).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({ data: 1, error: null });
    expect(await cambiarPapeleraProduccion('contrato', ['libre', 'protegido'], 'vaciar')).toBe(1);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('produccion_papelera_cambiar', {
      p_tipo: 'contrato', p_ids: ['libre', 'protegido'], p_accion: 'vaciar',
    });
  });
});
