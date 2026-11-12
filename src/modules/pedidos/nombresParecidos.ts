/* ──────────────────────────────────────────────────────────────────────────────
   Nombres PARECIDOS del inventario (12/11/2026).

   Cuando se escribe un nombre genérico en la Solicitud de Pedido, o cuando el analista
   carga la cotización de un renglón genérico que no coincide exacto con ningún producto,
   se sugieren los productos del inventario que se le parecen («¿Es este?»). Así no se
   crea un duplicado sin darse cuenta (p. ej. «CARPETAS OFICIO» vs «CARPETA OFICIO»).

   Es solo una SUGERENCIA: no cambia nada sola. Reglas puras (sin base).
   ────────────────────────────────────────────────────────────────────────────── */

export interface FichaParecida {
  id: string;
  sku: string;
  nombre: string;
  unidad?: string | null;
  estado?: string | null;
}

/** Palabras que no cuentan para comparar. */
const VACIAS = new Set([
  'DE', 'DEL', 'LA', 'LAS', 'EL', 'LOS', 'Y', 'O', 'EN', 'CON', 'SIN', 'PARA', 'POR', 'A', 'AL', 'UN', 'UNA',
  'X', 'UND', 'UNIDAD', 'UNIDADES', 'TIPO',
]);

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Singular simple: CARPETAS → CARPETA, SEPARADORES → SEPARADOR, LAPICES → LAPIZ. */
function singular(p: string): string {
  if (p.length > 4 && p.endsWith('CES')) return `${p.slice(0, -3)}Z`;
  if (p.length > 4 && /[^AEIOU]ES$/.test(p)) return p.slice(0, -2);
  if (p.length > 3 && p.endsWith('S')) return p.slice(0, -1);
  return p;
}

/** Palabras que cuentan de un nombre (mayúsculas, sin acentos, en singular). */
export function palabrasClave(nombre: string | null | undefined): string[] {
  const limpio = sinAcentos(String(nombre ?? '').toUpperCase()).replace(/[^A-Z0-9]+/g, ' ').trim();
  if (!limpio) return [];
  return [...new Set(limpio.split(' ').filter((p) => p && !VACIAS.has(p)).map(singular))];
}

/** ¿Las dos palabras son la misma? Iguales, o una empieza con la otra (mínimo 4 letras). */
function mismaPalabra(a: string, b: string): boolean {
  if (a === b) return true;
  const [corta, larga] = a.length <= b.length ? [a, b] : [b, a];
  return corta.length >= 4 && larga.startsWith(corta);
}

/** Qué tanto se parece el producto a lo escrito (0 a 1). */
export function parecido(escrito: string, producto: string): number {
  const q = palabrasClave(escrito);
  const p = palabrasClave(producto);
  if (!q.length || !p.length) return 0;
  const enComun = q.filter((w) => p.some((x) => mismaPalabra(w, x))).length;
  if (!enComun) return 0;
  // Cuenta lo escrito que está en el producto y, menos, lo del producto que sobra.
  return (enComun / q.length) * 0.75 + (enComun / p.length) * 0.25;
}

/** Clave del nombre exacto (como compara la base: sin acentos ni mayúsculas, espacios simples). */
const claveExacta = (s: string) => sinAcentos(String(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase());

/**
 * Los productos ACTIVOS más parecidos a lo escrito (de mayor a menor). No incluye el que
 * se llama exactamente igual (ese ya se liga solo). `min` = parecido mínimo para sugerir.
 */
export function productosParecidos<T extends FichaParecida>(escrito: string, fichas: T[], max = 4, min = 0.5): T[] {
  const k = claveExacta(escrito);
  if (palabrasClave(escrito).length === 0) return [];
  return fichas
    .filter((f) => (f.estado ?? 'activo') === 'activo' && claveExacta(f.nombre) !== k)
    .map((f) => ({ f, s: parecido(escrito, f.nombre) }))
    .filter((x) => x.s >= min)
    .sort((a, b) => b.s - a.s || a.f.nombre.length - b.f.nombre.length || a.f.nombre.localeCompare(b.f.nombre))
    .slice(0, max)
    .map((x) => x.f);
}

/** El producto que se llama EXACTAMENTE igual (sin importar acentos, mayúsculas ni espacios). */
export function productoMismoNombre<T extends FichaParecida>(escrito: string, fichas: T[]): T | null {
  const k = claveExacta(escrito);
  if (!k) return null;
  return fichas.find((f) => (f.estado ?? 'activo') === 'activo' && claveExacta(f.nombre) === k) ?? null;
}
