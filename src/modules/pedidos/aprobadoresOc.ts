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

/** JESUS LOZADA — Gerente / admin. Su firma es `public/firma.png`. */
export const APROBADOR_JESUS_EMAIL = 'touchgolden1127@gmail.com';
/** LEYDIS RENGEL — Jefa de administración. Su firma es `public/firma2.jpeg`. */
export const APROBADOR_LEYDIS_EMAIL = 'jhzgcontabilidad@gmail.com';

const norm = (e?: string | null) => (e ?? '').trim().toLowerCase();

/**
 * ¿Este usuario puede autorizar/aprobar Órdenes de Compra?
 * Lo pueden hacer el admin (JESUS LOZADA) y la Jefa de administración
 * (LEYDIS RENGEL). Se acepta tanto por rol como por su correo, para que
 * siga funcionando aunque cambie la asignación de rol.
 */
export function puedeAprobarOc(role?: string | null, email?: string | null): boolean {
  if (role === 'admin') return true;
  if (role === 'jefa_de_administracion') return true;
  return norm(email) === APROBADOR_LEYDIS_EMAIL;
}

/**
 * Firma que corresponde al aprobador de una OC:
 *  · 'leydis'  → LEYDIS RENGEL (public/firma2.jpeg)
 *  · 'gerente' → JESUS LOZADA / cualquier otro admin (public/firma.png)
 */
export function firmaDeAprobador(email?: string | null): 'leydis' | 'gerente' {
  return norm(email) === APROBADOR_LEYDIS_EMAIL ? 'leydis' : 'gerente';
}
