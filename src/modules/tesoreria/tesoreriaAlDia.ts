/* ============================================================
   Golden Touch · Tesorería al día (07/11/2026)

   Pedido de la administradora: cuando no hay nada por pagar, el reporte dinámico
   y el WhatsApp dicen «ÓRDENES PENDIENTES POR PAGAR: 0 · TESORERÍA AL DÍA EN
   PAGOS PENDIENTES» en vez de quedar vacíos o bloqueados.
   ============================================================ */
import { previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';

export const TITULO_AL_DIA = 'ÓRDENES PENDIENTES POR PAGAR: 0';
export const LEYENDA_AL_DIA = 'TESORERÍA AL DÍA EN PAGOS PENDIENTES';

/** «07/11/2026 · 09:15 a. m.» en hora de Venezuela. */
export function fechaHoraAlDia(ahora: Date = new Date()): string {
  const f = new Intl.DateTimeFormat('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric' }).format(ahora);
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Caracas', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(ahora);
  const g = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
  const pm = g('dayPeriod').toUpperCase() === 'PM' ? 'p. m.' : 'a. m.';
  return `${f} · ${g('hour').padStart(2, '0')}:${g('minute')} ${pm}`;
}

/** El WhatsApp cuando no queda ninguna orden por pagar. */
export function textoWhatsappTesoreriaAlDia(ahora: Date = new Date()): string {
  return [
    '🧾 *RESUMEN · ÓRDENES POR PAGAR*',
    `📅 *Generado:* ${fechaHoraAlDia(ahora)}`,
    '',
    `📋 *${TITULO_AL_DIA}*`,
    `✅ *${LEYENDA_AL_DIA}*`,
    '',
    '🏢 *GOLDEN TOUCH 1127 C.A.*',
  ].join('\n');
}

/** El PDF del reporte dinámico de «Por pagar» cuando no queda nada por pagar. */
export async function descargarTesoreriaAlDiaPdf(ahora: Date = new Date()): Promise<void> {
  const [{ jsPDF }, { dibujarLogoPdf, loadLogoPdfDataUrl }] = await Promise.all([import('jspdf'), import('@/shared/lib/pdfLogo')]);
  const logo = await loadLogoPdfDataUrl().catch(() => null);
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  let y = M;
  if (logo) dibujarLogoPdf(doc, logo, M, y, 44);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(30, 30, 30);
  doc.text(pdfSafe('TESORERÍA · ÓRDENES POR PAGAR'), W / 2 + (logo ? 28 : 0), y + 18, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90, 90, 90);
  doc.text(pdfSafe(`Generado: ${fechaHoraAlDia(ahora)}`), W / 2 + (logo ? 28 : 0), y + 36, { align: 'center' });
  y += 110;
  doc.setFillColor(232, 248, 238); doc.setDrawColor(22, 163, 74); doc.setLineWidth(1.2);
  doc.roundedRect(M, y, W - 2 * M, 110, 10, 10, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30); doc.setFontSize(18);
  doc.text(pdfSafe(TITULO_AL_DIA), W / 2, y + 45, { align: 'center' });
  doc.setTextColor(21, 128, 61); doc.setFontSize(16);
  doc.text(pdfSafe(LEYENDA_AL_DIA), W / 2, y + 78, { align: 'center' });
  const H = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120, 120, 120);
  doc.text(pdfSafe(`GOLDEN TOUCH 1127 C.A. · Impreso ${fechaHoraAlDia(ahora)}`), M, H - 18);
  previewPdf(doc, `tesoreria-al-dia-${ahora.toISOString().slice(0, 10)}.pdf`);
}
