/* ============================================================
   Golden Touch · Combustible · El horómetro del equipo

   LA REGLA (02/10/2026). El horómetro de un equipo es un totalizador de
   horas de máquina: horas trabajadas = horómetro final − horómetro inicial,
   y el final de un surtido es donde arranca el inicial del siguiente surtido
   del mismo equipo. La cadena no se puede cortar ni retroceder.

   QUÉ PASABA. La columna horas_utilizadas existía en la base y se mostraba
   en la tabla, el Excel y el PDF, pero NADIE la escribía: salía siempre
   vacía. Y en la vista del teléfono se podía guardar un final menor que el
   inicial, que dejaba horas negativas y arrancaba mal el surtido siguiente.

   QUÉ SE HACE AHORA. Las horas se calculan acá y se guardan con el
   movimiento (y se recalculan cuando el re-encadenado corrige el inicial).
   Un final menor que el inicial no se deja guardar.
   ============================================================ */

const numero = (v: number | null | undefined): number | null =>
  (v == null || !Number.isFinite(Number(v)) ? null : Number(v));

const redondear = (v: number): number => Math.round(v * 100) / 100;

/**
 * Horas trabajadas = horómetro final − horómetro inicial.
 * Si falta cualquiera de las dos lecturas no hay nada que calcular: null.
 * Cero es válido: se surtió un equipo que no trabajó desde el surtido anterior.
 */
export function horasTrabajadas(hi: number | null | undefined, hf: number | null | undefined): number | null {
  const i = numero(hi);
  const f = numero(hf);
  if (i === null || f === null) return null;
  return redondear(f - i);
}

/**
 * Falta el horómetro final de un surtido a un equipo que ya trae horómetro (02/10/2026).
 * Sin el final no hay horas trabajadas, el mantenimiento no avanza y el próximo surtido
 * del equipo arranca con un inicial viejo. En el teléfono el final quedaba escondido en
 * «Más datos» y casi nunca se cargaba. Un equipo sin horómetro previo (bidones, apoyo)
 * no lo exige: no hay cadena que cortar.
 */
export function faltaHorometroFinal(hi: number | null | undefined, hf: number | null | undefined): string | null {
  if (numero(hi) === null || numero(hf) !== null) return null;
  return `Escribe el horómetro final (o el kilometraje del tablero). Arrancó en ${numero(hi)}: con el final salen las horas trabajadas para el mantenimiento y de ahí arranca el próximo surtido.`;
}

/**
 * Qué impide guardar estas lecturas, o null si están bien.
 * Solo hay una causa: un final menor que el inicial. Las horas saldrían
 * negativas y el próximo surtido del equipo arrancaría con el horómetro
 * retrocedido.
 */
export function errorHorometro(hi: number | null | undefined, hf: number | null | undefined): string | null {
  const h = horasTrabajadas(hi, hf);
  if (h === null || h >= 0) return null;
  return `El horómetro final (${numero(hf)}) no puede ser menor que el inicial (${numero(hi)}): las horas trabajadas saldrían negativas. Revisa la lectura.`;
}
