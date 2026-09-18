/* ============================================================
   Golden Touch · Ventas · Quién AUTORIZA las ventas

   Toda venta (nota de entrega o factura, venta o permuta) pasa por una
   autorización previa antes de mover plata. La dan dos personas:
     · JESUS LOZADA  (admin / Gerente)
     · LEYDIS RENGEL (Jefa de administración)

   Son las mismas que aprueban las Órdenes de Compra, así que se toman sus
   correos de `aprobadoresOc.ts` en vez de repetirlos.

   OJO: esto SOLO decide qué botones se ven. Quien de verdad lo hace cumplir
   es la base (`es_autorizador_ventas()` en
   supabase/2026-09-18-ventas-documento-igtf-autorizacion.sql), con los mismos
   dos correos. Si cambia una persona, se cambia en los dos lados.
   ============================================================ */
import { APROBADOR_JESUS_EMAIL, APROBADOR_LEYDIS_EMAIL } from '@/modules/pedidos/aprobadoresOc';

export const AUTORIZADORES_VENTAS_TEXTO = 'LEYDIS RENGEL o JESUS LOZADA';

const AUTORIZADORES = [APROBADOR_JESUS_EMAIL, APROBADOR_LEYDIS_EMAIL].map((e) => e.toLowerCase());

/** ¿Este usuario puede autorizar (o rechazar) ventas? */
export function puedeAutorizarVentas(email?: string | null): boolean {
  return AUTORIZADORES.includes((email ?? '').trim().toLowerCase());
}
