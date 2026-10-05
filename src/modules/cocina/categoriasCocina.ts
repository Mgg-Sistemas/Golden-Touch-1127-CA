/* ============================================================
   Golden Touch · Cocina · Categorías de cocina y regla del «vale de entrega»
   Una sola fuente de verdad para:
   · qué categorías del inventario son COMIDA (las descuenta únicamente
     Distribución de comidas, plato a plato);
   · qué categorías entran al catálogo de Distribución (comida + limpieza);
   · cuándo una salida de material a COCINA es un VALE DE ENTREGA: sigue el
     documento, la nota, las firmas y el correlativo, pero NO toca el stock.
   Desde el 05/10/2026 las categorías las GESTIONA Cocina (tabla `cocina_categorias`,
   botón «⚙ Categorías de cocina»); el candado en la base (trigger
   `vale_cocina_no_toca_stock`) lee la misma tabla. Las raíces de abajo quedan solo de
   respaldo mientras la configuración no se ha cargado.
   ============================================================ */

const norm = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Raíces (sin acentos, minúsculas) de las categorías de COMIDA. Se comparan con
 *  `includes`, así «VÍVERES», «HORTALIZAS Y LEGUMBRES» o «FRUTAS Y JUGOS» entran. */
export const STEMS_COMIDA = [
  'aliment', 'viver', 'carne', 'proteina', 'hortaliza', 'legumbre', 'verdura',
  'fruta', 'jugo', 'bebida', 'refresco', 'lacteo', 'queso', 'huevo', 'pollo', 'pescado',
  'embutido', 'charcuter', 'grano', 'cereal', 'harina', 'pasta', 'condimento', 'especia',
  'panader', 'dulce', 'postre', 'cafe', 'azucar', 'enlatado', 'conserva', 'comida',
] as const;

/** Limpieza va al catálogo de Distribución, pero NO es comida: sale por Salidas y sí descuenta. */
export const STEMS_LIMPIEZA = ['limpi'] as const;

export type TipoCategoriaCocina = 'comida' | 'limpieza';

/** Configuración cargada de `cocina_categorias` (categoría normalizada → tipo).
 *  null = todavía no se cargó: se usan las raíces de respaldo. */
let configurada: Map<string, TipoCategoriaCocina> | null = null;

/** Fija la configuración de categorías de cocina (lo llama el repositorio al cargarla). */
export function fijarCategoriasCocina(filas: { categoria: string; tipo: TipoCategoriaCocina }[] | null): void {
  configurada = filas ? new Map(filas.map((f) => [norm(f.categoria), f.tipo])) : null;
}

/** Tipo de una categoría para Cocina; null = no entra a Cocina. */
export function tipoCategoriaCocina(categoria: string | null | undefined): TipoCategoriaCocina | null {
  const c = norm(categoria);
  if (!c) return null;
  if (configurada) return configurada.get(c) ?? null;
  if (STEMS_COMIDA.some((k) => c.includes(k))) return 'comida';
  if (STEMS_LIMPIEZA.some((k) => c.includes(k))) return 'limpieza';
  return null;
}

/** ¿La categoría es comida? (lo que descuenta solo Distribución de comidas). */
export function esCategoriaComida(categoria: string | null | undefined): boolean {
  return tipoCategoriaCocina(categoria) === 'comida';
}

/** ¿La categoría entra en el catálogo de Distribución de comidas? Comida + limpieza
 *  (sin configuración, el stem «limpi» cubre también la variante «LIMPIENZA»). */
export function esCategoriaViveres(categoria: string | null | undefined): boolean {
  return tipoCategoriaCocina(categoria) !== null;
}

/** ¿La unidad solicitante de la salida es la cocina (o el comedor)? */
export function esUnidadCocina(unidad: string | null | undefined): boolean {
  const u = norm(unidad);
  return u.includes('cocina') || u.includes('comedor');
}

/**
 * Regla: los víveres los descuenta únicamente Distribución de comidas. Una salida
 * a COCINA con comida es un vale de entrega: no toca el stock (el kilo baja cuando
 * se sirve el plato). Limpieza y todo lo demás sí descuentan aunque vayan a cocina.
 */
export function esValeCocina(o: { unidadSolicitante: string | null | undefined; categoria: string | null | undefined }): boolean {
  return esUnidadCocina(o.unidadSolicitante) && esCategoriaComida(o.categoria);
}

export const MSG_VALE_COCINA =
  'Vale de entrega a Cocina: los alimentos no descuentan inventario (el consumo lo registra Distribución de comidas, plato a plato).';
