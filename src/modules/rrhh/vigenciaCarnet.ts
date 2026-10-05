/* ============================================================
   Golden Touch · RRHH · Vencimiento del carnet (05/10/2026)

   El carnet lleva impresa la fecha hasta la que vale. Se guarda como FECHA
   (`personal.carnet_vence`) y se puede cargar de dos formas: eligiendo el día
   o diciendo «vale N días / semanas / meses / años» desde hoy, que se
   convierte en esa misma fecha. Por ahora todos vencen el 31/12/2026.
   ============================================================ */

export type UnidadVigencia = 'dias' | 'semanas' | 'meses' | 'anios';

export const UNIDADES_VIGENCIA: { valor: UnidadVigencia; label: string }[] = [
  { valor: 'dias', label: 'días' },
  { valor: 'semanas', label: 'semanas' },
  { valor: 'meses', label: 'meses' },
  { valor: 'anios', label: 'años' },
];

/** Con lo que arranca un carnet nuevo mientras no se diga otra cosa. */
export const CARNET_VENCE_POR_DEFECTO = '2026-12-31';

/** A partir de este margen el carnet se avisa «por vencer». */
export const DIAS_AVISO_VENCE = 30;

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function aFecha(isoDia: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDia ?? ''));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * Fecha de vencimiento a `cantidad` unidades de `desde`.
 *
 * Los meses y años no se cuentan en días: 31/01 + 1 mes es 28/02 (o 29), el
 * último día del mes, y no el 03/03 que da sumarle 30 días.
 */
export function venceEn(desde: string, cantidad: number, unidad: UnidadVigencia): string | null {
  const base = aFecha(desde);
  const n = Math.trunc(Number(cantidad));
  if (!base || !Number.isFinite(n) || n <= 0) return null;
  if (unidad === 'dias' || unidad === 'semanas') {
    base.setDate(base.getDate() + n * (unidad === 'semanas' ? 7 : 1));
    return iso(base);
  }
  const meses = unidad === 'anios' ? n * 12 : n;
  const dia = base.getDate();
  const destino = new Date(base.getFullYear(), base.getMonth() + meses, 1);
  const ultimo = new Date(destino.getFullYear(), destino.getMonth() + 1, 0).getDate();
  destino.setDate(Math.min(dia, ultimo));
  return iso(destino);
}

export type EstadoCarnet = 'vigente' | 'por_vencer' | 'vencido';

/** Cómo está el carnet hoy. Sin fecha cargada no hay estado. */
export function estadoCarnet(vence: string | null | undefined, hoy: string = iso(new Date())): EstadoCarnet | null {
  const v = aFecha(vence ?? '');
  const h = aFecha(hoy);
  if (!v || !h) return null;
  const dias = Math.round((v.getTime() - h.getTime()) / 86_400_000);
  if (dias < 0) return 'vencido';
  return dias <= DIAS_AVISO_VENCE ? 'por_vencer' : 'vigente';
}

/** «31/12/2026», que es como sale impreso. */
export function fechaCarnet(vence: string | null | undefined): string {
  const d = String(vence ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '';
}
