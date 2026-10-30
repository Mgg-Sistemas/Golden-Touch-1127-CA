/* ============================================================
   Golden Touch · Tesorería · Mensaje de WhatsApp por Motivo de Pago
   
   Genera el mensaje estructurado de WhatsApp al pagar una OC o al registrar
   un motivo de no pago (sin fondos, esperando respuesta, no procede, otro).
   ============================================================ */

import type { Orden } from '@/shared/lib/types';
import { quienSync } from '@/shared/lib/directorioUsuarios';
import { nombrePersonaCompras } from '@/modules/pedidos/personasCompras';

export const MOTIVOS_NO_PAGO = [
  'Sin fondos en estos momentos.',
  'Esperando respuestas por el jefe.',
  'No procede esta compra',
  'Otro',
] as const;

export type MotivoNoPagoTipo = typeof MOTIVOS_NO_PAGO[number];

function num(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numTasa(t: number): string {
  return t.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export interface MensajeMotivoPagoOptions {
  orden: Orden;
  proveedorNombre?: string | null;
  tasaUsd?: number | null;
  personas?: Map<string, string>;
  pagada: boolean;
  motivoTipo?: MotivoNoPagoTipo | null;
  motivoDetalle?: string | null;
}

export function construirTextoMotivoPagoWhatsapp({
  orden: o,
  proveedorNombre,
  tasaUsd,
  personas,
  pagada,
  motivoTipo,
  motivoDetalle,
}: MensajeMotivoPagoOptions): string {
  const L: string[] = [];

  L.push(pagada ? '💸 *PAGO DE ORDEN DE COMPRA*' : '⚠️ *NOTIFICACIÓN DE PAGO DE OC*', '');
  L.push(`🔹 *ORDEN:* ${o.oc_codigo || o.codigo || '—'}`);
  if (o.codigo && o.oc_codigo && o.codigo !== o.oc_codigo) {
    L.push(`📄 *Solicitud (OP):* ${o.codigo}`);
  }
  const prov = proveedorNombre?.trim();
  if (prov) {
    L.push(`🏭 *Proveedor:* ${prov}`);
  }

  // Quién solicitó la orden
  const solRaw = o.solicitante?.trim() || o.solicitante_email?.trim();
  const solNombre = quienSync(o.solicitante, o.solicitante_email) || (solRaw ? nombrePersonaCompras(solRaw, personas) : '');
  const unidad = o.unidad_solicitante?.trim();
  const solicita = [solNombre, unidad].filter(Boolean).join(' · ');
  if (solicita) {
    L.push(`👤 *Solicitante:* ${solicita}`);
  }

  // Analista que hizo la orden
  const analistaRaw = o.oc_creada_por || o.oc_emitida_por || o.metodo_pago_por;
  if (analistaRaw) {
    const analista = quienSync(null, analistaRaw) || nombrePersonaCompras(analistaRaw, personas);
    if (analista) {
      L.push(`🛒 *Analista encargado:* ${analista}`);
    }
  }

  // Nota del analista / solicitud
  const notaAnalista = o.oc_seleccion_observacion?.trim() || o.notas?.trim();
  if (notaAnalista) {
    L.push(`📝 *Nota del analista:* ${notaAnalista}`);
  }

  // Montos en $ y en Bs al cambio
  const totalUsd = Number(o.pago_en_divisa && o.total_divisa != null ? o.total_divisa : o.total) || 0;
  L.push(`💵 *Total:* $${num(totalUsd)}`);

  const t = Number(tasaUsd) || 0;
  if (t > 0) {
    const totalBs = Math.round(totalUsd * t * 100) / 100;
    L.push(`💱 *Monto en Bs:* Bs ${num(totalBs)} (tasa BCV ${numTasa(t)})`);
  }

  // Estado
  if (pagada) {
    L.push('📌 *Estado:* PAGADA POR TESORERIA');
  } else {
    let descMotivo = motivoTipo || 'Pendiente de pago';
    if (motivoTipo === 'No procede esta compra') {
      const just = motivoDetalle?.trim();
      descMotivo = just ? `No procede esta compra (${just})` : 'No procede esta compra';
    } else if (motivoTipo === 'Otro') {
      const otro = motivoDetalle?.trim();
      descMotivo = otro || 'Otro motivo especificado por tesorería';
    }
    L.push(`📌 *Estado:* ${descMotivo}`);

    if (motivoTipo === 'No procede esta compra') {
      L.push('', '🚨 *ACCIÓN REQUERIDA:* Notificación al analista encargado para que cancele la orden o busque otra cotización.');
    }
  }

  L.push('', '🏢 GOLDEN TOUCH 1127 C.A. · Tesorería');
  return L.join('\n');
}
