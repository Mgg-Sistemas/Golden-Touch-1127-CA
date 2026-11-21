/* ============================================================
   Golden Touch · Tesorería · Resumen WhatsApp con cuentas a crédito OC/OS
   (19-11-2026)

   Builder PURO del aviso de «Órdenes por pagar» que, cuando en el lote hay
   cuentas a crédito originadas en Compras, las separa en SU PROPIA sección
   (OC y OS), con su saldo pendiente y sus subtotales. Lo que se paga de
   inmediato y lo que se paga a crédito nunca se mezclan en el mismo renglón.

   GT ya tiene el builder general en `motivoPagoWhatsapp.ts`; este archivo
   solo añade la capa de crédito que trae el port de MGG (commits 4f230d0f).
   No toca Supabase ni la pantalla. Emojis sin el selector U+FE0F.
   ============================================================ */
import { identidadEmpresa } from '@/shared/lib/empresa';
import { estadoItemLote, fechaHoraResumen, type MotivoLote } from './motivoPagoWhatsapp';

/** Igual que el motivo del resumen individual de GT. */
export type MotivoPagoLote = MotivoLote;

export interface ItemResumenPorPagar {
  codigo: string;
  proveedor: string;
  /** Lo que se paga / el saldo pendiente, en USD. */
  montoUsd: number;
  motivo: MotivoPagoLote;
  motivoDetalle?: string | null;
  /** Cuenta a crédito de Compras (OC u OS): se expresa por su SALDO. */
  esCredito?: boolean;
  tipoCredito?: 'OC' | 'OS';
  /** Fecha vigente / vencimiento en formato DD/MM/AAAA si la orden es a crédito. */
  fechaVencimiento?: string | null;
}

function num(n: number): string {
  return (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const usd = (n: number) => `$${num(n)}`;
const unaLinea = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** Qué falta para armar el resumen (null si está bien). */
export function errorResumenPorPagar(items: ItemResumenPorPagar[]): string | null {
  if (!items.length) return 'Selecciona al menos una orden.';
  const sinDetalle = items.find((i) => (i.motivo === 'Otro' || i.motivo === 'No procede esta compra') && !unaLinea(i.motivoDetalle));
  return sinDetalle ? `Escribe el motivo de ${sinDetalle.codigo}.` : null;
}

/** Sin nada por pagar → «Tesorería al día». */
export function textoTesoreriaAlDia(ahora: Date): string {
  return [
    '🧾 *RESUMEN · ÓRDENES POR PAGAR*',
    `📅 *Generado:* ${fechaHoraResumen(ahora)}`,
    '',
    '🧾 *ÓRDENES PENDIENTES POR PAGAR: 0*',
    '',
    '✅ *TESORERÍA AL DÍA EN PAGOS PENDIENTES*',
    '',
    `🏢 *${identidadEmpresa('GT').nombre}*`,
  ].join('\n');
}

/** Sin créditos OC/OS pendientes. */
export function textoCreditosAlDia(ahora: Date): string {
  return [
    '🧾 *RESUMEN · CUENTAS A CRÉDITO POR PAGAR*',
    `📅 *Generado:* ${fechaHoraResumen(ahora)}`,
    '',
    '🧾 *CUENTAS A CRÉDITO (OC Y OS) PENDIENTES: 0*',
    '',
    '✅ *TESORERÍA AL DÍA EN CUENTAS A CRÉDITO*',
    '',
    `🏢 *${identidadEmpresa('GT').nombre}*`,
  ].join('\n');
}

/**
 * Texto del resumen. `creditos: true` significa que TODO el lote son cuentas a
 * crédito; si no, las filas marcadas como `esCredito` se agrupan aparte.
 */
export function textoResumenPorPagar(items: ItemResumenPorPagar[], ahora: Date, opts?: { creditos?: boolean }): string {
  const cred = !!opts?.creditos;
  const itemsCredMix = !cred ? items.filter((it) => it.esCredito) : [];
  const L: string[] = [];
  L.push(cred ? '🧾 *RESUMEN · CUENTAS A CRÉDITO POR PAGAR*' : '🧾 *RESUMEN · ÓRDENES POR PAGAR*');
  L.push(`📅 *Generado:* ${fechaHoraResumen(ahora)}`);
  L.push('');

  if (itemsCredMix.length > 0 || cred) {
    const inmediatas = items.filter((it) => !it.esCredito && !cred);
    const creditos = cred ? items : itemsCredMix;
    if (inmediatas.length > 0) {
      inmediatas.forEach((it, i) => {
        L.push(`${i + 1}. 🔹 *${unaLinea(it.codigo) || '—'}* · ${unaLinea(it.proveedor) || '—'}`);
        L.push(`    💵 *A pagar:* ${usd(it.montoUsd)} · ${estadoItemLote(it.motivo, it.motivoDetalle)}`);
      });
      L.push('');
    }
    const nOc = creditos.filter((it) => it.tipoCredito !== 'OS').length;
    const nOs = creditos.filter((it) => it.tipoCredito === 'OS').length;
    L.push(`💳 *CUENTAS A CRÉDITO COMPRAS · OC Y OS (${creditos.length} · OC: ${nOc}, OS: ${nOs})*`);
    creditos.forEach((it, i) => {
      const tag = `[${it.tipoCredito === 'OS' ? 'OS' : 'OC'}] `;
      L.push(`${i + 1}. 💳 *${tag}${unaLinea(it.codigo) || '—'}* · ${unaLinea(it.proveedor) || '—'}`);
      const vencFmt = it.fechaVencimiento ? ` · Vigente hasta ${it.fechaVencimiento}` : '';
      L.push(`    💵 *Saldo:* ${usd(it.montoUsd)}${vencFmt} · ${estadoItemLote(it.motivo, it.motivoDetalle)}`);
    });
    const subInm = inmediatas.reduce((a, it) => a + (Number(it.montoUsd) || 0), 0);
    const subOc = creditos.filter((it) => it.tipoCredito !== 'OS').reduce((a, it) => a + (Number(it.montoUsd) || 0), 0);
    const subOs = creditos.filter((it) => it.tipoCredito === 'OS').reduce((a, it) => a + (Number(it.montoUsd) || 0), 0);
    L.push('');
    if (inmediatas.length > 0) {
      L.push(`🧾 *Subtotal por pagar (${inmediatas.length}):* *${usd(subInm)}*`);
    }
    L.push(`💳 *Subtotal cuentas a crédito (${creditos.length}):* *${usd(subOc + subOs)}*`);
    L.push(`    ├ OC: *${usd(subOc)}*`);
    L.push(`    └ OS: *${usd(subOs)}*`);
  } else {
    items.forEach((it, i) => {
      L.push(`${i + 1}. 🔹 *${unaLinea(it.codigo) || '—'}* · ${unaLinea(it.proveedor) || '—'}`);
      L.push(`    💵 *A pagar:* ${usd(it.montoUsd)} · ${estadoItemLote(it.motivo, it.motivoDetalle)}`);
    });
    L.push('');
  }

  const total = items.reduce((a, it) => a + (Number(it.montoUsd) || 0), 0);
  const sePagan = items.filter((it) => it.motivo === 'si');
  const totalSi = sePagan.reduce((a, it) => a + (Number(it.montoUsd) || 0), 0);
  const unidad = cred ? (items.length === 1 ? 'cuenta' : 'cuentas') : (items.length === 1 ? 'orden' : 'órdenes');
  L.push(`💰 *Total (${items.length} ${unidad}):* *${usd(total)}*`);
  if (sePagan.length !== items.length) {
    L.push(`✅ *Se pagarán (${sePagan.length}):* *${usd(totalSi)}*`);
    L.push(`⏸ *No se pagarán (${items.length - sePagan.length}):* *${usd(total - totalSi)}*`);
  }
  L.push(`🏢 *${identidadEmpresa('GT').nombre}*`);
  return L.join('\n');
}
