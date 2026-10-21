/* ============================================================
   Golden Touch · Proveedores · Descargar la lista en PDF y Excel

   Sale la lista que se está viendo (con los filtros de la pantalla): RIF, razón
   social, contacto, teléfono, correo, dirección, categorías, origen, actividad
   económica, N° de administración y estado. Los dos formatos llevan los mismos
   datos; el PDF (más angosto) deja la dirección y el N° de administración en la
   segunda línea de la razón social. Los dos abren en vista previa.

   `construir…` solo arma el documento (es lo que se prueba); `descargar…` trae el
   logo / la empresa y abre la vista previa.
   ============================================================ */
import type { Proveedor } from '@/shared/lib/types';
import { previewExcelArchivo, previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';

export interface OpcionesReporteProveedores {
  /** Cómo se filtró la lista («Activos · Categoría Ferretería»); vacío = sin filtro. */
  filtro?: string;
  /** ISO del momento en que se genera. Ahora, si no se pasa. */
  generadoEn?: string;
}

const ORIGEN: Record<string, string> = { nacional: 'Nacional', internacional: 'Internacional' };

/** dd/mm/aaaa hh:mm (hora de Venezuela) del momento de generación. */
export function momentoGeneracion(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('day')}/${g('month')}/${g('year')} ${g('hour')}:${g('minute')}`;
}

/** Una fila lista para escribir (texto plano; el PDF la pasa por pdfSafe). */
export interface FilaProveedor {
  rif: string;
  razon: string;
  contacto: string;
  telefono: string;
  email: string;
  direccion: string;
  categorias: string;
  origen: string;
  actividad: string;
  numeroAdm: string;
  estado: string;
}

export function filasProveedores(lista: readonly Proveedor[]): FilaProveedor[] {
  const t = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, ' ').trim();
  return lista.map((p) => ({
    rif: t(p.rif),
    razon: t(p.razon_social),
    contacto: t(p.contacto),
    telefono: t(p.telefono),
    email: t(p.email),
    direccion: t(p.direccion),
    categorias: (p.categorias ?? []).map(t).filter(Boolean).join(', '),
    origen: ORIGEN[p.origen] ?? t(p.origen),
    actividad: t(p.actividad_economica),
    numeroAdm: t(p.numero_administracion),
    estado: p.estado === 'activo' ? 'Activo' : 'Inactivo',
  }));
}

/* Paleta PASTEL (la de «Compras por estado»). */
const PASTEL_PDF: Record<'titulo' | 'cabecera' | 'cabeceraTexto' | 'cebra', [number, number, number]> = {
  titulo: [192, 126, 70],
  cabecera: [246, 217, 184],
  cabeceraTexto: [92, 58, 28],
  cebra: [253, 248, 242],
};

export async function construirProveedoresPdf(
  lista: readonly Proveedor[], logo: string | null, op: OpcionesReporteProveedores = {},
): Promise<import('jspdf').jsPDF> {
  const [{ jsPDF }, { default: autoTable }, { dibujarLogoPdf }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/pdfLogo'),
  ]);
  const generado = momentoGeneracion(op.generadoEn ?? new Date().toISOString());
  const filas = filasProveedores(lista);

  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const MARGIN = 40;
  let y = MARGIN;
  if (logo) dibujarLogoPdf(doc, logo, MARGIN, y, 44);

  const cx = W / 2 + (logo ? 28 : 0);
  doc.setTextColor(...PASTEL_PDF.titulo); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text('PROVEEDORES', cx, y + 18, { align: 'center' });
  doc.setTextColor(120, 120, 120); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(pdfSafe(`GOLDEN TOUCH 1127 C.A. · ${filas.length} proveedor(es) · Generado ${generado}`), cx, y + 32, { align: 'center' });
  if (op.filtro) doc.text(pdfSafe(`Filtro: ${op.filtro}`), cx, y + 44, { align: 'center' });
  y += op.filtro ? 62 : 54;

  autoTable(doc, {
    startY: y,
    head: [['#', 'RIF', 'RAZÓN SOCIAL', 'CONTACTO', 'TELÉFONO', 'CORREO', 'CATEGORÍAS', 'ACTIVIDAD ECONÓMICA', 'ESTADO']],
    body: filas.map((f, i) => [
      String(i + 1),
      pdfSafe(f.rif) || '—',
      // Dirección y N° de administración, debajo de la razón social (así el PDF cabe en una hoja horizontal).
      [pdfSafe(f.razon) || '—', f.direccion ? pdfSafe(f.direccion) : '', f.numeroAdm ? `N° adm.: ${pdfSafe(f.numeroAdm)}` : ''].filter(Boolean).join('\n'),
      pdfSafe(f.contacto) || '—',
      pdfSafe(f.telefono) || '—',
      pdfSafe(f.email) || '—',
      pdfSafe(f.categorias) || '—',
      pdfSafe(f.actividad) || '—',
      f.estado,
    ]),
    styles: { fontSize: 7.5, cellPadding: 3, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: PASTEL_PDF.cabecera, textColor: PASTEL_PDF.cabeceraTexto, fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: PASTEL_PDF.cebra },
    columnStyles: {
      0: { halign: 'center', cellWidth: 22 },
      1: { cellWidth: 62 },
      2: { cellWidth: 150 },
      3: { cellWidth: 64 },
      4: { cellWidth: 62 },
      5: { cellWidth: 100 },
      7: { cellWidth: 100 },
      8: { halign: 'center', cellWidth: 40 },
    },
    margin: MARGIN,
  });

  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setDrawColor(225, 225, 225); doc.setLineWidth(0.4);
    doc.line(MARGIN, H - 28, W - MARGIN, H - 28);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120, 120, 120);
    doc.text(pdfSafe(`PROVEEDORES · GOLDEN TOUCH 1127 C.A. · Generado ${generado}`), MARGIN, H - 16);
    doc.text(`Página ${i} de ${paginas}`, W - MARGIN, H - 16, { align: 'right' });
  }
  return doc;
}

export async function descargarProveedoresPdf(lista: readonly Proveedor[], op: OpcionesReporteProveedores = {}): Promise<void> {
  const { loadLogoPdfDataUrl } = await import('@/shared/lib/pdfLogo');
  const doc = await construirProveedoresPdf(lista, await loadLogoPdfDataUrl().catch(() => null), op);
  previewPdf(doc, `proveedores-${new Date().toISOString().slice(0, 10)}.pdf`);
}

const PASTEL_XLS = {
  titulo: 'FFC07E46',
  cabecera: 'FFF6D9B8',
  cabeceraTexto: 'FF5C3A1C',
  cebra: 'FFFDF8F2',
  borde: 'FFE0D3C2',
};

export async function construirProveedoresExcel(lista: readonly Proveedor[], op: OpcionesReporteProveedores = {}): Promise<ArrayBuffer> {
  const [{ default: ExcelJS }, { identidadEmpresa }] = await Promise.all([
    import('exceljs'),
    import('@/shared/lib/empresa'),
  ]);
  const emp = identidadEmpresa('GT');
  const generado = momentoGeneracion(op.generadoEn ?? new Date().toISOString());
  const filas = filasProveedores(lista);
  const COLS = 12;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Proveedores', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: 'frozen', ySplit: 4 }],
  });
  ws.columns = [
    { width: 6 }, { width: 16 }, { width: 38 }, { width: 24 }, { width: 16 }, { width: 30 },
    { width: 40 }, { width: 32 }, { width: 14 }, { width: 38 }, { width: 18 }, { width: 11 },
  ];
  const borde = { style: 'thin' as const, color: { argb: PASTEL_XLS.borde } };
  const bordes = { top: borde, left: borde, bottom: borde, right: borde };

  for (const fila of [1, 2, 3]) ws.mergeCells(fila, 1, fila, COLS);
  ws.getRow(1).height = 26;
  const t = ws.getCell(1, 1);
  t.value = `PROVEEDORES · ${emp.nombre}`;
  t.font = { name: 'Arial', size: 14, bold: true, color: { argb: PASTEL_XLS.titulo } };
  t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  const sub = (fila: number, texto: string) => {
    const c = ws.getCell(fila, 1);
    c.value = texto;
    c.font = { name: 'Arial', size: 10, color: { argb: 'FF5C6673' } };
    c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  };
  sub(2, `${filas.length} proveedor(es) · Generado ${generado}`);
  sub(3, op.filtro ? `Filtro: ${op.filtro}` : 'Sin filtro: todos los proveedores');

  const cab = ws.getRow(4);
  cab.values = ['#', 'RIF', 'RAZÓN SOCIAL', 'CONTACTO', 'TELÉFONO', 'CORREO', 'DIRECCIÓN', 'CATEGORÍAS', 'ORIGEN', 'ACTIVIDAD ECONÓMICA', 'N° ADMINISTRACIÓN', 'ESTADO'];
  cab.height = 24;
  cab.eachCell((c) => {
    c.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: PASTEL_XLS.cabeceraTexto } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PASTEL_XLS.cabecera } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = bordes;
  });

  filas.forEach((f, i) => {
    const r = ws.addRow([i + 1, f.rif, f.razon, f.contacto, f.telefono, f.email, f.direccion, f.categorias, f.origen, f.actividad, f.numeroAdm, f.estado]);
    r.eachCell({ includeEmpty: true }, (c, col) => {
      c.font = { name: 'Arial', size: 10, bold: col === 3 };
      c.border = bordes;
      c.alignment = { vertical: 'middle', wrapText: true, horizontal: col === 1 || col === 12 ? 'center' : 'left' };
      if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PASTEL_XLS.cebra } };
    });
  });
  if (filas.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + filas.length, column: COLS } };

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function descargarProveedoresExcel(lista: readonly Proveedor[], op: OpcionesReporteProveedores = {}): Promise<void> {
  const bytes = await construirProveedoresExcel(lista, op);
  await previewExcelArchivo(bytes, `proveedores-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
