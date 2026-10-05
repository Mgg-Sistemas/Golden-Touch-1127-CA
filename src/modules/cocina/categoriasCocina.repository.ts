/* ============================================================
   Golden Touch · Cocina · Categorías de cocina (Supabase)
   Tabla `cocina_categorias`: qué categorías del inventario entran a Cocina
   y si son comida o limpieza (ver `categoriasCocina.ts`).
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { fijarCategoriasCocina, type TipoCategoriaCocina } from './categoriasCocina';

export interface CategoriaCocina { categoria: string; tipo: TipoCategoriaCocina }

const TABLE = 'cocina_categorias';

/** Lee la configuración y la deja fijada para las reglas de cocina/salidas. */
export async function cargarCategoriasCocina(): Promise<CategoriaCocina[]> {
  const { data, error } = await supabase.from(TABLE).select('categoria, tipo').order('categoria');
  if (error) throw error;
  const filas = (data ?? []) as CategoriaCocina[];
  fijarCategoriasCocina(filas);
  return filas;
}

/** Igual que `cargarCategoriasCocina`, pero si falla deja las reglas de respaldo y sigue. */
export async function asegurarCategoriasCocina(): Promise<void> {
  try { await cargarCategoriasCocina(); } catch { /* quedan las raíces de respaldo */ }
}

/** Pone una categoría como comida/limpieza, o la saca de Cocina (`null`). */
export async function guardarCategoriaCocina(categoria: string, tipo: TipoCategoriaCocina | null, actor: string | null): Promise<void> {
  const c = categoria.trim();
  if (!c) throw new Error('Categoría vacía.');
  if (tipo === null) {
    const { error } = await supabase.from(TABLE).delete().eq('categoria', c);
    if (error) throw error;
  } else {
    const { error } = await supabase.from(TABLE).upsert({ categoria: c, tipo, created_by: actor }, { onConflict: 'categoria' });
    if (error) throw error;
  }
  await cargarCategoriasCocina();
}
