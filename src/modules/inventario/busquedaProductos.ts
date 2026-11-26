import { norm } from '@/shared/lib/texto';
import { depositoDe, resolverDeposito } from './depositos';

/** Campos del producto que puede aprovechar el buscador (todos opcionales para
 *  poder usarlo también con las filas resumidas del buscador global). */
export interface ProductoBuscable {
  id?: string;
  sku?: string | null;
  nombre?: string | null;
  nombre_busqueda?: string | null;
  nombre_busq?: string | null;
  marca?: string | null;
  modelo?: string | null;
  serial?: string | null;
  codigo?: string | null;
  numero?: string | null;
  unidad?: string | null;
  categoria?: string | null;
  descripcion?: string | null;
  ubicacion?: string | null;
  almacen?: string | null;
  sku_anteriores?: string[] | null;
}

// Conectores que no distinguen un producto de otro. Así «TIZA DE HERRERÍA»
// encuentra la ficha existente «TIZA PARA HERRERÍA» en vez de decir que no hay nada.
const CONECTORES = new Set(['a', 'al', 'de', 'del', 'el', 'la', 'las', 'los', 'para', 'por', 'y']);

/** Palabras útiles de una búsqueda, sin acentos ni mayúsculas. Si TODO el
 *  término son conectores se conservan: nunca se devuelve una lista vacía que
 *  haría coincidir accidentalmente con todos los productos. */
export function tokensBusquedaProducto(texto: string | null | undefined): string[] {
  const tokens = norm(texto).split(/\s+/).filter(Boolean);
  const utiles = tokens.filter((t) => !CONECTORES.has(t));
  return utiles.length ? utiles : tokens;
}

/** Texto completo donde se busca: nombre, SKU (también anteriores), detalle,
 *  categoría, medida y ubicación. */
export function textoBusquedaProducto(p: ProductoBuscable): string {
  return [
    p.sku, p.nombre, p.nombre_busqueda, p.nombre_busq, p.marca, p.modelo,
    p.serial, p.codigo, p.numero, p.unidad, p.categoria, p.descripcion, p.ubicacion,
    ...(p.sku_anteriores ?? []),
  ].map((campo) => norm(String(campo ?? ''))).join(' ');
}

/** Cada palabra útil debe aparecer en algún dato, sin exigir que la frase sea
 *  literal ni que esté en el mismo orden. */
export function coincideBusquedaProducto(p: ProductoBuscable, busqueda: string): boolean {
  const tokens = tokensBusquedaProducto(busqueda);
  if (!tokens.length) return true;
  const texto = textoBusquedaProducto(p);
  return tokens.every((token) => texto.includes(token));
}

/** Ficha del producto en SU depósito. Antes el buscador global mandaba todo al
 *  Inventario General y una ficha de Mina parecía inexistente al abrirla. */
export function rutaDetalleProducto(p: { id: string; almacen?: string | null }): string {
  const deposito = resolverDeposito(depositoDe(p));
  return `${deposito.ruta}?detalle=${encodeURIComponent(p.id)}`;
}
