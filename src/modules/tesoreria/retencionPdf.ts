/* ============================================================
   Golden Touch · Tesorería · Comprobante de Retención (PDF).
   Se descarga SOLO al hacer clic (regla del sistema).
   ============================================================ */
import type { Retencion } from '@/shared/lib/types';

const TIPO_LABEL: Record<string, string> = {
  IVA: 'Retención de IVA',
  ISLR: 'Retención de ISLR',
  MUNICIPAL: 'Retención Municipal (Alcaldía)',
};

function monto(n: number, moneda: string): string {
  const v = Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return moneda === 'USD' ? `$ ${v}` : `${moneda} ${v}`;
}

export async function descargarComprobanteRetencionPdf(r: Retencion, proveedorNombre?: string | null): Promise<void> {
  const [{ jsPDF }, { default: autoTable }, fmt, { loadLogoDataUrl }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/format'),
    import('@/shared/lib/pdfLogo'),
  ]);
  const logo = await loadLogoDataUrl().catch(() => null);
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const MARGIN = 40;
  let y = MARGIN;
  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 50, 50); } catch { /* opcional */ } }
  const tx = logo ? MARGIN + 64 : MARGIN;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text('Comprobante de Retención', tx, y + 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text('Golden Touch 1127 C.A.', tx, y + 36);
  doc.text(`Generado ${fmt.dateTime(new Date().toISOString())}`, tx, y + 50);
  y += 70;

  doc.setDrawColor(255, 138, 0); doc.setLineWidth(1.5);
  doc.line(MARGIN, y, doc.internal.pageSize.getWidth() - MARGIN, y);
  y += 14;

  const ficha: Array<[string, string]> = [
    ['Tipo', TIPO_LABEL[r.tipo] ?? r.tipo],
    ['Comprobante N°', r.comprobante_nro || '—'],
    ['Fecha', fmt.date(r.fecha)],
    ['Proveedor', proveedorNombre || '—'],
    ['Base imponible', monto(r.base, r.moneda)],
    ['Porcentaje', `${r.porcentaje} %`],
    ['Monto retenido', monto(r.monto, r.moneda)],
    ['Moneda', r.moneda],
    ['Descripción', r.descripcion || '—'],
    ['Registró', r.actor_name || r.actor || '—'],
  ];
  autoTable(doc, {
    startY: y, body: ficha, theme: 'plain',
    styles: { fontSize: 10, cellPadding: 4 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 180 }, 1: { cellWidth: 'auto' } },
    margin: { left: MARGIN, right: MARGIN },
  });

  doc.save(`comprobante-retencion-${r.tipo}-${(r.comprobante_nro || r.id).slice(0, 12)}.pdf`);
}
