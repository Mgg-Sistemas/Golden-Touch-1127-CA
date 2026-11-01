/* ============================================================
   Golden Touch · Delivery · acceso a datos (31/10/2026 · igual que MGG)
   Todo pasa por las funciones de supabase/2026-10-31-delivery-igual-mgg.sql:
   la base decide quién puede tomar (solo uno por OC), avanzar y subir fotos.

   Adaptaciones de GT respecto de MGG:
   · el interruptor es `sistema_interruptores` (clave compras_delivery), se
     lee con src/shared/lib/interruptores.ts;
   · el comprobante de pago sale de la OC (comprobantes_pago / factura_path)
     con comprobantesDeLaOrden(), como en Compras de GT;
   · la moneda de la OC es `total_moneda`.
   ============================================================ */
import { useEffect, useState } from 'react';
import { supabase } from '@/shared/lib/supabase';
import { comprimirImagen } from '@/shared/lib/comprimirImagen';
import { interruptorActivo } from '@/shared/lib/interruptores';
import { useRealtime } from '@/shared/lib/useRealtime';
import { comprobantesDeLaOrden } from '@/modules/pedidos/adjuntosPago';
import { labelMetodoPago, urlAdjuntoOc } from '@/modules/pedidos/pedidos.repository';
import type { PagoMetodo } from '@/shared/lib/types';
import {
  INTERRUPTOR_DELIVERY, MAX_FOTOS_DELIVERY, type FotoDelivery, type PedidoDelivery, type UbicacionDelivery,
} from './delivery';

const BUCKET = 'delivery-fotos';

function err(e: { message?: string } | null | unknown, porDefecto: string): Error {
  const m = String((e as { message?: string } | null)?.message ?? '').trim();
  if (/permission denied|row-level security/i.test(m)) return new Error('No tienes permiso en Delivery.');
  return new Error(m || porDefecto);
}

function normalizar(r: Record<string, unknown>): PedidoDelivery {
  const p = r as unknown as PedidoDelivery;
  return {
    ...p,
    total: Number(p.total) || 0,
    items: Array.isArray(r.items) ? (r.items as PedidoDelivery['items']) : [],
    fotos_recibo: Array.isArray(r.fotos_recibo) ? (r.fotos_recibo as FotoDelivery[]) : [],
    fotos_entrega: Array.isArray(r.fotos_entrega) ? (r.fotos_entrega as FotoDelivery[]) : [],
    historial: Array.isArray(r.historial) ? (r.historial as PedidoDelivery['historial']) : [],
  };
}

/** ¿Está conectado Delivery a Compras? (interruptor compras_delivery). Apagado = el módulo abre pero no llegan OC. */
export function deliveryConectado(): Promise<boolean> {
  return interruptorActivo(INTERRUPTOR_DELIVERY);
}

/** `null` mientras carga (para no mostrar el aviso de «no conectado» de entrada); se actualiza en vivo. */
export function useDeliveryConectado(): boolean | null {
  const [v, setV] = useState<boolean | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivo = true;
    void deliveryConectado().then((x) => { if (vivo) setV(x); });
    return () => { vivo = false; };
  }, [n]);
  useRealtime(['sistema_interruptores'], () => setN((x) => x + 1));
  return v;
}

/**
 * Los pedidos: los disponibles (OC pagadas sin tomar), los en curso y,
 * con `incluirCerrados`, los entregados y cancelados (histórico).
 */
export async function listPedidosDelivery(incluirCerrados = false): Promise<PedidoDelivery[]> {
  const { data, error } = await supabase.rpc('delivery_pedidos_listado', { p_incluir_cerrados: incluirCerrados });
  if (error) throw err(error, 'No se pudieron leer los pedidos.');
  return ((data ?? []) as Record<string, unknown>[]).map(normalizar);
}

/** Tomar el pedido. Si otro delivery lo tomó primero, la base lo rechaza con su nombre. */
export async function tomarPedido(ordenId: string): Promise<void> {
  const { error } = await supabase.rpc('delivery_tomar', { p_orden_id: ordenId });
  if (error) throw err(error, 'No se pudo tomar el pedido.');
}

export async function marcarEnRuta(pedidoId: string): Promise<void> {
  const { error } = await supabase.rpc('delivery_avanzar', { p_pedido_id: pedidoId, p_estado: 'en_ruta' });
  if (error) throw err(error, 'No se pudo marcar en ruta.');
}

export async function marcarEntregado(pedidoId: string, almacen: string, nota?: string | null): Promise<void> {
  const { error } = await supabase.rpc('delivery_avanzar', {
    p_pedido_id: pedidoId, p_estado: 'entregado', p_almacen: almacen, p_nota: nota ?? null,
  });
  if (error) throw err(error, 'No se pudo marcar la entrega.');
}

export async function cancelarPedido(pedidoId: string, motivo: string, detalle?: string | null): Promise<void> {
  const { error } = await supabase.rpc('delivery_avanzar', {
    p_pedido_id: pedidoId, p_estado: 'cancelado', p_motivo: motivo, p_detalle: detalle ?? null,
  });
  if (error) throw err(error, 'No se pudo cancelar el pedido.');
}

const seguro = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80);

/** Sube fotos (comprimidas) al recibir del proveedor ('recibo') o al entregar ('entrega'). */
export async function subirFotosDelivery(
  pedidoId: string, tipo: 'recibo' | 'entrega', actuales: FotoDelivery[], archivos: File[],
): Promise<FotoDelivery[]> {
  if (actuales.length + archivos.length > MAX_FOTOS_DELIVERY) throw new Error(`Se pueden adjuntar hasta ${MAX_FOTOS_DELIVERY} fotos.`);
  const nuevas = await Promise.all(archivos.map(async (original) => {
    const f = await comprimirImagen(original).catch(() => original);
    const path = `${pedidoId}/${tipo}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${seguro(f.name)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, f, { upsert: false, contentType: f.type || 'image/jpeg' });
    if (error) throw new Error(`No se pudo subir «${original.name}»: ${error.message}`);
    return { path, filename: original.name };
  }));
  const fotos = [...actuales, ...nuevas];
  const { error } = await supabase.rpc('delivery_fotos', { p_pedido_id: pedidoId, p_tipo: tipo, p_fotos: fotos });
  if (error) throw err(error, 'No se pudieron anotar las fotos.');
  return fotos;
}

export async function urlFotoDelivery(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  if (error) throw new Error('No se pudo abrir la foto.');
  return data.signedUrl;
}

/** El motorizado comparte dónde está (se llama al cambiar la posición, con límite de frecuencia). */
export async function compartirUbicacion(
  pos: { lat: number; lng: number; precision?: number | null; velocidad?: number | null; rumbo?: number | null },
  pedidoId?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('delivery_ubicar', {
    p_lat: pos.lat, p_lng: pos.lng, p_precision: pos.precision ?? null,
    p_velocidad: pos.velocidad ?? null, p_rumbo: pos.rumbo ?? null, p_pedido_id: pedidoId ?? null,
  });
  if (error) throw err(error, 'No se pudo compartir la ubicación.');
}

export async function listUbicaciones(): Promise<UbicacionDelivery[]> {
  const { data, error } = await supabase.from('delivery_ubicaciones').select('*').order('actualizado_en', { ascending: false });
  if (error) throw err(error, 'No se pudieron leer las ubicaciones.');
  return ((data ?? []) as UbicacionDelivery[]).map((u) => ({ ...u, lat: Number(u.lat), lng: Number(u.lng) }));
}

/** Fila cruda del histórico (cada toma, incluidas las canceladas aunque la OC se haya retomado). */
export interface FilaHistorialCruda {
  id: string; orden_id: string; estado: string; repartidor_nombre: string | null; repartidor_email: string | null;
  aceptado_en: string; en_ruta_en: string | null; entregado_en: string | null; cancelado_en: string | null;
  motivo_cancel: string | null; almacen_entrega: string | null;
  /** GT: también nota y cantidad de fotos, para el reporte. */
  nota_entrega?: string | null; fotos_recibo?: unknown; fotos_entrega?: unknown;
  orden: { oc_codigo: string | null; codigo: string; total: number; moneda: string | null; proveedor_id: string | null } | null;
}

/** Histórico directo de la tabla (incluye cada cancelación aunque la OC se haya retomado). */
export async function listHistorialDelivery(desde: string, hasta: string): Promise<FilaHistorialCruda[]> {
  const { data, error } = await supabase.from('delivery_pedidos')
    .select('id, orden_id, estado, repartidor_nombre, repartidor_email, aceptado_en, en_ruta_en, entregado_en, cancelado_en, motivo_cancel, almacen_entrega, nota_entrega, fotos_recibo, fotos_entrega, orden:ordenes(oc_codigo, codigo, total, moneda:total_moneda, proveedor_id)')
    .gte('aceptado_en', `${desde}T00:00:00-04:00`).lte('aceptado_en', `${hasta}T23:59:59.999-04:00`)
    .order('aceptado_en', { ascending: false });
  if (error) throw err(error, 'No se pudo leer el histórico.');
  return (data ?? []) as unknown as FilaHistorialCruda[];
}

export interface ArchivoComprobanteDelivery { url: string; nombre: string; etiqueta: string; esPdf: boolean }

export interface ComprobantePagoDelivery {
  archivos: ArchivoComprobanteDelivery[];
  pagadaEn: string | null;
  pagos: Array<{ monto: number; moneda: string; metodo: string }>;
  total: number;
  moneda: string;
}

/**
 * Lo que adjuntó Tesorería al pagar la OC, para que el delivery verifique que
 * de verdad se pagó. GT: los comprobantes están en la OC (comprobantes_pago, o
 * factura_path en las viejas). `archivos` vacío si Tesorería no adjuntó nada
 * (p. ej. efectivo).
 */
export async function comprobantePagoDelivery(ordenId: string): Promise<ComprobantePagoDelivery> {
  const { data, error } = await supabase.rpc('delivery_comprobante_pago', { p_orden_id: ordenId });
  if (error) throw err(error, 'No se pudo leer el pago de la orden.');
  const o = (data ?? {}) as {
    pagada_en?: string | null; total?: number | null; total_moneda?: string | null;
    comprobantes_pago?: { path: string; nombre: string }[] | null; factura_path?: string | null; factura_nombre?: string | null;
    metodo_pago?: PagoMetodo[] | null;
  };
  const refs = comprobantesDeLaOrden({
    comprobantes_pago: Array.isArray(o.comprobantes_pago) ? o.comprobantes_pago : null,
    factura_path: o.factura_path ?? null, factura_nombre: o.factura_nombre ?? null,
    retencion_path: null, retencion_nombre: null, factura_recepcion_path: null, factura_recepcion_nombre: null,
  });
  const archivos = await Promise.all(refs.map(async (r) => {
    const url = await urlAdjuntoOc(r.path).catch(() => '');
    return { url, nombre: r.nombre, etiqueta: r.etiqueta, esPdf: /\.pdf$/i.test(r.path) };
  }));
  const pagos = (Array.isArray(o.metodo_pago) ? o.metodo_pago : [])
    .map((p) => ({ monto: Number(p?.monto) || 0, moneda: p?.moneda ?? '', metodo: labelMetodoPago(p?.metodo) }));
  return {
    archivos: archivos.filter((a) => a.url),
    pagadaEn: o.pagada_en ?? null,
    pagos,
    total: Number(o.total) || 0,
    moneda: o.total_moneda || 'USD',
  };
}
