/* ============================================================
   Golden Touch · Geodesta · La actividad planificada

   Lógica pura: el borrador, sus validaciones y su texto de búsqueda.
   Las mismas reglas que la base exige (título con contenido, hasta >= desde)
   se revisan acá para avisar antes de viajar.
   ============================================================ */
import { norm } from '@/shared/lib/texto';
import type { EstadoPlan, PlanificacionGeodesta } from '@/shared/lib/types';
import { hoyVE } from './informeModelo';

export interface BorradorPlan {
  titulo: string;
  desde: string;
  hasta: string;
  lugar: string;
  nota: string;
  estado: EstadoPlan;
  estado_nota: string;
}

export const ESTADOS_PLAN: { valor: EstadoPlan; label: string }[] = [
  { valor: 'planificada', label: 'Planificada' },
  { valor: 'cumplida', label: 'Cumplida' },
  { valor: 'no_se_hizo', label: 'No se hizo' },
];

export function etiquetaEstado(e: EstadoPlan): string {
  return ESTADOS_PLAN.find((x) => x.valor === e)?.label ?? e;
}

/** Una actividad nueva, en el día que se le pase (o hoy). */
export function planVacio(dia: string = hoyVE()): BorradorPlan {
  return { titulo: '', desde: dia, hasta: dia, lugar: '', nota: '', estado: 'planificada', estado_nota: '' };
}

export function borradorDesdePlan(p: PlanificacionGeodesta | null, dia: string = hoyVE()): BorradorPlan {
  if (!p) return planVacio(dia);
  return {
    titulo: p.titulo,
    desde: p.desde,
    hasta: p.hasta,
    lugar: p.lugar ?? '',
    nota: p.nota ?? '',
    estado: p.estado,
    estado_nota: p.estado_nota ?? '',
  };
}

/** El motivo solo tiene sentido cuando la actividad NO se hizo. En cualquier otro
 *  estado se descarta: si no, queda un «Llovió» colgando de una actividad cumplida. */
export function notaDeEstado(estado: EstadoPlan, nota: string | null | undefined): string | null {
  if (estado !== 'no_se_hizo') return null;
  const t = (nota ?? '').trim();
  return t ? t : null;
}

/** Qué impide guardar, o null. */
export function errorPlan(b: BorradorPlan): string | null {
  if (!b.titulo.trim()) return 'Escribí el título de la actividad.';
  if (!b.desde || !b.hasta) return 'Indicá las dos fechas: desde cuándo y hasta cuándo.';
  if (b.hasta < b.desde) return 'La actividad no puede terminar antes de empezar: revisá las fechas.';
  return null;
}

/** Texto plano buscable, en minúsculas y sin acentos. */
export function componerBusqPlan(b: BorradorPlan): string {
  return norm([b.titulo, b.lugar, b.nota].filter(Boolean).join(' ')).trim();
}
