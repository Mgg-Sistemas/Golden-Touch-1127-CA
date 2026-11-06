/* ============================================================
   Golden Touch · Compras · «Pendientes por recibir» (06/11/2026)

   Al pagarse una OC de productos ya no va directo al delivery: espera a que el
   analista confirme el retiro y cómo (delivery, carga pesada o a domicilio).
   Recién entonces el delivery la ve (lo filtra también la base:
   delivery_listado_canal / delivery_no_disponible_por / ordenes_a_delivery).
   ============================================================ */
import type { Orden } from '@/shared/lib/types';

/** Columna virtual del kanban de Compras (no es un estado de la orden). */
export const COL_POR_RETIRAR = 'por_retirar' as const;

/** La OC está pagada y espera que Compras confirme el retiro. */
export function esperaRetiro(o: Pick<Orden, 'estado' | 'tipo' | 'oc_codigo' | 'recibida_en' | 'retiro_confirmado_en'>): boolean {
  return o.estado === 'pagada'
    && (o.tipo ?? 'producto') === 'producto'
    && !!o.oc_codigo
    && !o.recibida_en
    && !o.retiro_confirmado_en;
}

/**
 * Va a la tarjeta «Pendiente por recibir» del kanban de Compras (06/11/2026): la OC pagada que
 * todavía no se recibió (falte o no confirmar el retiro) y la que espera recepción por contra
 * entrega o crédito saldado (`por_recibir`).
 */
export function enPendientePorRecibir(o: Pick<Orden, 'estado' | 'recibida_en'>): boolean {
  return (o.estado === 'pagada' && !o.recibida_en) || o.estado === 'por_recibir';
}

/** Texto del evento de delivery en la trazabilidad («🛵 Delivery · tomado por HECTOR ALAGAL»). */
export function textoEventoDelivery(ev: { evento: string; repartidor?: string | null; canal?: string | null; almacen?: string | null; motivo?: string | null }): string | null {
  const canal = ev.canal === 'carga_pesada' ? '🚚 Carga pesada' : '🛵 Delivery';
  const quien = ev.repartidor?.trim() || null;
  switch (ev.evento) {
    case 'delivery_tomado': return `${canal} · tomado por ${quien ?? '—'}`;
    case 'delivery_en_ruta': return `${canal} · en ruta${quien ? ` (${quien})` : ''}`;
    case 'delivery_entregado': return `${canal} · entregado${quien ? ` por ${quien}` : ''}${ev.almacen ? ` en ${ev.almacen}` : ''}`;
    case 'delivery_cancelado': return `${canal} · cancelado${quien ? ` (${quien})` : ''}${ev.motivo ? ` · ${ev.motivo}` : ''}`;
    default: return null;
  }
}
