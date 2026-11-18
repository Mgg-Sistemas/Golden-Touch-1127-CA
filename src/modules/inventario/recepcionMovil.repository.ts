/* ============================================================
   Golden Touch · Inventario (teléfono) · Recepción del delivery (base) — 04/11/2026
   Ver recepcionMovil.ts y supabase/2026-11-04-delivery-recepcion-almacenista.sql.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { comprimirImagen } from '@/shared/lib/comprimirImagen';
import { agregarAdjuntoDirecto } from '@/modules/pedidos/adjuntosDirectos.repository';
import type { Orden } from '@/shared/lib/types';
import type { PorRecepcionar, RecepcionDetallada } from './recepcionMovil';
import type { Recepcion } from './recepcionesHistorico';
import {
  fechaMontadaOrden,
  fechaPagoTesoreriaOrden,
  resolverAnalistaCompraDirecta,
  resolverAnalistaOrden,
} from './pendientesRecepcionReporte';

const BUCKET = 'delivery-fotos';

function err(e: { message?: string } | null, d: string): Error {
  const m = String(e?.message ?? '').trim();
  if (/permission denied|row-level security/i.test(m)) return new Error('No tienes permiso de escritura en Inventario.');
  return new Error(m || d);
}

/** Las OC que el delivery entregó y faltan por recepcionar (la más vieja primero). */
export async function listPorRecepcionar(): Promise<PorRecepcionar[]> {
  const { data, error } = await supabase.rpc('delivery_por_recepcionar');
  if (error) throw err(error, 'No se pudo leer lo que falta por recepcionar.');
  const base = ((Array.isArray(data) ? data : []) as PorRecepcionar[]).map((p) => ({
    ...p,
    items: Array.isArray(p.items) ? p.items : [],
    fotos_recibo: Array.isArray(p.fotos_recibo) ? p.fotos_recibo : [],
    fotos_entrega: Array.isArray(p.fotos_entrega) ? p.fotos_entrega : [],
    fotos_factura: Array.isArray(p.fotos_factura) ? p.fotos_factura : [],
  }));
  const ordenIds = Array.from(new Set(base.map((p) => p.orden_id).filter(Boolean)));
  if (!ordenIds.length) return base;
  const { data: ords } = await supabase
    .from('ordenes')
    .select('id, created_at, oc_creada_en, oc_emitida_en, pagada_en, oc_creada_por, oc_emitida_por, metodo_pago_por, aprobada_por, historial')
    .in('id', ordenIds);
  const mapOrd = new Map<string, Partial<Orden>>();
  for (const o of (ords ?? []) as Partial<Orden>[]) {
    if (o.id) mapOrd.set(o.id, o);
  }
  return base.map((p) => {
    const o = mapOrd.get(p.orden_id);
    if (!o) return p;
    return {
      ...p,
      analista: resolverAnalistaOrden(o as Orden) || p.analista,
      fecha_montada: fechaMontadaOrden(o as Orden),
      fecha_pago_tesoreria: fechaPagoTesoreriaOrden(o as Orden),
    };
  });
}

/**
 * 11/11/2026 · El almacenista carga la factura al recepcionar (FACTURAS ALMACÉN en Compras).
 * Va a adjuntos_directos 'orden_factura' (las fotos se achican antes de subir).
 */
export async function subirFacturasAlmacen(ordenId: string, archivos: File[], actor: string): Promise<void> {
  for (const original of archivos) {
    const f = original.type.startsWith('image/') ? await comprimirImagen(original).catch(() => original) : original;
    await agregarAdjuntoDirecto('orden_factura', ordenId, f, actor);
  }
}

/** Recepciona: suma al inventario lo que llegó y marca la OC recibida en Compras. */
export async function recepcionarPedido(pedidoId: string, cantidades: number[], nota?: string | null): Promise<{ resultado: string; at: string; recepcionado_nombre: string | null }> {
  const { data, error } = await supabase.rpc('delivery_recepcionar', {
    p_pedido_id: pedidoId, p_cants: cantidades, p_nota: nota?.trim() || null,
  });
  if (error) throw err(error, 'No se pudo recepcionar.');
  return data as { resultado: string; at: string; recepcionado_nombre: string | null };
}

export async function urlFotoRecepcion(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  if (error) throw new Error('No se pudo abrir la foto.');
  return data.signedUrl;
}

/** Baja las fotos del delivery como archivos, para mandarlas por WhatsApp. */
export async function descargarFotosRecepcion(fotos: { path: string; filename: string }[]): Promise<File[]> {
  const out = await Promise.all(fotos.map(async (f) => {
    try {
      const resp = await fetch(await urlFotoRecepcion(f.path));
      if (!resp.ok) return null;
      const blob = await resp.blob();
      return new File([blob], f.filename || f.path.split('/').pop() || 'foto.jpg', { type: blob.type?.startsWith('image/') ? blob.type : 'image/jpeg' });
    } catch { return null; }
  }));
  return out.filter((f): f is File => !!f);
}

/** Los nombres de una recepción del histórico (productos, proveedor, analista y fechas) para su PDF y su WhatsApp. */
export async function detallarRecepcion(r: Recepcion): Promise<RecepcionDetallada> {
  const ids = Array.from(new Set(r.items.map((it) => it.producto_id)));
  const [prods, prov, ordRes, cdRes] = await Promise.all([
    ids.length ? supabase.from('productos').select('id, nombre, sku, unidad').in('id', ids) : Promise.resolve({ data: [] as unknown[] }),
    r.proveedor_id ? supabase.from('proveedores').select('razon_social').eq('id', r.proveedor_id).maybeSingle() : Promise.resolve({ data: null }),
    r.ref_id
      ? supabase
          .from('ordenes')
          .select('id, created_at, oc_creada_en, oc_emitida_en, pagada_en, oc_creada_por, oc_emitida_por, metodo_pago_por, aprobada_por, historial')
          .eq('id', r.ref_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    r.ref_id
      ? supabase
          .from('compras_directas')
          .select('id, actor, actor_name, created_at, enviada_pagar_at, pagada_at')
          .eq('id', r.ref_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const porId = new Map(((prods.data ?? []) as Array<{ id: string; nombre: string; sku: string; unidad: string }>).map((p) => [p.id, p]));
  const ord = ordRes.data as Partial<Orden> | null;
  const cd = cdRes.data as { actor?: string | null; actor_name?: string | null; created_at?: string; enviada_pagar_at?: string | null; pagada_at?: string | null } | null;

  let analista: string | null = null;
  let fecha_montada: string | null = null;
  let fecha_pago_tesoreria: string | null = null;
  if (ord?.id) {
    analista = resolverAnalistaOrden(ord as Orden);
    fecha_montada = fechaMontadaOrden(ord as Orden);
    fecha_pago_tesoreria = fechaPagoTesoreriaOrden(ord as Orden);
  } else if (cd) {
    analista = resolverAnalistaCompraDirecta({ actor: cd.actor ?? null, actor_name: cd.actor_name ?? null });
    fecha_montada = cd.enviada_pagar_at ?? cd.created_at ?? null;
    fecha_pago_tesoreria = cd.pagada_at ?? null;
  }

  return {
    r,
    proveedor: ((prov.data as { razon_social?: string } | null)?.razon_social ?? '').trim() || null,
    analista,
    fecha_montada,
    fecha_pago_tesoreria,
    items: r.items.map((it) => {
      const p = porId.get(it.producto_id);
      return { producto_id: it.producto_id, nombre: p?.nombre ?? 'Producto', sku: p?.sku ?? null, unidad: p?.unidad ?? null, cantidad: it.cantidad, precio: it.precio };
    }),
  };
}
