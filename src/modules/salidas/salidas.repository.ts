/* ============================================================
   MGG · Salidas / Traslados · Material (Supabase)
   Salida (descuenta stock hacia un destino) y traslado (mueve
   stock entre almacenes llevando el PMP). Reutiliza el kardex
   (`movimientos`) y la lógica de existencias por almacén.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { Movimiento } from '@/shared/lib/types';
import { registrarMovimiento } from '@/modules/inventario/movimientos.repository';
import { getExistencia } from '@/modules/inventario/almacenes.repository';

export interface SalidaMaterialInput {
  productoId: string;
  almacen: string;
  cantidad: number;
  destino: string;
  motivo?: string | null;
  precioUnit?: number | null;
  /** Fecha en que se entregó la salida al destino (YYYY-MM-DD). */
  fechaEntrega?: string | null;
  actor: string;
  actorName?: string | null;
}

/** Salida de material: descuenta stock del almacén hacia un destino. */
export async function salidaMaterial(input: SalidaMaterialInput): Promise<Movimiento> {
  const cantidad = Number(input.cantidad) || 0;
  if (cantidad <= 0) throw new Error('La cantidad debe ser mayor que 0.');
  const ex = await getExistencia(input.productoId, input.almacen);
  const stock = Number(ex?.stock) || 0;
  if (cantidad > stock) throw new Error(`Stock insuficiente en ${input.almacen}. Disponible: ${stock}.`);

  return registrarMovimiento({
    producto_id: input.productoId,
    tipo: 'salida',
    delta: -cantidad,
    almacen: input.almacen,
    actor: input.actor,
    actor_name: input.actorName ?? null,
    ref_tipo: 'salida_modulo',
    destino: input.destino || null,
    fecha_entrega: input.fechaEntrega || null,
    detalle: input.motivo || null,
    precio_unitario: input.precioUnit != null ? Number(input.precioUnit) : null,
  });
}

export interface TrasladoMaterialInput {
  productoId: string;
  almacenOrigen: string;
  almacenDestino: string;
  cantidad: number;
  motivo?: string | null;
  precioUnit?: number | null;
  /** Texto de la nota de entrega (se imprime en el PDF cuando está marcada). */
  notaEntrega?: string | null;
  /** Fecha en que se entregó el traslado al almacén destino (YYYY-MM-DD). */
  fechaEntrega?: string | null;
  actor: string;
  actorName?: string | null;
}

/**
 * Traslado de material entre almacenes: salida en origen + entrada en destino
 * llevando el costo (PMP) del origen para fundirlo en el destino.
 */
export async function trasladoMaterial(input: TrasladoMaterialInput): Promise<void> {
  const cantidad = Number(input.cantidad) || 0;
  if (cantidad <= 0) throw new Error('La cantidad debe ser mayor que 0.');
  if (input.almacenOrigen === input.almacenDestino) throw new Error('El almacén origen y destino deben ser distintos.');
  const exOrigen = await getExistencia(input.productoId, input.almacenOrigen);
  const stockOrigen = Number(exOrigen?.stock) || 0;
  if (cantidad > stockOrigen) throw new Error(`Stock insuficiente en ${input.almacenOrigen}. Disponible: ${stockOrigen}.`);
  const costoOrigen = Number(exOrigen?.costo_promedio) || 0;
  const precio = input.precioUnit != null ? Number(input.precioUnit) : null;
  const motivo = input.motivo?.trim() || null;
  const notaEntrega = input.notaEntrega?.trim() || null;

  // Salida del origen.
  await registrarMovimiento({
    producto_id: input.productoId,
    tipo: 'transferencia',
    delta: -cantidad,
    almacen: input.almacenOrigen,
    actor: input.actor,
    actor_name: input.actorName ?? null,
    ref_tipo: 'traslado_modulo',
    destino: input.almacenDestino,
    nota_entrega: notaEntrega,
    fecha_entrega: input.fechaEntrega || null,
    detalle: motivo ? `Traslado a ${input.almacenDestino} · ${motivo}` : `Traslado a ${input.almacenDestino}`,
    precio_unitario: precio,
  });
  // Entrada al destino al costo (PMP) del origen.
  await registrarMovimiento({
    producto_id: input.productoId,
    tipo: 'transferencia',
    delta: cantidad,
    almacen: input.almacenDestino,
    actor: input.actor,
    actor_name: input.actorName ?? null,
    ref_tipo: 'traslado_modulo',
    destino: input.almacenDestino,
    nota_entrega: notaEntrega,
    fecha_entrega: input.fechaEntrega || null,
    detalle: motivo ? `Traslado desde ${input.almacenOrigen} · ${motivo}` : `Traslado desde ${input.almacenOrigen}`,
    precio_unitario: costoOrigen,
  });
}

/* ───────────── Directorio de personas (destino) ───────────── */

export interface PersonaDirectorio {
  id: string;
  nombre: string;
  apellido: string;
  cargo: string;
}

/** Directorio mínimo de usuarios activos (vía función SECURITY DEFINER,
 *  legible por cualquier autenticado) para elegir el destinatario persona. */
export async function listDirectorioUsuarios(): Promise<PersonaDirectorio[]> {
  const { data, error } = await supabase.rpc('directorio_usuarios');
  if (error) throw error;
  return (data ?? []) as PersonaDirectorio[];
}

/* ───────────── Listados (historial) ───────────── */

export async function listSalidasMaterial(): Promise<Movimiento[]> {
  const { data, error } = await supabase
    .from('movimientos')
    .select('*, producto:productos(sku, nombre, unidad)')
    .eq('ref_tipo', 'salida_modulo')
    .order('at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Movimiento[];
}

/** Traslados de material: solo el lado de salida (delta<0) para no duplicar. */
export async function listTrasladosMaterial(): Promise<Movimiento[]> {
  const { data, error } = await supabase
    .from('movimientos')
    .select('*, producto:productos(sku, nombre, unidad)')
    .eq('ref_tipo', 'traslado_modulo')
    .lt('delta', 0)
    .order('at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Movimiento[];
}
