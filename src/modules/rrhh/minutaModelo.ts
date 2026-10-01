/* ============================================================
   Golden Touch · RRHH · Minutas · modelo y reglas

   Lógica pura, sin red: filas vacías, validaciones y el texto de
   búsqueda. Vive aparte de los componentes para poder probarse sola,
   igual que `nominaCalculo.ts` y `fichaNro.ts`.
   ============================================================ */
import { norm } from '@/shared/lib/texto';
import type {
  EstadoMinuta, Minuta, MinutaAcuerdo, MinutaAvance, MinutaParticipante,
} from '@/shared/lib/types';

/** Lo que el editor tiene en pantalla: una minuta sin los campos que pone la base. */
export interface BorradorMinuta {
  fecha: string;
  lugar: string;
  hora_inicio: string;
  objetivo: string;
  orden_dia: string[];
  participantes: MinutaParticipante[];
  acuerdos: MinutaAcuerdo[];
  otros_asuntos: string;
  proxima_fecha: string | null;
  proximos_puntos: string[];
  avances: MinutaAvance[];
  observaciones: string;
  estado: EstadoMinuta;
  anexar_adjuntos_pdf: boolean;
}

export function filaParticipanteVacia(): MinutaParticipante {
  return { personal_id: null, nombre: '', cargo: '' };
}

export function filaAcuerdoVacia(): MinutaAcuerdo {
  return { responsable: '', actividad: '', fecha_compromiso: null };
}

/** Los porcentajes nacen en `null`, no en 0: «todavía no se midió» no es «0 %». */
export function filaAvanceVacia(): MinutaAvance {
  return {
    actividad: '', responsable: '', fecha_programada: null,
    revision_fecha: null, pct_inicial: null, revision_final: '', pct_avance: null,
  };
}

/** Qué está mal con un porcentaje, o `null` si está bien. Vacío es válido. */
export function errorPorcentaje(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) return 'El porcentaje tiene que ser un número.';
  if (n < 0 || n > 100) return 'El porcentaje tiene que estar entre 0 y 100.';
  return null;
}

/** Qué impide guardar la minuta, o `null` si se puede guardar. */
export function errorMinuta(m: BorradorMinuta): string | null {
  if (!m.fecha) return 'Indicá la fecha de la reunión.';
  if (!m.objetivo.trim()) return 'Escribí el objetivo de la reunión.';
  for (const a of m.avances) {
    const e = errorPorcentaje(a.pct_inicial) ?? errorPorcentaje(a.pct_avance);
    if (e) return e;
  }
  return null;
}

/**
 * Texto plano de todo lo buscable, en minúsculas y sin acentos. Lo guarda el
 * repositorio en la columna `busq`, sobre la que hay un índice de trigramas.
 * Se arma acá (y no en un disparador de la base) para poder probarlo.
 */
export function componerBusq(m: BorradorMinuta): string {
  const partes = [
    m.objetivo, m.lugar, m.otros_asuntos, m.observaciones,
    ...m.orden_dia,
    ...m.proximos_puntos,
    ...m.participantes.flatMap((p) => [p.nombre, p.cargo]),
    ...m.acuerdos.flatMap((a) => [a.responsable, a.actividad]),
    ...m.avances.flatMap((a) => [a.actividad, a.responsable, a.revision_final]),
  ];
  return norm(partes.filter(Boolean).join(' ')).trim();
}

/** ¿Quedó algún acuerdo con fecha de compromiso que todavía no venció? */
export function tieneAcuerdosPendientes(m: Minuta, hoy: Date = new Date()): boolean {
  const corte = hoy.toISOString().slice(0, 10);
  return (m.acuerdos ?? []).some((a) => !!a.fecha_compromiso && a.fecha_compromiso >= corte);
}

export function numeroMinuta(anio: number, n: number): string {
  return `MIN-${anio}-${String(n).padStart(4, '0')}`;
}
