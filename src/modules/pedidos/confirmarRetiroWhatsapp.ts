/* ============================================================
   Golden Touch · Compras · WhatsApp al confirmar el retiro (27/11/2026)

   Cuando una OC pagada está en «Pendiente por recibir» y Compras confirma
   cómo se retira, se arma el aviso para el grupo de Delivery / Carga pesada.
   Se abre para compartir con `CompartirWhatsapp`: nada se envía solo.

   El encabezado va en negrita —en WhatsApp es el equivalente a «en grande»—
   con separadores, igual que los otros avisos del sistema. En carga pesada
   se destaca además la modalidad para que no pase desapercibida.

   Los renglones son los mismos de `delivery.ts` (🔹 Orden, 🏭 Proveedor, 🚨
   Requerimiento, 🚚 Entrega, 🕒 y sello GT), para que quien lo lee en el chat
   reconozca el formato de una vez. Encabezado y pie dicen la modalidad real.
   Los productos NO se enumeran:
   el mensaje manda expresamente a revisarlos en el sistema.
   ============================================================ */
import type { ModalidadEntrega, Orden, Proveedor } from '@/shared/lib/types';
import { MODALIDADES_ENTREGA, etiquetaSedeEntrega } from '@/shared/lib/types';
import { fechaHoraVE, montoTxt } from '@/modules/delivery/delivery';
import { nombrePersonaCompras } from './personasCompras';

/** Encabezado que pidió Compras; la modalidad se agrega según la OC. */
export const TEXTO_CONFIRMAR_RETIRO = 'CONFIRMAR RETIRO POR SISTEMAS';
/** Pie con el sello de la empresa; la modalidad se agrega según la OC. */
export const PIE_EMPRESA = '🏢 *GOLDEN TOUCH 1127 C.A.*';
/** Solo se agrega cuando la modalidad es carga pesada. */
export const TEXTO_CARGA_PESADA = 'CARGA PESADA';
/** En lugar del listado: los productos se consultan en el sistema, nunca en el chat. */
export const TEXTO_VER_PRODUCTOS = 'NO se muestran aquí · para verlos, *revise el sistema*.';
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
  // 27/11/2026: el encabezado y el pie tienen que decir la modalidad real de la OC.
  // Antes quedaba fijo «DELIVERY» incluso en carga pesada.
  const encabezado = `*${TEXTO_CONFIRMAR_RETIRO} - ${etiquetaModalidad.toUpperCase()}*`;
  const pie = `${PIE_EMPRESA} · ${etiquetaModalidad}`;
  const cuando = o.retiro_confirmado_en ?? new Date().toISOString();
  const por = nombrePersonaCompras(o.retiro_confirmado_por || actor, personas);

  const L: string[] = [
    encabezado,
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
  // 27/11/2026: el WhatsApp no enumera productos. Va en negrita y claro: si quiere
  // ver qué se retira, la persona debe abrir el sistema. Nada de «SUBELO».
  L.push('', `📦 *Productos:* ${TEXTO_VER_PRODUCTOS}`);

  L.push('', SEPARADOR, `✅ *Retiro confirmado:* ${por || '—'} · 🕒 ${fechaHoraVE(cuando)}`, pie);
  return L.join('\n');
}
