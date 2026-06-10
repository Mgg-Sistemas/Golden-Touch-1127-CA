/* ============================================================
   Golden Touch · Producción · Reporte PDF de contratos de producción
   Misma estética del sistema (logo, franja naranja, autoTable).
   Exporta los contratos recibidos (respeta el filtro aplicado).
   ============================================================ */
import { dateTime, num } from '@/shared/lib/format';
import { loadLogoDataUrl } from '@/shared/lib/pdfLogo';
import type { ContratoAcopio } from '@/shared/lib/types';

export interface ContratoReporteMeta { filtro?: string }

const NOMBRE_ARCHIVO = 'contratos-produccion.pdf';
const pct = (v: number | null | undefined) =>
  v == null || !Number.isFinite(Number(v)) ? '' : `${(Number(v) * 100).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

async function construirDoc(rows: ContratoAcopio[], meta: ContratoReporteMeta = {}) {
  const [logo, { jsPDF }, { default: autoTable }] = await Promise.all([
    loadLogoDataUrl().catch(() => null),
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const MARGIN = 28;
  let y = MARGIN;

  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 50, 50); } catch { /* opcional */ } }
  const tx = logo ? MARGIN + 62 : MARGIN;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text('Contratos de producción', tx, y + 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text('Casiterita = Kg seco, limpio · fórmulas del control de producción', tx, y + 33);
  doc.text(`Golden Touch 1127 C.A. · ${dateTime(new Date().toISOString())}`, PAGE_W - MARGIN, y + 18, { align: 'right' });
  doc.text(`${rows.length} contrato(s)${meta.filtro ? ` · ${meta.filtro}` : ''}`, PAGE_W - MARGIN, y + 33, { align: 'right' });
  y += 58;

  doc.setDrawColor(255, 138, 0); doc.setLineWidth(1.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y); y += 8;

  const body = rows.map((c) => [
    c.numero,
    c.fecha,
    c.supervisor || '—',
    c.lugar_extraccion || '—',
    c.molino || '—',
    num(c.ton_procesadas),
    num(c.tolva),
    num(c.kg_humedo),
    num(c.kg_secos),
    num(c.kg_seco_limpio),
    pct(c.pct_recuperacion_casiterita),
    num(c.kg_hierro),
    pct(c.pct_hierro),
    c.estado === 'activo' ? 'Activo' : 'Cerrado',
  ]);

  const totTon = rows.reduce((a, c) => a + (Number(c.ton_procesadas) || 0), 0);
  const totLim = rows.reduce((a, c) => a + (Number(c.kg_seco_limpio) || 0), 0);
  const totFe = rows.reduce((a, c) => a + (Number(c.kg_hierro) || 0), 0);
  body.push(['', '', '', '', 'TOTALES', num(totTon), '', '', '', num(totLim), '', num(totFe), '', '']);

  autoTable(doc, {
    startY: y + 4,
    head: [['N°', 'Fecha', 'Supervisor', 'Lugar', 'Molino', 'Ton', 'Tolva', 'Kg húm.', 'Kg secos', 'Kg s/limpio', '% Rec. Cas.', 'Kg Fe', '% Fe', 'Estado']],
    body,
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: 7, cellPadding: 2.5, overflow: 'linebreak' },
    headStyles: { fillColor: [255, 138, 0], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 70 }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' },
      8: { halign: 'right' }, 9: { halign: 'right', fontStyle: 'bold' }, 10: { halign: 'right' }, 11: { halign: 'right' }, 12: { halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.row.index === body.length - 1) { data.cell.styles.fontStyle = 'bold'; data.cell.styles.fillColor = [245, 245, 245]; }
    },
  });

  return doc;
}

export async function descargarContratosPdf(rows: ContratoAcopio[], meta: ContratoReporteMeta = {}): Promise<void> {
  const doc = await construirDoc(rows, meta);
  doc.save(NOMBRE_ARCHIVO);
}

export async function obtenerContratosPdfBase64(rows: ContratoAcopio[], meta: ContratoReporteMeta = {}): Promise<{ base64: string; nombre: string }> {
  const doc = await construirDoc(rows, meta);
  return { base64: doc.output('datauristring').split(',')[1] ?? '', nombre: NOMBRE_ARCHIVO };
}
