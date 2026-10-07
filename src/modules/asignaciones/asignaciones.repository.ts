/* ============================================================
   Golden Touch · Asignaciones · datos

   Todo lo que mueve stock pasa por funciones del servidor (asignacion_*):
   así la salida del inventario, la devolución y el borrado quedan en el
   kardex y no hay forma de que el stock y la asignación se desincronicen.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { Asignacion, CondicionDevolucion } from './asignacionesReglas';
import { ALMACEN_MINA } from '@/modules/inventario/depositos';
import type { VehiculoCatalogo } from './vehiculosCatalogo';

export interface ProductoAsignable {
  id: string;
  sku: string | null;
  nombre: string;
  unidad: string | null;
  stock: number;
  precio: number | null;
  categoria: string | null;
  marca?: string | null;
  modelo?: string | null;
  serial?: string | null;
}

function error(e: { message?: string } | null, def: string): Error {
  return new Error(e?.message || def);
}

export async function listAsignaciones(): Promise<Asignacion[]> {
  const { data, error: e } = await supabase.from('asignaciones').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false });
  if (e) throw e;
  return (data ?? []) as Asignacion[];
}

/** Productos activos que se pueden sacar del inventario. */
export async function listProductosAsignables(): Promise<ProductoAsignable[]> {
  const { data, error: e } = await supabase.from('productos')
    .select('id, sku, nombre, unidad, stock, precio, categoria, marca, modelo, serial, no_inventariable')
    .eq('estado', 'activo').neq('almacen', ALMACEN_MINA).order('nombre');   // Depósito Mina: independiente, no entra aquí.
  if (e) throw e;
  return ((data ?? []) as (ProductoAsignable & { no_inventariable?: boolean })[]).filter((p) => !p.no_inventariable);
}

export async function crearAsignacion(p: Record<string, unknown>, actor: string, actorName: string | null): Promise<Asignacion> {
  const { data, error: e } = await supabase.rpc('asignacion_crear', { p, p_actor: actor, p_actor_name: actorName });
  if (e) throw error(e, 'No se pudo registrar la asignación');
  return data as Asignacion;
}

export async function editarAsignacion(id: string, p: Record<string, unknown>, actor: string, actorName: string | null): Promise<Asignacion> {
  const { data, error: e } = await supabase.rpc('asignacion_editar', { p_id: id, p, p_actor: actor, p_actor_name: actorName });
  if (e) throw error(e, 'No se pudo guardar el cambio');
  return data as Asignacion;
}

export async function devolverAsignacion(
  id: string, d: { fecha: string; condicion: CondicionDevolucion; reingresa: boolean; nota: string },
  actor: string, actorName: string | null,
): Promise<Asignacion> {
  const { data, error: e } = await supabase.rpc('asignacion_devolver', {
    p_id: id, p_fecha: d.fecha, p_condicion: d.condicion, p_reingresa: d.reingresa, p_nota: d.nota, p_actor: actor, p_actor_name: actorName,
  });
  if (e) throw error(e, 'No se pudo registrar la devolución');
  return data as Asignacion;
}

export async function anularDevolucion(id: string, actor: string, actorName: string | null): Promise<Asignacion> {
  const { data, error: e } = await supabase.rpc('asignacion_anular_devolucion', { p_id: id, p_actor: actor, p_actor_name: actorName });
  if (e) throw error(e, 'No se pudo anular la devolución');
  return data as Asignacion;
}

export async function eliminarAsignacion(id: string, actor: string, actorName: string | null): Promise<void> {
  const { error: e } = await supabase.rpc('asignacion_eliminar', { p_id: id, p_actor: actor, p_actor_name: actorName });
  if (e) throw error(e, 'No se pudo eliminar la asignación');
}

/* ───────── Vehículos (apartado «Asignación de vehículos») ───────── */

/** Catálogo de vehículos (tabla `vehiculos_catalogo`): activos e inactivos. */
export async function listVehiculosCatalogo(): Promise<VehiculoCatalogo[]> {
  const { data, error: e } = await supabase.from('vehiculos_catalogo').select('*').order('placa');
  if (e) throw error(e, 'No se pudo cargar el catálogo de vehículos');
  return (data ?? []) as VehiculoCatalogo[];
}

/** Agrega (sin `id`) o edita un vehículo del catálogo. */
export async function guardarVehiculo(id: string | null, p: Record<string, unknown>, actor: string): Promise<VehiculoCatalogo> {
  const q = id
    ? supabase.from('vehiculos_catalogo').update({ ...p, updated_by: actor }).eq('id', id)
    : supabase.from('vehiculos_catalogo').insert({ ...p, created_by: actor });
  const { data, error: e } = await q.select('*').single();
  if (e) {
    if (e.code === '23505') throw new Error(`La placa ${String(p.placa ?? '')} ya está en el catálogo.`);
    throw error(e, 'No se pudo guardar el vehículo');
  }
  return data as VehiculoCatalogo;
}

/** Borra un vehículo del catálogo. La base lo impide si tiene asignaciones (se marca inactivo). */
export async function eliminarVehiculo(id: string): Promise<void> {
  const { error: e } = await supabase.from('vehiculos_catalogo').delete().eq('id', id);
  if (e) throw error(e, 'No se pudo borrar el vehículo');
}

/** Guarda el kilometraje con que se devolvió el vehículo (va después de devolver). */
export async function guardarKmDevolucion(id: string, km: number | null, actor: string): Promise<Asignacion> {
  const { data, error: e } = await supabase.rpc('asignacion_km_devolucion', { p_id: id, p_km: km, p_actor: actor });
  if (e) throw error(e, 'No se pudo guardar el kilometraje de devolución');
  return data as Asignacion;
}
