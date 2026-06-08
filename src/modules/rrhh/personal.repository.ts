/* ============================================================
   Golden Touch · RRHH · Personal (ficha)
   "Usuarios" son los del login; "Personal" engloba a TODO el personal
   a pagar (tengan o no usuario). El sueldo base es MENSUAL (USD).
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { Personal } from '@/shared/lib/types';

const TABLE = 'personal';

/** Lista el personal, ordenado por departamento y nombre. */
export async function listPersonal(soloActivos = false): Promise<Personal[]> {
  let q = supabase.from(TABLE).select('*').order('departamento', { ascending: true, nullsFirst: false }).order('nombre', { ascending: true });
  if (soloActivos) q = q.eq('activo', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Personal[];
}

export interface PersonalInput {
  nombre: string;
  apellido?: string;
  cedula?: string | null;
  cargo?: string | null;
  departamento?: string | null;
  sueldo_base?: number;
  fecha_ingreso?: string | null;
}

function payload(input: PersonalInput) {
  return {
    nombre: input.nombre.trim(),
    apellido: (input.apellido ?? '').trim(),
    cedula: input.cedula?.trim() || null,
    cargo: input.cargo?.trim() || null,
    departamento: input.departamento?.trim() || null,
    sueldo_base: Math.round((Number(input.sueldo_base) || 0) * 100) / 100,
    fecha_ingreso: input.fecha_ingreso || null,
  };
}

export async function crearPersonal(input: PersonalInput, actorEmail?: string): Promise<Personal> {
  if (!input.nombre.trim()) throw new Error('Indicá el nombre.');
  const { data, error } = await supabase.from(TABLE).insert({ ...payload(input), created_by: actorEmail ?? null }).select('*').single();
  if (error) throw error;
  return data as Personal;
}

export async function actualizarPersonal(id: string, patch: PersonalInput): Promise<Personal> {
  if (!patch.nombre.trim()) throw new Error('Indicá el nombre.');
  const { data, error } = await supabase.from(TABLE).update(payload(patch)).eq('id', id).select('*').single();
  if (error) throw error;
  return data as Personal;
}

/** Solo el sueldo base (para "guardar sueldos" desde la carga de nómina). */
export async function guardarSueldoBase(id: string, sueldoBase: number): Promise<void> {
  const { error } = await supabase.from(TABLE).update({ sueldo_base: Math.round((Number(sueldoBase) || 0) * 100) / 100 }).eq('id', id);
  if (error) throw error;
}

/** Activa o desactiva (no borra: conserva el histórico de pagos). */
export async function setPersonalActivo(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from(TABLE).update({ activo }).eq('id', id);
  if (error) throw error;
}

/** Elimina definitivamente una persona del personal. */
export async function eliminarPersonal(id: string): Promise<void> {
  const { data, error } = await supabase.from(TABLE).delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No se pudo eliminar: sin permiso o ya no existía.');
}
