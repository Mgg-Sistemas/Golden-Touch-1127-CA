/* ============================================================
   Golden Touch · RRHH · Catálogos de cargo y departamento
   Departamento: el mismo catálogo de Usuarios (taxonomía compartida
   'usuario.departamento') + los que ya existan en usuarios/personal.
   Cargo: catálogo compartido 'usuario.cargo' + los que ya tenga el
   personal. En ambos se puede agregar uno nuevo y queda disponible.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { listTaxonomia, addTaxonomia, invalidateTaxonomia } from '@/shared/lib/taxonomias';

function ordenar(set: Set<string>): string[] {
  return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));
}

async function columna(tabla: 'usuarios' | 'personal', col: 'departamento' | 'cargo'): Promise<string[]> {
  const { data } = await supabase.from(tabla).select(col);
  return ((data ?? []) as Array<Record<string, string | null>>).map((r) => r[col] ?? '').filter(Boolean);
}

/** Departamentos: taxonomía de Usuarios + valores reales en usuarios y personal. */
export async function listDepartamentos(): Promise<string[]> {
  const [tax, us, pe] = await Promise.all([
    listTaxonomia('usuario.departamento').catch(() => [] as string[]),
    columna('usuarios', 'departamento').catch(() => [] as string[]),
    columna('personal', 'departamento').catch(() => [] as string[]),
  ]);
  const set = new Set<string>();
  [...tax, ...us, ...pe].forEach((v) => set.add(v));
  return ordenar(set);
}

export async function addDepartamento(nombre: string, actorEmail?: string): Promise<string | null> {
  const v = await addTaxonomia('usuario.departamento', nombre, actorEmail);
  invalidateTaxonomia('usuario.departamento');
  return v;
}

/** Cargos: catálogo compartido + los que ya tenga el personal. */
export async function listCargos(): Promise<string[]> {
  const [tax, pe] = await Promise.all([
    listTaxonomia('usuario.cargo').catch(() => [] as string[]),
    columna('personal', 'cargo').catch(() => [] as string[]),
  ]);
  const set = new Set<string>();
  [...tax, ...pe].forEach((v) => set.add(v));
  return ordenar(set);
}

export async function addCargo(nombre: string, actorEmail?: string): Promise<string | null> {
  const v = await addTaxonomia('usuario.cargo', nombre, actorEmail);
  invalidateTaxonomia('usuario.cargo');
  return v;
}
