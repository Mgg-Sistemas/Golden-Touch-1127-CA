/* ============================================================
   Golden Touch · Solicitudes de Pedido · Repositorio (29/10/2026)

   Lee y escribe lo de la revisión de Almacén:
   · `sistema_interruptores` (clave `compras_revision_almacen`): si el flujo está
     encendido. Si la tabla todavía no existe o falla la lectura, se toma APAGADO
     y Compras sigue como siempre.
   · `ordenes` en estado `revision_almacen` + su fila en `solicitudes_revision_almacen`.
   · Existencias de Los Pinos (`productos.stock` del General) y, por nombre, del Depósito Mina.
   · RPC `almacen_revisar_solicitud` / `almacen_devolver_a_revision`.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { mensajeError } from '@/shared/lib/errores';
import { buscarProductosParecidos, type ProductoParecido } from '@/modules/inventario/inventario.repository';
import { ALMACEN_MINA, esDelDeposito } from '@/modules/inventario/depositos';
import { claveNombreProducto, type RenglonSP, type RevisionRenglon, type StockMinaPorNombre, type StockPorProducto } from './revisionAlmacen';

export const CLAVE_INTERRUPTOR = 'compras_revision_almacen';
export const ESTADO_REVISION = 'revision_almacen';

/** La SP tal como se lee para esta pantalla (solo las columnas que hacen falta). */
export interface OrdenSolicitud {
  id: string;
  codigo: string;
  estado: string;
  tipo?: string | null;
  solicitante?: string | null;
  solicitante_email?: string | null;
  unidad_solicitante?: string | null;
  urgente?: boolean | null;
  motivo?: string | null;
  finalidad?: string | null;
  items: RenglonSP[];
  created_at: string;
}

export interface RevisionAlmacenRow {
  id: string;
  orden_id: string;
  estado: 'por_revisar' | 'revisada';
  items_original: RenglonSP[] | null;
  items_revision: unknown;
  nota: string | null;
  texto_whatsapp: string | null;
  revisada_por: string | null;
  revisada_por_nombre: string | null;
  revisada_en: string | null;
  created_at: string;
}

export interface SolicitudConRevision {
  orden: OrdenSolicitud;
  revision: RevisionAlmacenRow | null;
}

export interface ResultadoRevision {
  estado_orden: string;
  renglones_disponibles: number;
  renglones_a_compras: number;
  items_revision: unknown;
}

const COLS_ORDEN = 'id, codigo, estado, tipo, solicitante, solicitante_email, unidad_solicitante, urgente, motivo, finalidad, items, created_at';

const comoOrden = (r: Record<string, unknown>): OrdenSolicitud => ({
  ...(r as unknown as OrdenSolicitud),
  items: Array.isArray(r.items) ? (r.items as RenglonSP[]) : [],
});

/** ¿Está encendido el flujo? Cualquier falla (tabla que aún no existe, red) = apagado. */
export async function interruptorRevisionAlmacen(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('sistema_interruptores')
      .select('activo')
      .eq('clave', CLAVE_INTERRUPTOR)
      .maybeSingle();
    if (error || !data) return false;
    return (data as { activo?: unknown }).activo === true;
  } catch {
    return false;
  }
}

async function revisionesDe(ordenIds: string[]): Promise<Map<string, RevisionAlmacenRow>> {
  if (!ordenIds.length) return new Map();
  const { data, error } = await supabase
    .from('solicitudes_revision_almacen')
    .select('*')
    .in('orden_id', ordenIds);
  if (error) throw new Error(mensajeError(error, 'No se pudo leer la revisión de Almacén.'));
  return new Map(((data ?? []) as RevisionAlmacenRow[]).map((r) => [r.orden_id, r]));
}

/** SP que esperan a Almacén, las más recientes primero. */
export async function listSolicitudesPorRevisar(): Promise<SolicitudConRevision[]> {
  const { data, error } = await supabase
    .from('ordenes')
    .select(COLS_ORDEN)
    .eq('estado', ESTADO_REVISION)
    .order('created_at', { ascending: false });
  if (error) throw new Error(mensajeError(error, 'No se pudieron leer las solicitudes por revisar.'));
  const ordenes = ((data ?? []) as Record<string, unknown>[]).map(comoOrden);
  const revs = await revisionesDe(ordenes.map((o) => o.id));
  // La RPC cuenta los renglones (idx) sobre `items_original` de la revisión: se trabaja
  // sobre esa misma lista para que las posiciones coincidan siempre.
  return ordenes.map((orden) => {
    const revision = revs.get(orden.id) ?? null;
    const orig = revision?.items_original;
    return { orden: Array.isArray(orig) && orig.length ? { ...orden, items: orig } : orden, revision };
  });
}

/** Las revisadas en los últimos `dias` días, la más reciente primero. */
export async function listRevisadasRecientes(dias = 7): Promise<SolicitudConRevision[]> {
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('solicitudes_revision_almacen')
    .select('*')
    .eq('estado', 'revisada')
    .gte('revisada_en', desde)
    .order('revisada_en', { ascending: false });
  if (error) throw new Error(mensajeError(error, 'No se pudieron leer las solicitudes revisadas.'));
  const revs = (data ?? []) as RevisionAlmacenRow[];
  if (!revs.length) return [];
  const { data: ords, error: e2 } = await supabase
    .from('ordenes')
    .select(COLS_ORDEN)
    .in('id', revs.map((r) => r.orden_id));
  if (e2) throw new Error(mensajeError(e2, 'No se pudieron leer las órdenes revisadas.'));
  const porId = new Map(((ords ?? []) as Record<string, unknown>[]).map(comoOrden).map((o) => [o.id, o]));
  return revs
    .filter((r) => porId.has(r.orden_id))
    .map((revision) => ({ orden: porId.get(revision.orden_id)!, revision }));
}

export interface ExistenciaProducto {
  id: string;
  nombre: string;
  unidad: string;
  stock: number;
}

/** Existencia actual de esos productos en el Inventario General (lo de la Mina no cuenta). */
export async function existenciasDe(productoIds: string[]): Promise<Record<string, ExistenciaProducto>> {
  const ids = [...new Set(productoIds.filter(Boolean))];
  if (!ids.length) return {};
  const { data, error } = await supabase
    .from('productos')
    .select('id, nombre, unidad, stock, almacen')
    .in('id', ids);
  if (error) throw new Error(mensajeError(error, 'No se pudieron leer las existencias.'));
  const out: Record<string, ExistenciaProducto> = {};
  for (const p of (data ?? []) as Array<ExistenciaProducto & { almacen?: string | null }>) {
    if (!esDelDeposito(p, 'general')) continue;
    out[p.id] = { id: p.id, nombre: p.nombre, unidad: p.unidad, stock: Math.max(0, Number(p.stock) || 0) };
  }
  return out;
}

/**
 * Existencia del Depósito Mina por nombre de producto (30/10/2026): el almacenista de
 * Los Pinos ve también lo que hay allá. La Mina tiene catálogo propio, así que el
 * mismo producto se reconoce por el nombre (como el traslado entre almacenes).
 */
export async function existenciasMinaPorNombre(): Promise<StockMinaPorNombre> {
  const { data, error } = await supabase
    .from('productos')
    .select('nombre, stock')
    .eq('almacen', ALMACEN_MINA)
    .eq('estado', 'activo');
  if (error) throw new Error(mensajeError(error, 'No se pudieron leer las existencias del Depósito Mina.'));
  const out: StockMinaPorNombre = {};
  for (const p of (data ?? []) as { nombre: string; stock: number | null }[]) {
    out[claveNombreProducto(p.nombre)] = Math.max(0, Number(p.stock) || 0);
  }
  return out;
}

/** Solo los números, para la parte pura. */
export const stockPlano = (ex: Record<string, ExistenciaProducto>): StockPorProducto =>
  Object.fromEntries(Object.values(ex).map((p) => [p.id, p.stock]));

/**
 * Para un renglón escrito a mano (sin `productoId`): el producto del inventario que
 * más se le parece, si se parece bastante. Es una SUGERENCIA para ver su existencia;
 * no cambia la SP.
 */
export async function buscarProductoPorNombre(nombre: string): Promise<ProductoParecido | null> {
  try {
    const rs = await buscarProductosParecidos(nombre);
    const mejor = rs[0];
    return mejor && mejor.parecido >= 0.5 ? mejor : null;
  } catch {
    return null;
  }
}

/** Marca la SP como revisada. Si Almacén cubre todo queda finalizada; si no, pasa a Compras con lo faltante. */
export async function revisarSolicitud(
  ordenId: string, items: RevisionRenglon[], nota: string, textoWhatsapp: string,
): Promise<ResultadoRevision> {
  const { data, error } = await supabase.rpc('almacen_revisar_solicitud', {
    p_orden_id: ordenId,
    p_items: items.map((r) => ({
      idx: r.idx, cantidad_disponible: r.cantidad_disponible,
      ...(r.por_almacen ? { por_almacen: r.por_almacen } : {}),
    })),
    p_nota: nota.trim() || null,
    p_texto_whatsapp: textoWhatsapp,
  });
  if (error) throw new Error(mensajeError(error, 'No se pudo marcar la solicitud como revisada.'));
  return (data ?? {}) as ResultadoRevision;
}

/** Solo administración: la SP vuelve a «Por revisar». */
export async function devolverARevision(ordenId: string): Promise<void> {
  const { error } = await supabase.rpc('almacen_devolver_a_revision', { p_orden_id: ordenId });
  if (error) throw new Error(mensajeError(error, 'No se pudo devolver la solicitud a revisión.'));
}
