/* ============================================================
   Conciliación · exportación PDF y Excel (12/11/2026).
   Mismo estilo que Tesorería: membrete de la empresa, barra naranja,
   tarjetas de totales y la tabla (con subtotales si se agrupa). Ambos
   abren la vista previa antes de descargar.
   ============================================================ */

import { previewExcelArchivo, previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import { identidadEmpresa } from '@/shared/lib/empresa';
import { loadLogoPdfEmpresa, dibujarLogoPdf, anchoLogoPdf } from '@/shared/lib/pdfLogo';
import { indicadores, type FilaConciliacion } from './conciliacion';
import {
  COLUMNAS_REPORTE, agrupar, bs, celda, usd, valorExcel,
  type Agrupacion, type ClaveColumna, type MetaReporte,
} from './reporteConciliacion';

const NARANJA: [number, number, number] = [255, 138, 0];

function hoyStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
}

function columnasDe(claves: ClaveColumna[]) {
  const cols = COLUMNAS_REPORTE.filter((c) => claves.includes(c.clave));
  if (!cols.length) throw new Error('Selecciona al menos una columna.');
  return cols;
}

export async function descargarConciliacionPdf(
  filas: FilaConciliacion[], claves: ClaveColumna[], modo: Agrupacion, meta: MetaReporte,
): Promise<void> {
  if (!filas.length) throw new Error('No hay OC para el reporte con estos filtros.');
  const cols = columnasDe(claves);
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: cols.length > 6 ? 'landscape' : 'portrait' });
  const W = doc.internal.pageSize.getWidth();
  const M = 36;
  const UW = W - M * 2;
  let y = M;

  // Membrete
  const emp = identidadEmpresa('GT');
  const logo = await loadLogoPdfEmpresa('GT').catch(() => null);
  const caja = 40;
  if (logo) dibujarLogoPdf(doc, logo, M, y, caja);
  const tx = logo ? M + anchoLogoPdf(caja) + 12 : M;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...NARANJA);
  doc.text(pdfSafe(meta.titulo), tx, y + 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(80, 80, 80);
  doc.text(pdfSafe(`${emp.nombre} · RIF ${emp.rif}`), tx, y + 27);
  const sub = doc.splitTextToSize(pdfSafe(`${meta.filtrosTexto || 'Todas las OC'} · Generado ${meta.generado}`), W - M - tx) as string[];
  doc.text(sub, tx, y + 38);
  y += Math.max(caja, 38 + sub.length * 10) + 8;
  doc.setFillColor(...NARANJA); doc.rect(M, y, UW, 3, 'F');
  y += 12;

  // Tarjetas de totales
  const k = indicadores(filas);
  const tarjetas = [
    { t: 'Total de OC', v: String(k.totalOc.cantidad), s: `${usd(k.totalOc.usd)} · ${bs(k.totalOc.bs)}` },
    { t: 'Total pagado', v: String(k.pagado.cantidad), s: `${usd(k.pagado.usd)} · ${bs(k.pagado.bs)}` },
    { t: 'OC con retenciones', v: String(k.conRetencion.cantidad), s: `${usd(k.conRetencion.usd)} · ${bs(k.conRetencion.bs)}` },
  ];
  const gap = 10;
  const tw = (UW - gap * (tarjetas.length - 1)) / tarjetas.length;
  tarjetas.forEach((c, i) => {
    const x = M + i * (tw + gap);
    doc.setDrawColor(230, 230, 230); doc.setFillColor(250, 250, 250);
    doc.roundedRect(x, y, tw, 48, 4, 4, 'FD');
    doc.setFillColor(...NARANJA); doc.rect(x, y, 3, 48, 'F');
    doc.setFontSize(8); doc.setTextColor(110, 110, 110); doc.text(pdfSafe(c.t), x + 10, y + 13);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(30, 30, 30); doc.text(pdfSafe(c.v), x + 10, y + 29);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(90, 90, 90);
    doc.text(pdfSafe(c.s), x + 10, y + 41, { maxWidth: tw - 16 });
  });
  y += 60;

  // Tabla (con una fila de grupo y su subtotal si se agrupa)
  const grupos = agrupar(filas, modo);
  const body: (string | { content: string; colSpan?: number; styles?: Record<string, unknown> })[][] = [];
  for (const g of grupos) {
    if (modo !== 'ninguna') {
      body.push([{
        content: pdfSafe(`${g.titulo} · ${g.filas.length} OC · ${usd(g.totalUsd)} · ${bs(g.totalBs)}`),
        colSpan: cols.length,
        styles: { fillColor: [255, 243, 224], fontStyle: 'bold', textColor: [120, 60, 0] },
      }]);
    }
    for (const r of g.filas) body.push(cols.map((c) => pdfSafe(celda(r, c.clave))));
  }
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [cols.map((c) => pdfSafe(c.titulo))],
    body,
    styles: { fontSize: 7.5, cellPadding: 3, overflow: 'linebreak' },
    // Encabezados centrados (12/11/2026, pedido de la administradora).
    headStyles: { fillColor: NARANJA, textColor: 255, fontStyle: 'bold', halign: 'center', valign: 'middle' },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: Object.fromEntries(cols.map((c, i) => [i, c.numerica ? { halign: 'right' } : {}])),
  });

  // Pie con número de página
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5); doc.setTextColor(140, 140, 140);
    doc.text(pdfSafe(`Conciliación · página ${p} de ${paginas}`), W - M, doc.internal.pageSize.getHeight() - 16, { align: 'right' });
  }
  previewPdf(doc, `conciliacion-${hoyStr()}.pdf`);
}

export async function descargarConciliacionExcel(
  filas: FilaConciliacion[], claves: ClaveColumna[], modo: Agrupacion, meta: MetaReporte,
): Promise<void> {
  if (!filas.length) throw new Error('No hay OC para el reporte con estos filtros.');
  const cols = columnasDe(claves);
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Conciliación', { views: [{ state: 'frozen', ySplit: 4 }] });
  const naranja = 'FFFF8A00';

  ws.mergeCells(1, 1, 1, cols.length);
  ws.getCell(1, 1).value = meta.titulo;
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: naranja } };
  ws.mergeCells(2, 1, 2, cols.length);
  ws.getCell(2, 1).value = `${meta.filtrosTexto || 'Todas las OC'} · Generado ${meta.generado}`;
  ws.getCell(2, 1).font = { italic: true, color: { argb: 'FF666666' } };

  const head = ws.getRow(4);
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.titulo;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: naranja } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  let fila = 5;
  for (const g of agrupar(filas, modo)) {
    if (modo !== 'ninguna') {
      ws.mergeCells(fila, 1, fila, cols.length);
      const c = ws.getCell(fila, 1);
      c.value = `${g.titulo} · ${g.filas.length} OC · ${usd(g.totalUsd)} · ${bs(g.totalBs)}`;
      c.font = { bold: true, color: { argb: 'FF783C00' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E0' } };
      fila++;
    }
    for (const r of g.filas) {
      const row = ws.getRow(fila++);
      cols.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        cell.value = valorExcel(r, c.clave);
        if (c.clave === 'montoUsd') cell.numFmt = '"$" #,##0.00';
        if (c.clave === 'montoBs') cell.numFmt = '"Bs" #,##0.00';
        if (c.clave === 'tasa') cell.numFmt = '#,##0.00';
      });
    }
  }

  // Totales
  const k = indicadores(filas);
  fila++;
  const tot = ws.getRow(fila);
  tot.getCell(1).value = `Total: ${k.totalOc.cantidad} OC · pagadas ${k.pagado.cantidad} · con retención ${k.conRetencion.cantidad}`;
  tot.getCell(1).font = { bold: true };
  const iUsd = cols.findIndex((c) => c.clave === 'montoUsd');
  const iBs = cols.findIndex((c) => c.clave === 'montoBs');
  if (iUsd >= 0) { tot.getCell(iUsd + 1).value = k.totalOc.usd; tot.getCell(iUsd + 1).numFmt = '"$" #,##0.00'; tot.getCell(iUsd + 1).font = { bold: true }; }
  if (iBs >= 0) { tot.getCell(iBs + 1).value = k.totalOc.bs; tot.getCell(iBs + 1).numFmt = '"Bs" #,##0.00'; tot.getCell(iBs + 1).font = { bold: true }; }

  cols.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.clave === 'item' ? 7 : c.clave === 'proveedor' || c.clave === 'retencion' || c.clave === 'referencia' ? 32 : 18;
  });

  const bytes = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  await previewExcelArchivo(bytes, `conciliacion-${hoyStr()}.xlsx`);
}
