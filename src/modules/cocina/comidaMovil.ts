/* ============================================================
   Golden Touch · Cocina · Reglas de la vista de teléfono

   La pantalla del que sirve la comida: elige desayuno, almuerzo o cena, pone
   cuántas personas comieron y qué se consumió, y guarda. Aquí vive lo que
   hay que decidir sin pantalla, para poder probarlo:

   · QUÉ DÍA ES. El día del servicio se lee siempre en la hora de Caracas
     (UTC−4), no en la del teléfono ni en UTC. Una cena cargada a las 9 de la
     noche es de hoy, no de mañana.

   · A QUÉ HORA QUEDA. La comida de hoy queda con la hora en que se cargó. La
     de un día anterior no tiene «hora en que se cargó» que valga: queda con
     la hora habitual de esa comida (7, 12 o 19), que es la que la ubica bien
     dentro de su día. Al editar se conserva la hora original, y si el día no
     cambió no se toca nada: así una comida de la mañana corregida por la
     tarde no cambia de ciclo de mercado.

   · SI YA ESTABA CARGADA. Se avisa, no se bloquea: puede haber dos almuerzos
     el mismo día (dos turnos), pero lo normal es que sea un doble registro.
   ============================================================ */
import type { CocinaMovimiento, TipoComida } from './cocina.repository';

/** Caracas no tiene horario de verano: siempre UTC−4. */
const MS_CARACAS = 4 * 60 * 60 * 1000;
const RX_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Hora habitual de cada comida, para ubicar la que se carga de un día anterior. */
export const HORA_COMIDA: Record<TipoComida, string> = {
  desayuno: '07:00:00',
  almuerzo: '12:00:00',
  cena: '19:00:00',
};

function enCaracas(at: string | Date | null | undefined): Date | null {
  const d = at instanceof Date ? at : new Date(at ?? '');
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() - MS_CARACAS);
}

/** El día del servicio (AAAA-MM-DD) en la hora de Caracas. */
export function diaCaracas(at: string | Date | null | undefined): string {
  return enCaracas(at)?.toISOString().slice(0, 10) ?? '';
}

/** La hora (HH:MM:SS) en Caracas. */
export function horaCaracas(at: string | Date | null | undefined): string {
  return enCaracas(at)?.toISOString().slice(11, 19) ?? '';
}

/** «Hoy» en Caracas. */
export function hoyCaracas(ahora: Date = new Date()): string {
  return diaCaracas(ahora);
}

function instante(fecha: string, hora: string): string {
  return new Date(`${fecha}T${hora}-04:00`).toISOString();
}

/**
 * El instante (`at`) con el que se guarda la comida, o `undefined` si no hay
 * que tocarlo (al editar sin cambiar el día).
 */
export function instanteServicio(e: {
  fecha: string;
  tipo: TipoComida;
  ahora?: Date;
  /** `at` que ya tenía, si se está editando. */
  originalAt?: string | null;
}): string | undefined {
  if (!RX_DIA.test(e.fecha)) return undefined;
  const ahora = e.ahora ?? new Date();
  if (e.originalAt) {
    if (diaCaracas(e.originalAt) === e.fecha) return undefined;
    return instante(e.fecha, horaCaracas(e.originalAt) || HORA_COMIDA[e.tipo]);
  }
  if (e.fecha === hoyCaracas(ahora)) return ahora.toISOString();
  return instante(e.fecha, HORA_COMIDA[e.tipo]);
}

/** Qué está mal con la fecha elegida, o `null` si sirve. */
export function errorFechaComida(fecha: string, hoy: string): string | null {
  if (!RX_DIA.test(fecha)) return 'Indica la fecha de la comida.';
  if (fecha > hoy) return 'La fecha no puede ser de un día que todavía no llegó.';
  return null;
}

/** Qué está mal con la cantidad de personas, o `null` si sirve. */
export function errorPersonas(texto: string): string | null {
  const n = Number(String(texto).replace(',', '.'));
  if (!String(texto).trim() || !Number.isFinite(n) || n <= 0) return 'Indica cuántas personas comieron.';
  if (!Number.isInteger(n)) return 'La cantidad de personas va sin decimales.';
  return null;
}

type ComidaFechada = Pick<CocinaMovimiento, 'id' | 'at' | 'tipo_comida'>;

/**
 * ¿Ya hay una comida de ese tipo cargada para ese día? Devuelve la primera que
 * encuentra, para decir cuál es. `exceptoId` es la que se está editando.
 */
export function yaCargada<T extends ComidaFechada>(movs: T[], fecha: string, tipo: TipoComida, exceptoId?: string | null): T | null {
  return movs.find((m) => m.id !== exceptoId && m.tipo_comida === tipo && diaCaracas(m.at) === fecha) ?? null;
}

/** «Hoy», «Ayer» o DD/MM/AAAA, para que la lista se lea de un vistazo. */
export function etiquetaDia(fecha: string, hoy: string): string {
  if (!RX_DIA.test(fecha)) return '';
  if (fecha === hoy) return 'Hoy';
  const ayer = new Date(`${hoy}T12:00:00Z`);
  ayer.setUTCDate(ayer.getUTCDate() - 1);
  if (fecha === ayer.toISOString().slice(0, 10)) return 'Ayer';
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}/${fecha.slice(0, 4)}`;
}

/** El día que está `dias` antes de `hoy` (para traer solo lo reciente). */
export function diasAtras(hoy: string, dias: number): string {
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}
