/* ============================================================
   Golden Touch · Producción · Tenor Promedio Diarios · Reportes
   PDF / Excel / Correo de la lista de tenor por contrato.
   Columnas: N°, Fecha, Ton procesadas, Kg Casiterita, Ton×1000, Tenor %.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { previewPdf, previewExcel } from '@/shared/lib/reportePreview';

export interface TenorRow {
  numero: string;
  fecha: string;
  ton: number;       // Ton procesadas (material primario)
  kg: number;        // Kg Casiterita (Kg seco limpio)
  tonMil: number;    // Ton × 1000
  tenor: number | null; // Kg / (Ton × 1000)  → se muestra en %
}

export interface TenorMeta { filtro?: string }

const NOMBRE = 'tenor-promedio-diarios';
const fmtNum = (v: number) => v.toLocaleString('es', { maximumFractionDigits: 2 });
const fmtPct = (v: number | null) =>
  v == null || !Number.isFinite(v) ? '' : `${(v * 100).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

async function construirDoc(rows: TenorRow[], meta: TenorMeta = {}) {
  const [{ dateTime }, { loadLogoDataUrl }, { jsPDF }, { default: autoTable }] = await Promise.all([
    import('@/shared/lib/format'), import('@/shared/lib/pdfLogo'), import('jspdf'), import('jspdf-autotable'),
  ]);
  const logo = await loadLogoDataUrl().catch(() => null);

  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const MARGIN = 42.52; // 1.5 cm
  let y = MARGIN;
  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 50, 50); } catch { /* opcional */ } }
  const tx = logo ? MARGIN + 62 : MARGIN;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text('Tenor Promedio Diarios', tx, y + 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text('Tenor = Kg Casiterita ÷ (Ton procesadas × 1000)', tx, y + 33);
  doc.text(`GOLDEN TOUCH 1127 C.A. · ${dateTime(new Date().toISOString())}`, PAGE_W - MARGIN, y + 18, { align: 'right' });
  doc.text(`${rows.length} registro(s)${meta.filtro ? ` · ${meta.filtro}` : ''}`, PAGE_W - MARGIN, y + 33, { align: 'right' });
  y += 58;
  doc.setDrawColor(255, 138, 0); doc.setLineWidth(1.5); doc.line(MARGIN, y, PAGE_W - MARGIN, y); y += 8;

  const body = rows.map((r) => [r.numero, r.fecha, fmtNum(r.ton), fmtNum(r.kg), fmtNum(r.tonMil), fmtPct(r.tenor)]);
  const totTon = rows.reduce((a, r) => a + r.ton, 0);
  const totKg = rows.reduce((a, r) => a + r.kg, 0);
  const totMil = rows.reduce((a, r) => a + r.tonMil, 0);
  body.push(['', 'TOTALES', fmtNum(totTon), fmtNum(totKg), fmtNum(totMil), fmtPct(totMil > 0 ? totKg / totMil : null)]);

  autoTable(doc, {
    startY: y + 4,
    head: [['N° Contrato', 'Fecha', 'Ton procesadas', 'Kg Casiterita', 'Ton × 1000', 'Tenor %']],
    body,
    margin: MARGIN,
    styles: { fontSize: 8.5, cellPadding: 4 },
    headStyles: { fillColor: [255, 138, 0], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } },
    didParseCell: (data) => { if (data.row.index === body.length - 1) { data.cell.styles.fontStyle = 'bold'; data.cell.styles.fillColor = [245, 245, 245]; } },
  });
  return doc;
}

export async function descargarTenorPdf(rows: TenorRow[], meta: TenorMeta = {}): Promise<void> {
  previewPdf(await construirDoc(rows, meta), `${NOMBRE}.pdf`);
}

export async function descargarTenorExcel(rows: TenorRow[]): Promise<void> {
  const [XLSXmod, { dateTime }] = await Promise.all([import('xlsx-js-style'), import('@/shared/lib/format')]);
  const XLSX = XLSXmod as unknown as {
    utils: { aoa_to_sheet: (d: unknown[][]) => Record<string, unknown>; encode_cell: (c: { r: number; c: number }) => string; book_new: () => unknown; book_append_sheet: (wb: unknown, ws: unknown, name: string) => void };
    writeFile: (wb: unknown, name: string) => void;
  };
  const HEADER = { font: { name: 'Arial', sz: 11, bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: 'FF8A00' } }, alignment: { horizontal: 'center' } };
  const TITLE = { ...HEADER, font: { ...HEADER.font, sz: 14 }, alignment: { horizontal: 'left' } };
  const head = ['N° Contrato', 'Fecha', 'Ton procesadas', 'Kg Casiterita', 'Ton × 1000', 'Tenor %'];
  const filas = rows.map((r) => [r.numero, r.fecha, r.ton, r.kg, r.tonMil, r.tenor == null ? '' : r.tenor]);
  const aoa: unknown[][] = [['TENOR PROMEDIO DIARIOS · GOLDEN TOUCH 1127 C.A.'], [`${rows.length} registro(s) · ${dateTime(new Date().toISOString())}`], [], head, ...filas];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  (ws as Record<string, unknown>)['!cols'] = [{ wch: 16 }, { wch: 13 }, { wch: 15 }, { wch: 15 }, { wch: 14 }, { wch: 12 }];
  (ws as Record<string, unknown>)['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }];
  const cellAt = (r: number, c: number) => (ws as Record<string, { s?: unknown; z?: string }>)[XLSX.utils.encode_cell({ r, c })];
  const t = cellAt(0, 0); if (t) t.s = TITLE;
  head.forEach((_, c) => { const cell = cellAt(3, c); if (cell) cell.s = HEADER; });
  // Formato porcentaje en la columna Tenor.
  rows.forEach((_, i) => { const cell = cellAt(4 + i, 5); if (cell) cell.z = '0.00%'; });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tenor');
  previewExcel(wb, `${NOMBRE}.xlsx`);
}

export async function enviarTenorPorCorreo(rows: TenorRow[], destinos: string[], meta: TenorMeta = {}): Promise<{ destinatarios: string[] }> {
  const base64 = (await construirDoc(rows, meta)).output('datauristring').split(',')[1] ?? '';
  const { data, error } = await supabase.functions.invoke<{ ok: true; destinatarios: string[] } | { error: string }>('enviar-reporte', {
    body: { pdf_base64: base64, nombre_archivo: `${NOMBRE}.pdf`, asunto: `Tenor Promedio Diarios${meta.filtro ? ` · ${meta.filtro}` : ''}`, mensaje: `Tenor promedio diarios (${rows.length} registro(s)).`, to_emails: destinos },
  });
  if (error) throw new Error(error.message ?? 'No se pudo enviar el correo');
  if (!data || 'error' in data) throw new Error((data as { error?: string })?.error || 'Respuesta inválida');
  return { destinatarios: data.destinatarios };
}
