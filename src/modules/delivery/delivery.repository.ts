/* ============================================================
   Golden Touch · Delivery · Repositorio (30/10/2026)

   · `sistema_interruptores` (clave `compras_delivery`): si el módulo está
     encendido. Si falla la lectura, se toma APAGADO.
   · `delivery_pedidos` + los datos de su OC (`ordenes`), del proveedor
     (`proveedores`) y del analista que montó la OC (RPC
     `delivery_contacto_analistas`: el motorizado no lee `usuarios`). Todo en
     pocos viajes (uno por tabla, por tandas), nunca uno por pedido.
   · Cada paso es un RPC de la base, que pone las reglas (si otro motorizado ya
     tomó el pedido, la base lo rechaza y el mensaje se muestra tal cual).
   · Fotos en el bucket privado `delivery-fotos/<pedido>/<recibido|entrega>/…`.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { comprimirImagen } from '@/shared/lib/comprimirImagen';
import { quienSync } from '@/shared/lib/directorioUsuarios';
import {
  INTERRUPTOR_DELIVERY, MAX_FOTOS_DELIVERY,
  type EventoDeliveryRow, type FotoDelivery, type PedidoDelivery, type PedidoDeliveryVista, type UbicacionDelivery,
} from './delivery.types';
import { estadoRetencion, type PedidoDeliveryConRetencion } from './delivery';
import { comprobantesDeLaOrden } from '@/modules/pedidos/adjuntosPago';
import { labelMetodoPago } from '@/modules/pedidos/pedidos.repository';
import type { PagoMetodo } from '@/shared/lib/types';

export type { PedidoDeliveryConRetencion, PedidoDeliveryCompleto, EstadoRetencionDelivery } from './delivery';
export type { AdjuntoPago } from '@/modules/pedidos/adjuntosPago';
/** URL firmada (10 min) de un comprobante de pago de Tesorería (bucket `compras-oc`). */
export { urlAdjuntoOc as urlComprobantePago, urlAdjuntoOc } from '@/modules/pedidos/pedidos.repository';

const BUCKET = 'delivery-fotos';
/** Tamaño de cada tanda de `.in(...)` (que la URL no se haga larga). */
const TANDA = 100;

export type MomentoFoto = 'recibido' | 'entrega';

const errorDe = (e: { message?: string } | null | undefined, porDefecto: string) =>
  new Error(String(e?.message ?? '').trim() || porDefecto);

function enTandas<T>(lista: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < lista.length; i += TANDA) out.push(lista.slice(i, i + TANDA));
  return out;
}

const fotos = (v: unknown): FotoDelivery[] =>
  Array.isArray(v) ? (v as FotoDelivery[]).filter((f) => f && typeof f.path === 'string') : [];

/** Fila de `delivery_pedidos` con las listas y números asegurados. */
export function normalizarPedido(r: Record<string, unknown>): PedidoDelivery {
  const p = r as unknown as PedidoDelivery;
  return {
    ...p,
    fotos_recibido: fotos(r.fotos_recibido),
    fotos_entrega: fotos(r.fotos_entrega),
    cancelaciones: Number(p.cancelaciones) || 0,
  };
}

/** Día de Venezuela (YYYY-MM-DD) → instante de inicio / fin (Caracas es UTC-4 todo el año). */
const inicioDiaVE = (d: string) => `${d}T00:00:00-04:00`;
const finDiaVE = (d: string) => `${d}T23:59:59.999-04:00`;

/* ───────────── Interruptor ───────────── */

/** ¿Está encendido Delivery? Cualquier falla = apagado. */
export async function deliveryActivo(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('sistema_interruptores')
      .select('activo')
      .eq('clave', INTERRUPTOR_DELIVERY)
      .maybeSingle();
    if (error || !data) return false;
    return (data as { activo?: unknown }).activo === true;
  } catch {
    return false;
  }
}

/* ───────────── Lecturas ───────────── */

interface FilaOrden {
  id: string;
  codigo: string;
  oc_codigo: string | null;
  total: number | null;
  total_moneda: string | null;
  urgente: boolean | null;
  notas: string | null;
  unidad_solicitante: string | null;
  items: unknown;
  pagada_en: string | null;
  oc_creada_por: string | null;
  oc_emitida_por: string | null;
  proveedor_id: string | null;
  retencion_finalizada: boolean | null;
  comprobante_tipo: string | null;
  comprobantes_pago: { path: string; nombre: string }[] | null;
  factura_path: string | null;
  factura_nombre: string | null;
  pagada_por: string | null;
  metodo_pago: PagoMetodo[] | null;
}

interface FilaProveedor { id: string; razon_social: string | null; rif: string | null; telefono: string | null; direccion: string | null }
interface FilaAnalista { email: string | null; nombre: string | null; telefono: string | null }

const COLS_ORDEN = 'id, codigo, oc_codigo, total, total_moneda, urgente, notas, unidad_solicitante, items, pagada_en, '
  + 'oc_creada_por, oc_emitida_por, proveedor_id, retencion_finalizada, comprobante_tipo, '
  + 'comprobantes_pago, factura_path, factura_nombre, pagada_por, metodo_pago';

/** «Pago móvil + Efectivo $» a partir de las patas del pago. */
function textoMetodos(m: unknown): string {
  const patas = Array.isArray(m) ? (m as PagoMetodo[]) : [];
  return [...new Set(patas.map((x) => labelMetodoPago(x?.metodo)).filter((x) => x && x !== '—'))].join(' + ');
}

async function ordenesDe(ids: string[]): Promise<Map<string, FilaOrden>> {
  const m = new Map<string, FilaOrden>();
  for (const t of enTandas(ids)) {
    const { data, error } = await supabase.from('ordenes').select(COLS_ORDEN).in('id', t);
    if (error) throw errorDe(error, 'No se pudieron leer las órdenes de compra.');
    for (const o of (data ?? []) as unknown as FilaOrden[]) m.set(o.id, o);
  }
  return m;
}

async function proveedoresDe(ids: string[]): Promise<Map<string, FilaProveedor>> {
  const m = new Map<string, FilaProveedor>();
  for (const t of enTandas(ids)) {
    const { data, error } = await supabase.from('proveedores').select('id, razon_social, rif, telefono, direccion').in('id', t);
    if (error) throw errorDe(error, 'No se pudieron leer los proveedores.');
    for (const p of (data ?? []) as FilaProveedor[]) m.set(p.id, p);
  }
  return m;
}

/** Nombre y teléfono de los analistas (RPC: el motorizado no puede leer `usuarios`). Si falla, sin teléfono. */
async function analistasDe(emails: string[]): Promise<Map<string, FilaAnalista>> {
  const m = new Map<string, FilaAnalista>();
  if (!emails.length) return m;
  try {
    const { data, error } = await supabase.rpc('delivery_contacto_analistas', { p_emails: emails });
    if (error) return m;
    for (const a of (data ?? []) as FilaAnalista[]) if (a.email) m.set(a.email.trim().toLowerCase(), a);
  } catch {
    /* sin contacto: se muestra el nombre del directorio y no se ofrece llamar */
  }
  return m;
}

const itemsDe = (v: unknown): PedidoDeliveryVista['orden']['items'] =>
  (Array.isArray(v) ? v : [])
    .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
    .map((i) => ({
      nombre: String(i.nombre ?? i.descripcion ?? '').trim() || 'Sin nombre',
      cantidad: Number(i.cantidad) || 0,
      unidad: (i.unidad as string | null | undefined) ?? null,
      ...(typeof i.comprar === 'boolean' ? { comprar: i.comprar } : {}),
    }));

/**
 * Los pedidos de Delivery con lo de su OC, proveedor y analista. Sin rango, todos
 * (los más recientes primero); con `desde`/`hasta` (YYYY-MM-DD, hora de Venezuela)
 * los que ENTRARON a Delivery en esos días.
 */
export async function listPedidosDelivery(f: { desde?: string | null; hasta?: string | null } = {}): Promise<PedidoDeliveryConRetencion[]> {
  let q = supabase.from('delivery_pedidos').select('*').order('created_at', { ascending: false }).limit(2000);
  if (f.desde) q = q.gte('created_at', inicioDiaVE(f.desde));
  if (f.hasta) q = q.lte('created_at', finDiaVE(f.hasta));
  const { data, error } = await q;
  if (error) throw errorDe(error, 'No se pudieron leer los pedidos de Delivery.');
  const pedidos = ((data ?? []) as Record<string, unknown>[]).map(normalizarPedido);
  if (!pedidos.length) return [];

  const ordenes = await ordenesDe([...new Set(pedidos.map((p) => p.orden_id))]);
  const provIds = [...new Set([...ordenes.values()].map((o) => o.proveedor_id).filter((x): x is string => !!x))];
  const correos = [...new Set([...ordenes.values()]
    .map((o) => (o.oc_creada_por || o.oc_emitida_por || '').trim().toLowerCase())
    .filter((x) => x.includes('@')))];
  const [proveedores, analistas] = await Promise.all([proveedoresDe(provIds), analistasDe(correos)]);

  return pedidos.map((p) => {
    const o = ordenes.get(p.orden_id);
    const analistaEmail = (o?.oc_creada_por || o?.oc_emitida_por || '').trim() || null;
    const a = analistaEmail ? analistas.get(analistaEmail.toLowerCase()) : undefined;
    const pr = o?.proveedor_id ? proveedores.get(o.proveedor_id) : undefined;
    const nombreAnalista = a?.nombre?.trim() || (analistaEmail ? quienSync(null, analistaEmail) : '') || null;
    return {
      ...p,
      orden: {
        id: p.orden_id,
        codigo: o?.codigo ?? '',
        oc_codigo: o?.oc_codigo ?? null,
        total: Number(o?.total) || 0,
        total_moneda: o?.total_moneda ?? null,
        urgente: o?.urgente ?? null,
        notas: o?.notas ?? null,
        unidad_solicitante: o?.unidad_solicitante ?? null,
        items: itemsDe(o?.items),
        pagada_en: o?.pagada_en ?? null,
        analista_email: analistaEmail,
        retencion: estadoRetencion(o ?? {}),
        pagada_por: o?.pagada_por ? (quienSync(o.pagada_por, o.pagada_por) || o.pagada_por) : null,
        pagada_por_email: o?.pagada_por?.includes('@') ? o.pagada_por : null,
        metodo_pago: Array.isArray(o?.metodo_pago) ? o.metodo_pago : [],
        metodo_pago_texto: textoMetodos(o?.metodo_pago),
      },
      // Lo que adjuntó Tesorería al pagar: el motorizado verifica que de verdad se pagó.
      comprobantesPago: o ? comprobantesDeLaOrden({
        comprobantes_pago: Array.isArray(o.comprobantes_pago) ? o.comprobantes_pago : null,
        factura_path: o.factura_path, factura_nombre: o.factura_nombre,
        retencion_path: null, retencion_nombre: null, factura_recepcion_path: null, factura_recepcion_nombre: null,
      }) : [],
      proveedor: pr ? { razon_social: pr.razon_social, rif: pr.rif, telefono: pr.telefono, direccion: pr.direccion } : null,
      analista: analistaEmail ? { nombre: nombreAnalista, telefono: a?.telefono?.trim() || null } : null,
    };
  });
}

/** El historial de los pedidos indicados (o el de todos), lo más reciente primero. */
export async function listEventosDelivery(pedidoIds?: string[]): Promise<EventoDeliveryRow[]> {
  const leer = async (ids?: string[]) => {
    let q = supabase.from('delivery_eventos').select('*').order('at', { ascending: false });
    q = ids ? q.in('pedido_id', ids) : q.limit(5000);
    const { data, error } = await q;
    if (error) throw errorDe(error, 'No se pudo leer el historial de Delivery.');
    return (data ?? []) as EventoDeliveryRow[];
  };
  if (!pedidoIds) return leer();
  const ids = [...new Set(pedidoIds.filter(Boolean))];
  if (!ids.length) return [];
  const partes = await Promise.all(enTandas(ids).map((t) => leer(t)));
  return partes.flat().sort((a, b) => b.at.localeCompare(a.at));
}

/** Última posición de cada motorizado (solo admin y quien lee Delivery). */
export async function listUbicaciones(): Promise<UbicacionDelivery[]> {
  const { data, error } = await supabase.from('delivery_ubicaciones').select('*').order('updated_at', { ascending: false });
  if (error) throw errorDe(error, 'No se pudieron leer las ubicaciones.');
  return ((data ?? []) as UbicacionDelivery[]).map((u) => ({
    ...u, lat: Number(u.lat), lng: Number(u.lng), precision_m: u.precision_m == null ? null : Number(u.precision_m),
  }));
}

/* ───────────── Pasos (RPC) ───────────── */

async function rpcPedido(fn: string, args: Record<string, unknown>, porDefecto: string): Promise<PedidoDelivery> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw errorDe(error, porDefecto);
  const fila = Array.isArray(data) ? data[0] : data;
  return normalizarPedido((fila ?? {}) as Record<string, unknown>);
}

const coord = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : n);

/** ✋ Aceptar: queda a nombre de quien lo toma. Si otro ya lo tomó, la base lo rechaza. */
export function aceptarPedido(pedidoId: string, lat?: number | null, lng?: number | null): Promise<PedidoDelivery> {
  return rpcPedido('delivery_aceptar', { p_pedido_id: pedidoId, p_lat: coord(lat), p_lng: coord(lng) }, 'No se pudo aceptar el pedido.');
}

/** ⚠ No puedo buscarlo: vuelve a «Por tomar» con el motivo. */
export function cancelarPedido(pedidoId: string, motivo: string, detalle?: string | null): Promise<PedidoDelivery> {
  return rpcPedido('delivery_cancelar', {
    p_pedido_id: pedidoId, p_motivo: motivo.trim(), p_detalle: detalle?.trim() || null,
  }, 'No se pudo cancelar el pedido.');
}

/** 🚚 Lo recibió del proveedor y va en ruta (con las fotos al recibir). */
export function marcarEnRuta(pedidoId: string, fotosRecibido: FotoDelivery[], lat?: number | null, lng?: number | null): Promise<PedidoDelivery> {
  return rpcPedido('delivery_en_ruta', {
    p_pedido_id: pedidoId, p_fotos: fotosRecibido ?? [], p_lat: coord(lat), p_lng: coord(lng),
  }, 'No se pudo marcar el pedido en ruta.');
}

/** ✅ Entregado en el almacén (con las fotos al entregar y una nota). */
export function marcarEntregado(
  pedidoId: string, fotosEntrega: FotoDelivery[], nota?: string | null, lat?: number | null, lng?: number | null,
): Promise<PedidoDelivery> {
  return rpcPedido('delivery_entregar', {
    p_pedido_id: pedidoId, p_fotos: fotosEntrega ?? [], p_nota: nota?.trim() || null, p_lat: coord(lat), p_lng: coord(lng),
  }, 'No se pudo marcar el pedido como entregado.');
}

/** 📷 Agregar fotos a un momento (recibido / entrega). */
export function adjuntarFotos(pedidoId: string, momento: MomentoFoto, nuevas: FotoDelivery[]): Promise<PedidoDelivery> {
  return rpcPedido('delivery_adjuntar_fotos', { p_pedido_id: pedidoId, p_momento: momento, p_fotos: nuevas ?? [] }, 'No se pudieron agregar las fotos.');
}

/** Solo administración: el pedido vuelve a «Por tomar». */
export function reabrirPedido(pedidoId: string): Promise<PedidoDelivery> {
  return rpcPedido('delivery_reabrir', { p_pedido_id: pedidoId }, 'No se pudo reabrir el pedido.');
}

/** 📍 La posición del motorizado (la PC la ve en el mapa). Devuelve su fila de `delivery_ubicaciones`. */
export async function actualizarUbicacion(
  lat: number, lng: number, precision?: number | null, pedidoId?: string | null,
): Promise<UbicacionDelivery | null> {
  const { data, error } = await supabase.rpc('delivery_actualizar_ubicacion', {
    p_lat: lat, p_lng: lng, p_precision: coord(precision), p_pedido_id: pedidoId || null,
  });
  if (error) throw errorDe(error, 'No se pudo enviar la ubicación.');
  const fila = Array.isArray(data) ? data[0] : data;
  return (fila ?? null) as UbicacionDelivery | null;
}

/* ───────────── Fotos ───────────── */

const seguro = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80) || 'foto.jpg';

/** Hasta MAX_FOTOS_DELIVERY y solo imágenes. `null` = se puede. */
export function errorFotosDelivery(archivos: { name: string; type: string }[], yaHay = 0): string | null {
  if (yaHay + archivos.length > MAX_FOTOS_DELIVERY) return `Se pueden adjuntar hasta ${MAX_FOTOS_DELIVERY} fotos.`;
  const mala = archivos.find((f) => !/^image\//.test(f.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name));
  return mala ? `«${mala.name}» no es una imagen.` : null;
}

/**
 * Sube las fotos (comprimidas) a `delivery-fotos/<pedido>/<momento>/<ts>-<nombre>` y
 * devuelve lo guardado. No las anota en el pedido: eso lo hace el RPC del paso
 * (`marcarEnRuta`, `marcarEntregado` o `adjuntarFotos`).
 */
export async function subirFotosDelivery(pedidoId: string, momento: MomentoFoto, archivos: File[]): Promise<FotoDelivery[]> {
  const mal = errorFotosDelivery(archivos);
  if (mal) throw new Error(mal);
  const base = Date.now();
  return Promise.all(archivos.map(async (original, i) => {
    const f = await comprimirImagen(original, { maximo: 1400, calidad: 0.78 }).catch(() => original);
    const path = `${pedidoId}/${momento}/${base + i}-${seguro(f.name)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, f, { upsert: false, contentType: f.type || 'image/jpeg' });
    if (error) throw new Error(`No se pudo subir «${original.name}»: ${error.message}`);
    return { path, nombre: original.name };
  }));
}

/** URL firmada (10 min) de una foto. */
export async function urlFotoDelivery(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  if (error || !data) throw new Error('No se pudo abrir la foto.');
  return data.signedUrl;
}
