/* ============================================================
   Golden Touch · Salidas / Traslados · Directorio de transporte
   Catálogos gestionables de CHOFERES (responsable: nombre, apellido,
   cédula) y VEHÍCULOS (descripción + placa). Ambos con activar /
   desactivar / editar / eliminar, y persistidos en Supabase para
   reutilizarse en cada solicitud (buscables en el formulario).
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';

export interface Chofer {
  id: string;
  nombre: string;
  apellido: string;
  cedula: string;
  activo: boolean;
  orden: number;
  created_by: string | null;
  created_at: string;
}

export interface Vehiculo {
  id: string;
  descripcion: string;
  placa: string;
  activo: boolean;
  orden: number;
  created_by: string | null;
  created_at: string;
}

/** Nombre completo "Apellido, Nombre" / o solo nombre si no hay apellido. */
export function nombreChofer(c: Pick<Chofer, 'nombre' | 'apellido'>): string {
  return [c.nombre, c.apellido].map((s) => (s ?? '').trim()).filter(Boolean).join(' ').trim();
}

/* ───────────── Choferes ───────────── */

export async function listChoferes(soloActivos = false): Promise<Chofer[]> {
  let q = supabase.from('choferes').select('*').order('orden', { ascending: true }).order('nombre', { ascending: true });
  if (soloActivos) q = q.eq('activo', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Chofer[];
}

export async function addChofer(input: { nombre: string; apellido?: string; cedula?: string; actor?: string }): Promise<Chofer> {
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error('Indicá el nombre del chofer.');
  const { data, error } = await supabase.from('choferes').insert({
    nombre,
    apellido: (input.apellido ?? '').trim(),
    cedula: (input.cedula ?? '').trim(),
    created_by: input.actor ?? null,
  }).select('*').single();
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Ya existe un chofer con esa cédula.');
    throw error;
  }
  return data as Chofer;
}

export async function updateChofer(id: string, input: { nombre: string; apellido?: string; cedula?: string }): Promise<void> {
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error('Indicá el nombre del chofer.');
  const { error } = await supabase.from('choferes').update({
    nombre, apellido: (input.apellido ?? '').trim(), cedula: (input.cedula ?? '').trim(),
  }).eq('id', id);
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Ya existe un chofer con esa cédula.');
    throw error;
  }
}

export async function setChoferActivo(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from('choferes').update({ activo }).eq('id', id);
  if (error) throw error;
}

export async function eliminarChofer(id: string): Promise<void> {
  const { error } = await supabase.from('choferes').delete().eq('id', id);
  if (error) throw error;
}

/* ───────────── Vehículos ───────────── */

export async function listVehiculos(soloActivos = false): Promise<Vehiculo[]> {
  let q = supabase.from('vehiculos').select('*').order('orden', { ascending: true }).order('descripcion', { ascending: true });
  if (soloActivos) q = q.eq('activo', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Vehiculo[];
}

export async function addVehiculo(input: { descripcion: string; placa: string; actor?: string }): Promise<Vehiculo> {
  const descripcion = input.descripcion.trim();
  const placa = input.placa.trim().toUpperCase();
  if (!descripcion) throw new Error('Indicá la descripción del vehículo.');
  if (!placa) throw new Error('Indicá la placa del vehículo.');
  const { data, error } = await supabase.from('vehiculos').insert({
    descripcion, placa, created_by: input.actor ?? null,
  }).select('*').single();
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Ya existe un vehículo con esa placa.');
    throw error;
  }
  return data as Vehiculo;
}

export async function updateVehiculo(id: string, input: { descripcion: string; placa: string }): Promise<void> {
  const descripcion = input.descripcion.trim();
  const placa = input.placa.trim().toUpperCase();
  if (!descripcion) throw new Error('Indicá la descripción del vehículo.');
  if (!placa) throw new Error('Indicá la placa del vehículo.');
  const { error } = await supabase.from('vehiculos').update({ descripcion, placa }).eq('id', id);
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Ya existe un vehículo con esa placa.');
    throw error;
  }
}

export async function setVehiculoActivo(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from('vehiculos').update({ activo }).eq('id', id);
  if (error) throw error;
}

export async function eliminarVehiculo(id: string): Promise<void> {
  const { error } = await supabase.from('vehiculos').delete().eq('id', id);
  if (error) throw error;
}
