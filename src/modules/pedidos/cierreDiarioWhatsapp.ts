/* ============================================================
   Golden Touch · Compras · «Cierre diario» para WhatsApp
   Los cuatro títulos con sus cantidades, en texto con emojis para el chat.
   Se fija con tests: es un acuerdo con quien lo lee en el teléfono.
   ============================================================ */
import { TITULOS_CIERRE, etiquetaPeriodo, momentoImpresion, type PeriodoCierre, type ResumenCierre } from './cierreDiario';

export function textoCierreDiarioWhatsapp(r: ResumenCierre, p: PeriodoCierre, ahora: Date = new Date()): string {
  const L: string[] = [];
  L.push('📊 *CIERRE DIARIO · COMPRAS*', '');
  L.push(`📅 *Período:* ${etiquetaPeriodo(p)}`);
  L.push(`🕒 *Impreso:* ${momentoImpresion(ahora)}`, '');
  for (const t of TITULOS_CIERRE) L.push(`${t.emoji} *${t.titulo}:* ${r[t.clave]}`);
  if (r.analistas && r.analistas.length > 0) {
    L.push('', '👥 *POR ANALISTA*');
    for (const a of r.analistas) {
      L.push(`· *${a.nombre}:* ${a.cotizaciones} cotizaciones realizadas · ${a.finalizadas} órdenes finalizadas`);
    }
  }
  L.push('', '🏢 GOLDEN TOUCH 1127 C.A.');
  return L.join('\n');
}
