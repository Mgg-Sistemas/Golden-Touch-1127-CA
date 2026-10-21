/* ============================================================
   Cambiar de proveedor al indicar el método de pago = VOLVER A COTIZAR:
     · `reabrirEleccionOferta` desde `confirmada_metodo` reabre la elección (la OC
       vuelve a «aprobada» con todas las ofertas de nuevo), exige motivo, anula la
       aprobación del Gerente y deja todo en la traza; no pisa a otro usuario;
     · cómo se lee ese evento (y el cambio directo de antes) para la línea de tiempo.
   ============================================================ */
import { beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import type { Orden } from '@/shared/lib/types';

// Base simulada: registra lo que se escribe y con qué condiciones.
const base = vi.hoisted(() => ({
  estadoVigente: 'confirmada_metodo' as string | null, // estado real en la base (null = la fila no existe)
  proveedor: { razon_social: 'DISTRIBUIDORA EL TORETE' } as { razon_social: string } | null,
  ofertasPatch: null as Record<string, unknown> | null,
  ordenPatch: null as Record<string, unknown> | null,
  filtrosOrden: [] as Array<[string, unknown]>,
  filaDevuelta: undefined as Record<string, unknown> | null | undefined, // undefined = devuelve lo actualizado
  rpc: null as { fn: string; args: Record<string, unknown> } | null,
}));

vi.mock('@/shared/lib/supabase', () => {
  function from(tabla: string) {
    let op: 'select' | 'update' = 'select';
    let patch: Record<string, unknown> | null = null;
    const filtros: Array<[string, unknown]> = [];
    const resolver = () => {
      if (tabla === 'ofertas_proveedor') { base.ofertasPatch = patch; return { data: null, error: null }; }
      if (tabla === 'proveedores') return { data: base.proveedor, error: null };
      if (op === 'select') return { data: base.estadoVigente === null ? null : { estado: base.estadoVigente }, error: null };
      base.ordenPatch = patch; base.filtrosOrden = filtros;
      return { data: base.filaDevuelta === undefined ? { ...patch } : base.filaDevuelta, error: null };
    };
    const q: Record<string, unknown> = {
      select: () => q,
      update: (p: Record<string, unknown>) => { op = 'update'; patch = p; return q; },
      eq: (c: string, v: unknown) => { filtros.push([c, v]); return q; },
      maybeSingle: async () => resolver(),
      then: (ok: (v: unknown) => unknown) => Promise.resolve(resolver()).then(ok),
    };
    return q;
  }
  return {
    supabase: {
      from,
      rpc: async (fn: string, args: Record<string, unknown>) => { base.rpc = { fn, args }; return { data: { id: 'padre', codigo: 'SP-PADRE' }, error: null }; },
    },
  };
});

import { esCambioProveedor, leerCambioProveedor, textoCambioProveedor, textoReeleccionPorCambio } from './cambioProveedor';
import { reabrirEleccionOferta } from './pedidos.repository';

const orden = (patch: Partial<Orden> = {}): Orden => ({
  id: 'o1', codigo: 'SP-2026-0001', oc_codigo: 'OC-2026-0001',
  estado: 'confirmada_metodo', proveedor_id: 'pA', total: 1000, total_moneda: 'USD',
  oc_aprobada_por: 'gerente@gt.com', oc_aprobada_en: '2026-10-16T11:44:00Z',
  items: [{ nombre: 'Saco', cantidad: 1, precio: 1000 }],
  historial: [{ at: '2026-10-15T12:00:00Z', evento: 'creada', actor: 'ana@gt.com' }],
  ...patch,
} as unknown as Orden);

beforeEach(() => {
  base.estadoVigente = 'confirmada_metodo';
  base.proveedor = { razon_social: 'DISTRIBUIDORA EL TORETE' };
  base.ofertasPatch = null; base.ordenPatch = null; base.filtrosOrden = []; base.filaDevuelta = undefined; base.rpc = null;
});

describe('reabrirEleccionOferta · cambio de proveedor desde «indicar método de pago»', () => {
  it('reabre la elección: vuelve a «aprobada», reactiva TODAS las ofertas y anula la aprobación del Gerente', async () => {
    await reabrirEleccionOferta(orden(), 'compras@gt.com', { motivo: 'El proveedor no tiene el material' });
    expect(base.ofertasPatch).toMatchObject({ estado: 'pendiente', decidida_por_email: null, decidida_en: null, motivo_descarte: null });
    expect(base.ordenPatch).toMatchObject({
      estado: 'aprobada',
      oc_creada_por: null, oc_creada_en: null,
      oc_aprobada_por: null, oc_aprobada_en: null,
    });
    // No se tocan ítems ni total (lo que se cotice de nuevo los fija al escoger la oferta).
    expect(base.ordenPatch).not.toHaveProperty('items');
    expect(base.ordenPatch).not.toHaveProperty('total');
  });

  it('exige el motivo y no escribe nada sin él', async () => {
    await expect(reabrirEleccionOferta(orden(), 'compras@gt.com')).rejects.toThrow(/motivo/);
    await expect(reabrirEleccionOferta(orden(), 'compras@gt.com', { motivo: '   ' })).rejects.toThrow(/motivo/);
    expect(base.ofertasPatch).toBeNull();
    expect(base.ordenPatch).toBeNull();
  });

  it('deja todo en la traza: motivo, proveedor anterior (con nombre), total, estado previo y la aprobación anulada', async () => {
    await reabrirEleccionOferta(orden(), 'compras@gt.com', { motivo: 'Subió el precio' });
    const historial = base.ordenPatch!.historial as Array<Record<string, unknown>>;
    expect(historial).toHaveLength(2);
    expect(historial[0].evento).toBe('creada');                 // lo anterior se conserva
    expect(historial[1]).toMatchObject({
      evento: 'eleccion_reabierta',
      actor: 'compras@gt.com',
      cambioProveedor: true,
      motivo: 'Subió el precio',
      estadoAnterior: 'confirmada_metodo',
      proveedorAnteriorId: 'pA',
      proveedorAnterior: 'DISTRIBUIDORA EL TORETE',
      totalAnterior: 1000,
      aprobacionAnteriorPor: 'gerente@gt.com',
      aprobacionAnteriorEn: '2026-10-16T11:44:00Z',
    });
    expect(typeof historial[1].at).toBe('string');
  });

  it('solo escribe si la OC sigue como se vio: se comprueba antes de reactivar ofertas', async () => {
    base.estadoVigente = 'oc_aprobada';   // otro usuario ya la mandó a pagar
    await expect(reabrirEleccionOferta(orden(), 'compras@gt.com', { motivo: 'x motivo' })).rejects.toThrow(/otro usuario/);
    expect(base.ofertasPatch).toBeNull();   // las ofertas NO quedaron reactivadas a medias
    expect(base.ordenPatch).toBeNull();
  });

  it('la actualización lleva la condición del estado (no pisa una carrera entre la comprobación y la escritura)', async () => {
    await reabrirEleccionOferta(orden(), 'compras@gt.com', { motivo: 'motivo' });
    expect(base.filtrosOrden).toContainEqual(['id', 'o1']);
    expect(base.filtrosOrden).toContainEqual(['estado', 'confirmada_metodo']);
    base.filaDevuelta = null;               // la escritura no encontró la fila en ese estado
    await expect(reabrirEleccionOferta(orden(), 'compras@gt.com', { motivo: 'motivo' })).rejects.toThrow(/otro usuario/);
  });

  it('una OC hija de un reparto vuelve a la padre y lleva el motivo', async () => {
    const r = await reabrirEleccionOferta(orden({ op_padre_id: 'padre' } as Partial<Orden>), 'compras@gt.com', { motivo: 'sin stock' });
    expect(base.rpc).toMatchObject({ fn: 'devolver_hija_a_padre', args: { p_hija_id: 'o1', p_evento: 'eleccion_reabierta', p_motivo: 'sin stock' } });
    expect((r as unknown as { codigo: string }).codigo).toBe('SP-PADRE');
    expect(base.ofertasPatch).toBeNull();   // eso lo hace la función de la base
  });

  it('en otro estado (p. ej. ya «Confirmada pagar») se rechaza sin escribir nada', async () => {
    base.estadoVigente = 'oc_aprobada';
    await expect(reabrirEleccionOferta(orden({ estado: 'oc_aprobada' }), 'x@gt.com', { motivo: 'motivo' })).rejects.toThrow(/Solo se puede reelegir/);
    expect(base.ofertasPatch).toBeNull();
    expect(base.ordenPatch).toBeNull();
  });
});

describe('reabrirEleccionOferta · reelegir de siempre (OC pendiente por aprobación)', () => {
  it('sigue igual: sin motivo, no limpia aprobación ni marca cambio de proveedor', async () => {
    base.estadoVigente = 'oc_creada';
    await reabrirEleccionOferta(orden({ estado: 'oc_creada', oc_aprobada_por: null, oc_aprobada_en: null } as Partial<Orden>), 'compras@gt.com');
    expect(base.ordenPatch).toMatchObject({ estado: 'aprobada' });
    expect(base.ordenPatch).not.toHaveProperty('oc_aprobada_por');
    const ev = (base.ordenPatch!.historial as Array<Record<string, unknown>>).at(-1)!;
    expect(ev.evento).toBe('eleccion_reabierta');
    expect(ev).not.toHaveProperty('cambioProveedor');
  });
});

describe('lectura de la traza', () => {
  it('esCambioProveedor reconoce el cambio actual y el directo de antes, y no la reelección común', () => {
    expect(esCambioProveedor({ evento: 'eleccion_reabierta', cambioProveedor: true })).toBe(true);
    expect(esCambioProveedor({ evento: 'proveedor_cambiado' })).toBe(true);
    expect(esCambioProveedor({ evento: 'eleccion_reabierta' })).toBe(false);
    expect(esCambioProveedor({ evento: 'aprobada' })).toBe(false);
  });

  it('cambio actual: proveedor anterior y motivo; la aprobación anulada sale del evento', () => {
    const c = leerCambioProveedor({
      proveedorAnteriorId: 'pA', proveedorAnterior: 'DISTRIBUIDORA EL TORETE',
      motivo: 'Subió el precio', aprobacionAnteriorPor: 'g@gt.com', aprobacionAnteriorEn: '2026-10-16T11:44:00Z',
    });
    expect(textoReeleccionPorCambio(c)).toBe(' · proveedor anterior: DISTRIBUIDORA EL TORETE · motivo: Subió el precio');
    expect(c.aprobacionAnteriorPor).toBe('g@gt.com');
  });

  it('cambio directo de antes (formato antiguo): el nuevo venía en proveedorId y el motivo en nota; nombres de la ficha', () => {
    const fichas: Record<string, string> = { pA: 'VIEJO C.A.', pB: 'NUEVO C.A.' };
    const c = leerCambioProveedor(
      { proveedorAnteriorId: 'pA', proveedorId: 'pB', nota: 'Cambio de proveedor al indicar método de pago' },
      (id) => fichas[id],
    );
    expect(c.nuevoId).toBe('pB');
    expect(textoCambioProveedor(c)).toBe(' · de VIEJO C.A. → NUEVO C.A. · Cambio de proveedor al indicar método de pago');
  });

  it('con los nombres guardados en el evento no depende de la ficha', () => {
    const c = leerCambioProveedor({ proveedorAnteriorId: 'pA', proveedorNuevoId: 'pB', proveedorAnterior: 'A S.A.', proveedorNuevo: 'B S.A.' });
    expect(textoCambioProveedor(c)).toBe(' · de A S.A. → B S.A.');
  });

  it('sin datos no inventa nada', () => {
    expect(textoReeleccionPorCambio(leerCambioProveedor({}))).toBe('');
    expect(textoCambioProveedor(leerCambioProveedor({ proveedorAnteriorId: 'x', proveedorNuevoId: 'y' }))).toBe('');
    expect(textoCambioProveedor(leerCambioProveedor({ motivo: 'solo motivo' }))).toBe(' · solo motivo');
  });
});
