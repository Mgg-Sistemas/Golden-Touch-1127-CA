/* ============================================================
   Golden Touch · RRHH · Historial de cambios de cargo (04/11/2026)

   Como el historial de sueldo: el cargo de una ficha que ya existe se cambia
   SOLO con `cambiar_cargo` (fecha desde la que rige + motivo) y queda el
   renglón en `personal_cargos`. Si se movió por otra vía, la base igual anota
   el renglón «sin motivo». Aquí lo que se calcula sin tocar la base.
   ============================================================ */

export interface PersonalCargo {
  id: string;
  personal_id: string;
  cargo_anterior: string | null;
  cargo_nuevo: string | null;
  departamento_anterior: string | null;
  departamento_nuevo: string | null;
  fecha: string;
  motivo: string;
  nota: string | null;
  created_at: string;
  created_by: string | null;
  actor_name: string | null;
}

export const MOTIVOS_CARGO = [
  'Ascenso',
  'Promoción interna',
  'Reasignación de área',
  'Cambio por necesidad operativa',
  'Fin de período de prueba',
  'Corrección de datos',
  'Otro',
] as const;

/** Lo que escribe la base cuando el cargo se movió por fuera de esta pantalla. */
export const MOTIVO_CARGO_SIN_REGISTRAR = 'Cambio sin motivo registrado (se guardó por otra vía)';

export const motivoCargoFinal = (motivo: string, otro: string) => (motivo === 'Otro' ? otro.trim() : motivo.trim());

const norm = (s: string | null | undefined) => String(s ?? '').trim().toUpperCase();

/** Lo que impide guardar el cambio; `null` = se puede. */
export function errorCambioCargo(d: {
  cargoActual: string | null | undefined; deptoActual: string | null | undefined;
  cargoNuevo: string; deptoNuevo: string; motivo: string; fecha: string; hoy: string;
}): string | null {
  if (!d.cargoNuevo.trim()) return 'Indica el cargo nuevo.';
  const depto = d.deptoNuevo.trim() || d.deptoActual || '';
  if (norm(d.cargoNuevo) === norm(d.cargoActual) && norm(depto) === norm(d.deptoActual)) return 'Es el mismo cargo que ya tiene.';
  if (d.motivo.trim().length < 3) return 'Indica el motivo del cambio de cargo.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) return 'Indica desde cuándo rige el cargo nuevo.';
  const tope = new Date(`${d.hoy}T00:00:00Z`);
  tope.setUTCDate(tope.getUTCDate() + 31);
  if (d.fecha > tope.toISOString().slice(0, 10)) return 'La fecha no puede pasar de un mes adelante.';
  return null;
}

/** «OPERADOR → SUPERVISOR» (con el departamento si cambió). */
export function textoCambioCargo(r: Pick<PersonalCargo, 'cargo_anterior' | 'cargo_nuevo' | 'departamento_anterior' | 'departamento_nuevo'>): string {
  const c = `${r.cargo_anterior || '—'} → ${r.cargo_nuevo || '—'}`;
  if (norm(r.departamento_anterior) === norm(r.departamento_nuevo)) return c;
  return `${c} (depto. ${r.departamento_anterior || '—'} → ${r.departamento_nuevo || '—'})`;
}
