/* ============================================================
   Golden Touch · RRHH · Resumen de nómina en PDF y Excel (09/10/2026)
   Mismo estilo que «Descargar datos del personal»: logo de la empresa
   (MTO sale como Minería Tin Oxide), cabecera naranja, márgenes de 2 cm,
   columna «N°», orientación automática o elegida, y vista previa.
   Grupos con su título y su subtotal; al final la fila TOTAL y el bloque
   de totales (si se marcó).
   ============================================================ */
import { previewExcelArchivo, previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import {
  formatoCelda, letraQueEntra, lineasTotales, orientacionResumen,
  type OrientacionHoja, type ResumenArmado,
} from './resumenNomina';

export interface MetaResumen {
  /** Empresa del logo y del nombre: 'GT' | 'MTO'. */
  empresa: 'GT' | 'MTO';
  /** Qué se resume: «NOM-2026-0004 · 2da quincena…» o «Todas las nóminas · GT y MTO…». */
  alcance: string;
  claves: string[];
  orientacion: OrientacionHoja;
  archivo: string;
}

const NARANJA = 'FFFF8A00';

function validar(r: ResumenArmado) {
  if (!r.campos.length) throw new Error('Marca al menos una columna para el resumen.');
  if (!r.bloques.some((b) => b.filas.length)) throw new Error('No hay renglones de nómina para ese alcance (revisa el período, las fechas o la empresa).');
}

const cuentaFilas = (r: ResumenArmado) => r.bloques.reduce((a, b) => a + b.filas.length, 0);

export async function descargarResumenPdf(r: ResumenArmado, meta: MetaResumen): Promise<void> {
  validar(r);
  const [{ jsPDF }, { default: autoTable }, { loadLogoPdfEmpresa, dibujarLogoPdf }, { identidadEmpresa }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/pdfLogo'),
    import('@/shared/lib/empresa'),
  ]);
  const emp = identidadEmpresa(meta.empresa);
  const logo = await loadLogoPdfEmpresa(meta.empresa).catch(() => null);
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: orientacionResumen(meta.claves, meta.orientacion) });
  const W = doc.internal.pageSize.getWidth();
  const MARGIN = 56.69; // 2 cm por lado
  let y = MARGIN;
  if (logo) dibujarLogoPdf(doc, logo, MARGIN, y, 52);
  doc.setTextColor(255, 138, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(pdfSafe('RESUMEN DE NÓMINA'), W / 2, y + 16, { align: 'center' });
  doc.setTextColor(80, 80, 80); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(pdfSafe(`${emp.nombre} · RIF ${emp.rif}`), W / 2, y + 31, { align: 'center' });
  const lineasAlcance = doc.splitTextToSize(pdfSafe(`${meta.alcance} · ${cuentaFilas(r)} renglón(es) · ${new Date().toLocaleString('es-VE')}`), W - MARGIN * 2 - 160);
  doc.text(lineasAlcance, W / 2, y + 44, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 70 + Math.max(0, lineasAlcance.length - 1) * 11;

  const anchoTotal = r.campos.reduce((a, c) => a + c.ancho, 0);
  const COL_N = 40;
  const util = W - MARGIN * 2 - COL_N;
  const letra = letraQueEntra(util, anchoTotal);
  const columnStyles: Record<number, { cellWidth: number; halign?: 'right' | 'center' }> = { 0: { cellWidth: COL_N, halign: 'center' } };
  r.campos.forEach((c, i) => {
    columnStyles[i + 1] = { cellWidth: (util * c.ancho) / anchoTotal, ...(c.tipo !== 'texto' ? { halign: 'right' as const } : {}) };
  });
  const totalCols = r.campos.length + 1;
  const filaSuma = (etiqueta: string, sumas: (number | null)[], fondo: [number, number, number]) => [
    { content: etiqueta, styles: { fontStyle: 'bold' as const, fillColor: fondo, halign: 'center' as const } },
    ...sumas.map((v, k) => ({ content: v == null ? '' : formatoCelda(r.campos[k].tipo, v), styles: { fontStyle: 'bold' as const, fillColor: fondo } })),
  ];

  type Celda = string | { content: string; colSpan?: number; styles?: Record<string, unknown> };
  const body: Celda[][] = [];
  let nro = 0;
  for (const b of r.bloques) {
    if (b.titulo) body.push([{ content: pdfSafe(b.titulo), colSpan: totalCols, styles: { fontStyle: 'bold', fillColor: [255, 236, 210], textColor: [120, 60, 0], halign: 'left' } }]);
    for (const f of b.filas) {
      nro += 1;
      body.push([String(nro), ...f.map((v, k) => pdfSafe(formatoCelda(r.campos[k].tipo, v)))]);
    }
    if (b.subtotal && b.filas.length) body.push(filaSuma('Subtotal', b.subtotal, [245, 240, 232]));
  }
  if (r.total) body.push(filaSuma('TOTAL', r.total, [255, 220, 170]));

  autoTable(doc, {
    theme: 'grid',
    startY: y,
    head: [['N°', ...r.campos.map((c) => pdfSafe(c.etiqueta.toUpperCase()))]],
    body: body as never,
    styles: { fontSize: letra, cellPadding: letra < 8 ? 3.5 : 6, overflow: 'linebreak', valign: 'middle', lineColor: [150, 156, 164], lineWidth: 0.6, textColor: [20, 24, 30] },
    headStyles: { fillColor: [255, 138, 0], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', valign: 'middle', fontSize: Math.min(9, letra), lineColor: [150, 156, 164], lineWidth: 0.6 },
    columnStyles,
    margin: MARGIN,
  });

  if (r.totales) {
    const finY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    autoTable(doc, {
      theme: 'grid',
      startY: finY + 18,
      head: [[{ content: 'TOTALES', colSpan: 2 }]],
      body: lineasTotales(r.totales).map(([k, v]) => [pdfSafe(k), pdfSafe(v)]),
      styles: { fontSize: 9, cellPadding: 5, lineColor: [150, 156, 164], lineWidth: 0.6, textColor: [20, 24, 30] },
      headStyles: { fillColor: [255, 138, 0], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
      columnStyles: { 0: { cellWidth: 170, fontStyle: 'bold' }, 1: { cellWidth: 130, halign: 'right' } },
      tableWidth: 300,
      margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: MARGIN },
      pageBreak: 'avoid',
    });
  }
  previewPdf(doc, meta.archivo + '.pdf');
}

/** Excel con logo (ExcelJS), grupos con título y subtotal, fila TOTAL y bloque de totales. */
export async function descargarResumenExcel(r: ResumenArmado, meta: MetaResumen): Promise<void> {
  validar(r);
  const [{ default: ExcelJS }, { loadLogoDataUrl, loadLogoPdfEmpresa, LOGO_PDF_PROPORCION }, { identidadEmpresa }] = await Promise.all([
    import('exceljs'),
    import('@/shared/lib/pdfLogo'),
    import('@/shared/lib/empresa'),
  ]);
  const emp = identidadEmpresa(meta.empresa);
  const logo = await (meta.empresa === 'MTO' ? loadLogoPdfEmpresa('MTO') : loadLogoDataUrl()).catch(() => null);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Resumen de nómina', {
    pageSetup: { orientation: orientacionResumen(meta.claves, meta.orientacion), fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: 'frozen', ySplit: 5 }],
  });
  ws.columns = [{ width: 10 }, ...r.campos.map((c) => ({ width: Math.max(c.ancho, c.etiqueta.length) + 4 }))];
  const ultima = r.campos.length + 1;
  const borde = { style: 'thin' as const, color: { argb: 'FFBFC5CC' } };
  const bordes = { top: borde, left: borde, bottom: borde, right: borde };
  const formato: Record<string, string> = { usd: '#,##0.00', bs: '#,##0.00', monto: '#,##0.00', tasa: '#,##0.00', num: '0' };

  ws.getRow(1).height = 26; ws.getRow(2).height = 20; ws.getRow(3).height = 16;
  const logoAlto = 54;
  const logoAncho = meta.empresa === 'MTO' ? Math.round(logoAlto * LOGO_PDF_PROPORCION) : logoAlto;
  if (logo) {
    const id = wb.addImage({ base64: logo, extension: 'jpeg' });
    ws.addImage(id, { tl: { col: 0.1, row: 0.1 }, ext: { width: logoAncho, height: logoAlto } });
  }
  let desde = 1, ocupado = 0;
  while (desde < ultima && ocupado < logoAncho + 8) { ocupado += (Number(ws.getColumn(desde).width) || 10) * 7; desde += 1; }
  desde = Math.min(Math.max(desde, 2), ultima);
  for (const fila of [1, 2, 3]) ws.mergeCells(fila, desde, fila, Math.max(desde, ultima));
  const t = ws.getCell(1, desde);
  t.value = `RESUMEN DE NÓMINA · ${emp.nombre}`;
  t.font = { name: 'Arial', size: 14, bold: true, color: { argb: NARANJA } };
  t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  const sub = ws.getCell(2, desde);
  sub.value = `RIF ${emp.rif} · ${cuentaFilas(r)} renglón(es) · ${new Date().toLocaleString('es-VE')}`;
  const alc = ws.getCell(3, desde);
  alc.value = meta.alcance;
  for (const c of [sub, alc]) {
    c.font = { name: 'Arial', size: 10, color: { argb: 'FF5C6673' } };
    c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  }

  const cab = ws.getRow(5);
  cab.values = ['N°', ...r.campos.map((c) => c.etiqueta)];
  cab.height = 28;
  cab.eachCell((c) => {
    c.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NARANJA } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = bordes;
  });

  let fila = 6, nro = 0;
  const pintar = (rowN: number, valores: (string | number | null)[], estilo: 'normal' | 'par' | 'suma' | 'total') => {
    const row = ws.getRow(rowN);
    row.values = valores.map((v) => (v == null ? '' : v));
    row.height = 20;
    for (let col = 1; col <= ultima; col++) {
      const c = row.getCell(col);
      const campo = r.campos[col - 2];
      c.font = { name: 'Arial', size: 10, bold: estilo === 'suma' || estilo === 'total' };
      c.border = bordes;
      c.alignment = { vertical: 'middle', horizontal: col === 1 ? 'center' : campo && campo.tipo !== 'texto' ? 'right' : 'left', wrapText: true };
      if (campo && formato[campo.tipo] && typeof c.value === 'number') c.numFmt = formato[campo.tipo];
      const fondo = estilo === 'par' ? 'FFFAF6F0' : estilo === 'suma' ? 'FFF5F0E8' : estilo === 'total' ? 'FFFFDCAA' : null;
      if (fondo) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fondo } };
    }
  };
  for (const b of r.bloques) {
    if (b.titulo) {
      ws.mergeCells(fila, 1, fila, ultima);
      const c = ws.getCell(fila, 1);
      c.value = b.titulo;
      c.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF783C00' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFECD2' } };
      c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      c.border = bordes;
      ws.getRow(fila).height = 20;
      fila += 1;
    }
    b.filas.forEach((f, i) => { nro += 1; pintar(fila, [nro, ...f], i % 2 === 1 ? 'par' : 'normal'); fila += 1; });
    if (b.subtotal && b.filas.length) { pintar(fila, ['Subtotal', ...b.subtotal], 'suma'); fila += 1; }
  }
  if (r.total) { pintar(fila, ['TOTAL', ...r.total], 'total'); fila += 1; }

  if (r.totales) {
    fila += 1;
    const hasta = Math.min(ultima, 3);
    ws.mergeCells(fila, 1, fila, hasta);
    const h = ws.getCell(fila, 1);
    h.value = 'TOTALES';
    h.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NARANJA } };
    h.alignment = { horizontal: 'center', vertical: 'middle' };
    fila += 1;
    for (const [k, v] of lineasTotales(r.totales)) {
      const a = ws.getCell(fila, 1);
      if (hasta >= 3) ws.mergeCells(fila, 1, fila, 2);
      a.value = k;
      a.font = { name: 'Arial', size: 10, bold: true };
      a.border = bordes;
      const b = ws.getCell(fila, hasta >= 3 ? 3 : 2);
      b.value = v;
      b.font = { name: 'Arial', size: 10 };
      b.alignment = { horizontal: 'right' };
      b.border = bordes;
      fila += 1;
    }
  }

  const bytes = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  await previewExcelArchivo(bytes, meta.archivo + '.xlsx');
}
