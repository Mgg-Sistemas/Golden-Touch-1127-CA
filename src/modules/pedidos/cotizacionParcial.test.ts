import { describe, expect, it, vi } from 'vitest';
import type { Orden, ItemOrden } from '@/shared/lib/types';

const estado = vi.hoisted(() => ({ insertados: [] as Record<string, unknown>[], actualizados: [] as Record<string, unknown>[] }));
vi.mock('@/shared/lib/supabase', () => {
  const client = { rpc: async () => ({ data: 1, error: null }), from: (tabla: string) => {
    let insertado: Record<string, unknown> | null = null;
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'like', 'order', 'limit']) q[m] = () => q;
    q.insert = (r: Record<string, unknown>) => { insertado = r; estado.insertados.push(r); return q; };
    q.update = (r: Record<string, unknown>) => { if (tabla === 'ordenes') estado.actualizados.push(r); return q; };
    q.maybeSingle = async () => ({ data: { iva_aplicado: true, iva_incluido: true, iva_pct: 16, iva_monto: 2.76 }, error: null });
    q.single = async () => ({ data: { id: 'hija', ...insertado }, error: null });
    q.then = (resolve: (v: unknown) => void) => Promise.resolve({ data: [], error: null }).then(resolve);
    return q;
  } };
  return { supabase: client, getSupabase: () => client, isSupabaseConfigured: false };
});

describe('aceptación de cotización parcial', () => {
  it('crea una OC hija solo con precio y deja los ceros en la madre sin sumar dos veces el IVA incluido', async () => {
    const { aprobarOrdenConOferta } = await import('./pedidos.repository');
    const a = { sku: 'A', nombre: 'Comprado', cantidad: 2, precio: 10, unidad: 'UND' } as ItemOrden;
    const b = { sku: 'B', nombre: 'No cotizado', cantidad: 1, precio: 0, unidad: 'UND' } as ItemOrden;
    const madre = { id: 'madre', codigo: 'SP-2026-TEST', tipo: 'producto', estado: 'aprobada', items: [a, b], historial: [] } as unknown as Orden;
    const hija = await aprobarOrdenConOferta(madre, 'proveedor', [a, b], 20, null, 'compras@test', null, { observacion: null, adjuntos: [], modalidadPago: 'bcv' });
    expect(hija.id).toBe('hija');
    expect(estado.insertados[0]).toMatchObject({ op_padre_id: 'madre', items: [a], total: 20, iva_incluido: true });
    expect(estado.actualizados).toContainEqual(expect.objectContaining({ estado: 'aprobada', items: [b] }));
  });
});
