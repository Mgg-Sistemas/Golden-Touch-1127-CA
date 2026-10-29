/* ============================================================
   Golden Touch · Compras · AUTORIZADORES de OC
   Quién puede aprobar/autorizar las Órdenes de Compra y qué firma
   se estampa en el PDF según quién la aprobó:
     · JESUS LOZADA  (admin / Gerente)         → public/firma.png
     · LEYDIS RENGEL (Jefa de administración)  → public/firma2.jpeg
   La firma se elige por el correo del aprobador (`oc_aprobada_por`),
   así el PDF refleja SIEMPRE a quien realmente autorizó, sin importar
   quién lo genere o descargue.
   ============================================================ */

import { autorizadoPara } from '@/modules/usuarios/autorizados';

/** MARIANA TOVAR — Analista de Compras: ELABORA las Órdenes de Compra. Se estampa como
 *  «Elaborado por» en el PDF de la OC, aparte de la firma de quien la aprueba. Igual que los
 *  aprobadores, va fijo aquí: si cambia la persona/cargo/CI se edita este único lugar. */
export const ELABORADOR_OC = {
  nombre: 'MARIANA TOVAR',
  cargo: 'Analista de Compras',
  ci: 'V-27.293.907',
} as const;

/** JESUS LOZADA — Gerente / admin. Su firma es `public/firma.png`. */
export const APROBADOR_JESUS_EMAIL = 'touchgolden1127@gmail.com';
/** LEYDIS RENGEL — Jefa de administración. Su firma es `public/firma2.jpeg`. */
export const APROBADOR_LEYDIS_EMAIL = 'jhzgcontabilidad@gmail.com';

const norm = (e?: string | null) => (e ?? '').trim().toLowerCase();

/**
 * ¿Este usuario puede autorizar/aprobar Órdenes de Compra?
 * Lo decide SOLO la lista «Usuarios autorizados para:» de Roles y Permisos (opción
 * «Aprobar órdenes de compra»). Desde el 29/10/2026 el rol admin ya no aprueba por sí
 * solo: un administrador que no esté en la lista no ve el botón. Mientras la lista no
 * se haya cargado nadie aprueba (las pantallas se repintan cuando llega).
 * La misma regla vive en la base: `puede_aprobar_oc()`.
 */
export function puedeAprobarOc(_role?: string | null, email?: string | null): boolean {
  return autorizadoPara(norm(email), 'oc') === true;
}

/**
 * ¿Este usuario puede aprobar Órdenes de Salida / Traslados / Salidas temporales?
 * Solo los usuarios autorizados con «Aprobar órdenes de salida» (el admin también
 * tiene que estar en la lista).
 */
export function puedeAprobarSalidas(_role?: string | null, email?: string | null): boolean {
  return autorizadoPara(norm(email), 'salidas') === true;
}

/**
 * Firma que corresponde al aprobador de una OC:
 *  · 'leydis'  → LEYDIS RENGEL (public/firma2.jpeg)
 *  · 'gerente' → JESUS LOZADA / cualquier otro admin (public/firma.png)
 */
export function firmaDeAprobador(email?: string | null): 'leydis' | 'gerente' {
  return norm(email) === APROBADOR_LEYDIS_EMAIL ? 'leydis' : 'gerente';
}

/** Etapas en las que la OC ya lleva la firma (espera método de pago o
 *  confirmada para pagar). Desde aquí, cancelarla o anularla es decisión de usuarios autorizados. */
export const ESTADOS_FIRMADOS_GG = ['confirmada_metodo', 'oc_aprobada'] as const;

/**
 * ¿Este usuario puede cancelar/anular la orden en su etapa actual?
 *  · Antes de la firma del GG (pendiente, aprobada, oc_creada, proveedor desistido): Compras.
 *  · Ya aprobada por el GG: SOLO quien aprueba OC (usuarios autorizados de la lista).
 *  · Pagada, recibida o finalizada: nadie (cancelar tras el pago sería un reembolso).
 * La misma regla vive en la base (trigger `oc_aprobada_solo_gerente_cancela`).
 */
export function puedeCancelarOc(estado: string | null | undefined, role?: string | null, email?: string | null): boolean {
  const e = estado ?? '';
  if (['pendiente', 'aprobada', 'oc_creada', 'desistida_proveedor'].includes(e)) return true;
  if ((ESTADOS_FIRMADOS_GG as readonly string[]).includes(e)) return puedeAprobarOc(role, email);
  return false;
}

export const MSG_SOLO_AUTORIZADOS_CANCELA =
  'Esta OC ya fue aprobada por el Gerente General: solo los usuarios autorizados pueden anularla.';
export const MSG_SOLO_GERENTE_CANCELA = MSG_SOLO_AUTORIZADOS_CANCELA;
