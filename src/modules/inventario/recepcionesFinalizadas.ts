/* ============================================================
   Golden Touch · Inventario · Recepciones finalizadas
   En la pantalla se ven solo las más recientes; el resto pasa al
   Histórico, una lista buscable. Reglas puras (sin Supabase).
   ============================================================ */

/** Cuántas recepciones finalizadas se muestran como tarjetas. */
export const MAX_RECEPCIONES_VISIBLES = 10;

export interface RecepcionBuscable {
  created_at: string;
  codigo: string;
  oc_codigo?: string | null;
  solicitante?: string | null;
  items?: { nombre?: string | null; sku?: string | null; cantidad?: number | string | null }[] | null;
}

const fecha = (o: { created_at: string }) => Date.parse(o.created_at ?? '') || 0;

/** Sin mayúsculas, sin acentos y sin espacios de sobra: «jesus» encuentra «JESÚS». */
function normalizar(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim();
}

/** Las más recientes (para las tarjetas) y las anteriores (para el Histórico). */
export function partirRecepciones<T extends { created_at: string }>(
  ordenes: T[], max = MAX_RECEPCIONES_VISIBLES,
): { recientes: T[]; anteriores: T[] } {
  const ordenadas = [...ordenes].sort((a, b) => fecha(b) - fecha(a));
  return { recientes: ordenadas.slice(0, max), anteriores: ordenadas.slice(max) };
}

/** Filtra por código, OC, quién solicitó o producto (nombre o SKU). Cada palabra tiene que aparecer. */
export function filtrarRecepciones<T extends RecepcionBuscable>(ordenes: T[], consulta: string): T[] {
  const palabras = normalizar(consulta).split(' ').filter(Boolean);
  if (!palabras.length) return ordenes;
  return ordenes.filter((o) => {
    const productos = (o.items ?? []).map((it) => `${it.nombre ?? ''} ${it.sku ?? ''}`).join(' ');
    const texto = normalizar(`${o.codigo} ${o.oc_codigo ?? ''} ${o.solicitante ?? ''} ${productos}`);
    return palabras.every((p) => texto.includes(p));
  });
}

/** Unidades totales de la orden. */
export function unidadesDeOrden(o: Pick<RecepcionBuscable, 'items'>): number {
  return (o.items ?? []).reduce((a, it) => a + (Number(it.cantidad) || 0), 0);
}
