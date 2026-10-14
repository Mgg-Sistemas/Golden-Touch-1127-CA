/* ============================================================
   Golden Touch · Asignaciones · Acta de entrega (PDF · vista previa)

   La carta numerada: logo, «Puerto Ordaz, 12 de octubre del 2026»,
   «ASIGNACIÓN 026-2026», el párrafo de quién entrega a quién y qué, el
   cuadro ENTREGA / RECIBE con espacio para firma y huella, el pie con el
   domicilio fiscal y, en la hoja siguiente, el ANEXO FOTOGRÁFICO.
   Sale con la empresa de la nómina de quien recibe (GT o MTO).
   Si no se indicó quién suscribe, la línea queda en blanco para escribirla.
   ============================================================ */
import { loadLogoPdfEmpresa, dibujarLogoPdf } from '@/shared/lib/pdfLogo';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import { previewPdf } from '@/shared/lib/reportePreview';
import { identidadEmpresa, razonSocialTexto, ciudadCorta } from '@/shared/lib/empresa';
import { date as fmtDate } from '@/shared/lib/format';
import { CATEGORIA, type Asignacion, type PersonaMin } from './asignacionesReglas';
import { ITEMS_EN_TABLA, cedulaConPuntos, fechaCartaVE, nombreCarta, parrafoActa, textoItemActa } from './actas';
import type { ActaAsignacion } from './actas.repository';

const GRIS: [number, number, number] = [110, 110, 110];
const TINTA: [number, number, number] = [30, 30, 30];
const NARANJA: [number, number, number] = [255, 138, 0];

/* eslint-disable @typescript-eslint/no-explicit-any */


export async function verActaEntregaPdf(
  acta: ActaAsignacion,
  items: Asignacion[],
  recibe: PersonaMin | null,
  fotos: { dataUrl: string; filename: string }[] = [],
): Promise<void> {
  const emp = identidadEmpresa(recibe?.empresa);
  const empresa = razonSocialTexto(emp);
  const [{ jsPDF }, { default: autoTable }, logo] = await Promise.all([
    import('jspdf'), import('jspdf-autotable'), loadLogoPdfEmpresa(recibe?.empresa).catch(() => null),
  ]);
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 56.7;
  const ancho = W - 2 * M;
  const LOGO = 50;
  const limite = H - 70;

  const membrete = (): number => {
    if (logo) { try { dibujarLogoPdf(doc, logo, M, M - 10, LOGO); } catch { /* el logo es opcional */ } }
    doc.setDrawColor(...NARANJA); doc.setLineWidth(1.2);
    doc.line(M, M + LOGO, W - M, M + LOGO);
    return M + LOGO + 26;
  };
  const pie = () => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRIS);
    const dom = doc.splitTextToSize(pdfSafe(`Domicilio Fiscal: ${emp.domicilio}`), ancho) as string[];
    doc.text(dom, W / 2, H - 46, { align: 'center' });
    doc.text(pdfSafe(`RIF ${emp.rif} · ${emp.email} · WhatsApp ${emp.whatsapp}`), W / 2, H - 46 + dom.length * 9, { align: 'center' });
    doc.setTextColor(...TINTA);
  };

  let y = membrete();
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...TINTA);
  doc.text(pdfSafe(fechaCartaVE(acta.fecha, ciudadCorta(emp))), W - M, y, { align: 'right' });
  y += 30;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(pdfSafe(`ASIGNACIÓN ${acta.numero}`), W / 2, y, { align: 'center' });
  y += 26;

  const recibeNombre = recibe ? nombreCarta(recibe) : '—';
  const parrafo = parrafoActa({
    empresa,
    entregaNombre: acta.entrega_nombre ?? '', entregaCedula: acta.entrega_cedula ?? '', entregaCargo: acta.entrega_cargo ?? '',
    recibeNombre, items, observaciones: acta.observaciones,
  });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
  const lineas = doc.splitTextToSize(pdfSafe(parrafo), ancho) as string[];
  doc.text(lineas, M, y, { align: 'justify', maxWidth: ancho, lineHeightFactor: 1.45 });
  y += lineas.length * 10.5 * 1.45 + 10;

  // Con muchos ítems, la lista va en tabla debajo del párrafo.
  if (items.length >= ITEMS_EN_TABLA) {
    autoTable(doc as any, {
      startY: y,
      head: [['#', 'Tipo', 'Lo entregado', 'Vuelve']],
      body: items.map((a, i) => [String(i + 1), pdfSafe(CATEGORIA[a.categoria]?.label ?? a.categoria), pdfSafe(textoItemActa(a)), a.retornable ? 'Sí' : 'No']),
      styles: { fontSize: 8.5, cellPadding: 3, textColor: 20, lineColor: [60, 60, 60], lineWidth: 0.5 },
      headStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 22, halign: 'center' }, 1: { cellWidth: 95 }, 3: { cellWidth: 46, halign: 'center' } },
      margin: { left: M, right: M },
      theme: 'grid',
    });
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 14;
  }

  const obs = (acta.observaciones ?? '').trim();
  if (obs && (obs.length > 120 || items.length >= ITEMS_EN_TABLA)) {
    doc.setFontSize(9.5);
    const l2 = doc.splitTextToSize(pdfSafe(`Observaciones: ${obs}`), ancho) as string[];
    doc.text(l2, M, y, { lineHeightFactor: 1.4 });
    y += l2.length * 9.5 * 1.4 + 8;
  }

  doc.setFontSize(10.5);
  const cierre = doc.splitTextToSize('Sin otro particular a que hacer referencia me despido agradeciendo su valiosa colaboración.', ancho) as string[];
  doc.text(cierre, M, y + 6, { lineHeightFactor: 1.45 });
  y += cierre.length * 10.5 * 1.45 + 20;
  doc.text('Atentamente:', M, y);
  y += 24;

  // Cuadro ENTREGA / RECIBE: rótulo, espacio para firma y huella, nombre y cédula.
  const entregaTxt = acta.entrega_nombre
    ? [acta.entrega_nombre.toUpperCase(), acta.entrega_cedula ? `C.I. ${cedulaConPuntos(acta.entrega_cedula)}` : ''].filter(Boolean).join('\n')
    : 'Nombre: ______________________\nC.I.: __________________';
  const recibeTxt = [recibeNombre, recibe?.cedula ? `C.I. ${cedulaConPuntos(recibe.cedula)}` : ''].filter(Boolean).join('\n');
  if (y + 190 > limite) { pie(); doc.addPage(); y = membrete(); }
  autoTable(doc as any, {
    startY: y,
    head: [['ENTREGA:', 'RECIBE:']],
    body: [['', ''], [pdfSafe(entregaTxt), pdfSafe(recibeTxt)]],
    styles: { fontSize: 9, cellPadding: 6, textColor: 20, lineColor: [40, 40, 40], lineWidth: 0.75, valign: 'top' },
    headStyles: { fillColor: [255, 255, 255], textColor: 20, fontStyle: 'bold', halign: 'left', minCellHeight: 22 },
    bodyStyles: { fontStyle: 'bold' },
    didParseCell: (d: any) => { if (d.section === 'body' && d.row.index === 0) d.cell.styles.minCellHeight = 96; },
    didDrawCell: (d: any) => {
      if (d.section !== 'body' || d.row.index !== 0) return;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(170, 170, 170);
      doc.text('Firma y huella', d.cell.x + d.cell.width - 6, d.cell.y + d.cell.height - 6, { align: 'right' });
      doc.setTextColor(...TINTA);
    },
    margin: { left: M, right: M },
    theme: 'grid',
  });
  y = ((doc as any).lastAutoTable?.finalY ?? y) + 10;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRIS);
  doc.text(pdfSafe(`Acta ${acta.numero} · entrega del ${fmtDate(acta.fecha)} · ${items.length} ítem(s) · generada por el sistema`), M, y);
  pie();

  // ── Anexo fotográfico ──
  if (fotos.length) {
    doc.addPage();
    let ya = membrete();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...TINTA);
    doc.text(pdfSafe(`ANEXO FOTOGRÁFICO · ASIGNACIÓN ${acta.numero}`), W / 2, ya + 4, { align: 'center' });
    ya += 24;
    const gap = 12;
    const col = fotos.length === 1 ? ancho : (ancho - gap) / 2;
    const altoMax = fotos.length === 1 ? 330 : 230;
    fotos.forEach((f, i) => {
      const fila = Math.floor(i / 2); const colIdx = fotos.length === 1 ? 0 : i % 2;
      const x = M + colIdx * (col + gap);
      const yy = ya + fila * (altoMax + gap + 12);
      if (yy + altoMax > limite) return;
      try {
        const props = doc.getImageProperties(f.dataUrl);
        const r = Math.min(col / props.width, altoMax / props.height);
        const w = props.width * r; const h = props.height * r;
        doc.addImage(f.dataUrl, props.fileType || 'JPEG', x + (col - w) / 2, yy, w, h);
      } catch { /* una foto ilegible no tumba el acta */ }
    });
    pie();
  }

  previewPdf(doc, `acta-asignacion-${acta.numero}.pdf`);
}
