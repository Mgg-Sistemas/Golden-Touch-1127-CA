/* ============================================================
   Golden Touch · Tesorería · Retención YA registrada en el libro

   EXCEPCIÓN DE ALCANCE (autorizada): este helper lee del módulo de
   Retenciones para que Tesorería pueda PRE-LLENAR el monto de la retención
   en el modal de pago de una OC que se retiene «antes de pagar». Es una
   lectura de un solo sentido (Retenciones → Tesorería); no escribe nada en
   Retenciones ni cambia su cálculo. Toda la lógica de pago, egresos y caja
   sigue intacta: esto solo sugiere un número editable.

   El comprobante de retención se declara en BOLÍVARES, así que lo que
   devolvemos es el total retenido en Bs. El modal lo pre-llena en Bs (su
   moneda por defecto) y queda editable.
   ============================================================ */
import { listRetenciones } from '../libroFiscal/retencionesFiscal.repository';
import type { RetencionPracticada } from '../libroFiscal/retencionesFiscal.repository';

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export interface RetencionRegistrada {
  /** Total retenido en bolívares (como se declara ante el ente). */
  montoBs: number;
  /** Cuántas líneas de impuesto se sumaron (IVA, ISLR, ISAE…). */
  lineas: number;
}

/**
 * Suma, en bolívares, las líneas de retención PRACTICADA (no anuladas) de una OC.
 *
 * Devuelve `null` —y el modal deja el campo vacío, sin forzar nada— cuando:
 *  - no hay ninguna retención practicada registrada, o
 *  - alguna línea no se puede expresar en Bs con certeza (p. ej. una
 *    retención en $ sin tasa guardada): mejor vacío que un monto equivocado.
 */
export function sumarRetencionBs(lineas: RetencionPracticada[]): RetencionRegistrada | null {
  const vivas = lineas.filter((l) => l.direccion === 'practicada' && !l.anulada && l.montoRetenido > 0);
  if (!vivas.length) return null;
  let montoBs = 0;
  for (const l of vivas) {
    const bs = l.montoBs != null ? l.montoBs : (l.moneda === 'Bs' ? l.montoRetenido : null);
    if (bs == null) return null;
    montoBs += bs;
  }
  return { montoBs: r2(montoBs), lineas: vivas.length };
}

/**
 * Lee del libro la retención ya registrada para una OC y la devuelve sumada
 * en Bs, o `null` si no hay (ver {@link sumarRetencionBs}).
 */
export async function retencionRegistradaDeOrden(ordenId: string | null | undefined): Promise<RetencionRegistrada | null> {
  if (!ordenId) return null;
  const lineas = await listRetenciones({ docId: ordenId, direccion: 'practicada' });
  return sumarRetencionBs(lineas);
}
