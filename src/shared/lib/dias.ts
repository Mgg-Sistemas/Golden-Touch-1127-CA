/* ============================================================
   Golden Touch · Aritmética de días (AAAA-MM-DD)

   Todo se calcula en UTC a partir de las partes de la cadena, nunca con
   `new Date('2026-10-03')` y métodos locales: eso se corre un día en
   Venezuela, que está al oeste de Londres.

   Estas mismas funciones existen en `src/modules/rrhh/descansosPlan.ts`.
   La duplicación es a propósito: ese archivo pertenece a otro módulo y
   cambia a diario; acá viven para quien las necesite sin acoplarse a RRHH.
   ============================================================ */

const DIA_MS = 86_400_000;

/** Las etiquetas de los días, indexadas por `diaDeLaSemana` (0 = domingo). */
export const DIAS_SEMANA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'] as const;

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const;

function aMs(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

function deMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Suma (o resta) días a una fecha AAAA-MM-DD. */
export function sumarDias(iso: string, n: number): string {
  return deMs(aMs(iso) + n * DIA_MS);
}

/** Días de `a` a `b` (b − a). Del 1 al 3 da 2. */
export function difDias(a: string, b: string): number {
  return Math.round((aMs(b) - aMs(a)) / DIA_MS);
}

/** Días que dura un rango, contando los dos extremos. */
export function diasDe(r: { desde: string; hasta: string }): number {
  return difDias(r.desde, r.hasta) + 1;
}

/** Todas las fechas de `desde` a `hasta`, ambas incluidas. Al revés, vacío. */
export function fechasEntre(desde: string, hasta: string): string[] {
  const n = difDias(desde, hasta);
  return n < 0 ? [] : Array.from({ length: n + 1 }, (_, i) => sumarDias(desde, i));
}

/** ¿Se pisan los dos rangos? Los extremos cuentan. */
export function seCruzan(a: { desde: string; hasta: string }, b: { desde: string; hasta: string }): boolean {
  return a.desde <= b.hasta && b.desde <= a.hasta;
}

/** 0 = domingo, 6 = sábado. Igual que el calendario de Descansos. */
export function diaDeLaSemana(iso: string): number {
  return new Date(aMs(iso)).getUTCDay();
}

const dos = (n: number): string => String(n).padStart(2, '0');

export function primerDiaDelMes(anio: number, mes: number): string {
  return `${anio}-${dos(mes)}-01`;
}

/** El día 0 del mes siguiente ES el último del mes pedido: sirve para los 28/29/30/31. */
export function ultimoDiaDelMes(anio: number, mes: number): string {
  return deMs(Date.UTC(anio, mes, 0));
}

export function mesSiguiente(anio: number, mes: number): { anio: number; mes: number } {
  return mes === 12 ? { anio: anio + 1, mes: 1 } : { anio, mes: mes + 1 };
}

export function mesAnterior(anio: number, mes: number): { anio: number; mes: number } {
  return mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 };
}
