import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Trae TODAS las filas de una consulta paginando con `.range()`, sorteando el tope de
 * 1.000 filas por respuesta de PostgREST (que corta SIN avisar). Necesario cuando una
 * tabla puede superar las 1.000 filas (p. ej. `movimientos`) y se lee entera en una llamada.
 *
 * `construir(desde, hasta)` debe devolver la consulta YA filtrada/ordenada con `.range(desde, hasta)`
 * aplicado. Importante: la consulta debe llevar un `order` ESTABLE (con desempate único, p. ej.
 * `.order('at').order('id')`) para que las páginas no se solapen ni salten filas.
 */
export async function todasLasFilas<T>(
  construir: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  tam = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += tam) {
    const { data, error } = await construir(desde, desde + tam - 1);
    if (error) throw error;
    const filas = data ?? [];
    out.push(...filas);
    if (filas.length < tam) break;
  }
  return out;
}
