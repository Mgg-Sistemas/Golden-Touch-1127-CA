/* ============================================================
   Golden Touch · RRHH · Carga familiar
   Quiénes dependen del trabajador. De acá sale poder agrupar la lista por
   «con hijos / sin hijos», que antes no se podía saber porque el dato no
   existía en ningún lado.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { PersonalFamiliar } from '@/shared/lib/types';

const TABLE = 'personal_familiares';

export interface FamiliarInput {
  nombre: string;
  parentesco: PersonalFamiliar['parentesco'];
  fecha_nacimiento?: string | null;
  cedula?: string | null;
  genero?: PersonalFamiliar['genero'];
  estudia?: boolean;
  discapacidad?: boolean;
  observacion?: string | null;
}

function payload(personalId: string, f: FamiliarInput, actor?: string) {
  return {
    personal_id: personalId,
    nombre: f.nombre.trim(),
    parentesco: f.parentesco,
    fecha_nacimiento: f.fecha_nacimiento || null,
    cedula: f.cedula?.trim() || null,
    genero: f.genero || null,
    estudia: !!f.estudia,
    discapacidad: !!f.discapacidad,
    observacion: f.observacion?.trim() || null,
    created_by: actor ?? null,
  };
}

/** La carga familiar de una persona. */
export async function listFamiliares(personalId: string): Promise<PersonalFamiliar[]> {
  const { data, error } = await supabase
    .from(TABLE).select('*').eq('personal_id', personalId)
    .order('parentesco').order('fecha_nacimiento', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as PersonalFamiliar[];
}

/** Toda la carga familiar, para agrupar y contar la lista sin una consulta por persona. */
export async function listFamiliaresDeTodos(): Promise<Map<string, PersonalFamiliar[]>> {
  const { data, error } = await supabase.from(TABLE).select('*');
  if (error) throw error;
  const m = new Map<string, PersonalFamiliar[]>();
  for (const f of (data ?? []) as PersonalFamiliar[]) {
    const g = m.get(f.personal_id);
    if (g) g.push(f); else m.set(f.personal_id, [f]);
  }
  return m;
}

export async function agregarFamiliar(
  personalId: string, input: FamiliarInput, actor?: string,
): Promise<PersonalFamiliar> {
  if (!input.nombre.trim()) throw new Error('Indicá el nombre del familiar.');
  const { data, error } = await supabase.from(TABLE)
    .insert(payload(personalId, input, actor)).select('*').single();
  if (error) throw error;
  return data as PersonalFamiliar;
}

export async function actualizarFamiliar(
  id: string, personalId: string, input: FamiliarInput,
): Promise<PersonalFamiliar> {
  if (!input.nombre.trim()) throw new Error('Indicá el nombre del familiar.');
  const { created_by: _omitir, ...campos } = payload(personalId, input);
  const { data, error } = await supabase.from(TABLE)
    .update(campos).eq('id', id).select('*').single();
  if (error) throw error;
  return data as PersonalFamiliar;
}

export async function borrarFamiliar(id: string): Promise<void> {
  const { data, error } = await supabase.from(TABLE).delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No se pudo quitar: sin permiso o ya no existía.');
}
