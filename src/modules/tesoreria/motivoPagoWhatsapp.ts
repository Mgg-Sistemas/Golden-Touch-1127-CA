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

export interface MensajeMotivoPagoOptions {
  orden: Orden;
  proveedorNombre?: string | null;
  /** Ya no se usa (el aviso va solo en $); se deja para no romper a quien la pasa. */
  tasaUsd?: number | null;
  personas?: Map<string, string>;
  pagada: boolean;
  motivoTipo?: MotivoNoPagoTipo | null;
  motivoDetalle?: string | null;
}

export function construirTextoMotivoPagoWhatsapp({
  orden: o,
  proveedorNombre,
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

  // Monto solo en $ (03/11/2026: la usuaria pidió quitar el «Monto en Bs» de este aviso).
  const totalUsd = Number(o.pago_en_divisa && o.total_divisa != null ? o.total_divisa : o.total) || 0;
  L.push(`💵 *Total:* $${num(totalUsd)}`);

  // Estado
  if (pagada) {
    L.push('📌 *Estado:* *PAGADA POR TESORERIA*');
  } else {
    let descMotivo = motivoTipo || 'Pendiente de pago';
    if (motivoTipo === 'No procede esta compra') {
      const just = motivoDetalle?.trim();
      descMotivo = just ? `No procede esta compra (${just})` : 'No procede esta compra';
    } else if (motivoTipo === 'Otro') {
      const otro = motivoDetalle?.trim();
      descMotivo = otro || 'Otro motivo especificado por tesorería';
    }
    L.push(`📌 *Estado:* *${descMotivo}*`);

    if (motivoTipo === 'No procede esta compra') {
      L.push('', '🚨 *ACCIÓN REQUERIDA:* Notificación al analista encargado para que cancele la orden o busque otra cotización.');
    }
  }

  L.push('', '🏢 GOLDEN TOUCH 1127 C.A. · Tesorería');
  return L.join('\n');
}

/* ---------- Resumen por lote (04/11/2026) ----------
   Varias OC de «Órdenes pendientes por pagar» en un solo aviso: el código, el
   proveedor y el monto a pagar de cada una, el total, el motivo de pago (el mismo
   del aviso individual) y la fecha en que se arma el mensaje. */

export interface OrdenLoteWhatsapp {
  codigo: string;
  proveedor: string | null;
  monto: number;
  /** 'USD' (por defecto) o 'Bs'. */
  moneda?: string | null;
}

const montoMoneda = (n: number, moneda?: string | null) => (String(moneda ?? 'USD').toUpperCase() === 'BS' ? `Bs ${num(n)}` : `$${num(n)}`);

function estadoMotivo(pagada: boolean, motivoTipo?: MotivoNoPagoTipo | null, motivoDetalle?: string | null): string {
  if (pagada) return 'SE PAGARÁN POR TESORERÍA';
  if (motivoTipo === 'No procede esta compra') {
    const just = motivoDetalle?.trim();
    return just ? `No procede esta compra (${just})` : 'No procede esta compra';
  }
  if (motivoTipo === 'Otro') return motivoDetalle?.trim() || 'Otro motivo especificado por tesorería';
  return motivoTipo || 'Pendiente de pago';
}

export function construirTextoMotivoPagoLote(opts: {
  ordenes: OrdenLoteWhatsapp[];
  pagada: boolean;
  motivoTipo?: MotivoNoPagoTipo | null;
  motivoDetalle?: string | null;
  /** Cuándo se arma el mensaje (ISO). */
  fecha: string;
}): string {
  const { ordenes } = opts;
  const L: string[] = [];
  L.push(opts.pagada ? '💸 *RESUMEN DE PAGO · ÓRDENES DE COMPRA*' : '⚠️ *NOTIFICACIÓN DE PAGO · ÓRDENES DE COMPRA*');
  const f = new Date(opts.fecha);
  const fecha = Number.isNaN(f.getTime()) ? '' : f.toLocaleString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  if (fecha) L.push(`📅 *Fecha:* ${fecha}`);
  L.push('', `📋 *Órdenes (${ordenes.length}):*`);
  ordenes.forEach((o, i) => {
    L.push(`${i + 1}. *${o.codigo}* · ${o.proveedor?.trim() || '—'} — ${montoMoneda(o.monto, o.moneda)}`);
  });
  const porMoneda = new Map<string, number>();
  for (const o of ordenes) {
    const m = String(o.moneda ?? 'USD').toUpperCase() === 'BS' ? 'Bs' : 'USD';
    porMoneda.set(m, Math.round(((porMoneda.get(m) ?? 0) + (Number(o.monto) || 0)) * 100) / 100);
  }
  const totales = [...porMoneda.entries()].map(([m, n]) => montoMoneda(n, m)).join(' + ');
  L.push('', `💵 *Total a pagar (${ordenes.length} OC):* ${totales || '$0,00'}`);
  L.push(`📌 *Estado:* *${estadoMotivo(opts.pagada, opts.motivoTipo, opts.motivoDetalle)}*`);
  if (!opts.pagada && opts.motivoTipo === 'No procede esta compra') {
    L.push('', '🚨 *ACCIÓN REQUERIDA:* Notificación a los analistas encargados para que cancelen las órdenes o busquen otra cotización.');
  }
  L.push('', '🏢 GOLDEN TOUCH 1127 C.A. · Tesorería');
  return L.join('\n');
}
