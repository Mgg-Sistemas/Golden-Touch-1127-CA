/* ============================================================
   Golden Touch · Control de Maquinaria · Flota y Servicio (Supabase)
   Estado operativo del equipo (con historial), órdenes de servicio y
   las lecturas del expediente (compras, surtidos, fotos).

   La orden de servicio NO mueve stock ni compra por su cuenta:
     · lo que sale del inventario se pide con una SOLICITUD DE SALIDA
       (Salidas, queda «por aprobar» y descuenta al ejecutarse);
     · lo que falta se pide con una SOLICITUD DE PEDIDO (Pedidos, SP).
   Cada una se crea por su flujo de siempre y con el permiso de su
   módulo; si el usuario no lo tiene, la orden queda «por solicitar» y
   otro usuario lo genera después desde el expediente.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { ItemOrden, ItemSalida, Orden } from '@/shared/lib/types';
import { crearSolicitudSalida } from '@/modules/salidas/salidas.repository';
import { crearOrden } from '@/modules/pedidos/pedidos.repository';
import { BUCKET_DOCUMENTOS } from './maquinariaDocumentos.repository';
import { ultimoHorometroEquipo, ultimoKilometrajeEquipo } from '@/modules/combustible/tanques.repository';
import type { EstadoEquipo, EstadoOrdenServicio, RepuestoOrden } from './flota';
import { servicioPorId, piezasNuevas } from './flota';
export { faltaSalida, faltaCompra } from './flota';

/* ───────── Estado operativo ───────── */

export interface EventoEstado {
  id: string;
  equipo_id: string;
  estado_anterior: string | null;
  estado: EstadoEquipo;
  motivo: string | null;
  material: string | null;
  nota: string | null;
  orden_servicio_id: string | null;
  actor: string | null;
  actor_name: string | null;
  created_at: string;
}

/** Cambia el estado del equipo (avería, parada, espera, retiro, reactivar…) y deja el evento. */
export async function cambiarEstadoEquipo(equipoId: string, estado: EstadoEquipo, motivo?: string | null, material?: string | null, nota?: string | null): Promise<void> {
  const { error } = await supabase.rpc('maquinaria_cambiar_estado', {
    p_equipo_id: equipoId, p_estado: estado, p_motivo: motivo ?? null, p_material: material ?? null, p_nota: nota ?? null,
  });
  if (error) throw error;
}

export async function listEventosEstado(equipoId: string): Promise<EventoEstado[]> {
  const { data, error } = await supabase.from('maquinaria_estado_eventos').select('*')
    .eq('equipo_id', equipoId).order('created_at', { ascending: false }).limit(60);
  if (error) throw error;
  return (data ?? []) as EventoEstado[];
}

/* ───────── Órdenes de servicio ───────── */

export interface OrdenServicio {
  id: string;
  codigo: string;
  equipo_id: string;
  tipo: string;
  urgencia: 'normal' | 'alta' | 'urgente';
  intervenciones: string[];
  origen: 'interno' | 'externo';
  responsable: string | null;
  descripcion: string | null;
  estado: EstadoOrdenServicio;
  repuestos: RepuestoOrden[];
  horometro: number | null;
  kilometraje: number | null;
  solicitud_salida_id: string | null;
  orden_compra_id: string | null;
  estado_equipo_previo: string | null;
  nota_cierre: string | null;
  created_by: string | null;
  actor_name: string | null;
  created_at: string;
  updated_at: string | null;
  cerrada_at: string | null;
  /** Cuándo se avisó a Compras de las piezas que no están en el inventario. */
  compras_notificada_at: string | null;
}

export async function listOrdenesServicio(equipoId?: string): Promise<OrdenServicio[]> {
  let q = supabase.from('maquinaria_ordenes_servicio').select('*').order('created_at', { ascending: false });
  if (equipoId) q = q.eq('equipo_id', equipoId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as OrdenServicio[];
}

/** Órdenes abiertas por equipo (para el catálogo). */
export async function ordenesAbiertasPorEquipo(): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('maquinaria_ordenes_servicio').select('equipo_id')
    .in('estado', ['abierta', 'repuestos', 'en_proceso']);
  if (error) throw error;
  const out = new Map<string, number>();
  for (const r of (data ?? []) as { equipo_id: string }[]) out.set(r.equipo_id, (out.get(r.equipo_id) ?? 0) + 1);
  return out;
}

export interface NuevaOrdenServicio {
  equipo_id: string;
  tipo: string;
  urgencia: 'normal' | 'alta' | 'urgente';
  intervenciones: string[];
  origen: 'interno' | 'externo';
  responsable: string;
  descripcion: string;
  horometro: number | null;
  kilometraje: number | null;
  repuestos: { producto_id: string | null; nombre: string; unidad: string; cantidad: number }[];
}

/** Crea la orden. La base decide el origen de cada repuesto con el stock real del momento. */
export async function crearOrdenServicio(input: NuevaOrdenServicio): Promise<{ id: string; codigo: string; estado: EstadoOrdenServicio; repuestos: RepuestoOrden[] }> {
  const { data, error } = await supabase.rpc('maquinaria_crear_orden_servicio', { p: input });
  if (error) throw error;
  return data as { id: string; codigo: string; estado: EstadoOrdenServicio; repuestos: RepuestoOrden[] };
}

export async function avanzarOrdenServicio(id: string, estado: EstadoOrdenServicio, nota?: string | null): Promise<void> {
  const { error } = await supabase.rpc('maquinaria_avanzar_orden_servicio', { p_id: id, p_estado: estado, p_nota: nota ?? null });
  if (error) throw error;
}

async function vincular(id: string, salida: string | null, compra: string | null): Promise<void> {
  const { error } = await supabase.rpc('maquinaria_vincular_orden_servicio', { p_id: id, p_salida: salida, p_compra: compra });
  if (error) throw error;
}

interface Actor { email: string; nombre: string | null }

/**
 * Pide al inventario lo que sale de stock: una solicitud de salida «por aprobar»
 * (flujo de Salidas). No descuenta nada hasta que Salidas la ejecute.
 */
export async function solicitarSalidaDeOrden(o: OrdenServicio, equipoNombre: string, actor: Actor): Promise<string> {
  const items: ItemSalida[] = o.repuestos
    .filter((r) => r.producto_id && r.desde_inventario > 0)
    .map((r) => ({
      producto_id: r.producto_id as string,
      producto_nombre: r.nombre,
      unidad: r.unidad,
      cantidad: r.desde_inventario,
      precio_unit: 0,
      almacen: r.almacen,
      observacion: `${o.codigo} · ${equipoNombre}`,
    }));
  if (!items.length) throw new Error('Esta orden no tiene repuestos que salgan del inventario.');
  const sin = items.find((i) => !i.almacen);
  if (sin) throw new Error(`«${sin.producto_nombre}» no tiene almacén en el inventario: corrígelo en Inventario y vuelve a intentar.`);
  const servicio = servicioPorId(o.tipo)?.label ?? o.tipo;
  const sol = await crearSolicitudSalida({
    scope: 'salida', tipo: 'material',
    solicitante: (actor.nombre || actor.email).toUpperCase(),
    unidadSolicitante: 'MAQUINARIA',
    motivo: `Orden de servicio ${o.codigo} · ${equipoNombre} · ${servicio}`,
    items, actor: actor.email, actorName: actor.nombre,
  });
  await vincular(o.id, sol.id, null);
  return sol.codigo;
}

/**
 * Pide a compras lo que falta: una solicitud de pedido (SP) con los productos del
 * inventario. Las piezas que todavía no existen en el inventario van anotadas en la
 * nota de la SP (Compras las da de alta al cotizar, como en una SP normal).
 */
export async function solicitarCompraDeOrden(o: OrdenServicio, equipo: { id: string; equipo: string }, actor: Actor): Promise<string> {
  const conProducto = o.repuestos.filter((r) => r.a_comprar > 0 && r.producto_id);
  const nuevas = o.repuestos.filter((r) => r.a_comprar > 0 && !r.producto_id);
  if (!conProducto.length) {
    throw new Error(nuevas.length
      ? 'Las piezas a comprar todavía no están en el inventario: Compras las dará de alta (se le notificó). Cuando existan, cámbialas por el producto en la orden y pide la compra.'
      : 'Esta orden no tiene repuestos por comprar.');
  }
  // SKU de cada producto (la SP lo usa para la recepción).
  const ids = conProducto.map((r) => r.producto_id as string);
  const { data: prods, error: pe } = await supabase.from('productos').select('id, sku, unidad').in('id', ids);
  if (pe) throw pe;
  const sku = new Map(((prods ?? []) as { id: string; sku: string }[]).map((p) => [p.id, p.sku]));
  const finalidad = `Repuesto para ${equipo.equipo} · ${o.codigo}`;
  const items: ItemOrden[] = conProducto.map((r) => ({
    productoId: r.producto_id as string,
    sku: sku.get(r.producto_id as string) ?? '',
    nombre: r.nombre,
    cantidad: r.a_comprar,
    precio: 0,
    unidad: r.unidad,
    comprar: true,
    finalidad,
    equipo_id: equipo.id,
    equipo_nombre: equipo.equipo,
  }));
  const notas = [
    `Orden de servicio ${o.codigo} · ${equipo.equipo}.`,
    nuevas.length ? `Piezas que no están en el inventario: ${nuevas.map((n) => `${n.cantidad} ${n.unidad} ${n.nombre}`).join('; ')}.` : '',
  ].filter(Boolean).join(' ');
  const sp: Orden = await crearOrden({
    proveedor_id: null, items, notas, motivo: null, finalidad,
    clasificacion: [], urgente: o.urgencia === 'urgente',
    solicitante_email: actor.email,
    solicitante: (actor.nombre || actor.email).toUpperCase(),
    unidad_solicitante: 'MAQUINARIA',
    ci_solicitante: null,
  });
  await vincular(o.id, null, sp.id);
  return sp.codigo;
}

/* ───────── Compras del equipo (lectura) ───────── */

export interface CompraEquipo {
  id: string;
  codigo: string;
  oc_codigo: string | null;
  tipo: string | null;
  estado: string;
  created_at: string;
  total: number | null;
  total_moneda: string | null;
  lineas: { nombre: string; cantidad: number; unidad: string | null }[];
  /** Orden de servicio que la pidió (si salió de una). */
  orden_servicio: string | null;
}

/**
 * Solicitudes de pedido / servicio del equipo: las que tienen un renglón casado al
 * equipo (servicios de Pedidos y repuestos pedidos desde una orden de servicio) y las
 * vinculadas a sus órdenes de servicio.
 */
export async function comprasDeEquipo(equipoId: string, ordenes: OrdenServicio[]): Promise<CompraEquipo[]> {
  const vinculadas = ordenes.map((o) => o.orden_compra_id).filter(Boolean) as string[];
  const cols = 'id, codigo, oc_codigo, tipo, estado, created_at, total, total_moneda, items';
  const [porItem, porId] = await Promise.all([
    supabase.from('ordenes').select(cols).contains('items', [{ equipo_id: equipoId }]).order('created_at', { ascending: false }),
    vinculadas.length ? supabase.from('ordenes').select(cols).in('id', vinculadas) : Promise.resolve({ data: [], error: null }),
  ]);
  if (porItem.error) throw porItem.error;
  if (porId.error) throw porId.error;
  const porCompra = new Map(ordenes.filter((o) => o.orden_compra_id).map((o) => [o.orden_compra_id as string, o.codigo]));
  const vistos = new Map<string, CompraEquipo>();
  for (const r of [...(porItem.data ?? []), ...(porId.data ?? [])] as Array<Record<string, unknown>>) {
    const id = r.id as string;
    if (vistos.has(id)) continue;
    const items = Array.isArray(r.items) ? (r.items as Array<{ nombre?: string; cantidad?: number; unidad?: string; equipo_id?: string | null }>) : [];
    const propias = items.filter((i) => !i.equipo_id || i.equipo_id === equipoId);
    vistos.set(id, {
      id, codigo: r.codigo as string, oc_codigo: (r.oc_codigo as string) ?? null, tipo: (r.tipo as string) ?? null,
      estado: r.estado as string, created_at: r.created_at as string,
      total: r.total != null ? Number(r.total) : null, total_moneda: (r.total_moneda as string) ?? null,
      lineas: propias.map((i) => ({ nombre: i.nombre ?? '—', cantidad: Number(i.cantidad) || 0, unidad: i.unidad ?? null })),
      orden_servicio: porCompra.get(id) ?? null,
    });
  }
  return [...vistos.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Estado de las solicitudes de salida vinculadas a órdenes de servicio. */
export async function salidasDeOrdenes(ordenes: OrdenServicio[]): Promise<Map<string, { codigo: string; estado: string }>> {
  const ids = ordenes.map((o) => o.solicitud_salida_id).filter(Boolean) as string[];
  const out = new Map<string, { codigo: string; estado: string }>();
  if (!ids.length) return out;
  const { data, error } = await supabase.from('solicitudes_salida').select('id, codigo, estado').in('id', ids);
  if (error) throw error;
  for (const r of (data ?? []) as { id: string; codigo: string; estado: string }[]) out.set(r.id, { codigo: r.codigo, estado: r.estado });
  return out;
}

/* ───────── Combustible del equipo (lectura) ───────── */

export interface SurtidoEquipo {
  id: string;
  fecha: string;
  litros: number;
  horometro_fin: number | null;
  kilometraje: number | null;
  ubicacion: string | null;
  autorizado_por: string | null;
}

/** Últimos surtidos (uso) del equipo vinculado en Combustible. */
export async function surtidosDeEquipo(nombreCombustible: string | null | undefined, limite = 25): Promise<SurtidoEquipo[]> {
  const nombre = (nombreCombustible ?? '').trim();
  if (!nombre) return [];
  const { data, error } = await supabase.from('combustible_tanque_movimientos')
    .select('id, fecha, litros, horometro_fin, kilometraje, ubicacion, autorizado_por')
    .eq('equipo', nombre).eq('tipo', 'uso')
    .order('fecha', { ascending: false }).order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return ((data ?? []) as SurtidoEquipo[]).map((r) => ({ ...r, litros: Number(r.litros) || 0 }));
}

/* ───────── Fotos (las imágenes de los documentos del equipo) ───────── */

export interface FotoEquipo { id: string; equipo_id: string; nombre: string; url: string }

/** Imágenes de los documentos (📎) de uno o de todos los equipos, con URL firmada (1 h). */
export async function fotosDeEquipos(equipoId?: string): Promise<FotoEquipo[]> {
  let q = supabase.from('maquinaria_documentos').select('id, equipo_id, nombre, path, content_type, espacio')
    .like('content_type', 'image/%').order('espacio', { ascending: true });
  if (equipoId) q = q.eq('equipo_id', equipoId);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as { id: string; equipo_id: string; nombre: string; path: string }[];
  if (!rows.length) return [];
  const { data: urls, error: ue } = await supabase.storage.from(BUCKET_DOCUMENTOS).createSignedUrls(rows.map((r) => r.path), 3600);
  if (ue) throw ue;
  return rows.flatMap((r, i) => {
    const url = urls?.[i]?.signedUrl;
    return url ? [{ id: r.id, equipo_id: r.equipo_id, nombre: r.nombre, url }] : [];
  });
}

/* ───────── Piezas nuevas: aviso a Compras y cambio por el producto ───────── */

/**
 * Avisa a Compras (notificación persistente dirigida al rol analista_de_compras, con el
 * código OS, el equipo y la lista de piezas; enlaza al expediente) de las
 * piezas de la orden que no existen en el inventario: las da de alta Compras, la orden
 * no crea productos. Deja constancia en la orden. Devuelve false si no había piezas.
 */
export async function notificarComprasPiezasNuevas(o: Pick<OrdenServicio, 'id' | 'repuestos'>): Promise<boolean> {
  if (!piezasNuevas(o.repuestos).length) return false;
  // En el servidor (RPC): quien crea la orden no tiene el rol de Compras y no podría leer
  // de vuelta una notificación dirigida a ese rol. Inserta el aviso y marca la orden juntos.
  const { data, error } = await supabase.rpc('maquinaria_notificar_compras_piezas', { p_id: o.id });
  if (error) throw error;
  return data === true;
}

/** Cambia una pieza nueva por el producto del inventario y vuelve a decidir inventario / compra. */
export async function reemplazarPiezaOrden(ordenId: string, indice: number, productoId: string): Promise<RepuestoOrden> {
  const { data, error } = await supabase.rpc('maquinaria_reemplazar_pieza_orden', { p_id: ordenId, p_indice: indice, p_producto_id: productoId });
  if (error) throw error;
  return data as RepuestoOrden;
}

/* ───────── Lavados ───────── */

export interface LavadoEquipo {
  id: string;
  equipo_id: string;
  fecha: string;
  tipo: string;
  responsable: string | null;
  horometro: number | null;
  kilometraje: number | null;
  nota: string | null;
  actor: string | null;
  actor_name: string | null;
  created_at: string;
}

export async function listLavados(equipoId: string): Promise<LavadoEquipo[]> {
  const { data, error } = await supabase.from('maquinaria_lavados').select('*')
    .eq('equipo_id', equipoId).order('fecha', { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []) as LavadoEquipo[];
}

export interface NuevoLavado {
  equipo_id: string;
  fecha: string;          // ISO
  tipo: string;
  responsable: string | null;
  horometro: number | null;
  kilometraje: number | null;
  nota: string | null;
}

export async function registrarLavado(input: NuevoLavado, actor: { email: string; nombre: string | null }): Promise<void> {
  const tipo = input.tipo.trim();
  if (tipo.length < 3) throw new Error('Indica el tipo de lavado (al menos 3 letras).');
  const { error } = await supabase.from('maquinaria_lavados').insert({
    ...input, tipo,
    responsable: input.responsable?.trim() || null,
    nota: input.nota?.trim() || null,
    actor: actor.email, actor_name: actor.nombre,
  });
  if (error) throw error;
}

/** Borra un lavado. La base solo lo permite al administrador. */
export async function eliminarLavado(id: string): Promise<void> {
  const { data, error } = await supabase.from('maquinaria_lavados').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('Solo un administrador puede borrar lavados.');
}

/* ───────── Lecturas para los submódulos (todos los equipos) ───────── */

/** Historial global de cambios de estado (más reciente primero). */
export async function listEventosEstadoTodos(limite = 2000): Promise<EventoEstado[]> {
  const { data, error } = await supabase.from('maquinaria_estado_eventos').select('*')
    .order('created_at', { ascending: false }).limit(limite);
  if (error) throw error;
  return (data ?? []) as EventoEstado[];
}

/** Todos los lavados (más reciente primero). */
export async function listLavadosTodos(limite = 5000): Promise<LavadoEquipo[]> {
  const { data, error } = await supabase.from('maquinaria_lavados').select('*')
    .order('fecha', { ascending: false }).limit(limite);
  if (error) throw error;
  return (data ?? []) as LavadoEquipo[];
}

export interface CompraResumen { id: string; codigo: string; oc_codigo: string | null; estado: string; created_at: string; total: number | null; total_moneda: string | null }

/** Las solicitudes de pedido / OC vinculadas a órdenes de servicio (por id). */
export async function comprasPorIds(ids: string[]): Promise<Map<string, CompraResumen>> {
  const out = new Map<string, CompraResumen>();
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return out;
  const { data, error } = await supabase.from('ordenes').select('id, codigo, oc_codigo, estado, created_at, total, total_moneda').in('id', unicos);
  if (error) throw error;
  for (const r of (data ?? []) as CompraResumen[]) out.set(r.id, { ...r, total: r.total != null ? Number(r.total) : null });
  return out;
}

/** Horómetro y km vigentes de un equipo (Combustible; el horómetro cae a la bitácora). */
export async function lecturasVigentesEquipo(e: { id: string; combustible_equipo: string | null }): Promise<{ horometro: number | null; km: number | null }> {
  const vinc = (e.combustible_equipo ?? '').trim();
  const [horo, km] = await Promise.all([
    vinc ? ultimoHorometroEquipo(vinc).catch(() => null) : Promise.resolve(null),
    vinc ? ultimoKilometrajeEquipo(vinc).catch(() => null) : Promise.resolve(null),
  ]);
  let horometro = horo;
  if (horometro == null) {
    const { data } = await supabase.from('maquinaria_mantenimientos').select('horometro')
      .eq('equipo_id', e.id).not('horometro', 'is', null)
      .order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(1);
    horometro = data?.[0]?.horometro != null ? Number(data[0].horometro) : null;
  }
  return { horometro, km };
}
