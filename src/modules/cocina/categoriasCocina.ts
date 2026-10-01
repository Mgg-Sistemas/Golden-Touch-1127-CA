/* ============================================================
   Golden Touch · Cocina · Categorías de cocina y regla del «vale de entrega»
   Una sola fuente de verdad para:
   · qué categorías del inventario son COMIDA (las descuenta únicamente
     Distribución de comidas, plato a plato);
   · qué categorías entran al catálogo de Distribución (comida + limpieza);
   · cuándo una salida de material a COCINA es un VALE DE ENTREGA: sigue el
     documento, la nota, las firmas y el correlativo, pero NO toca el stock.
   El candado en la base (trigger `vale_cocina_no_toca_stock`) usa las mismas
   raíces: si se agrega una aquí, agregarla también allá.
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

/** ¿La categoría es comida? (lo que descuenta solo Distribución de comidas). */
export function esCategoriaComida(categoria: string | null | undefined): boolean {
  const c = norm(categoria);
  return !!c && STEMS_COMIDA.some((k) => c.includes(k));
}

/** ¿La categoría entra en el catálogo de Distribución de comidas? Comida + limpieza
 *  (el stem «limpi» cubre también la variante mal escrita «LIMPIENZA»). */
export function esCategoriaViveres(categoria: string | null | undefined): boolean {
  const c = norm(categoria);
  return !!c && (esCategoriaComida(c) || STEMS_LIMPIEZA.some((k) => c.includes(k)));
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
