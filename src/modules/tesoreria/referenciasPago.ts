/* ============================================================
   Referencia del pago (12/11/2026).

   Al pagar una OC desde Tesorería, cada pata que sale en bolívares
   (transferencia / pago móvil) pide los ÚLTIMOS 4 DÍGITOS de la referencia
   bancaria, y cada pata por Binance (USDT) pide los últimos 4 del ID de la
   orden. Así el egreso se puede cruzar con el estado de cuenta sin abrir la
   captura.

   Va dentro del motivo del pago, que ya llega al concepto del egreso en el
   registro de movimientos («pago: Ref. Bs 1234 · …»): no hace falta columna nueva.

   No se pide en Bs EN EFECTIVO: si la OC solo indica efectivo en Bs como forma
   de pago en bolívares, no hay referencia que anotar.
   ============================================================ */

export type TipoReferencia = 'bs' | 'binance';

/** Una pata del pago que necesita referencia. `etiqueta` distingue cuentas cuando hay varias. */
export interface PataReferencia {
  key: string;
  tipo: TipoReferencia;
  etiqueta?: string | null;
}

const METODOS_BS_ELECTRONICOS = new Set(['transferencia', 'pago_movil']);

/**
 * ¿Qué referencia pide una pata en esta moneda? `metodos` son las formas de pago
 * que Compras indicó en la OC: si en bolívares solo indicó efectivo, la pata en Bs
 * no pide referencia.
 */
export function tipoReferencia(
  moneda: string | null | undefined,
  metodos?: { metodo?: string | null }[] | null,
): TipoReferencia | null {
  if (moneda === 'USDT') return 'binance';
  if (moneda !== 'Bs') return null;
  const lista = (metodos ?? []).map((m) => m.metodo ?? '');
  const soloEfectivoBs = lista.includes('efectivo_bs') && !lista.some((m) => METODOS_BS_ELECTRONICOS.has(m));
  return soloEfectivoBs ? null : 'bs';
}

/** Deja solo dígitos y se queda con los 4 últimos (si pegan la referencia completa, sirve igual). */
export function ultimos4(valor: string): string {
  return valor.replace(/\D/g, '').slice(-4);
}

export function referenciaValida(valor: string | null | undefined): boolean {
  return /^\d{4}$/.test(valor ?? '');
}

export function nombreReferencia(tipo: TipoReferencia): string {
  return tipo === 'bs' ? 'Referencia de la transferencia / pago móvil' : 'ID de la orden de Binance';
}

function prefijo(tipo: TipoReferencia): string {
  return tipo === 'bs' ? 'Ref. Bs' : 'ID Binance';
}

/** Patas a las que les falta la referencia (o la tienen incompleta). */
export function referenciasFaltantes(patas: PataReferencia[], refs: Record<string, string>): PataReferencia[] {
  return patas.filter((p) => !referenciaValida(refs[p.key]));
}

/** Mensaje de error para el formulario, o null si están todas. */
export function errorReferencias(patas: PataReferencia[], refs: Record<string, string>): string | null {
  const faltan = referenciasFaltantes(patas, refs);
  if (!faltan.length) return null;
  const tipos = new Set(faltan.map((p) => p.tipo));
  const que = [
    tipos.has('bs') ? 'la referencia de la transferencia / pago móvil' : '',
    tipos.has('binance') ? 'el ID de la orden de Binance' : '',
  ].filter(Boolean).join(' y ');
  return `Indica ${que}: los últimos 4 dígitos.`;
}

/** Texto que va al motivo del pago: «Ref. Bs 1234 · ID Binance 5678». Vacío si no hay patas. */
export function textoReferencias(patas: PataReferencia[], refs: Record<string, string>): string {
  return patas
    .filter((p) => referenciaValida(refs[p.key]))
    .map((p) => `${prefijo(p.tipo)}${p.etiqueta ? ` (${p.etiqueta})` : ''} ${refs[p.key]}`)
    .join(' · ');
}

/** Motivo final del pago: primero las referencias y después la nota que se haya escrito. */
export function motivoConReferencias(
  motivo: string | null | undefined,
  patas: PataReferencia[],
  refs: Record<string, string>,
): string | null {
  const junto = [textoReferencias(patas, refs), (motivo ?? '').trim()].filter(Boolean).join(' · ');
  return junto || null;
}
