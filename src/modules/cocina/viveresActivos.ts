/* ============================================================
   Golden Touch · Cocina · Solo víveres activos

   Un producto desactivado en el inventario sale de las listas de Cocina y ya
   no se puede cargar en una comida (02/10/2026). Las pantallas lo quitan solas
   apenas se desactiva; estas reglas son para la que quedó abierta sin señal y
   todavía lo muestra. La misma regla está en la base, en el disparador
   `trg_cocina_comida_solo_viveres_activos`.

   Solo cuenta lo que la comida consume DE MÁS. Una comida vieja que ya traía
   un producto hoy inactivo se puede seguir corrigiendo: bajarle la cantidad,
   quitarlo o cambiar la nota no saca nada nuevo del inventario.
   ============================================================ */

export interface CantidadViver {
  producto_id: string;
  cantidad: number | string | null;
}

function sumar(items: CantidadViver[] | null | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items ?? []) {
    if (!it?.producto_id) continue;
    m.set(it.producto_id, (m.get(it.producto_id) ?? 0) + (Number(it.cantidad) || 0));
  }
  return m;
}

/** Los productos de los que la comida consume MÁS que antes: los nuevos y los que suben de cantidad. */
export function consumenDeMas(
  antes: CantidadViver[] | null | undefined, ahora: CantidadViver[] | null | undefined,
): string[] {
  const viejo = sumar(antes);
  return [...sumar(ahora)].filter(([pid, cant]) => cant > (viejo.get(pid) ?? 0) + 1e-6).map(([pid]) => pid);
}

/** El aviso al intentar cargar productos desactivados. Con uno solo dice lo mismo que la base. */
export function mensajeViveresInactivos(nombres: string[]): string {
  const lista = [...nombres].sort((a, b) => a.localeCompare(b, 'es-VE'));
  if (lista.length === 1) {
    return `"${lista[0]}" está desactivado en el inventario y no se puede cargar en una comida. Quítalo de la lista y vuelve a guardar.`;
  }
  return `Están desactivados en el inventario y no se pueden cargar en una comida: ${lista.join(', ')}. Quítalos de la lista y vuelve a guardar.`;
}
