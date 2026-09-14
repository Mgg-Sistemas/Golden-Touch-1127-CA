/* ============================================================
   Golden Touch · Cocina · Descartar un mercado: reglas puras

   Portado de MGG (descartarMercado y DescartarMercadoModal), adaptado a GT.

   DESCARTAR NO ES CERRAR NI BORRAR.
   · Cerrar congela el ciclo y abre el siguiente con la foto del stock.
   · Borrar se lleva el rango, el resumen y el rastro.
   · Descartar deja el ciclo guardado y marcado: sus cifras se siguen viendo en
     «Mercados cerrados», pero no cuenta y no le pasa saldo a nadie. Tampoco abre
     el siguiente: lo inicia una persona cuando el inventario está como debe.

   Se usa cuando un ciclo nació mal y sus números no describen nada creíble.

   Doble llave, como el resto de lo destructivo del sistema: un motivo que
   explique y el número del mercado escrito a mano. Acá viven las piezas que se
   prueban sin base ni React.
   ============================================================ */
import { norm } from '@/shared/lib/texto';

/** Largo mínimo del motivo. «ok» o «error» no explican nada dentro de seis meses. */
export const MOTIVO_DESCARTE_MIN = 15;

/** Lo que hay que escribir para confirmar: el número del mercado (MK-AAAA-####). */
export function claveDescarte(numero: string | null | undefined): string {
  // Nunca vacía: una clave vacía se confirmaría con cualquier cosa.
  return (numero ?? '').trim() || 'DESCARTAR';
}

/** ¿Lo escrito coincide con la clave? Sin distinguir mayúsculas, acentos ni espacios. */
export function confirmacionValida(escrito: string | null | undefined, clave: string): boolean {
  const limpio = (s: string | null | undefined) => norm(s).replace(/\s+/g, '');
  return limpio(escrito) !== '' && limpio(escrito) === limpio(clave);
}

/** ¿El motivo alcanza el mínimo, sin contar los espacios de sobra? */
export function motivoValido(motivo: string | null | undefined): boolean {
  return (motivo ?? '').trim().length >= MOTIVO_DESCARTE_MIN;
}

/**
 * ¿El mercado fue descartado?
 *
 * La marca vive en `totales`, que ya es jsonb: así el descarte no pide una
 * migración y los mercados anteriores simplemente no la traen.
 */
export function esDescartado(m: { totales?: { descartado?: boolean | null } | null } | null | undefined): boolean {
  return m?.totales?.descartado === true;
}
