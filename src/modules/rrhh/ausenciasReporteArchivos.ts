/* ============================================================
   Golden Touch · RRHH · Vacaciones y descansos en PDF y Excel

   Mismo estilo que el resto de los papeles del sistema: logo de la empresa,
   márgenes de 2 cm, cabecera de tabla naranja, totales al pie y vista previa
   antes de bajar. El texto del PDF pasa por `pdfSafe`.
   ============================================================ */
import type { EmpresaRrhh } from '@/shared/lib/types';
import { previewExcelArchivo, previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import { nombrePersona, totalesAusencias, type FilaAusencia, type TipoAusencia } from './ausenciasReporte';

const MARGIN = 56.69; // 2 cm por lado

const usd = (v: number | null | undefined) =>
  `$ ${Number(v ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dia = (f: string | null | undefined) => {
  const d = String(f ?? '').slice(0, 10);
  return d.length === 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '';
};
const hoy = () => new Date().toISOString().slice(0, 10);

export interface MetaAusencias {
  tipo: TipoAusencia;
  empresa: EmpresaRrhh;
  desde?: string | null;
  hasta?: string | null;
  /** Nombre de la persona si el reporte es de una sola. */
  persona?: string | null;
}

const titulo = (t: TipoAusencia) => (t === 'vacaciones' ? 'REPORTE DE VACACIONES' : 'REPORTE DE DESCANSOS');

function rangoTexto(m: MetaAusencias): string {
  if (m.desde && m.hasta) return `Del ${dia(m.desde)} al ${dia(m.hasta)}`;
  if (m.desde) return `Desde el ${dia(m.desde)}`;
  if (m.hasta) return `Hasta el ${dia(m.hasta)}`;
  return 'Todas las fechas';
}

function subtitulo(m: MetaAusencias, filas: FilaAusencia[]): string {
  const t = totalesAusencias(filas);
  return [`Nómina ${m.empresa}`, rangoTexto(m), m.persona ? m.persona : null,
    `${t.registros} registro(s) de ${t.personas} persona(s)`].filter(Boolean).join('  ·  ');
}

/** Encabezados y celdas de cada tipo (lo mismo para PDF y Excel). */
function tabla(tipo: TipoAusencia, filas: FilaAusencia[]): { head: string[]; body: (string | number)[][] } {
  if (tipo === 'vacaciones') {
    return {
      head: ['N°', 'TRABAJADOR', 'C.I.', 'CARGO', 'DEPARTAMENTO', 'DESDE', 'HASTA', 'DÍAS', 'ESTADO', 'MONTO $', 'CRUCE'],
      body: filas.map((f, i) => [i + 1, nombrePersona(f.persona), f.persona?.cedula ?? '', f.persona?.cargo ?? '',
        f.persona?.departamento ?? '', dia(f.desde), dia(f.hasta), f.diasTotal, f.estado, Number(f.monto) || 0, f.cruce ? 'Sí' : '']),
    };
  }
  return {
    head: ['N°', 'TRABAJADOR', 'C.I.', 'CARGO', 'DEPARTAMENTO', 'DESDE', 'HASTA', 'DÍAS', 'ORIGEN', 'NOTA'],
    body: filas.map((f, i) => [i + 1, nombrePersona(f.persona), f.persona?.cedula ?? '', f.persona?.cargo ?? '',
      f.persona?.departamento ?? '', dia(f.desde), dia(f.hasta), f.diasTotal, f.estado, f.nota ?? '']),
  };
}

function lineasTotales(tipo: TipoAusencia, filas: FilaAusencia[]): string[] {
  const t = totalesAusencias(filas);
  const base = [`Registros: ${t.registros}`, `Personas: ${t.personas}`, `Días en total: ${t.dias}`];
  if (tipo === 'vacaciones') {
    base.push(`Procesadas: ${t.procesadas}`, `Pendientes: ${t.pendientes}`, `Monto total: ${usd(t.monto)}`);
    if (t.cruces) base.push(`Con cruce en el departamento: ${t.cruces}`);
  }
  return base;
}

const archivo = (m: MetaAusencias, ext: string) =>
  `${m.tipo}-${m.empresa.toLowerCase()}-${m.desde ?? 'inicio'}-a-${m.hasta ?? hoy()}.${ext}`;

/* ---------------- PDF ---------------- */

export async function descargarAusenciasPdf(filas: FilaAusencia[], meta: MetaAusencias): Promise<void> {
  if (!filas.length) throw new Error('No hay registros con esos filtros.');
  const [{ jsPDF }, { default: autoTable }, { loadLogoPdfEmpresa, dibujarLogoPdf, anchoLogoPdf }, { identidadEmpresa }] = await Promise.all([
    import('jspdf'), import('jspdf-autotable'), import('@/shared/lib/pdfLogo'), import('@/shared/lib/empresa'),
  ]);
  const emp = identidadEmpresa(meta.empresa);
  const logo = await loadLogoPdfEmpresa(meta.empresa).catch(() => null);
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  let y = MARGIN;
  const caja = 44;
  if (logo) dibujarLogoPdf(doc, logo, MARGIN, y, caja);
  const xTexto = logo ? MARGIN + anchoLogoPdf(caja) + 14 : MARGIN;
  doc.setTextColor(255, 138, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(pdfSafe(titulo(meta.tipo)), xTexto, y + 16);
  doc.setTextColor(80, 80, 80); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(pdfSafe(`${emp.nombre}  ·  RIF ${emp.rif}`), xTexto, y + 30);
  doc.text(pdfSafe(subtitulo(meta, filas)), xTexto, y + 42);
  doc.setTextColor(0, 0, 0);
  y += caja + 18;

  const { head, body } = tabla(meta.tipo, filas);
  const esVac = meta.tipo === 'vacaciones';
  autoTable(doc, {
    startY: y,
    head: [head.map((h) => pdfSafe(h))],
    body: body.map((r) => r.map((c, i) => (esVac && i === 9 ? usd(Number(c)) : pdfSafe(String(c))))),
    styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: [255, 138, 0], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 8 },
    alternateRowStyles: { fillColor: [250, 246, 240] },
    columnStyles: {
      0: { cellWidth: 24, halign: 'center' },
      1: { cellWidth: 120 },
      2: { cellWidth: 58 },
      5: { cellWidth: 52, halign: 'center' },
      6: { cellWidth: 52, halign: 'center' },
      7: { cellWidth: 34, halign: 'center' },
      ...(esVac ? { 9: { cellWidth: 62, halign: 'right' as const }, 10: { cellWidth: 36, halign: 'center' as const } } : { 9: { cellWidth: 'auto' as const } }),
    },
    margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: MARGIN },
    didDrawPage: () => {
      doc.setFontSize(7); doc.setTextColor(120, 120, 120);
      doc.text(pdfSafe(`Página ${doc.getNumberOfPages()}  ·  Generado ${new Date().toLocaleString('es-VE')}`),
        W - MARGIN, H - MARGIN / 2, { align: 'right' });
      doc.setTextColor(0, 0, 0);
    },
  });

  // @ts-expect-error lastAutoTable lo agrega el plugin
  let fin = (doc.lastAutoTable?.finalY ?? y) as number;
  const lineas = lineasTotales(meta.tipo, filas);
  if (fin + 20 + lineas.length * 12 > H - MARGIN) { doc.addPage(); fin = MARGIN; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text('TOTALES', MARGIN, fin + 18);
  doc.setFont('helvetica', 'normal');
  doc.text(pdfSafe(lineas.join('   ·   ')), MARGIN, fin + 32, { maxWidth: W - MARGIN * 2 });

  previewPdf(doc, archivo(meta, 'pdf'));
}

/* ---------------- Excel ---------------- */

export async function descargarAusenciasExcel(filas: FilaAusencia[], meta: MetaAusencias): Promise<void> {
  if (!filas.length) throw new Error('No hay registros con esos filtros.');
  const [{ default: ExcelJS }, { identidadEmpresa }] = await Promise.all([
    import('exceljs'), import('@/shared/lib/empresa'),
  ]);
  const emp = identidadEmpresa(meta.empresa);
  const esVac = meta.tipo === 'vacaciones';
  const { head, body } = tabla(meta.tipo, filas);
  const anchos = esVac ? [6, 30, 13, 22, 20, 12, 12, 8, 12, 13, 8] : [6, 30, 13, 22, 20, 12, 12, 8, 10, 40];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(esVac ? 'Vacaciones' : 'Descansos', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: 'frozen', ySplit: 5 }],
  });
  ws.columns = anchos.map((w) => ({ width: w }));
  const ultima = head.length;
  const borde = { style: 'thin' as const, color: { argb: 'FFBFC5CC' } };
  const bordes = { top: borde, left: borde, bottom: borde, right: borde };

  ws.getRow(1).height = 26; ws.getRow(2).height = 20; ws.getRow(3).height = 14;
  // Los Excel van sin logo (09/10/2026): el título arranca en la columna A.
  const desde = 1;
  ws.mergeCells(1, desde, 1, ultima);
  ws.mergeCells(2, desde, 2, ultima);
  const t = ws.getCell(1, desde);
  t.value = `${titulo(meta.tipo)} · ${emp.nombre}`;
  t.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFF8A00' } };
  t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  const sub = ws.getCell(2, desde);
  sub.value = `RIF ${emp.rif} · ${subtitulo(meta, filas).replace(/ {2}· {2}/g, ' · ')} · ${new Date().toLocaleString('es-VE')}`;
  sub.font = { name: 'Arial', size: 10, color: { argb: 'FF5C6673' } };
  sub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  const cab = ws.getRow(5);
  cab.values = head;
  cab.height = 26;
  cab.eachCell((c) => {
    c.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF8A00' } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = bordes;
  });
  body.forEach((f, i) => {
    const r = ws.getRow(6 + i);
    r.values = f;
    r.eachCell({ includeEmpty: true }, (c, col) => {
      c.font = { name: 'Arial', size: 10 };
      c.border = bordes;
      c.alignment = { vertical: 'middle', horizontal: col === 1 || col === 8 ? 'center' : 'left', indent: col === 1 || col === 8 ? 0 : 1, wrapText: true };
      if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAF6F0' } };
      if (esVac && col === 10) { c.numFmt = '#,##0.00'; c.alignment = { ...c.alignment, horizontal: 'right' }; }
    });
  });

  // Totales al pie.
  let fila = 6 + body.length + 1;
  const tc = ws.getCell(fila, 2);
  tc.value = 'TOTALES'; tc.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFF8A00' } };
  for (const l of lineasTotales(meta.tipo, filas)) {
    fila += 1;
    const [k, ...v] = l.split(': ');
    ws.getCell(fila, 2).value = k;
    ws.getCell(fila, 2).font = { name: 'Arial', size: 10, bold: true };
    ws.getCell(fila, 3).value = v.join(': ');
    ws.getCell(fila, 3).font = { name: 'Arial', size: 10 };
  }

  const bytes = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  await previewExcelArchivo(bytes, archivo(meta, 'xlsx'));
}
