/* ============================================================
   Golden Touch · Geodesta · Reglas del calendario

   Lógica pura: armar la rejilla del mes, saber qué actividades tocan un
   día, y recortar una barra al mes que se está viendo. Los componentes
   solo dibujan lo que estas funciones deciden.
   ============================================================ */
import {
  diaDeLaSemana, difDias, primerDiaDelMes, seCruzan, sumarDias, ultimoDiaDelMes,
} from '@/shared/lib/dias';

/** Seis semanas siempre: así la rejilla no cambia de alto al pasar de mes. */
export const CELDAS_REJILLA = 42;

export interface CeldaMes {
  fecha: string;
  /** false = relleno del mes anterior o del siguiente. No se toca. */
  delMes: boolean;
  esHoy: boolean;
  /** 0 = domingo. */
  diaSemana: number;
}

export interface Tramo {
  /** Columna donde arranca la barra, 0 = día 1 del mes. */
  col0: number;
  /** Columna donde termina, incluida. Una actividad de un día tiene col0 === col1. */
  col1: number;
  /** Viene de antes del mes. */
  cortaIzq: boolean;
  /** Sigue después del mes. */
  cortaDer: boolean;
}

export function limitesDelMes(anio: number, mes: number): { ini: string; fin: string } {
  return { ini: primerDiaDelMes(anio, mes), fin: ultimoDiaDelMes(anio, mes) };
}

/** Las 42 celdas del mes, arrancando el domingo de la semana del día 1. */
export function rejillaDelMes(anio: number, mes: number, hoy: string): CeldaMes[] {
  const ini = primerDiaDelMes(anio, mes);
  const arranque = sumarDias(ini, -diaDeLaSemana(ini));
  const prefijo = `${anio}-${String(mes).padStart(2, '0')}`;
  return Array.from({ length: CELDAS_REJILLA }, (_, i) => {
    const fecha = sumarDias(arranque, i);
    return {
      fecha,
      delMes: fecha.slice(0, 7) === prefijo,
      esHoy: fecha === hoy,
      diaSemana: diaDeLaSemana(fecha),
    };
  });
}

/** Las actividades que TOCAN ese día: una de tres días sale en los tres. */
export function actividadesDelDia<T extends { desde: string; hasta: string }>(acts: readonly T[], dia: string): T[] {
  return acts.filter((a) => a.desde <= dia && dia <= a.hasta);
}

/**
 * Dónde dibujar la barra dentro del mes, recortada a lo que se ve.
 * `null` si la actividad no toca el mes. Nunca devuelve columnas fuera de
 * rango: sin esto, una actividad que viene de agosto desbordaría la rejilla.
 */
export function tramoEnElMes(
  act: { desde: string; hasta: string }, mesIni: string, mesFin: string,
): Tramo | null {
  if (!seCruzan(act, { desde: mesIni, hasta: mesFin })) return null;
  const ini = act.desde < mesIni ? mesIni : act.desde;
  const fin = act.hasta > mesFin ? mesFin : act.hasta;
  return {
    col0: difDias(mesIni, ini),
    col1: difDias(mesIni, fin),
    cortaIzq: act.desde < mesIni,
    cortaDer: act.hasta > mesFin,
  };
}

/** Lo que toca hoy, venga de antes o arranque hoy. */
export function deHoy<T extends { desde: string; hasta: string }>(acts: readonly T[], hoy: string): T[] {
  return actividadesDelDia(acts, hoy);
}

/** Lo que ARRANCA en los próximos `n` días. No repite lo de hoy. */
export function proximosDias<T extends { desde: string; hasta: string }>(
  acts: readonly T[], hoy: string, n = 7,
): T[] {
  const fin = sumarDias(hoy, n);
  return acts.filter((a) => a.desde > hoy && a.desde <= fin)
    .slice().sort((a, b) => a.desde.localeCompare(b.desde));
}

/** Ya pasó y sigue sin marcar. Lo más viejo primero: es lo que más urge. */
export function sinMarcar<T extends { hasta: string; estado: string }>(acts: readonly T[], hoy: string): T[] {
  return acts.filter((a) => a.hasta < hoy && a.estado === 'planificada')
    .slice().sort((a, b) => a.hasta.localeCompare(b.hasta));
}
