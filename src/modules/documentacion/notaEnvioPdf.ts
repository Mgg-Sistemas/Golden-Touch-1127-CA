/* ============================================================
   Golden Touch · Documentación · Nota de envío (PDF · vista previa)

   Copia del formato que se llenaba a mano («Nota de entrega» de papel):
   membrete con domicilio fiscal, N° y fecha arriba a la derecha, recuadro
   del cliente / departamento, recuadro de detalles de entrega, tabla
   ITEM · DESCRIPCIÓN · CANT., total y las dos firmas (Entregado por /
   Recibido conforme). Carta, márgenes de 2 cm.
   ============================================================ */
import { loadLogoPdfDataUrl, dibujarLogoPdf } from '@/shared/lib/pdfLogo';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import { previewPdf } from '@/shared/lib/reportePreview';
import { EMPRESA_DOMICILIO, EMPRESA_NOMBRE, EMPRESA_RIF } from '@/shared/lib/empresa';
import { cantidadTexto, numeroEnvio, totalRenglones } from './notaEnvio';
import type { NotaEnvio } from './documentacion.repository';

/** Granate del formato original. */
const GRANATE: [number, number, number] = [128, 52, 44];
const FONDO_CAJA: [number, number, number] = [250, 247, 242];

function fechaVe(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

export async function descargarNotaEnvioPdf(n: NotaEnvio): Promise<void> {
  const [{ jsPDF }, { default: autoTable }, logo] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    loadLogoPdfDataUrl().catch(() => null),
  ]);
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 56.7;
  const der = W - M;
  let y = M;

  // ─── Membrete ───
  const CAJA = 64;
  if (logo) dibujarLogoPdf(doc, logo, M, y, CAJA);
  else {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(20);
    doc.text(EMPRESA_NOMBRE, M, y + 20);
    doc.setFontSize(9); doc.text(`RIF: ${EMPRESA_RIF}`, M, y + 34);
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(...GRANATE);
  doc.text(n.estado === 'anulado' ? 'NOTA DE ENVÍO · ANULADA' : 'NOTA DE ENVÍO', der, y + 16, { align: 'right' });
  doc.setFontSize(10); doc.setTextColor(60);
  doc.setFont('helvetica', 'normal'); doc.text('N°:', der - 92, y + 36);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(20);
  doc.text(numeroEnvio(n.numero), der, y + 36, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60);
  doc.text('Fecha:', der - 92, y + 54);
  doc.setTextColor(20); doc.text(fechaVe(n.fecha), der, y + 54, { align: 'right' });
  y += CAJA + 8;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(40);
  const dom = doc.splitTextToSize(`Domicilio Fiscal: ${pdfSafe(EMPRESA_DOMICILIO)}`, W - 2 * M) as string[];
  doc.text(dom, M, y);
  y += dom.length * 11 + 4;
  doc.setDrawColor(...GRANATE); doc.setLineWidth(1.6);
  doc.line(M, y, der, y);
  y += 14;

  // ─── Recuadros: cliente / departamento · detalles de entrega ───
  const gap = 12;
  const bw = (W - 2 * M - gap) / 2;
  const bh = 78;
  const caja = (x: number, titulo: string, filas: Array<[string, string]>) => {
    doc.setFillColor(...FONDO_CAJA); doc.setDrawColor(205, 195, 180); doc.setLineWidth(0.7);
    doc.roundedRect(x, y, bw, bh, 5, 5, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...GRANATE);
    doc.text(titulo, x + 10, y + 16);
    let fy = y + 34;
    filas.forEach(([k, v]) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(80);
      doc.text(k, x + 10, fy);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(20);
      const val = doc.splitTextToSize(pdfSafe(v) || '—', bw - 100) as string[];
      doc.text(val.slice(0, 2), x + 90, fy);
      fy += val.length > 1 ? 24 : 18;
    });
  };
  caja(M, 'DATOS DEL CLIENTE / DEPARTAMENTO', [['Razón Social:', n.razon_social], ['RIF / C.I.:', n.rif ?? '']]);
  caja(M + bw + gap, 'DETALLES DE ENTREGA', [['Atención a:', n.atencion_a ?? ''], ['Condición:', n.condicion ?? '']]);
  y += bh + 16;

  // ─── Renglones ───
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['ITEM', 'DESCRIPCIÓN / CONCEPTO', 'CANT.']],
    body: n.items.map((r, i) => [String(i + 1).padStart(2, '0'), pdfSafe(r.descripcion), cantidadTexto(r.cantidad)]),
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9.5, cellPadding: { top: 6, bottom: 6, left: 6, right: 6 }, textColor: 20, lineColor: [215, 210, 200], lineWidth: { bottom: 0.5 } },
    headStyles: { fillColor: GRANATE, textColor: 255, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 46, halign: 'center' }, 2: { cellWidth: 70, halign: 'right' } },
  });
  y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  y += 16;

  if (n.notas) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(70);
    const nl = doc.splitTextToSize(`Observaciones: ${pdfSafe(n.notas)}`, W - 2 * M) as string[];
    doc.text(nl, M, y + 4);
    y += nl.length * 12 + 8;
  }

  // ─── Total (abajo a la derecha, sobre las firmas) ───
  const firmaY = Math.max(y + 130, H - 120);
  const totalY = Math.max(y, firmaY - 110);
  const tw = 210, th = 40;
  doc.setFillColor(...FONDO_CAJA); doc.setDrawColor(205, 195, 180); doc.setLineWidth(0.7);
  doc.roundedRect(der - tw, totalY, tw, th, 5, 5, 'FD');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(40);
  doc.text(`Total ${pdfSafe(n.total_etiqueta)}:`, der - tw + 12, totalY + 25);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(20);
  doc.text(cantidadTexto(n.total ?? totalRenglones(n.items)), der - 14, totalY + 25, { align: 'right' });

  // ─── Firmas ───
  const fw = (W - 2 * M - 40) / 2;
  doc.setDrawColor(60); doc.setLineWidth(0.7);
  doc.line(M, firmaY, M + fw, firmaY);
  doc.line(der - fw, firmaY, der, firmaY);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(20);
  doc.text(`Entregado por ${pdfSafe(n.entregado_por) || ''}`.trim(), M + fw / 2, firmaY + 15, { align: 'center', maxWidth: fw });
  doc.text('Recibido Conforme', der - fw / 2, firmaY + 15, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90);
  doc.text('Firma', M + fw / 2, firmaY + 29, { align: 'center' });
  doc.text('Firma, Sello, Cédula y Fecha', der - fw / 2, firmaY + 29, { align: 'center' });

  if (n.estado === 'anulado') {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(70); doc.setTextColor(200, 60, 60);
    doc.text('ANULADA', W / 2, H / 2, { align: 'center', angle: 30 });
  }

  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(150);
  doc.text(`Documento generado por el sistema · Nota de envío N° ${numeroEnvio(n.numero)}`, M, H - 30);

  previewPdf(doc, `nota-envio-${numeroEnvio(n.numero)}.pdf`);
}
