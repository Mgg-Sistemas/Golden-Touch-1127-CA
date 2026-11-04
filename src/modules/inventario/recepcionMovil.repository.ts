/* ============================================================
   Golden Touch · Inventario (teléfono) · Recepción del delivery (base) — 04/11/2026
   Ver recepcionMovil.ts y supabase/2026-11-04-delivery-recepcion-almacenista.sql.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { PorRecepcionar, RecepcionDetallada } from './recepcionMovil';
import type { Recepcion } from './recepcionesHistorico';

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
  return ((Array.isArray(data) ? data : []) as PorRecepcionar[]).map((p) => ({
    ...p,
    items: Array.isArray(p.items) ? p.items : [],
    fotos_recibo: Array.isArray(p.fotos_recibo) ? p.fotos_recibo : [],
    fotos_entrega: Array.isArray(p.fotos_entrega) ? p.fotos_entrega : [],
  }));
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

/** Los nombres de una recepción del histórico (productos y proveedor) para su PDF y su WhatsApp. */
export async function detallarRecepcion(r: Recepcion): Promise<RecepcionDetallada> {
  const ids = Array.from(new Set(r.items.map((it) => it.producto_id)));
  const [prods, prov] = await Promise.all([
    ids.length ? supabase.from('productos').select('id, nombre, sku, unidad').in('id', ids) : Promise.resolve({ data: [] as unknown[] }),
    r.proveedor_id ? supabase.from('proveedores').select('razon_social').eq('id', r.proveedor_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const porId = new Map(((prods.data ?? []) as Array<{ id: string; nombre: string; sku: string; unidad: string }>).map((p) => [p.id, p]));
  return {
    r,
    proveedor: ((prov.data as { razon_social?: string } | null)?.razon_social ?? '').trim() || null,
    items: r.items.map((it) => {
      const p = porId.get(it.producto_id);
      return { producto_id: it.producto_id, nombre: p?.nombre ?? 'Producto', sku: p?.sku ?? null, unidad: p?.unidad ?? null, cantidad: it.cantidad, precio: it.precio };
    }),
  };
}
