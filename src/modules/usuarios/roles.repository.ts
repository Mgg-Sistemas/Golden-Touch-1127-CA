import { supabase } from '@/shared/lib/supabase';

export interface CustomRole {
  key: string;
  label: string;
  descripcion: string | null;
  color: string;
  sistema: boolean;
  created_at?: string;
  created_by?: string | null;
}

const TABLE = 'custom_roles';

export async function listRoles(): Promise<CustomRole[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('sistema', { ascending: false })
    .order('label', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CustomRole[];
}

export interface CrearRolInput {
  key: string;
  label: string;
  descripcion?: string;
  color?: string;
  actor?: string;
}

export async function crearRol(input: CrearRolInput): Promise<CustomRole> {
  const key = input.key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 32);
  if (!key) throw new Error('La clave del rol no puede estar vacía');
  const label = input.label.trim();
  if (!label) throw new Error('El nombre del rol es obligatorio');
  const payload = {
    key,
    label,
    descripcion: input.descripcion?.trim() || null,
    color: input.color || '#64748b',
    sistema: false,
    created_by: input.actor ?? null,
  };
  const { data, error } = await supabase.from(TABLE).insert(payload).select('*').single();
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new Error('Ya existe un rol con esa clave');
    }
    throw error;
  }
  return data as CustomRole;
}

export interface ActualizarRolInput {
  label?: string;
  descripcion?: string | null;
  color?: string;
}

/** Actualiza nombre, descripción y/o color de un rol. La clave (key) no se cambia
 *  desde aquí porque cualquier rol del sistema o con permisos cargados depende
 *  de ella; renombrar la etiqueta es suficiente para corregir errores humanos. */
export async function actualizarRol(key: string, patch: ActualizarRolInput): Promise<CustomRole> {
  const payload: Record<string, unknown> = {};
  if (patch.label !== undefined) {
    const lbl = patch.label.trim();
    if (!lbl) throw new Error('El nombre del rol no puede estar vacío');
    payload.label = lbl;
  }
  if (patch.descripcion !== undefined) payload.descripcion = patch.descripcion?.trim() || null;
  if (patch.color !== undefined) payload.color = patch.color;
  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('key', key)
    .select('*')
    .single();
  if (error) throw error;
  return data as CustomRole;
}

export async function eliminarRol(key: string): Promise<void> {
  const { count, error: cErr } = await supabase
    .from('usuarios')
    .select('id', { count: 'exact', head: true })
    .eq('role', key);
  if (cErr) throw cErr;
  if ((count ?? 0) > 0) {
    throw new Error(`No se puede eliminar: hay ${count} usuario(s) con este rol`);
  }
  const { data: rol, error: rErr } = await supabase
    .from(TABLE)
    .select('sistema')
    .eq('key', key)
    .maybeSingle();
  if (rErr) throw rErr;
  if (rol?.sistema) throw new Error('No se puede eliminar un rol del sistema');
  const { error } = await supabase.from(TABLE).delete().eq('key', key);
  if (error) throw error;
}

export async function contarUsuariosPorRol(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('usuarios').select('role');
  if (error) throw error;
  return (data ?? []).reduce<Record<string, number>>((acc, row) => {
    const r = (row as { role: string }).role;
    acc[r] = (acc[r] ?? 0) + 1;
    return acc;
  }, {});
}
