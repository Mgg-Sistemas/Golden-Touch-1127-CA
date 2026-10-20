import { beforeEach, describe, expect, it, vi } from 'vitest';

/* Supabase falso: cada `from()` toma la siguiente respuesta de la cola y anota
   qué tabla se pidió y qué métodos se le encadenaron. */
type Resp = { data: unknown; error: unknown };
const cola: Resp[] = [];
const llamadas: { tabla: string; metodos: unknown[][] }[] = [];

function consulta(tabla: string, resp: Resp) {
  const registro = { tabla, metodos: [] as unknown[][] };
  llamadas.push(registro);
  const q: Record<string, unknown> = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') return (ok: (v: Resp) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(resp).then(ok, ko);
      return (...args: unknown[]) => { registro.metodos.push([prop, ...args]); return q; };
    },
  });
  return q;
}

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    from: (tabla: string) => consulta(tabla, cola.shift() ?? { data: [], error: null }),
    rpc: async () => ({ data: null, error: null }),
  },
}));

// El dinero y el inventario: si se llaman, la prueba lo ve.
const revertirEgresoDivisa = vi.fn(async () => undefined);
const ingresarDineroCaja = vi.fn(async () => undefined);
vi.mock('@/modules/tesoreria/cajaSaldos.repository', () => ({
  revertirEgresoDivisa: (...a: unknown[]) => revertirEgresoDivisa(...(a as [])),
  egresarDivisa: vi.fn(),
}));
vi.mock('@/modules/salidas/cajas.repository', () => ({
  ingresarDineroCaja: (...a: unknown[]) => ingresarDineroCaja(...(a as [])),
  egresarGastoCaja: vi.fn(),
}));
vi.mock('@/modules/inventario/movimientos.repository', () => ({ registrarMovimiento: vi.fn() }));
// La base de hoy (sin P03): el borrado no pregunta por facturas registradas en Retenciones.
vi.mock('@/modules/libroFiscal/disponibilidad', async (orig) => ({ ...(await orig<object>()), p03Disponible: async () => false }));

import { anularRetencionesVinculadas, restaurarRetencionesAnuladas } from './tesoreria.repository';
import { reabrirCompraDirecta, type CompraDirecta } from '@/modules/pedidos/compras.repository';
import { eliminarOrdenCompra } from '@/modules/pedidos/pedidos.repository';
import type { Orden } from '@/shared/lib/types';

const base = { columna: 'orden_id' as const, id: 'oc-1', motivo: 'OC eliminada', documento: 'La orden OC-1' };
const metodo = (i: number, m: string) => llamadas[i]?.metodos.find((x) => x[0] === m);

beforeEach(() => {
  cola.length = 0; llamadas.length = 0;
  revertirEgresoDivisa.mockClear(); ingresarDineroCaja.mockClear();
});

describe('anular (nunca borrar) las retenciones de una OC o una compra', () => {
  it('sin retenciones vigentes no hace nada y deja seguir', async () => {
    cola.push({ data: [], error: null });
    await expect(anularRetencionesVinculadas(base)).resolves.toEqual([]);
    expect(llamadas).toHaveLength(1);
    expect(metodo(0, 'neq')).toEqual(['neq', 'estado', 'anulada']);
  });

  it('con una retención declarada se detiene: eso se resuelve en Retenciones', async () => {
    cola.push({ data: [{ id: 'r-1', estado: 'declarada', declarada_at: '2026-10-10T00:00:00Z' }], error: null });
    await expect(anularRetencionesVinculadas(base)).rejects.toThrow('ya declaradas');
    expect(llamadas).toHaveLength(1);
  });

  it('sin permiso (la base no toca las filas y no avisa) se detiene y devuelve las que sí anuló', async () => {
    cola.push({ data: [{ id: 'r-1', estado: 'registrada' }, { id: 'r-2', estado: 'registrada' }], error: null });
    cola.push({ data: [{ id: 'r-1' }], error: null });   // solo una cambió
    cola.push({ data: null, error: null });              // la devolución
    await expect(anularRetencionesVinculadas(base)).rejects.toThrow('no tiene permiso para anularlas');
    expect(metodo(2, 'update')?.[1]).toMatchObject({ estado: 'registrada', anulada_motivo: null });
    expect(metodo(2, 'in')).toEqual(['in', 'id', ['r-1']]);
  });

  it('con permiso las anula con su motivo; ninguna se borra', async () => {
    cola.push({ data: [{ id: 'r-1', estado: 'registrada' }], error: null });
    cola.push({ data: [{ id: 'r-1' }], error: null });
    await expect(anularRetencionesVinculadas(base)).resolves.toEqual(['r-1']);
    expect(metodo(1, 'update')?.[1]).toMatchObject({ estado: 'anulada', anulada_motivo: 'OC eliminada' });
    expect(llamadas.some((l) => l.metodos.some((m) => m[0] === 'delete'))).toBe(false);
  });

  it('devolver a «registrada» toca solo las anuladas de esa lista', async () => {
    cola.push({ data: null, error: null });
    await restaurarRetencionesAnuladas(['r-1', 'r-2']);
    expect(metodo(0, 'eq')).toEqual(['eq', 'estado', 'anulada']);
    expect(metodo(0, 'in')).toEqual(['in', 'id', ['r-1', 'r-2']]);
  });
});

describe('se comprueba ANTES de mover dinero o stock', () => {
  const compra = {
    id: 'cd-1', codigo: 'CD-1', estado: 'finalizada', producto_nombre: 'Material de prueba',
    caja_id: 'caja-1', gasto: 100, pago_legs: null, retencion_pago_monto: 0,
  } as unknown as CompraDirecta;

  it('reabrir una compra con una retención declarada: no se devuelve dinero', async () => {
    cola.push({ data: [{ id: 'r-1', estado: 'declarada', declarada_at: '2026-10-10T00:00:00Z' }], error: null });
    await expect(reabrirCompraDirecta(compra, 'prueba@ejemplo.com')).rejects.toThrow('ya declaradas');
    expect(ingresarDineroCaja).not.toHaveBeenCalled();
    expect(revertirEgresoDivisa).not.toHaveBeenCalled();
  });

  it('reabrir una compra sin permiso sobre sus retenciones: no se devuelve dinero', async () => {
    cola.push({ data: [{ id: 'r-1', estado: 'registrada' }], error: null });
    cola.push({ data: [], error: null });
    await expect(reabrirCompraDirecta(compra, 'prueba@ejemplo.com')).rejects.toThrow('no tiene permiso');
    expect(ingresarDineroCaja).not.toHaveBeenCalled();
  });

  it('si después falla la devolución del dinero, las retenciones vuelven a «registrada»', async () => {
    cola.push({ data: [{ id: 'r-1', estado: 'registrada' }], error: null });
    cola.push({ data: [{ id: 'r-1' }], error: null });
    ingresarDineroCaja.mockRejectedValueOnce(new Error('caja cerrada'));
    await expect(reabrirCompraDirecta(compra, 'prueba@ejemplo.com')).rejects.toThrow('caja cerrada');
    const ultima = llamadas[llamadas.length - 1];
    expect(ultima.tabla).toBe('retenciones');
    expect(ultima.metodos.find((m) => m[0] === 'update')?.[1]).toMatchObject({ estado: 'registrada' });
  });

  it('eliminar una OC con una retención declarada: no se revierte ningún egreso y se suelta la reserva', async () => {
    cola.push({ data: [{ id: 'oc-1' }], error: null });   // la reserva
    cola.push({ data: [{ id: 'r-1', estado: 'declarada', declarada_at: '2026-10-10T00:00:00Z' }], error: null });
    cola.push({ data: null, error: null });               // soltar la reserva
    const orden = { id: 'oc-1', codigo: 'OC-1', oc_codigo: 'OC-1' } as unknown as Orden;
    await expect(eliminarOrdenCompra(orden, 'prueba@ejemplo.com')).rejects.toThrow('ya declaradas');
    expect(revertirEgresoDivisa).not.toHaveBeenCalled();
    expect(llamadas.some((l) => l.tabla === 'movimientos_caja')).toBe(false);
    expect(llamadas[llamadas.length - 1].metodos.find((m) => m[0] === 'update')?.[1]).toEqual({ eliminando_at: null });
  });
});
