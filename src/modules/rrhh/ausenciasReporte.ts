/* ============================================================
   Golden Touch · RRHH · Reporte de vacaciones y descansos (cálculo puro)

   Arma las filas del PDF y del Excel: qué ausencias se cruzan con el rango
   de fechas elegido, ordenadas por trabajador y fecha, con sus totales.
   ============================================================ */
import { norm } from '@/shared/lib/texto';

export type TipoAusencia = 'vacaciones' | 'descansos';

export interface PersonaAusencia {
  id: string;
  nombre: string;
  apellido?: string | null;
  cedula?: string | null;
  cargo?: string | null;
  departamento?: string | null;
}

/** Una ausencia ya traducida: vacación o descanso. */
export interface AusenciaBase {
  id: string;
  personal_id: string;
  desde: string;
  hasta: string;
  /** Días que trae el registro; si falta se cuentan del desde al hasta. */
  dias?: number | null;
  /** Vacaciones: Procesada / Pendiente · Descansos: Plan / Manual. */
  estado: string;
  /** Solo vacaciones: monto en $ (sueldo diario × días). */
  monto?: number | null;
  /** Solo vacaciones: se cruza con alguien del mismo departamento. */
  cruce?: boolean;
  nota?: string | null;
}

export interface FiltroAusencias {
  desde?: string | null;
  hasta?: string | null;
  personalId?: string | null;
  texto?: string | null;
}

export interface FilaAusencia extends AusenciaBase {
  persona: PersonaAusencia | null;
  diasTotal: number;
}

/** Días del desde al hasta, ambos incluidos. */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${String(desde).slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${String(hasta).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

export const nombrePersona = (p: PersonaAusencia | null | undefined) =>
  p ? `${p.nombre} ${p.apellido ?? ''}`.trim() : '—';

/**
 * Las ausencias que se cruzan con el rango (un descanso del 28 al 3 entra en
 * el mes que empieza el 1), de la persona elegida y que coinciden con el
 * texto (nombre, cédula, cargo o departamento, sin acentos).
 */
export function filasAusencias(
  items: AusenciaBase[],
  personas: PersonaAusencia[],
  f: FiltroAusencias,
): FilaAusencia[] {
  const porId = new Map(personas.map((p) => [p.id, p]));
  const d = f.desde ? String(f.desde).slice(0, 10) : null;
  const h = f.hasta ? String(f.hasta).slice(0, 10) : null;
  const q = norm(f.texto ?? '').trim();
  return items
    .filter((a) => a.desde && a.hasta)
    .filter((a) => (!d || String(a.hasta).slice(0, 10) >= d) && (!h || String(a.desde).slice(0, 10) <= h))
    .filter((a) => !f.personalId || a.personal_id === f.personalId)
    .map((a) => {
      const persona = porId.get(a.personal_id) ?? null;
      const diasTotal = Number(a.dias) > 0 ? Number(a.dias) : diasEntre(a.desde, a.hasta);
      return { ...a, persona, diasTotal };
    })
    .filter((a) => {
      if (!q) return true;
      const p = a.persona;
      return norm([nombrePersona(p), p?.cedula, p?.cargo, p?.departamento].filter(Boolean).join(' ')).includes(q);
    })
    .sort((x, y) => nombrePersona(x.persona).localeCompare(nombrePersona(y.persona), 'es')
      || String(x.desde).localeCompare(String(y.desde)));
}

export interface TotalesAusencias {
  registros: number;
  personas: number;
  dias: number;
  /** Solo vacaciones. */
  monto: number;
  procesadas: number;
  pendientes: number;
  cruces: number;
}

export function totalesAusencias(filas: FilaAusencia[]): TotalesAusencias {
  return {
    registros: filas.length,
    personas: new Set(filas.map((f) => f.personal_id)).size,
    dias: filas.reduce((s, f) => s + f.diasTotal, 0),
    monto: Math.round(filas.reduce((s, f) => s + (Number(f.monto) || 0), 0) * 100) / 100,
    procesadas: filas.filter((f) => f.estado === 'Procesada').length,
    pendientes: filas.filter((f) => f.estado === 'Pendiente').length,
    cruces: filas.filter((f) => f.cruce).length,
  };
}

/** Primer y último día del mes (ISO) de una fecha año/mes (mes 0-based). */
export function rangoDelMes(y: number, m: number): { desde: string; hasta: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const ultimo = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return { desde: `${y}-${pad(m + 1)}-01`, hasta: `${y}-${pad(m + 1)}-${pad(ultimo)}` };
}
