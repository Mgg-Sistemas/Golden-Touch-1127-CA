/* ============================================================
   Golden Touch · Compras · PDF «Cierre diario»
   Una hoja: los cuatro títulos con sus cantidades, el período y la fecha y hora
   en que se imprime. `construirCierreDiarioPdf` solo arma el documento (es la que
   se prueba); la descarga trae el logo y abre la vista previa con 🖨 Imprimir.
   ============================================================ */
import { previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import { TITULOS_CIERRE, etiquetaPeriodo, momentoImpresion, type PeriodoCierre, type ResumenCierre } from './cierreDiario';

const PASTEL: Record<'titulo' | 'cabecera' | 'cabeceraTexto' | 'cebra', [number, number, number]> = {
  titulo: [192, 126, 70],
  cabecera: [246, 217, 184],
  cabeceraTexto: [92, 58, 28],
  cebra: [253, 248, 242],
};

export async function construirCierreDiarioPdf(
  r: ResumenCierre, p: PeriodoCierre, logo: string | null, ahora: Date = new Date(),
): Promise<import('jspdf').jsPDF> {
  const [{ jsPDF }, { default: autoTable }, { dibujarLogoPdf }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/pdfLogo'),
  ]);
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const MARGIN = 56.69;
  let y = MARGIN;
  if (logo) dibujarLogoPdf(doc, logo, MARGIN, y, 44);

  const cx = W / 2 + (logo ? 28 : 0);
  doc.setTextColor(...PASTEL.titulo); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text('CIERRE DIARIO · COMPRAS', cx, y + 22, { align: 'center' });
  doc.setTextColor(120, 120, 120); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  doc.text('GOLDEN TOUCH 1127 C.A.', cx, y + 38, { align: 'center' });
  y += 78;

  doc.setTextColor(40, 40, 40); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('Período:', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.text(pdfSafe(etiquetaPeriodo(p)), MARGIN + 52, y);
  y += 18;
  doc.setFont('helvetica', 'bold'); doc.text('Impreso:', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.text(pdfSafe(momentoImpresion(ahora)), MARGIN + 52, y);
  y += 16;

  autoTable(doc, {
    startY: y,
    head: [['TÍTULO', 'CANTIDAD']],
    body: TITULOS_CIERRE.map((t) => [pdfSafe(t.titulo), String(r[t.clave])]),
    styles: { fontSize: 12, cellPadding: 9, valign: 'middle' },
    headStyles: { fillColor: PASTEL.cabecera, textColor: PASTEL.cabeceraTexto, fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: PASTEL.cebra },
    columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'center', cellWidth: 100, fontStyle: 'bold', fontSize: 14 } },
    margin: MARGIN,
  });

  // @ts-expect-error lastAutoTable lo agrega el plugin
  y = ((doc.lastAutoTable?.finalY ?? y) as number) + 20;

  if (r.analistas && r.analistas.length > 0) {
    doc.setTextColor(...PASTEL.titulo); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text(pdfSafe('POR ANALISTA'), MARGIN, y);
    y += 8;

    autoTable(doc, {
      startY: y,
      head: [['ANALISTA', 'COTIZACIONES REALIZADAS', 'ÓRDENES FINALIZADAS']],
      body: r.analistas.map((a) => [pdfSafe(a.nombre), String(a.cotizaciones), String(a.finalizadas)]),
      styles: { fontSize: 10, cellPadding: 7, valign: 'middle' },
      headStyles: { fillColor: PASTEL.cabecera, textColor: PASTEL.cabeceraTexto, fontStyle: 'bold', halign: 'center' },
      alternateRowStyles: { fillColor: PASTEL.cebra },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { halign: 'center', cellWidth: 160, fontStyle: 'bold', fontSize: 11 },
        2: { halign: 'center', cellWidth: 140, fontStyle: 'bold', fontSize: 11 },
      },
      margin: MARGIN,
    });
  }

  doc.setDrawColor(225, 225, 225); doc.setLineWidth(0.4);
  doc.line(MARGIN, H - 30, W - MARGIN, H - 30);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120, 120, 120);
  doc.text(pdfSafe(`CIERRE DIARIO · GOLDEN TOUCH 1127 C.A. · Impreso ${momentoImpresion(ahora)}`), MARGIN, H - 18);
  return doc;
}

/** Genera el reporte y abre la vista previa (con el logo de la empresa). */
export async function descargarCierreDiarioPdf(r: ResumenCierre, p: PeriodoCierre, ahora: Date = new Date()): Promise<void> {
  const { loadLogoPdfDataUrl } = await import('@/shared/lib/pdfLogo');
  const doc = await construirCierreDiarioPdf(r, p, await loadLogoPdfDataUrl().catch(() => null), ahora);
  const sufijo = p.desde === p.hasta ? p.desde : `${p.desde}_a_${p.hasta}`;
  previewPdf(doc, `cierre-diario-${sufijo}.pdf`);
}
