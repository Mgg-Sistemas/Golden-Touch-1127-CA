/* ============================================================
   Golden Touch · Compras · «Cierre diario» para WhatsApp
   Los tres títulos con sus cantidades, en texto con emojis para el chat,
   con espacios entre líneas para facilitar la lectura rápida en el teléfono.
   Se fija con tests: es un acuerdo con quien lo lee en el teléfono.
   ============================================================ */
import { money } from '@/shared/lib/format';
import { TITULOS_CIERRE, etiquetaPeriodo, fechaCaracas, momentoImpresion, type PeriodoCierre, type ResumenCierre } from './cierreDiario';

/** Emoji de modalidad de retiro SIN U+FE0F (WhatsApp conserva intactos los emojis de un solo codepoint). */
function emojiEntregaRetiro(entrega: string): string {
  const norm = entrega.toLowerCase();
  if (norm.includes('delivery')) return '🛵';
  if (norm.includes('pesada')) return '🚛';
  if (norm.includes('domicilio')) return '🏠';
  return '📍';
}

export function textoCierreDiarioWhatsapp(r: ResumenCierre, p: PeriodoCierre, ahora: Date = new Date()): string {
  const L: string[] = [];
  L.push('📊 *CIERRE DIARIO · COMPRAS*', '');
  L.push(`📅 *Período:* ${etiquetaPeriodo(p, fechaCaracas(ahora))}`, '');
  L.push(`🕒 *Impreso:* ${momentoImpresion(ahora)}`, '');

  for (const t of TITULOS_CIERRE) {
    L.push(`${t.emoji} *${t.titulo}:* ${r[t.clave]}`, '');
  }

  L.push(`🧾 *DETALLE · ÓRDENES POR PAGAR (${r.ocPorPagar.length})*`, '');
  if (r.ocPorPagar.length === 0) {
    L.push('No quedaron órdenes por pagar en este período.', '');
  } else {
    for (const o of r.ocPorPagar) L.push(`• ${o.proveedor}${o.codigo ? ` · ${o.codigo}` : ''}: *${money(o.montoUsd)}*`);
    L.push('', `💰 *Total pendiente por pagar:* ${money(r.totalPorPagarUsd)}`, '');
  }

  if (r.ocPorRetirar) {
    L.push(`🚚 *PENDIENTES POR RETIRAR (${r.ocPorRetirar.length})*`, '');
    if (r.ocPorRetirar.length === 0) {
      L.push('No hay órdenes pagadas esperando que se confirme el retiro.', '');
    } else {
      for (const o of r.ocPorRetirar) {
        const icono = emojiEntregaRetiro(o.entrega);
        L.push(`📦 *${o.proveedor}*${o.codigo ? ` · *${o.codigo}*` : ''}`);
        L.push(`   ${icono} ${o.entrega} · 📅 Pagada: ${o.pagada}`, '');
      }
    }
  }

  if (r.analistas && r.analistas.length > 0) {
    L.push('👥 *POR ANALISTA*', '');
    for (const a of r.analistas) {
      L.push(`👤 *${a.nombre}:*`);
      L.push(`Total de cotizaciones realizadas: *${a.cotizaciones}*`);
      L.push(`Total de órdenes finalizadas: *${a.finalizadas}*`, '');
    }
  }

  L.push('🏢 *GOLDEN TOUCH 1127 C.A.*');
  return L.join('\n');
}
