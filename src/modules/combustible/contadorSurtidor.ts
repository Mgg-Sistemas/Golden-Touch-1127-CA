/* ============================================================
   Golden Touch · Combustible · El contador del surtidor

   LA REGLA (02/10/2026). El contador del surtidor de un tanque es un
   totalizador: lo que marca AL TERMINAR un surtido es donde ARRANCA el
   siguiente. La cadena no se puede cortar.

   QUÉ PASABA. El contador final era opcional. El que surtía cargaba los
   litros y dejaba el contador vacío; el movimiento quedaba «434150 → —» y,
   como no había final nuevo, el siguiente surtido volvía a arrancar en
   434150. El contador se quedaba clavado en el mismo número aunque el
   tanque siguiera despachando.

   QUÉ SE HACE AHORA. Si el final viene vacío se guarda inicial + litros, que
   es lo que el surtidor tiene que marcar. Si el que surte escribe la lectura
   real, vale la lectura: es el dato físico, y la pantalla avisa cuando no
   coincide con los litros. El inicial, si no viene, es el mayor final del
   tanque.

   Solo los movimientos que SALEN POR EL SURTIDOR mueven su contador: el
   surtido a un equipo y el traslado. Una entrada, un retorno o una merma no
   pasan por la manguera.
   ============================================================ */
import type { TipoMovTanque } from '@/shared/lib/types';

/** ¿Este movimiento sale por el surtidor del tanque y hace avanzar su contador? */
export function pasaPorSurtidor(tipo: TipoMovTanque): boolean {
  return tipo === 'uso' || tipo === 'traslado';
}

const numero = (v: number | null | undefined): number | null =>
  (v == null || !Number.isFinite(Number(v)) ? null : Number(v));

const redondear = (v: number): number => Math.round(v * 100) / 100;

/**
 * El contador final que se guarda si el campo queda vacío: inicial + litros.
 *
 * Sin inicial no hay de dónde sumar, y con litros en cero o negativos (las
 * correcciones «como en el Excel») el surtidor no avanzó: en los dos casos no
 * se propone nada y el campo queda como venga.
 */
export function contadorFinalPropuesto(ini: number | null | undefined, litros: number | null | undefined): number | null {
  const i = numero(ini);
  const l = numero(litros);
  if (i === null || l === null || l <= 0) return null;
  return redondear(i + l);
}

export interface ContadorMovimiento {
  ini: number | null;
  fin: number | null;
}

/**
 * Deja completo el contador de un movimiento antes de guardarlo.
 *
 * - Inicial: el que vino del formulario o, si no vino, el último del tanque.
 * - Final: el que escribieron (la lectura real manda) o, si quedó vacío,
 *   inicial + litros.
 *
 * Lo que no sale por el surtidor se devuelve como vino.
 */
export function completarContador(e: {
  tipo: TipoMovTanque;
  litros: number;
  ini?: number | null;
  fin?: number | null;
  /** Mayor contador final del tanque, por si el formulario no trajo el inicial. */
  ultimo?: number | null;
}): ContadorMovimiento {
  const ini = numero(e.ini);
  const fin = numero(e.fin);
  if (!pasaPorSurtidor(e.tipo)) return { ini, fin };
  const arranque = ini ?? numero(e.ultimo);
  return { ini: arranque, fin: fin ?? contadorFinalPropuesto(arranque, e.litros) };
}
