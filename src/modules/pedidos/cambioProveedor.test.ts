/* ============================================================
   Cambio de proveedor al indicar el método de pago:
     · cómo se lee el evento de la traza (formato actual y antiguo), y
     · lo que `cambiarProveedorOrden` escribe en la base (a aprobación del
       Gerente, aprobación anulada, traza completa, y sin pisar una orden que
       otro usuario ya movió).
   ============================================================ */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Orden } from '@/shared/lib/types';

// Base simulada: registra lo que se actualiza y con qué condiciones.
const base = vi.hoisted(() => ({
  proveedores: [] as Array<{ id: string; razon_social: string }>,
  update: null as Record<string, unknown> | null,
  filtros: [] as Array<[string, unknown]>,
  filaDevuelta: undefined as Record<string, unknown> | null | undefined, // undefined = devuelve lo actualizado; null = ninguna fila
  error: null as { message: string } | null,
}));

vi.mock('@/shared/lib/supabase', () => {
  const consultaProveedores = {
    select: () => ({ in: async () => ({ data: base.proveedores, error: null }) }),
  };
  const consultaOrdenes = {
    update: (patch: Record<string, unknown>) => {
      base.update = patch;
      const q = {
        eq: (col: string, val: unknown) => { base.filtros.push([col, val]); return q; },
        select: () => q,
        maybeSingle: async () => ({
          data: base.filaDevuelta === undefined ? { ...patch } : base.filaDevuelta,
          error: base.error,
        }),
      };
      return q;
    },
  };
  return { supabase: { from: (t: string) => (t === 'proveedores' ? consultaProveedores : consultaOrdenes) } };
});

import { leerCambioProveedor, textoCambioProveedor } from './cambioProveedor';
import { cambiarProveedorOrden } from './pedidos.repository';

const orden = (patch: Partial<Orden> = {}): Orden => ({
  id: 'o1', codigo: 'SP-2026-0001', oc_codigo: 'OC-2026-0001',
  estado: 'confirmada_metodo', proveedor_id: 'pA', total: 1000, total_moneda: 'USD',
  oc_aprobada_por: 'gerente@gt.com', oc_aprobada_en: '2026-10-16T11:44:00Z',
  items: [{ nombre: 'Saco', cantidad: 1, precio: 1000 }],
  historial: [{ at: '2026-10-15T12:00:00Z', evento: 'creada', actor: 'ana@gt.com' }],
  ...patch,
} as unknown as Orden);

beforeEach(() => {
  base.proveedores = [{ id: 'pA', razon_social: 'DISTRIBUIDORA EL TORETE' }, { id: 'pB', razon_social: 'FERRETERIA CENTRAL' }];
  base.update = null; base.filtros = []; base.filaDevuelta = undefined; base.error = null;
});

describe('cambiarProveedorOrden', () => {
  it('cambia el proveedor y devuelve la OC a aprobación (sin tocar ítems ni total)', async () => {
    await cambiarProveedorOrden(orden(), 'pB', 'compras@gt.com');
    expect(base.update).toMatchObject({
      proveedor_id: 'pB',
      estado: 'oc_creada',
      oc_aprobada_por: null,
      oc_aprobada_en: null,
    });
    expect(base.update).not.toHaveProperty('items');
    expect(base.update).not.toHaveProperty('total');
  });

  it('deja todo en la traza: proveedores con nombre, quién, aprobación anulada y estado previo', async () => {
    await cambiarProveedorOrden(orden(), 'pB', 'compras@gt.com');
    const historial = base.update!.historial as Array<Record<string, unknown>>;
    expect(historial).toHaveLength(2);                       // lo anterior se conserva
    expect(historial[0].evento).toBe('creada');
    expect(historial[1]).toMatchObject({
      evento: 'proveedor_cambiado',
      actor: 'compras@gt.com',
      proveedorAnteriorId: 'pA',
      proveedorNuevoId: 'pB',
      proveedorAnterior: 'DISTRIBUIDORA EL TORETE',
      proveedorNuevo: 'FERRETERIA CENTRAL',
      estadoAnterior: 'confirmada_metodo',
      aprobacionAnteriorPor: 'gerente@gt.com',
      aprobacionAnteriorEn: '2026-10-16T11:44:00Z',
    });
    expect(String(historial[1].motivo)).toContain('vuelve a aprobación del Gerente General');
    expect(typeof historial[1].at).toBe('string');
  });

  it('solo actualiza si la orden sigue en el estado que se vio (no pisa a otro usuario)', async () => {
    await cambiarProveedorOrden(orden(), 'pB', 'compras@gt.com');
    expect(base.filtros).toContainEqual(['id', 'o1']);
    expect(base.filtros).toContainEqual(['estado', 'confirmada_metodo']);
  });

  it('si otro usuario ya la movió (ninguna fila cambia), avisa y no da por hecho el cambio', async () => {
    base.filaDevuelta = null;
    await expect(cambiarProveedorOrden(orden(), 'pB', 'compras@gt.com')).rejects.toThrow(/otro usuario/);
  });

  it('propaga el error de la base', async () => {
    base.error = { message: 'permiso denegado' };
    await expect(cambiarProveedorOrden(orden(), 'pB', 'compras@gt.com')).rejects.toMatchObject({ message: 'permiso denegado' });
  });

  it('solo en «indicar método de pago»: en otro estado se rechaza sin escribir nada', async () => {
    await expect(cambiarProveedorOrden(orden({ estado: 'oc_aprobada' }), 'pB', 'x@gt.com')).rejects.toThrow(/mientras se indica el método de pago/);
    expect(base.update).toBeNull();
  });

  it('mismo proveedor: no hace nada; sin proveedor: pide elegirlo', async () => {
    const o = orden();
    expect(await cambiarProveedorOrden(o, 'pA', 'x@gt.com')).toBe(o);
    expect(base.update).toBeNull();
    await expect(cambiarProveedorOrden(o, '', 'x@gt.com')).rejects.toThrow(/Elige el proveedor/);
  });
});

describe('leerCambioProveedor / textoCambioProveedor', () => {
  it('formato actual: usa los nombres guardados aunque la ficha ya no exista', () => {
    const c = leerCambioProveedor({
      proveedorAnteriorId: 'pA', proveedorNuevoId: 'pB',
      proveedorAnterior: 'DISTRIBUIDORA EL TORETE', proveedorNuevo: 'FERRETERIA CENTRAL',
      motivo: 'Cambio de proveedor', aprobacionAnteriorPor: 'g@gt.com', aprobacionAnteriorEn: '2026-10-16T11:44:00Z',
    });
    expect(c.anterior).toBe('DISTRIBUIDORA EL TORETE');
    expect(c.nuevo).toBe('FERRETERIA CENTRAL');
    expect(textoCambioProveedor(c)).toBe(' · de DISTRIBUIDORA EL TORETE → FERRETERIA CENTRAL · Cambio de proveedor');
    expect(c.aprobacionAnteriorPor).toBe('g@gt.com');
  });

  it('formato antiguo: el nuevo venía en proveedorId y el motivo en nota; los nombres salen de la ficha', () => {
    const fichas: Record<string, string> = { pA: 'VIEJO C.A.', pB: 'NUEVO C.A.' };
    const c = leerCambioProveedor(
      { proveedorAnteriorId: 'pA', proveedorId: 'pB', nota: 'Cambio de proveedor al indicar método de pago' },
      (id) => fichas[id],
    );
    expect(c.nuevoId).toBe('pB');
    expect(textoCambioProveedor(c)).toBe(' · de VIEJO C.A. → NUEVO C.A. · Cambio de proveedor al indicar método de pago');
    expect(c.aprobacionAnteriorPor).toBeNull();
  });

  it('sin nombres conocidos no inventa: deja «—» o solo el motivo', () => {
    // Con un solo nombre conocido se muestra ese y «—» en el otro; sin ninguno no se inventa nada.
    expect(textoCambioProveedor(leerCambioProveedor({ proveedorAnteriorId: 'x', proveedorNuevoId: 'y', proveedorNuevo: 'NUEVO C.A.' }))).toBe(' · de — → NUEVO C.A.');
    expect(textoCambioProveedor(leerCambioProveedor({ proveedorAnteriorId: 'x', proveedorNuevoId: 'y' }))).toBe('');
    expect(textoCambioProveedor(leerCambioProveedor({ motivo: 'solo motivo' }))).toBe(' · solo motivo');
    expect(textoCambioProveedor(leerCambioProveedor({}))).toBe('');
  });
});
