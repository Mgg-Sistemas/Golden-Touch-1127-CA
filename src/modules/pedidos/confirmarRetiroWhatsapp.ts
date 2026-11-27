/* ============================================================
   Golden Touch · Compras · WhatsApp al confirmar el retiro (27/11/2026)

   Cuando una OC pagada está en «Pendiente por recibir» y Compras confirma
   cómo se retira, se arma el aviso para el grupo de Delivery / Carga pesada.
   Se abre para compartir con `CompartirWhatsapp`: nada se envía solo.

   El encabezado va en negrita —en WhatsApp es el equivalente a «en grande»—
   con separadores, igual que los otros avisos del sistema. En carga pesada
   se destaca además la modalidad para que no pase desapercibida.

   Los renglones y el pie son los mismos de `delivery.ts` (🔹 Orden, 🏭
   Proveedor, 🚨 Requerimiento, 🚚 Entrega, 📦 Productos, 🕒 y pie GT), para
   que quien lo lee en el chat reconozca el formato de una vez.
   ============================================================ */
import type { ModalidadEntrega, Orden, Proveedor } from '@/shared/lib/types';
import { MODALIDADES_ENTREGA, etiquetaSedeEntrega } from '@/shared/lib/types';
import { fechaHoraVE, montoTxt, PIE_DELIVERY } from '@/modules/delivery/delivery';
import { nombrePersonaCompras } from './personasCompras';

/** Encabezado exacto que pidió Compras. En negrita, con separadores. */
export const TEXTO_CONFIRMAR_RETIRO = 'CONFIRMAR RETIRO POR SISTEMAS - DELIVERY';
/** Solo se agrega cuando la modalidad es carga pesada. */
export const TEXTO_CARGA_PESADA = 'CARGA PESADA';
const SEPARADOR = '━━━━━━━━━━━━━━━━━━━━━━━━';

type DatosRetiro = Pick<Orden,
  | 'codigo' | 'oc_codigo' | 'proveedor_id' | 'items' | 'total' | 'total_moneda'
  | 'urgente' | 'notas' | 'motivo' | 'finalidad'
  | 'solicitante' | 'solicitante_email' | 'unidad_solicitante'
  | 'oc_creada_por' | 'oc_emitida_por' | 'metodo_pago_por'
  | 'almacen_destino' | 'sede_entrega' | 'modalidad_entrega'
  | 'retiro_confirmado_en' | 'retiro_confirmado_por'>;

/**
 * Texto del aviso de retiro confirmado. Se llama SOLO después de que
 * `confirmarRetiroOc` haya guardado el retiro (así no se avisa dos veces).
 */
export function mensajeConfirmarRetiroWhatsapp(
  o: DatosRetiro,
  proveedor: Pick<Proveedor, 'razon_social' | 'direccion'> | null | undefined,
  modalidad: ModalidadEntrega,
  actor?: string | null,
  personas?: Map<string, string>,
): string {
  const etiquetaModalidad = MODALIDADES_ENTREGA.find((x) => x.key === modalidad)?.label ?? 'Delivery';
  const cuando = o.retiro_confirmado_en ?? new Date().toISOString();
  const por = nombrePersonaCompras(o.retiro_confirmado_por || actor, personas);

  const L: string[] = [
    `*${TEXTO_CONFIRMAR_RETIRO}*`,
    SEPARADOR,
    '',
    `🔹 *ORDEN:* ${o.oc_codigo || o.codigo || '—'}`,
    `🏭 *Proveedor:* ${proveedor?.razon_social?.trim() || '—'}`,
  ];
  const direccion = proveedor?.direccion?.trim();
  if (direccion) L.push(`📍 *Dirección:* ${direccion}`);
  L.push(o.urgente ? '🚨 *Requerimiento:* URGENTE' : '🟢 *Requerimiento:* Normal');
  L.push(`🚚 *Entrega:* ${etiquetaModalidad}`);
  if (modalidad === 'carga_pesada') L.push(`🚛 *${TEXTO_CARGA_PESADA}*`);

  const solicita = [
    nombrePersonaCompras(o.solicitante?.trim() || o.solicitante_email, personas),
    o.unidad_solicitante?.trim(),
  ].filter(Boolean).join(' · ');
  if (solicita) L.push(`👤 *Solicita:* ${solicita}`);
  const analista = nombrePersonaCompras(o.oc_creada_por || o.oc_emitida_por || o.metodo_pago_por, personas);
  if (analista) L.push(`🛒 *Analista encargado:* ${analista}`);
  if (o.almacen_destino?.trim()) L.push(`🏬 *Entregar en:* ${o.almacen_destino.trim()}`);
  const sede = etiquetaSedeEntrega(o.sede_entrega);
  if (sede) L.push(`📍 *Dirección de recepción:* Almacén ${sede}`);
  const detalle = o.finalidad?.trim() || o.motivo?.trim();
  if (detalle) L.push(`📝 *Detalle:* ${detalle}`);
  const nota = o.notas?.trim();
  if (nota) L.push(`📌 *Nota:* ${nota}`);

  L.push(`💵 *Total:* ${montoTxt(Number(o.total) || 0, o.total_moneda || 'USD')}`);
  const items = (o.items ?? []).filter((i) => i.comprar !== false).map((i) =>
    `• ${i.nombre} — ${(Number(i.cantidad) || 0).toLocaleString('es-VE', { maximumFractionDigits: 3 })}${i.unidad ? ` ${i.unidad}` : ''}`);
  if (items.length) L.push('', `📦 *Productos (${items.length}):*`, ...items);

  L.push('', SEPARADOR, `✅ *Retiro confirmado:* ${por || '—'} · 🕒 ${fechaHoraVE(cuando)}`, PIE_DELIVERY);
  return L.join('\n');
}
