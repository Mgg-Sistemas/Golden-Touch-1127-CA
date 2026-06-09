/* ============================================================
   Golden Touch · Combustible · Reporte PDF del historial de conciliaciones
   Misma estética que el libro mayor (logo, franja naranja, autoTable).
   Exporta las conciliaciones que recibe (respeta el filtro aplicado).
   ============================================================ */
import { dateTime, num } from '@/shared/lib/format';
import { loadLogoDataUrl } from '@/shared/lib/pdfLogo';
import type { ConciliacionCombustible } from '@/shared/lib/types';

export interface ConciliacionRow extends ConciliacionCombustible {
  tanqueNombre: string;
}

export interface ConciliacionReporteMeta {
  /** Texto con el filtro aplicado (para el subtítulo). */
  filtro?: string;
}

const NOMBRE_ARCHIVO = 'combustible-conciliaciones.pdf';

async function construirDoc(rows: ConciliacionRow[], meta: ConciliacionReporteMeta = {}) {
  const [logo, { jsPDF }, { default: autoTable }] = await Promise.all([
    loadLogoDataUrl().catch(() => null),
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const MARGIN = 32;
  let y = MARGIN;

  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 50, 50); } catch { /* opcional */ } }
  const tx = logo ? MARGIN + 62 : MARGIN;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text('Combustible · Conciliaciones', tx, y + 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text('Saldo en libros vs. saldo según la mina (libreta)', tx, y + 33);
  doc.text(`Golden Touch 1127 C.A. · ${dateTime(new Date().toISOString())}`, PAGE_W - MARGIN, y + 18, { align: 'right' });
  doc.text(`${rows.length} registro(s)${meta.filtro ? ` · ${meta.filtro}` : ''}`, PAGE_W - MARGIN, y + 33, { align: 'right' });
  y += 58;

  doc.setDrawColor(255, 138, 0); doc.setLineWidth(1.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y); y += 8;

  const body = rows.map((c) => [
    c.periodo || '—',
    c.tanqueNombre,
    c.fecha,
    num(c.saldo_libros),
    num(c.saldo_reportado_mina),
    num(c.diferencia),
    c.notas || '—',
  ]);

  // Totales (sin la diferencia, como en la pantalla).
  const totLibros = rows.reduce((a, c) => a + (Number(c.saldo_libros) || 0), 0);
  const totLibreta = rows.reduce((a, c) => a + (Number(c.saldo_reportado_mina) || 0), 0);
  body.push(['', 'TOTALES', '', num(totLibros), num(totLibreta), '', '']);

  autoTable(doc, {
    startY: y + 4,
    head: [['Semana', 'Tanque', 'Registrada', 'Libros', 'Libreta (mina)', 'Dif.', 'Notas']],
    body,
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: 7.5, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [255, 138, 0], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 120 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 70 },
      3: { cellWidth: 70, halign: 'right', fontStyle: 'bold' }, 4: { cellWidth: 80, halign: 'right' },
      5: { cellWidth: 60, halign: 'right' }, 6: { cellWidth: 'auto' },
    },
    didParseCell: (data) => {
      if (data.row.index === body.length - 1) { data.cell.styles.fontStyle = 'bold'; data.cell.styles.fillColor = [245, 245, 245]; }
    },
  });

  return doc;
}

export async function descargarConciliacionesPdf(rows: ConciliacionRow[], meta: ConciliacionReporteMeta = {}): Promise<void> {
  const doc = await construirDoc(rows, meta);
  doc.save(NOMBRE_ARCHIVO);
}

export async function obtenerConciliacionesPdfBase64(
  rows: ConciliacionRow[], meta: ConciliacionReporteMeta = {},
): Promise<{ base64: string; nombre: string }> {
  const doc = await construirDoc(rows, meta);
  const base64 = doc.output('datauristring').split(',')[1] ?? '';
  return { base64, nombre: NOMBRE_ARCHIVO };
}
