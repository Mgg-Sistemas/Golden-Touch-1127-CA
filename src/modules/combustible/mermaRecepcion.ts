/* ============================================================
   Golden Touch · Combustible · Merma de recepción

   LA REGLA (02/10/2026, decisión del usuario). En una ENTRADA o un
   TRASLADO entre tanques se puede anotar cuánto llegó de verdad (medido).
   La diferencia con lo enviado —la guía del proveedor o lo que salió del
   tanque origen— queda como una MERMA ligada a ese movimiento.

   El margen (10% por defecto, configurable por tanque) es un CONTROL, no una
   resta automática: si no se anota lo recibido, no hay merma. Si la merma
   pasa el margen, hace falta un motivo y solo un administrador la guarda.
   La base repite la regla (trg_combustible_merma_de_recepcion).

   Solo desde la PC: la vista de teléfono no la muestra, para no sumarle
   pasos ni errores a quien surte.
   ============================================================ */

/** Margen de merma por defecto, en % de lo enviado. */
export const MARGEN_MERMA_DEFECTO = 10;

export interface MermaRecepcion {
  /** Litros perdidos: enviados − recibidos. */
  merma: number;
  /** La merma en % de lo enviado. */
  pct: number;
  /** ¿Pasa el margen del tanque? */
  excede: boolean;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * La merma de una recepción, o un error si los números no cierran.
 * `recibidos` vacío (null) = no se midió: no hay merma y no es un error.
 */
export function mermaDeRecepcion(
  enviados: number, recibidos: number | null | undefined, margenPct: number | null | undefined,
): { ok: MermaRecepcion | null; error: string | null } {
  if (recibidos == null || !Number.isFinite(Number(recibidos))) return { ok: null, error: null };
  const env = Number(enviados) || 0;
  const rec = Number(recibidos);
  if (!(env > 0)) return { ok: null, error: 'Para anotar lo recibido, los litros enviados tienen que ser mayores que 0.' };
  if (rec < 0) return { ok: null, error: 'Los litros recibidos no pueden ser negativos.' };
  if (rec > env) return { ok: null, error: `No pueden llegar más litros (${rec}) de los que se enviaron (${env}). Revisa la medición.` };
  const merma = r2(env - rec);
  const pct = r2((merma / env) * 100);
  const margen = Number.isFinite(Number(margenPct)) && margenPct != null ? Number(margenPct) : MARGEN_MERMA_DEFECTO;
  return { ok: { merma, pct, excede: pct > margen + 1e-9 }, error: null };
}

/** El texto de la merma en el libro: de dónde sale y cuánto es. */
export function observacionMerma(origen: 'entrada' | 'traslado', ref: string, m: MermaRecepcion, motivo?: string | null): string {
  const de = origen === 'entrada' ? 'Merma de la entrada' : 'Merma del traslado';
  const base = `${de} ${ref} · ${m.pct.toLocaleString('es-VE', { maximumFractionDigits: 2 })}% de lo enviado`;
  return `${m.excede ? '⚠ ' : ''}${base}${motivo?.trim() ? ` · ${motivo.trim()}` : ''}`;
}
