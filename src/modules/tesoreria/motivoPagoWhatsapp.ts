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

/* 05/11/2026 · Formato como MGG: «🧾 RESUMEN · ÓRDENES POR PAGAR», cada orden con su
   propio motivo de pago (✅ Se pagará / ⏸ No se pagará · motivo), el total y la empresa. */

/** 'si' = se pagará; si no, uno de los motivos de «no se pagará». */
export type MotivoLote = 'si' | MotivoNoPagoTipo;

export interface OrdenLoteWhatsapp {
  codigo: string;
  proveedor: string | null;
  monto: number;
  /** 'USD' (por defecto) o 'Bs'. */
  moneda?: string | null;
  /** Motivo de pago de ESTA orden (sin dato = lo general del lote). */
  motivo?: MotivoLote | null;
  /** Lo escrito con «No procede esta compra» u «Otro». */
  motivoDetalle?: string | null;
}

const montoMoneda = (n: number, moneda?: string | null) => (String(moneda ?? 'USD').toUpperCase() === 'BS' ? `Bs ${num(n)}` : `$${num(n)}`);
const unaLinea = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim();

/** «05/11/2026 09:12 a. m.» en la hora de Venezuela. */
export function fechaHoraResumen(d: Date): string {
  const f = d.toLocaleDateString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric' });
  const h = d.toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit', hour12: true });
  return `${f} ${h}`;
}

/** El estado de una orden: «✅ *Se pagará*» o «⏸ *No se pagará* · motivo». */
export function estadoItemLote(motivo: MotivoLote, detalle?: string | null): string {
  if (motivo === 'si') return '✅ *Se pagará*';
  const det = unaLinea(detalle);
  const desc = motivo === 'Otro' ? (det || 'Otro motivo')
    : motivo === 'No procede esta compra' ? (det ? `No procede esta compra (${det})` : 'No procede esta compra')
    : motivo.replace(/\.$/, '');
  return `⏸ *No se pagará* · ${desc}`;
}

/** Qué falta para armar el resumen (null si está bien). */
export function errorResumenLote(ordenes: OrdenLoteWhatsapp[]): string | null {
  if (!ordenes.length) return 'Marca al menos una OC.';
  const falta = ordenes.find((o) => (o.motivo === 'Otro' || o.motivo === 'No procede esta compra') && !unaLinea(o.motivoDetalle));
  return falta ? `Escribe el motivo de ${falta.codigo}.` : null;
}

function totalesTxt(ordenes: OrdenLoteWhatsapp[]): string {
  const porMoneda = new Map<string, number>();
  for (const o of ordenes) {
    const m = String(o.moneda ?? 'USD').toUpperCase() === 'BS' ? 'Bs' : 'USD';
    porMoneda.set(m, Math.round(((porMoneda.get(m) ?? 0) + (Number(o.monto) || 0)) * 100) / 100);
  }
  return [...porMoneda.entries()].map(([m, n]) => montoMoneda(n, m)).join(' + ') || '$0,00';
}

export function construirTextoMotivoPagoLote(opts: {
  ordenes: OrdenLoteWhatsapp[];
  /** Motivo general (para las órdenes sin motivo propio). */
  pagada?: boolean;
  motivoTipo?: MotivoNoPagoTipo | null;
  motivoDetalle?: string | null;
  /** Cuándo se arma el mensaje (ISO). */
  fecha: string;
  /** 09/11/2026: encabezado (por defecto «RESUMEN · ÓRDENES POR PAGAR»). */
  titulo?: string;
  /** Etiqueta del monto de cada línea (por defecto «A pagar»). */
  etiquetaMonto?: string;
}): string {
  const general: MotivoLote = opts.pagada === false ? (opts.motivoTipo ?? 'Sin fondos en estos momentos.') : 'si';
  const items = opts.ordenes.map((o) => ({
    ...o,
    motivo: (o.motivo ?? general) as MotivoLote,
    motivoDetalle: o.motivo ? o.motivoDetalle : (o.motivoDetalle ?? opts.motivoDetalle),
  }));
  const L: string[] = [];
  L.push(`🧾 *${opts.titulo ?? 'RESUMEN · ÓRDENES POR PAGAR'}*`);
  const f = new Date(opts.fecha);
  if (!Number.isNaN(f.getTime())) L.push(`📅 *Generado:* ${fechaHoraResumen(f)}`);
  L.push('');
  items.forEach((o, i) => {
    L.push(`${i + 1}. 🔹 *${unaLinea(o.codigo) || '—'}* · ${unaLinea(o.proveedor) || '—'}`);
    L.push(`    💵 *${opts.etiquetaMonto ?? 'A pagar'}:* ${montoMoneda(Number(o.monto) || 0, o.moneda)} · ${estadoItemLote(o.motivo, o.motivoDetalle)}`);
  });
  const si = items.filter((o) => o.motivo === 'si');
  L.push('');
  L.push(`💰 *Total (${items.length} ${items.length === 1 ? 'orden' : 'órdenes'}):* *${totalesTxt(items)}*`);
  // Si no todas se pagan, cuánto sí sale hoy.
  if (si.length !== items.length) {
    L.push(`✅ *Se pagarán (${si.length}):* *${totalesTxt(si)}*`);
    L.push(`⏸ *No se pagarán (${items.length - si.length}):* *${totalesTxt(items.filter((o) => o.motivo !== 'si'))}*`);
  }
  if (items.some((o) => o.motivo === 'No procede esta compra')) {
    L.push('🚨 *ACCIÓN REQUERIDA:* los analistas encargados deben cancelar esas órdenes o buscar otra cotización.');
  }
  L.push('🏢 *GOLDEN TOUCH 1127 C.A.*');
  return L.join('\n');
}
