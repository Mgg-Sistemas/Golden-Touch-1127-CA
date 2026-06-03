/* ============================================================
   Golden Touch · Producción · Hornos (Supabase)
   Catálogo de hornos. Se administran como las categorías:
   alta, renombrado e inhabilitación (con motivo). El campo
   `produccion.horno` guarda el NOMBRE del horno (texto).
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { Horno } from '@/shared/lib/types';

const TABLE = 'hornos';

/** Todos los hornos (activos e inhabilitados), ordenados por nombre. */
export async function listHornos(): Promise<Horno[]> {
  const { data, error } = await supabase.from(TABLE).select('*').order('nombre', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Horno[];
}

/** Solo nombres de hornos ACTIVOS — para poblar el desplegable del formulario. */
export async function getNombresHornosActivos(): Promise<string[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('nombre')
    .eq('estado', 'activo')
    .order('nombre', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((h) => (h as { nombre: string }).nombre);
}

export async function crearHorno(nombre: string, actorEmail?: string): Promise<Horno> {
  const limpio = nombre.trim();
  if (!limpio) throw new Error('El nombre del horno es obligatorio');
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ nombre: limpio, created_by: actorEmail ?? null })
    .select('*')
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Ya existe un horno con ese nombre');
    throw error;
  }
  return data as Horno;
}

export async function renombrarHorno(id: string, nombre: string): Promise<Horno> {
  const limpio = nombre.trim();
  if (!limpio) throw new Error('El nombre del horno no puede estar vacío');
  const { data, error } = await supabase
    .from(TABLE)
    .update({ nombre: limpio, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Ya existe un horno con ese nombre');
    throw error;
  }
  return data as Horno;
}

/** Inhabilita un horno guardando el MOTIVO (obligatorio). */
export async function deshabilitarHorno(id: string, motivo: string): Promise<Horno> {
  const m = motivo.trim();
  if (!m) throw new Error('Indicá el motivo por el cual se deshabilita el horno');
  const { data, error } = await supabase
    .from(TABLE)
    .update({ estado: 'inactivo', motivo_inhabilitacion: m, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Horno;
}

/** Reactiva un horno previamente inhabilitado (limpia el motivo). */
export async function habilitarHorno(id: string): Promise<Horno> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ estado: 'activo', motivo_inhabilitacion: null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Horno;
}
