// Golden Touch · Tesorería · Resumen de cuentas (por pagar / créditos / por cobrar)
// Mismo formato que el checklist de Órdenes de Compra pendientes: tabla apaisada
// con logo, título naranja, listado con su valor y total(es) por moneda, y vista
// previa antes de descargar.
import { previewPdf } from '@/shared/lib/reportePreview';

export interface ResumenCuentaRow {
  /** Código u origen (N° OC, tipo, etc.). */
  concepto: string;
  contraparte: string;
  moneda: string;
  total: number;
  /** Abonado (por pagar) o cobrado (por cobrar). */
  pagado: number;
  saldo: number;
  estado: string;
  fecha: string | null;
}

function n2(n: number): string {
  return Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function construir(titulo: string, rows: ResumenCuentaRow[], etiquetaPagado: string) {
  const [{ jsPDF }, { default: autoTable }, fmt, { loadLogoDataUrl }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/format'),
    import('@/shared/lib/pdfLogo'),
  ]);
  const logo = await loadLogoDataUrl().catch(() => null);
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const W = doc.internal.pageSize.getWidth();
  const MARGIN = 42.52; // 1.5 cm
  let y = MARGIN;
  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 44, 44); } catch { /* opcional */ } }

  doc.setTextColor(255, 138, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(titulo.toUpperCase(), W / 2 + 28, y + 20, { align: 'center' });
  doc.setTextColor(90, 90, 90); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`${rows.length} cuenta(s) · ${fmt.dateTime(new Date().toISOString())}`, W / 2 + 28, y + 36, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 56;

  const body = rows.map((r, i) => [
    String(i + 1),
    r.concepto,
    r.contraparte,
    r.moneda,
    n2(r.total),
    n2(r.pagado),
    n2(r.saldo),
    r.estado,
    r.fecha ? fmt.date(r.fecha) : '—',
  ]);

  // Totales por moneda (los montos pueden ser USD/Bs/COP).
  const porMoneda = new Map<string, { total: number; pagado: number; saldo: number }>();
  for (const r of rows) {
    const m = porMoneda.get(r.moneda) ?? { total: 0, pagado: 0, saldo: 0 };
    m.total += Number(r.total) || 0; m.pagado += Number(r.pagado) || 0; m.saldo += Number(r.saldo) || 0;
    porMoneda.set(r.moneda, m);
  }
  const foot = [...porMoneda.entries()].map(([mon, t]) => [
    '', `TOTAL ${mon}`, '', mon, n2(t.total), n2(t.pagado), n2(t.saldo), '', '',
  ]);

  autoTable(doc, {
    startY: y,
    head: [['ITEM', 'CONCEPTO', 'CONTRAPARTE', 'MONEDA', 'TOTAL', etiquetaPagado.toUpperCase(), 'SALDO', 'ESTADO', 'FECHA']],
    body,
    foot,
    styles: { fontSize: 8, cellPadding: 4, valign: 'middle' },
    headStyles: { fillColor: [210, 210, 210], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: [235, 235, 235], textColor: [20, 20, 20], fontStyle: 'bold' },
    columnStyles: {
      0: { halign: 'center', cellWidth: 32 },
      1: { cellWidth: 110 },
      3: { halign: 'center', cellWidth: 54 },
      4: { halign: 'right', cellWidth: 80 },
      5: { halign: 'right', cellWidth: 80 },
      6: { halign: 'right', cellWidth: 80 },
      7: { halign: 'center', cellWidth: 80 },
      8: { halign: 'center', cellWidth: 70 },
    },
    margin: MARGIN,
  });

  doc.setFontSize(8); doc.setTextColor(120, 120, 120);
  doc.text('GOLDEN TOUCH 1127 C.A.', MARGIN, doc.internal.pageSize.getHeight() - 16);

  const slug = titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return { doc, filename: `resumen-${slug}.pdf` };
}

/** Genera el resumen y abre la vista previa (con botón Descargar). */
export async function descargarResumenCuentasPdf(
  titulo: string,
  rows: ResumenCuentaRow[],
  etiquetaPagado = 'ABONADO',
): Promise<void> {
  const { doc, filename } = await construir(titulo, rows, etiquetaPagado);
  previewPdf(doc, filename);
}
