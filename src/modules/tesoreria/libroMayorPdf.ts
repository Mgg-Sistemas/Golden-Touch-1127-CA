/* ============================================================
   Golden Touch · Tesorería · PDF del Libro Mayor (por moneda)
   Relación de movimientos de una moneda: fecha, caja, concepto,
   beneficiario/motivo, Debe, Haber y saldo corrido, con totales
   Debe / Haber / Neto. Vista previa antes de descargar.
   ============================================================ */
import { previewPdf } from '@/shared/lib/reportePreview';

export interface LibroMayorPdfRow {
  fecha: string;
  caja: string;
  concepto: string;
  beneficiario: string;
  debe: string;
  haber: string;
  saldo: string;
}

export async function descargarLibroMayorPdf(input: {
  moneda: string;
  rows: LibroMayorPdfRow[];
  totDebe: string;
  totHaber: string;
  neto: string;
}): Promise<void> {
  const [{ jsPDF }, { default: autoTable }, fmt, { loadLogoDataUrl }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/format'),
    import('@/shared/lib/pdfLogo'),
  ]);
  const logo = await loadLogoDataUrl().catch(() => null);
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const W = doc.internal.pageSize.getWidth();
  const MARGIN = 42.52;
  let y = MARGIN;
  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 44, 44); } catch { /* opcional */ } }

  doc.setTextColor(255, 138, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(`LIBRO MAYOR · ${input.moneda}`, W / 2 + 28, y + 22, { align: 'center' });
  doc.setTextColor(120, 120, 120); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`GOLDEN TOUCH 1127 C.A. · Generado ${fmt.dateTime(new Date().toISOString())}`, W / 2 + 28, y + 38, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 50;

  // Resumen Debe / Haber / Neto.
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text(`${input.rows.length} movimiento(s)   ·   Debe: ${input.totDebe}   ·   Haber: ${input.totHaber}   ·   Neto: ${input.neto}`, MARGIN, y + 8);
  y += 22;

  autoTable(doc, {
    startY: y,
    head: [['FECHA', 'CAJA', 'CONCEPTO', 'BENEFICIARIO / MOTIVO', 'DEBE', 'HABER', 'SALDO']],
    body: input.rows.map((r) => [r.fecha, r.caja, r.concepto, r.beneficiario, r.debe, r.haber, r.saldo]),
    foot: [['', '', '', 'Totales', input.totDebe, input.totHaber, input.neto]],
    styles: { fontSize: 8, cellPadding: 4, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: [210, 210, 210], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: [245, 245, 245], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'right' },
    columnStyles: {
      0: { cellWidth: 78 },
      1: { cellWidth: 70 },
      2: { cellWidth: 110 },
      3: { cellWidth: 'auto' },
      4: { halign: 'right', cellWidth: 70 },
      5: { halign: 'right', cellWidth: 70 },
      6: { halign: 'right', cellWidth: 70 },
    },
    margin: MARGIN,
  });

  previewPdf(doc, `libro-mayor-${input.moneda}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
