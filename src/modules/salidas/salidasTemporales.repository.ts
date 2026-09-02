/* ============================================================
   Golden Touch · Salidas Temporales · Repository (Supabase)
   Sacar un material a MANTENIMIENTO y retornarlo al inventario.
   Flujo:  pendiente → (aprobar, firma Leydis/Jesús) en_transito
           → (finalizar) finalizada  (muestra el tiempo en tránsito).
   Editable / eliminable SOLO mientras está 'pendiente'.
   Al pasar a en_transito el material SALE del inventario; al finalizar
   RETORNA. Reutiliza el kardex (movimientos) y el catálogo de choferes
   (responsable) del módulo de Salidas.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type {
  EventoHistorial, ItemSalidaTemporal, SalidaTemporal, Producto,
} from '@/shared/lib/types';
import { registrarMovimiento } from '@/modules/inventario/movimientos.repository';
import { getExistencia } from '@/modules/inventario/almacenes.repository';
import { createProducto, nextSku, listProductos } from '@/modules/inventario/inventario.repository';
import { firmaDeAprobador } from '@/modules/pedidos/aprobadoresOc';

const TABLE = 'salidas_temporales';

function appendHistorial(s: Pick<SalidaTemporal, 'historial'>, evento: string, actor: string, meta: Record<string, unknown> = {}): EventoHistorial[] {
  const ev = { at: new Date().toISOString(), evento, actor, ...meta } as EventoHistorial;
  return [...(s.historial ?? []), ev];
}

/** Correlativo GLOBAL ST-NNN (empieza en 001, no se reinicia), atómico vía RPC. */
async function nextCodigoSalidaTemporal(): Promise<{ codigo: string; n: number }> {
  const { data, error } = await supabase.rpc('next_correlativo', { p_clave: 'salida-temporal' });
  if (error) throw error;
  const n = Number(data) || 1;
  return { codigo: `ST-${String(n).padStart(3, '0')}`, n };
}

/** Minutos → texto legible ("2 d 5 h", "3 h 12 min", "45 min"). */
export function formatDuracion(min?: number | null): string {
  const m = Math.max(0, Math.round(Number(min) || 0));
  if (m <= 0) return '—';
  const dias = Math.floor(m / 1440);
  const horas = Math.floor((m % 1440) / 60);
  const mins = m % 60;
  const partes: string[] = [];
  if (dias) partes.push(`${dias} d`);
  if (horas) partes.push(`${horas} h`);
  if (mins && !dias) partes.push(`${mins} min`);
  return partes.join(' ') || `${m} min`;
}

export async function listSalidasTemporales(): Promise<SalidaTemporal[]> {
  const { data, error } = await supabase.from(TABLE).select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SalidaTemporal[];
}

export interface ItemSalidaTemporalInput {
  producto_id?: string | null;
  producto_nombre: string;
  producto_sku?: string | null;
  unidad?: string | null;
  cantidad: number;
  almacen?: string | null;
  es_nuevo?: boolean;
  /** Categoría para dar de alta el material nuevo (si es_nuevo). */
  categoria?: string | null;
  observacion?: string | null;
}

export interface CrearSalidaTemporalInput {
  items: ItemSalidaTemporalInput[];
  solicitante: string;
  unidadSolicitante?: string | null;
  motivo?: string | null;
  fecha?: string | null;
  // responsable (chofer) + vehículo + direcciones
  choferId?: string | null;
  choferNombre?: string | null;
  choferCedula?: string | null;
  vehiculoId?: string | null;
  vehiculoDescripcion?: string | null;
  vehiculoPlaca?: string | null;
  direccionDespacho?: string | null;
  direccionDestino?: string | null;
  actor: string;
  actorName?: string | null;
}

/**
 * Normaliza los renglones: da de alta en inventario los materiales NUEVOS (stock 0)
 * y devuelve la lista final de ItemSalidaTemporal con su producto_id resuelto.
 */
async function resolverItems(items: ItemSalidaTemporalInput[]): Promise<ItemSalidaTemporal[]> {
  const limpios = (items ?? []).filter((i) => i && (i.producto_id || (i.producto_nombre ?? '').trim()) && (Number(i.cantidad) || 0) > 0);
  if (!limpios.length) throw new Error('Agregá al menos un material con cantidad.');
  let productos: Producto[] | null = null;
  const out: ItemSalidaTemporal[] = [];
  for (const it of limpios) {
    const cantidad = Number(it.cantidad) || 0;
    if (it.producto_id && !it.es_nuevo) {
      out.push({
        producto_id: it.producto_id,
        producto_nombre: it.producto_nombre ?? '',
        producto_sku: it.producto_sku ?? null,
        unidad: it.unidad ?? null,
        cantidad,
        almacen: it.almacen ?? null,
        es_nuevo: false,
        observacion: it.observacion?.trim() || null,
      });
    } else {
      // Material NUEVO: se da de alta en inventario (stock 0, sin precio). SKU automático.
      const nombre = (it.producto_nombre ?? '').trim().toUpperCase();
      if (!nombre) throw new Error('Indicá el nombre del material nuevo.');
      const categoria = (it.categoria ?? '').trim() || 'GENERAL';
      if (productos == null) productos = await listProductos().catch(() => [] as Producto[]);
      const nuevo = await createProducto({
        sku: await nextSku(categoria, productos),
        nombre, categoria, unidad: it.unidad ?? 'UND',
        stock: 0, stock_min: 0, precio: 0, almacen: it.almacen ?? 'General', estado: 'activo',
      });
      productos = [...(productos ?? []), nuevo];
      out.push({
        producto_id: nuevo.id,
        producto_nombre: nuevo.nombre,
        producto_sku: nuevo.sku,
        unidad: nuevo.unidad ?? null,
        cantidad,
        almacen: it.almacen ?? null,
        es_nuevo: true,
        observacion: it.observacion?.trim() || null,
      });
    }
  }
  return out;
}

/** Crea la salida temporal en estado 'pendiente'. No mueve inventario todavía. */
export async function crearSalidaTemporal(input: CrearSalidaTemporalInput): Promise<SalidaTemporal> {
  if (!input.solicitante.trim()) throw new Error('Indicá quién hace la solicitud.');
  const items = await resolverItems(input.items);
  const { codigo, n } = await nextCodigoSalidaTemporal();
  const historial = appendHistorial({ historial: [] }, 'creada', input.actor);
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      codigo,
      correlativo: n,
      estado: 'pendiente',
      items,
      solicitante: input.solicitante.trim(),
      unidad_solicitante: input.unidadSolicitante?.trim() || null,
      motivo: input.motivo?.trim() || null,
      chofer_id: input.choferId ?? null,
      chofer_nombre: input.choferNombre?.trim() || null,
      chofer_cedula: input.choferCedula?.trim() || null,
      vehiculo_id: input.vehiculoId ?? null,
      vehiculo_descripcion: input.vehiculoDescripcion?.trim() || null,
      vehiculo_placa: input.vehiculoPlaca?.trim() || null,
      direccion_despacho: input.direccionDespacho?.trim() || null,
      direccion_destino: input.direccionDestino?.trim() || null,
      fecha: input.fecha || new Date().toISOString().slice(0, 10),
      historial,
      actor: input.actor,
      actor_name: input.actorName ?? null,
      created_by: input.actor,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as SalidaTemporal;
}

export interface EditarSalidaTemporalInput {
  items?: ItemSalidaTemporalInput[] | null;
  solicitante?: string;
  unidadSolicitante?: string | null;
  motivo?: string | null;
  fecha?: string | null;
  choferId?: string | null;
  choferNombre?: string | null;
  choferCedula?: string | null;
  vehiculoId?: string | null;
  vehiculoDescripcion?: string | null;
  vehiculoPlaca?: string | null;
  direccionDespacho?: string | null;
  direccionDestino?: string | null;
  actor: string;
}

/** Edita una salida temporal que AÚN está 'pendiente' (antes de aprobar). */
export async function editarSalidaTemporal(s: SalidaTemporal, input: EditarSalidaTemporalInput): Promise<void> {
  if (s.estado !== 'pendiente') throw new Error('Solo se puede modificar una salida temporal que está pendiente (sin aprobar).');
  const patch: Record<string, unknown> = {
    historial: appendHistorial(s, 'editada', input.actor),
    updated_at: new Date().toISOString(),
  };
  if (input.solicitante !== undefined) {
    if (!input.solicitante.trim()) throw new Error('Indicá quién hace la solicitud.');
    patch.solicitante = input.solicitante.trim();
  }
  if (input.unidadSolicitante !== undefined) patch.unidad_solicitante = input.unidadSolicitante?.trim() || null;
  if (input.motivo !== undefined) patch.motivo = input.motivo?.trim() || null;
  if (input.fecha !== undefined) patch.fecha = input.fecha || null;
  if (input.choferId !== undefined) patch.chofer_id = input.choferId ?? null;
  if (input.choferNombre !== undefined) patch.chofer_nombre = input.choferNombre?.trim() || null;
  if (input.choferCedula !== undefined) patch.chofer_cedula = input.choferCedula?.trim() || null;
  if (input.vehiculoId !== undefined) patch.vehiculo_id = input.vehiculoId ?? null;
  if (input.vehiculoDescripcion !== undefined) patch.vehiculo_descripcion = input.vehiculoDescripcion?.trim() || null;
  if (input.vehiculoPlaca !== undefined) patch.vehiculo_placa = input.vehiculoPlaca?.trim() || null;
  if (input.direccionDespacho !== undefined) patch.direccion_despacho = input.direccionDespacho?.trim() || null;
  if (input.direccionDestino !== undefined) patch.direccion_destino = input.direccionDestino?.trim() || null;
  if (input.items !== undefined && input.items !== null) {
    patch.items = await resolverItems(input.items);
  }
  const { error } = await supabase.from(TABLE).update(patch).eq('id', s.id);
  if (error) throw error;
}

/** Elimina una salida temporal que AÚN está 'pendiente' (antes de aprobar). */
export async function eliminarSalidaTemporal(s: SalidaTemporal): Promise<void> {
  if (s.estado !== 'pendiente') throw new Error('Solo se puede eliminar una salida temporal que está pendiente (sin aprobar).');
  const { error } = await supabase.from(TABLE).delete().eq('id', s.id);
  if (error) throw error;
}

/**
 * APRUEBA la salida temporal (pendiente → en_transito). Estampa la firma según quién
 * aprueba (Leydis o Jesús Lozada) y SACA el material del inventario (salida por cada
 * renglón existente con stock). Los materiales nuevos (stock 0) no descuentan: entran
 * al inventario recién al finalizar (retorno).
 */
export async function aprobarSalidaTemporal(
  s: SalidaTemporal,
  input: { actor: string; actorName?: string | null; aprobadorEmail: string; aprobadorNombre?: string | null },
): Promise<void> {
  if (s.estado !== 'pendiente') throw new Error('Solo se aprueban salidas temporales pendientes.');
  const items = s.items ?? [];
  if (!items.length) throw new Error('La salida temporal no tiene materiales.');

  // Pre-validación de stock de los renglones existentes (no los nuevos).
  const existentes = items.filter((it) => it.producto_id && !it.es_nuevo && it.almacen);
  for (const it of existentes) {
    const ex = await getExistencia(it.producto_id!, it.almacen!);
    const stock = Number(ex?.stock) || 0;
    if ((Number(it.cantidad) || 0) > stock) {
      throw new Error(`Stock insuficiente de ${it.producto_nombre || 'un material'} en ${it.almacen}. Disponible: ${stock}.`);
    }
  }
  // ── Reserva atómica (GT-SIN-18) ────────────────────────────────────────────
  // Se marca ANTES de mover inventario y condicionado al estado real: si dos
  // personas aprueban la misma salida a la vez, solo una gana y el material
  // sale una sola vez. Si el movimiento falla, se devuelve a 'pendiente'.
  const firma = firmaDeAprobador(input.aprobadorEmail);
  const now = new Date().toISOString();
  const { data: reserva, error: errReserva } = await supabase
    .from(TABLE)
    .update({
      estado: 'en_transito',
      aprobada_por: input.aprobadorEmail,
      aprobada_por_nombre: input.aprobadorNombre ?? null,
      aprobada_en: now,
      firma,
      en_transito_en: now,
      updated_at: now,
      historial: appendHistorial(s, 'aprobada', input.actor, { firma }),
    })
    .eq('id', s.id)
    .eq('estado', 'pendiente')
    .select('id');
  if (errReserva) throw errReserva;
  if (!reserva?.length) throw new Error('La salida temporal ya fue aprobada por otro usuario.');

  // Salida del inventario (material a mantenimiento).
  const destino = s.direccion_destino?.trim() || 'MANTENIMIENTO';
  try {
    for (const it of existentes) {
      await registrarMovimiento({
        producto_id: it.producto_id!,
        tipo: 'salida',
        delta: -(Number(it.cantidad) || 0),
        almacen: it.almacen!,
        actor: input.actor,
        actor_name: input.actorName ?? null,
        ref_tipo: 'salida_temporal',
        ref_id: s.id,
        ref_codigo: s.codigo,
        destino,
        solicitante: s.solicitante,
        detalle: `Salida temporal a mantenimiento${s.motivo ? ` · ${s.motivo}` : ''}`,
      });
    }
  } catch (e) {
    await supabase
      .from(TABLE)
      .update({ estado: 'pendiente', aprobada_por: null, aprobada_en: null, en_transito_en: null })
      .eq('id', s.id)
      .eq('estado', 'en_transito');
    throw e;
  }
}

/**
 * FINALIZA la salida temporal (en_transito → finalizada): el material RETORNA al
 * inventario (entrada por cada renglón) y se registra el tiempo que estuvo en
 * tránsito/mantenimiento (finalizada_en − en_transito_en, en minutos).
 */
export async function finalizarSalidaTemporal(
  s: SalidaTemporal,
  input: { actor: string; actorName?: string | null },
): Promise<void> {
  if (s.estado !== 'en_transito') throw new Error('Solo se finalizan salidas temporales en tránsito.');
  const items = s.items ?? [];

  // ── Reserva atómica (GT-SIN-18) ────────────────────────────────────────────
  // Acá el duplicado es peor que en la salida: dos finalizaciones a la vez
  // hacen ENTRAR el material dos veces e inflan el stock con unidades que no
  // existen. Se marca primero, condicionado al estado real en la base.
  const now = new Date();
  const desde = s.en_transito_en ? new Date(s.en_transito_en).getTime() : now.getTime();
  const duracionMin = Math.max(0, Math.round((now.getTime() - desde) / 60000));
  const { data: reserva, error: errReserva } = await supabase
    .from(TABLE)
    .update({
      estado: 'finalizada',
      finalizada_en: now.toISOString(),
      duracion_min: duracionMin,
      updated_at: now.toISOString(),
      historial: appendHistorial(s, 'finalizada', input.actor, { duracion_min: duracionMin }),
    })
    .eq('id', s.id)
    .eq('estado', 'en_transito')
    .select('id');
  if (errReserva) throw errReserva;
  if (!reserva?.length) throw new Error('La salida temporal ya fue finalizada por otro usuario.');

  // Retorno al inventario: entrada por cada renglón a su almacén.
  try {
    for (const it of items) {
      if (!it.producto_id) continue;
      const almacen = it.almacen || 'General';
      await registrarMovimiento({
        producto_id: it.producto_id,
        tipo: 'entrada',
        delta: Number(it.cantidad) || 0,
        almacen,
        actor: input.actor,
        actor_name: input.actorName ?? null,
        ref_tipo: 'salida_temporal_retorno',
        ref_id: s.id,
        ref_codigo: s.codigo,
        solicitante: s.solicitante,
        detalle: `Retorno de mantenimiento (salida temporal ${s.codigo})`,
      });
    }
  } catch (e) {
    await supabase
      .from(TABLE)
      .update({ estado: 'en_transito', finalizada_en: null, duracion_min: null })
      .eq('id', s.id)
      .eq('estado', 'finalizada');
    throw e;
  }
}
