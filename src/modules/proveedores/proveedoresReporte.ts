/* ============================================================
   Golden Touch · Proveedores · Descargar la lista en PDF y Excel

   Permite elegir qué datos salen (casillas de selección) y la orientación
   de la hoja (automática, vertical u horizontal).
   Sale la lista que se está viendo (con los filtros de la pantalla).
   Ambos formatos abren en vista previa.
   ============================================================ */
import type { Proveedor } from '@/shared/lib/types';
import { previewExcelArchivo, previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';

export type OrientacionHoja = 'auto' | 'vertical' | 'horizontal';

export interface OpcionesReporteProveedores {
  /** Cómo se filtró la lista («Activos · Categoría Ferretería»); vacío = sin filtro. */
  filtro?: string;
  /** ISO del momento en que se genera. Ahora, si no se pasa. */
  generadoEn?: string;
  /** Claves de los campos a incluir. Si no se pasa o está vacío, salen todos. */
  claves?: string[];
  /** Orientación forzada o automática según el peso de las columnas. */
  orientacion?: OrientacionHoja;
}

export interface CampoProveedor {
  clave: string;
  etiqueta: string;
  /** Ancho relativo de la columna (Excel en caracteres; el PDF lo reparte). */
  ancho: number;
  valor: (p: Proveedor) => string;
}

const ORIGEN: Record<string, string> = { nacional: 'Nacional', internacional: 'Internacional' };
const txt = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, ' ').trim();

/** Catálogo de campos disponibles para exportar, en el orden predeterminado. */
export const CAMPOS_PROVEEDOR: CampoProveedor[] = [
  { clave: 'rif', etiqueta: 'RIF', ancho: 16, valor: (p) => txt(p.rif) },
  { clave: 'razon_social', etiqueta: 'Razón social', ancho: 36, valor: (p) => txt(p.razon_social) },
  { clave: 'contacto', etiqueta: 'Contacto', ancho: 22, valor: (p) => txt(p.contacto) },
  { clave: 'telefono', etiqueta: 'Teléfono', ancho: 16, valor: (p) => txt(p.telefono) },
  { clave: 'email', etiqueta: 'Correo', ancho: 26, valor: (p) => txt(p.email) },
  { clave: 'direccion', etiqueta: 'Dirección', ancho: 32, valor: (p) => txt(p.direccion) },
  { clave: 'categorias', etiqueta: 'Categorías', ancho: 26, valor: (p) => (p.categorias ?? []).map(txt).filter(Boolean).join(', ') },
  { clave: 'origen', etiqueta: 'Origen', ancho: 14, valor: (p) => ORIGEN[p.origen] ?? txt(p.origen) },
  { clave: 'actividad_economica', etiqueta: 'Actividad económica', ancho: 28, valor: (p) => txt(p.actividad_economica) },
  { clave: 'numero_administracion', etiqueta: 'N° administración', ancho: 18, valor: (p) => txt(p.numero_administracion) },
  { clave: 'estado', etiqueta: 'Estado', ancho: 11, valor: (p) => (p.estado === 'activo' ? 'Activo' : 'Inactivo') },
];

/** Campos marcados por defecto al abrir el diálogo por primera vez. */
export const CAMPOS_POR_DEFECTO = [
  'rif',
  'razon_social',
  'contacto',
  'telefono',
  'email',
  'categorias',
  'estado',
];

/** Retorna los campos elegidos en el orden del catálogo. Si claves está vacío/no definido, retorna todos. */
export function camposElegidos(claves?: string[]): CampoProveedor[] {
  if (!claves || !claves.length) return CAMPOS_PROVEEDOR;
  const set = new Set(claves);
  const seleccion = CAMPOS_PROVEEDOR.filter((c) => set.has(c.clave));
  return seleccion.length ? seleccion : CAMPOS_PROVEEDOR;
}

/** Calcula la orientación final (portrait o landscape). */
export function orientacionFinal(claves: string[], elegida: OrientacionHoja = 'auto'): 'portrait' | 'landscape' {
  if (elegida === 'vertical') return 'portrait';
  if (elegida === 'horizontal') return 'landscape';
  const campos = camposElegidos(claves);
  const anchoTotal = campos.reduce((a, c) => a + c.ancho, 0);
  return anchoTotal > 85 || campos.length > 5 ? 'landscape' : 'portrait';
}

/** Tamaño de fuente para que las columnas entren en el ancho útil del PDF (entre 6 y 9 pt). */
export function letraQueEntra(util: number, anchoTotal: number): number {
  if (anchoTotal <= 0) return 9;
  return Math.max(6, Math.min(9, Math.floor((util / anchoTotal) * 2 * 2) / 2));
}

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

/** Una fila lista para escribir (texto plano; retrocompatibilidad con tests). */
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
  return lista.map((p) => ({
    rif: txt(p.rif),
    razon: txt(p.razon_social),
    contacto: txt(p.contacto),
    telefono: txt(p.telefono),
    email: txt(p.email),
    direccion: txt(p.direccion),
    categorias: (p.categorias ?? []).map(txt).filter(Boolean).join(', '),
    origen: ORIGEN[p.origen] ?? txt(p.origen),
    actividad: txt(p.actividad_economica),
    numeroAdm: txt(p.numero_administracion),
    estado: p.estado === 'activo' ? 'Activo' : 'Inactivo',
  }));
}

/** Encabezados y filas basados en los campos elegidos, ordenados por razón social. */
export function tablaProveedores(lista: readonly Proveedor[], claves?: string[]): { encabezados: string[]; filas: string[][] } {
  const campos = camposElegidos(claves);
  const orden = [...lista].sort((a, b) =>
    (a.razon_social ?? '').localeCompare(b.razon_social ?? '', 'es', { sensitivity: 'base' })
  );
  return {
    encabezados: campos.map((c) => c.etiqueta),
    filas: orden.map((p) => campos.map((c) => c.valor(p))),
  };
}

/* Paleta PASTEL (la de «Compras por estado»). */
const PASTEL_PDF: Record<'titulo' | 'cabecera' | 'cabeceraTexto' | 'cebra', [number, number, number]> = {
  titulo: [192, 126, 70],
  cabecera: [246, 217, 184],
  cabeceraTexto: [92, 58, 28],
  cebra: [253, 248, 242],
};

export async function construirProveedoresPdf(
  lista: readonly Proveedor[],
  logo: string | null,
  op: OpcionesReporteProveedores = {},
): Promise<import('jspdf').jsPDF> {
  const [{ jsPDF }, { default: autoTable }, { dibujarLogoPdf }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/pdfLogo'),
  ]);
  const generado = momentoGeneracion(op.generadoEn ?? new Date().toISOString());
  const campos = camposElegidos(op.claves);
  const { encabezados, filas } = tablaProveedores(lista, op.claves);
  const orientation = orientacionFinal(op.claves ?? [], op.orientacion);

  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const MARGIN = 36;
  let y = MARGIN;
  if (logo) dibujarLogoPdf(doc, logo, MARGIN, y, 44);

  const cx = W / 2 + (logo ? 28 : 0);
  doc.setTextColor(...PASTEL_PDF.titulo);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('PROVEEDORES', cx, y + 18, { align: 'center' });

  doc.setTextColor(120, 120, 120);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(pdfSafe(`GOLDEN TOUCH 1127 C.A. · ${filas.length} proveedor(es) · Generado ${generado}`), cx, y + 32, { align: 'center' });
  if (op.filtro) doc.text(pdfSafe(`Filtro: ${op.filtro}`), cx, y + 44, { align: 'center' });
  y += op.filtro ? 62 : 54;

  const util = W - MARGIN * 2 - 24;
  const anchoTotal = campos.reduce((a, c) => a + c.ancho, 0);
  const letra = letraQueEntra(util, anchoTotal);

  const columnStyles: Record<number, { cellWidth: number; halign?: 'center' | 'left' }> = {
    0: { halign: 'center', cellWidth: 24 },
  };
  campos.forEach((c, idx) => {
    columnStyles[idx + 1] = {
      cellWidth: (util * c.ancho) / anchoTotal,
      halign: c.clave === 'estado' || c.clave === 'origen' ? 'center' : 'left',
    };
  });

  autoTable(doc, {
    startY: y,
    head: [['#', ...encabezados.map((e) => pdfSafe(e.toUpperCase()))]],
    body: filas.map((fila, i) => [String(i + 1), ...fila.map((val) => pdfSafe(val) || '—')]),
    styles: { fontSize: letra, cellPadding: letra < 7.5 ? 2.5 : 4, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: PASTEL_PDF.cabecera, textColor: PASTEL_PDF.cabeceraTexto, fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: PASTEL_PDF.cebra },
    columnStyles,
    margin: MARGIN,
  });

  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setDrawColor(225, 225, 225);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, H - 28, W - MARGIN, H - 28);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text(pdfSafe(`PROVEEDORES · GOLDEN TOUCH 1127 C.A. · Generado ${generado}`), MARGIN, H - 16);
    doc.text(`Página ${i} de ${paginas}`, W - MARGIN, H - 16, { align: 'right' });
  }
  return doc;
}

export async function descargarProveedoresPdf(lista: readonly Proveedor[], op: OpcionesReporteProveedores = {}): Promise<void> {
  if (!lista.length) throw new Error('No hay proveedores en la lista (revisa los filtros).');
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

export async function construirProveedoresExcel(
  lista: readonly Proveedor[],
  op: OpcionesReporteProveedores = {},
): Promise<ArrayBuffer> {
  const [{ default: ExcelJS }, { identidadEmpresa }] = await Promise.all([
    import('exceljs'),
    import('@/shared/lib/empresa'),
  ]);
  const emp = identidadEmpresa('GT');
  const generado = momentoGeneracion(op.generadoEn ?? new Date().toISOString());
  const campos = camposElegidos(op.claves);
  const { encabezados, filas } = tablaProveedores(lista, op.claves);
  const COLS = Math.max(2, campos.length + 1);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Proveedores', {
    pageSetup: {
      orientation: orientacionFinal(op.claves ?? [], op.orientacion),
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
    views: [{ state: 'frozen', ySplit: 4 }],
  });

  ws.columns = [
    { width: 6 },
    ...campos.map((c) => ({ width: Math.max(c.ancho, c.etiqueta.length) + 6 })),
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
  cab.values = ['#', ...encabezados.map((e) => e.toUpperCase())];
  cab.height = 24;
  cab.eachCell((c) => {
    c.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: PASTEL_XLS.cabeceraTexto } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PASTEL_XLS.cabecera } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = bordes;
  });

  filas.forEach((fila, i) => {
    const r = ws.addRow([i + 1, ...fila]);
    r.eachCell({ includeEmpty: true }, (c, col) => {
      c.font = { name: 'Arial', size: 10, bold: col === 3 };
      c.border = bordes;
      c.alignment = {
        vertical: 'middle',
        wrapText: true,
        horizontal: col === 1 || (campos[col - 2]?.clave === 'estado') ? 'center' : 'left',
      };
      if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PASTEL_XLS.cebra } };
    });
  });
  if (filas.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + filas.length, column: COLS } };

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function descargarProveedoresExcel(lista: readonly Proveedor[], op: OpcionesReporteProveedores = {}): Promise<void> {
  if (!lista.length) throw new Error('No hay proveedores en la lista (revisa los filtros).');
  const bytes = await construirProveedoresExcel(lista, op);
  await previewExcelArchivo(bytes, `proveedores-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
