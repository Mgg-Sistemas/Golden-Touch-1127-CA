/* ============================================================
   Golden Touch · RRHH · Tabulador de sueldos por cargo (cálculo puro)

   El tabulador dice cuánto se gana por CARGO (sueldo mensual total acordado,
   en USD) y es por NÓMINA: GT y MTO tienen tabuladores distintos (ya hoy un
   mismo cargo no gana lo mismo en las dos) y cada nómina se carga y se paga
   por separado.

   Aquí vive lo que se calcula sin tocar la base: cómo se compara un cargo
   («Geólogo » y «GEOLOGO» son el mismo), quién cambiaría de sueldo al aplicar
   el tabulador y de cuánto a cuánto, y el armado del histórico salarial
   general. La comparación de cargos es la MISMA que la de la base
   (`rrhh_cargo_clave`), para que la vista previa diga exactamente lo que la
   función `aplicar_tabulador` va a hacer.
   ============================================================ */
import type { EmpresaRrhh, Personal, PersonalSueldo } from '@/shared/lib/types';

export interface TabuladorCargo {
  id: string;
  empresa: EmpresaRrhh;
  cargo: string;
  /** Sueldo mensual total acordado para el cargo, en USD. */
  monto: number;
  nota?: string | null;
  created_at: string;
  created_by?: string | null;
  updated_at: string;
  updated_by?: string | null;
}

export type AccionTabulador = 'alta' | 'cambio' | 'baja';

export interface TabuladorHistorial {
  id: string;
  tabulador_id?: string | null;
  empresa: EmpresaRrhh;
  cargo: string;
  /** Solo cuando el cambio fue de nombre del cargo. */
  cargo_anterior?: string | null;
  accion: AccionTabulador;
  monto_anterior?: number | null;
  monto_nuevo?: number | null;
  motivo?: string | null;
  created_at: string;
  created_by?: string | null;
}

export const ETIQUETA_ACCION: Record<AccionTabulador, string> = {
  alta: 'Cargo agregado',
  cambio: 'Monto/cargo cambiado',
  baja: 'Cargo eliminado',
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/** Cómo se escribe el cargo al guardarlo: sin espacios de más y en mayúsculas. */
export function normalizarCargo(cargo: string | null | undefined): string {
  return String(cargo ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}

/** La clave con la que se comparan dos cargos (igual que `rrhh_cargo_clave`). */
export function claveCargo(cargo: string | null | undefined): string {
  return normalizarCargo(cargo)
    .replace(/Á/g, 'A').replace(/É/g, 'E').replace(/Í/g, 'I')
    .replace(/Ó/g, 'O').replace(/[ÚÜ]/g, 'U');
}

/** Lo que impide guardar un renglón del tabulador. `null` = se puede. */
export function errorTabulador(
  cargo: string,
  monto: number | null,
  existentes: Pick<TabuladorCargo, 'id' | 'cargo'>[],
  idEditando?: string | null,
): string | null {
  if (!normalizarCargo(cargo)) return 'Escribe el cargo.';
  if (monto === null || !Number.isFinite(monto)) return 'Escribe el monto mensual del cargo.';
  if (monto < 0) return 'El monto no puede ser negativo.';
  const k = claveCargo(cargo);
  if (existentes.some((t) => t.id !== idEditando && claveCargo(t.cargo) === k)) {
    return 'Ese cargo ya está en el tabulador de esta nómina.';
  }
  return null;
}

export interface CambioTabulador {
  persona: Personal;
  cargo: string;
  antes: number;
  despues: number;
}

export interface PlanTabulador {
  /** Activos cuyo sueldo cambia al aplicar. */
  cambios: CambioTabulador[];
  /** Activos que ya ganan lo del tabulador. */
  alDia: Personal[];
  /** Activos cuyo cargo no está en el tabulador (no se tocan). */
  sinTabulador: Personal[];
}

/**
 * Quién cambia al aplicar el tabulador. Solo ACTIVOS y solo de la nómina
 * indicada; un cargo sin renglón en el tabulador no se toca.
 */
export function planAplicarTabulador(
  personas: Personal[],
  tabulador: Pick<TabuladorCargo, 'empresa' | 'cargo' | 'monto'>[],
  empresa: EmpresaRrhh,
): PlanTabulador {
  const porCargo = new Map<string, { cargo: string; monto: number }>();
  for (const t of tabulador) {
    if (t.empresa !== empresa) continue;
    porCargo.set(claveCargo(t.cargo), { cargo: t.cargo, monto: r2(num(t.monto)) });
  }
  const plan: PlanTabulador = { cambios: [], alDia: [], sinTabulador: [] };
  for (const p of personas) {
    if (!p.activo || (p.empresa ?? 'GT') !== empresa) continue;
    const t = porCargo.get(claveCargo(p.cargo));
    if (!t) { plan.sinTabulador.push(p); continue; }
    const antes = r2(num(p.sueldo_base));
    if (antes === t.monto) plan.alDia.push(p);
    else plan.cambios.push({ persona: p, cargo: t.cargo, antes, despues: t.monto });
  }
  plan.cambios.sort((a, b) => a.cargo.localeCompare(b.cargo, 'es') || nombreCompleto(a.persona).localeCompare(nombreCompleto(b.persona), 'es'));
  return plan;
}

/** Cuántos activos tiene cada cargo del tabulador y cuántos no ganan lo que dice. */
export function conteoPorCargo(
  personas: Personal[],
  empresa: EmpresaRrhh,
): Map<string, { activos: number; sueldos: number[] }> {
  const m = new Map<string, { activos: number; sueldos: number[] }>();
  for (const p of personas) {
    if (!p.activo || (p.empresa ?? 'GT') !== empresa) continue;
    const k = claveCargo(p.cargo);
    if (!k) continue;
    const e = m.get(k) ?? { activos: 0, sueldos: [] };
    e.activos += 1; e.sueldos.push(r2(num(p.sueldo_base)));
    m.set(k, e);
  }
  return m;
}

/** Cargos de los activos que todavía no están en el tabulador (para sugerirlos). */
export function cargosFaltantes(personas: Personal[], tabulador: Pick<TabuladorCargo, 'cargo'>[], empresa: EmpresaRrhh): string[] {
  const hay = new Set(tabulador.map((t) => claveCargo(t.cargo)));
  const vistos = new Map<string, string>();
  for (const p of personas) {
    if (!p.activo || (p.empresa ?? 'GT') !== empresa) continue;
    const k = claveCargo(p.cargo);
    if (!k || hay.has(k) || vistos.has(k)) continue;
    vistos.set(k, normalizarCargo(p.cargo));
  }
  return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'es'));
}

export function nombreCompleto(p: Pick<Personal, 'nombre' | 'apellido'>): string {
  return `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim();
}

/* ---------- Histórico salarial general ---------- */

/** Un renglón de `personal_sueldos` con los datos de la persona. */
export interface FilaHistorialSalarial extends PersonalSueldo {
  persona: Pick<Personal, 'id' | 'nombre' | 'apellido' | 'cedula' | 'cargo' | 'empresa' | 'ficha_nro' | 'activo'>;
}

export interface FiltroHistorialSalarial {
  empresa?: EmpresaRrhh | 'todas';
  /** AAAA-MM-DD, inclusive, sobre la fecha desde la que rige. */
  desde?: string | null;
  hasta?: string | null;
  personalId?: string | null;
}

/** Filtra y ordena (por persona y, dentro de cada una, del más viejo al más nuevo). */
export function filtrarHistorialSalarial(filas: FilaHistorialSalarial[], f: FiltroHistorialSalarial): FilaHistorialSalarial[] {
  const desde = (f.desde ?? '').slice(0, 10);
  const hasta = (f.hasta ?? '').slice(0, 10);
  return filas
    .filter((r) => !f.empresa || f.empresa === 'todas' || (r.persona.empresa ?? 'GT') === f.empresa)
    .filter((r) => !f.personalId || r.personal_id === f.personalId)
    .filter((r) => !desde || String(r.fecha).slice(0, 10) >= desde)
    .filter((r) => !hasta || String(r.fecha).slice(0, 10) <= hasta)
    .sort((a, b) =>
      nombreCompleto(a.persona).localeCompare(nombreCompleto(b.persona), 'es')
      || String(a.personal_id).localeCompare(String(b.personal_id))
      || String(a.fecha).localeCompare(String(b.fecha))
      || String(a.created_at).localeCompare(String(b.created_at)));
}

/** «01/10/2026 al 09/10/2026», «desde el …», «hasta el …» o «todo el histórico». */
export function etiquetaRango(desde?: string | null, hasta?: string | null): string {
  const d = (x: string) => `${x.slice(8, 10)}/${x.slice(5, 7)}/${x.slice(0, 4)}`;
  const a = (desde ?? '').slice(0, 10);
  const b = (hasta ?? '').slice(0, 10);
  if (a.length === 10 && b.length === 10) return `${d(a)} al ${d(b)}`;
  if (a.length === 10) return `desde el ${d(a)}`;
  if (b.length === 10) return `hasta el ${d(b)}`;
  return 'todo el histórico';
}
