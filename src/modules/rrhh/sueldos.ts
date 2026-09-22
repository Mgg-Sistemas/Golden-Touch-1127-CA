/* ============================================================
   Golden Touch · RRHH · Sueldos (cálculo puro)

   Hasta ahora el sueldo de una persona era UN SOLO NÚMERO que se pisaba:
   cambiarlo borraba el anterior y no quedaba ni cuándo ni por qué. Acá vive
   lo que se puede calcular y validar sin tocar la base: de cuánto a cuánto,
   cuánto se movió, y si el cambio está en condiciones de registrarse.

   Las mismas reglas están escritas también en la base (la función
   `cambiar_sueldo`), a propósito: acá avisan antes de guardar, allá impiden
   que entre un cambio sin motivo por cualquier otro camino.
   ============================================================ */

/** Motivos de uso corriente. «Otro» abre el campo para escribirlo. */
export const MOTIVOS_SUELDO = [
  'Aumento',
  'Ajuste por inflación',
  'Ascenso',
  'Cambio de cargo',
  'Acuerdo con el trabajador',
  'Corrección de carga',
  'Reducción acordada',
  'Otro',
] as const;

export type MotivoSueldo = (typeof MOTIVOS_SUELDO)[number];

/** El motivo que escribe la base cuando el sueldo se movió por fuera del sistema. */
export const MOTIVO_SIN_REGISTRAR = 'Cambio sin motivo registrado (se guardó por otra vía)';

export interface VariacionSueldo {
  /** Diferencia en dólares (negativa si bajó). */
  monto: number;
  /** Porcentaje sobre el sueldo anterior. `null` cuando no había sueldo
   *  anterior: no se puede calcular un porcentaje sobre cero. */
  porcentaje: number | null;
  sentido: 'sube' | 'baja' | 'igual';
}

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** De cuánto a cuánto se movió el sueldo. */
export function variacionSueldo(anterior: number | null | undefined, nuevo: number | null | undefined): VariacionSueldo {
  const a = round2(n(anterior));
  const b = round2(n(nuevo));
  const monto = round2(b - a);
  const sentido = monto > 0 ? 'sube' : monto < 0 ? 'baja' : 'igual';
  // Sobre cero no hay porcentaje que calcular: un sueldo que arranca en 300
  // no "subió un 100%", simplemente es el primero que tuvo.
  const porcentaje = a > 0 ? Math.round((monto / a) * 1000) / 10 : null;
  return { monto, porcentaje, sentido };
}

/**
 * Lo que impide registrar el cambio, en palabras. `null` = se puede guardar.
 * Se mira primero el monto y después el motivo: si alguien escribió el mismo
 * sueldo, pedirle el motivo primero lo manda a llenar un campo al pedo.
 */
export function errorCambioSueldo(
  actual: number | null | undefined,
  nuevo: number | null | undefined,
  motivo: string,
): string | null {
  // Un valor que falta NO es cero: `Number(null)` da 0, y dejar pasar eso
  // sería poner en cero el sueldo de alguien porque se vació el campo.
  if (nuevo === null || nuevo === undefined) return 'Escribí el sueldo nuevo.';
  const b = Number(nuevo);
  if (!Number.isFinite(b)) return 'Escribí el sueldo nuevo.';
  if (b < 0) return 'El sueldo no puede ser negativo.';
  if (round2(n(actual)) === round2(b)) return 'El sueldo es el mismo que ya tenía. No hay cambio que registrar.';
  if (!String(motivo ?? '').trim()) return 'Indicá el motivo del cambio de sueldo.';
  return null;
}

/** «+50,00 USD (+16,7%)» — para mostrar la variación de un renglón. */
export function etiquetaVariacion(v: VariacionSueldo): string {
  if (v.sentido === 'igual') return 'Sin cambio';
  const signo = v.monto > 0 ? '+' : '−';
  const monto = Math.abs(v.monto).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v.porcentaje === null) return `${signo}${monto} USD`;
  const pct = Math.abs(v.porcentaje).toLocaleString('es-VE', { maximumFractionDigits: 1 });
  return `${signo}${monto} USD (${signo}${pct}%)`;
}

/**
 * El motivo que se guarda. Con «Otro» vale lo que se escribió a mano, y si no
 * se escribió nada devuelve cadena vacía: así la validación lo toma como
 * faltante en vez de dejar guardada la palabra «Otro», que no dice nada.
 */
export function motivoFinal(elegido: string, escrito: string): string {
  if (elegido === 'Otro') return String(escrito ?? '').trim();
  return String(elegido ?? '').trim();
}
