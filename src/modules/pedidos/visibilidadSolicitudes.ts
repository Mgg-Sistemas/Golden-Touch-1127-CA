/* ============================================================
   Golden Touch · Visibilidad de Solicitudes de Pedido (31/10/2026)
   Con el permiso «Solicitud de Pedido» (sin «Compras») cada quien ve
   SOLO las órdenes que él creó: `ordenes.solicitante_email` = su correo
   (sin distinguir mayúsculas). Respaldo para órdenes viejas o montadas
   con otro solicitante: el evento 'creada' del historial con su correo
   como actor.
   ============================================================ */
import type { EventoHistorial } from '@/shared/lib/types';

/** Lo mínimo de una orden que hace falta para saber quién la creó. */
export interface OrdenConCreador {
  solicitante_email?: string | null;
  historial?: EventoHistorial[] | null;
}

const normalizar = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/** ¿La orden la creó este usuario? Sin correo → nunca (no se muestra nada ajeno). */
export function esOrdenPropia(o: OrdenConCreador, email: string | null | undefined): boolean {
  const yo = normalizar(email);
  if (!yo) return false;
  if (normalizar(o.solicitante_email) === yo) return true;
  const historial = Array.isArray(o.historial) ? o.historial : [];
  return historial.some((ev) => ev?.evento === 'creada' && normalizar(ev.actor) === yo);
}

/** Filtra la lista a las órdenes propias (vista de quien solo tiene «Solicitud de Pedido»). */
export function soloOrdenesPropias<T extends OrdenConCreador>(ordenes: T[], email: string | null | undefined): T[] {
  return ordenes.filter((o) => esOrdenPropia(o, email));
}
