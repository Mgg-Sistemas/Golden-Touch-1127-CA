/* ============================================================
   Golden Touch · Compras · Exportación del Reporte Moldeable (Excel / PDF / CSV)
   (10/11/2026)

   Calcado de `exportarInventarioMoldeable.ts`, adaptado a compras con doble
   moneda ($ y Bs) y a la analítica del resumen (totales, por estado, rankings
   por departamento, bloque de compras directas por categoría de gasto, ranking
   de cotizaciones y tops). Separa las funciones PURAS `construir*` (devuelven
   bytes/doc/string, testeables) de los envoltorios `descargar*` (preview/DOM).

   Formatos (decisión de la líder):
   - resumen   → solo la página de resumen + analítica.
   - detallado → el listado + encabezado de totales (KPIs), sin analítica completa.
   - hibrido   → resumen + analítica completos, y a continuación el listado.
   ============================================================ */

import { previewExcelArchivo, previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import { identidadEmpresa } from '@/shared/lib/empresa';
import { loadLogoPdfEmpresa, dibujarLogoPdf, anchoLogoPdf } from '@/shared/lib/pdfLogo';
import type { jsPDF } from 'jspdf';
import {
  CAMPOS_REPORTE_COMPRAS,
  ETIQUETA_TIPO_COMPRA,
  type AmbitoCompras,
  type CampoColumnaCompras,
  type FilaReporteCompras,
  type ModoAgrupacionCompras,
  type ResumenReporteCompras,
} from './comprasMoldeable';

const NARANJA: [number, number, number] = [255, 138, 0];
const VERDE: [number, number, number] = [16, 185, 129];
const AZUL: [number, number, number] = [56, 189, 248];
const TINTA: [number, number, number] = [30, 41, 59];
const BORDE: [number, number, number] = [203, 213, 225];
const FONDO_ALT: [number, number, number] = [250, 246, 240];

const AVISO_RANKING = 'No incluye las compras directas, que se agrupan por categoría de gasto.';

const fmtNum = (v: number | null | undefined, dec = 2) =>
  v == null ? '-' : Number(v).toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: dec });
const fmtUsd = (v: number | null | undefined) =>
  v == null ? '-' : `$ ${Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtBs = (v: number | null | undefined) =>
  v == null ? '-' : `Bs ${Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (v: number | null | undefined) => (v == null ? '-' : `${Number(v).toFixed(1)} %`);
const fmtFecha = (f: string) => {
  const [y, m, d] = (f || '').split('-');
  return y && m && d ? `${d}/${m}/${y}` : f || '-';
};
const hoyStr = () => new Date().toISOString().slice(0, 10);

const TITULO = 'Reporte de Compras';

export interface MetadatosExportacionCompras {
  desde: string;
  hasta: string;
  ambito: AmbitoCompras;
  agrupacion: ModoAgrupacionCompras;
  formato: 'resumen' | 'detallado' | 'hibrido';
  subtituloFiltros?: string;
  mostrarUsd: boolean;
  mostrarBs: boolean;
  tasaBcv: number;
  orientacion?: 'auto' | 'portrait' | 'landscape';
  formatoPresentacion?: 'fichas' | 'tabla';
}

const incluyeResumen = (m: MetadatosExportacionCompras) => m.formato === 'resumen' || m.formato === 'hibrido';
const incluyeDetalle = (m: MetadatosExportacionCompras) => m.formato === 'detallado' || m.formato === 'hibrido';

/** Valor crudo de una columna (clave→campo de la fila). */
function rawDeColumna(f: FilaReporteCompras, clave: string): unknown {
  switch (clave) {
    case 'tipo_compra': return ETIQUETA_TIPO_COMPRA[f.tipo_compra];
    case 'pct_total': return f.pct_del_total;
    default: return (f as unknown as Record<string, unknown>)[clave];
  }
}

/** El número subyacente de una columna numérica (para Excel/CSV), o null. */
function numeroDeColumna(f: FilaReporteCompras, clave: string): number | null {
  switch (clave) {
    case 'cantidad': return f.cantidad;
    case 'monto_usd': return f.monto_usd;
    case 'monto_bs': return f.monto_bs;
    case 'pagado_usd': return f.pagado_usd;
    case 'pct_total': return f.pct_del_total ?? null;
    default: return null;
  }
}

/** Texto formateado de una celda para PDF. */
function textoCelda(f: FilaReporteCompras, col: CampoColumnaCompras): string {
  const val = rawDeColumna(f, col.clave);
  if (val == null || val === '') return '-';
  switch (col.formato) {
    case 'moneda': return col.clave === 'monto_bs' ? fmtBs(Number(val)) : fmtUsd(Number(val));
    case 'numero': return fmtNum(Number(val), 2);
    case 'porcentaje': return fmtPct(Number(val));
    default:
      if (col.clave === 'fecha') return fmtFecha(String(val));
      return String(val);
  }
}

/** Columnas seleccionadas (en el orden del catálogo), filtradas por ámbito y por los interruptores $/Bs. */
function columnasVisibles(columnasClaves: string[], meta: MetadatosExportacionCompras): CampoColumnaCompras[] {
  return columnasClaves
    .map((c) => CAMPOS_REPORTE_COMPRAS.find((col) => col.clave === c))
    .filter((c): c is CampoColumnaCompras => {
      if (!c) return false;
      if (c.ambito && c.ambito !== 'ambos' && c.ambito !== meta.ambito) return false;
      if (!meta.mostrarUsd && (c.clave === 'monto_usd' || c.clave === 'pagado_usd')) return false;
      if (!meta.mostrarBs && c.clave === 'monto_bs') return false;
      return true;
    });
}

/** KPIs del encabezado de totales (siempre presentes). */
function kpisDeResumen(r: ResumenReporteCompras, meta: MetadatosExportacionCompras): Array<{ label: string; val: string; sub?: string }> {
  const dinero = (usd: number, bs: number) =>
    meta.mostrarUsd && meta.mostrarBs ? `${fmtUsd(usd)} · ${fmtBs(bs)}` : meta.mostrarUsd ? fmtUsd(usd) : fmtBs(bs);
  return [
    { label: 'TOTAL DE COMPRAS', val: `${r.totalCompras}`, sub: dinero(r.totalUsd, r.totalBs) },
    { label: 'FINALIZADAS', val: `${r.finalizadasCount}`, sub: dinero(r.finalizadasUsd, r.finalizadasBs) },
    { label: 'PENDIENTES', val: `${r.pendientesCount}`, sub: dinero(r.pendientesUsd, r.pendientesBs) },
    { label: 'PAGADO', val: dinero(r.pagadoUsd, r.pagadoBs), sub: r.deptoQueMasGasto ? `Más gastó: ${r.deptoQueMasGasto}` : 'del rango' },
  ];
}

/* ============================================================
   1. EXCEL (ExcelJS)
   ============================================================ */

function argb(rgb: [number, number, number]): string {
  return 'FF' + rgb.map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export async function construirComprasExcel(
  filas: FilaReporteCompras[],
  resumen: ResumenReporteCompras,
  columnasClaves: string[],
  meta: MetadatosExportacionCompras,
): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Golden Touch 1127 C.A.';
  wb.created = new Date();
  const idEmp = identidadEmpresa('GT');
  const columnas = columnasVisibles(columnasClaves, meta);
  const NAR = argb(NARANJA);

  // 1. Hoja Resumen
  if (incluyeResumen(meta)) {
    const ws = wb.addWorksheet('Resumen', { views: [{ showGridLines: true }] });
    ws.columns = [{ width: 5 }, { width: 30 }, { width: 22 }, { width: 22 }, { width: 16 }];

    ws.mergeCells('B2:E2');
    const r2 = ws.getCell('B2');
    r2.value = `${idEmp.nombre} · ${TITULO.toUpperCase()}`;
    r2.font = { name: 'Arial', size: 14, bold: true, color: { argb: NAR } };

    ws.mergeCells('B3:E3');
    const r3 = ws.getCell('B3');
    r3.value = `Período: ${fmtFecha(meta.desde)} al ${fmtFecha(meta.hasta)} | Tasa BCV: Bs ${fmtNum(meta.tasaBcv)} / $ | Emitido: ${new Date().toLocaleString('es-VE')}`;
    r3.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF64748B' } };

    // KPIs
    const kpis = kpisDeResumen(resumen, meta);
    kpis.forEach((k, i) => {
      const col = String.fromCharCode(66 + i);
      const label = ws.getCell(`${col}5`);
      label.value = k.label;
      label.font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF475569' } };
      label.alignment = { horizontal: 'center' };
      label.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      const val = ws.getCell(`${col}6`);
      val.value = `${k.val}${k.sub ? `\n${k.sub}` : ''}`;
      val.font = { name: 'Arial', size: 11, bold: true, color: { argb: NAR } };
      val.alignment = { horizontal: 'center', wrapText: true };
    });

    let row = 8;
    const bloque = (titulo: string, cols: string[], datos: (string | number)[][]) => {
      ws.getCell(`B${row}`).value = titulo;
      ws.getCell(`B${row}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1E293B' } };
      row += 1;
      const head = ws.getRow(row);
      cols.forEach((c, i) => {
        const cell = head.getCell(2 + i);
        cell.value = c;
        cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAR } };
        cell.alignment = { horizontal: i === 0 ? 'left' : 'right' };
      });
      row += 1;
      for (const fila of datos) {
        const r = ws.getRow(row);
        fila.forEach((v, i) => {
          const cell = r.getCell(2 + i);
          cell.value = v;
          cell.font = { name: 'Arial', size: 8.5, color: { argb: 'FF334155' } };
          cell.alignment = { horizontal: i === 0 ? 'left' : 'right' };
        });
        row += 1;
      }
      row += 1;
    };

    bloque(
      `RANKING DE DEPARTAMENTOS POR GASTO (${AVISO_RANKING})`,
      ['Departamento', 'Gasto ($)', 'Gasto (Bs)', '% del Total'],
      resumen.rankingDeptoGasto.map((d) => [d.departamento, d.usd, d.bs, `${d.pct.toFixed(1)}%`]),
    );
    if (resumen.comprasDirectasPorCategoriaGasto.length) {
      bloque(
        `COMPRAS DIRECTAS POR CATEGORÍA DE GASTO (total: ${fmtUsd(resumen.totalDirectasUsd)} · ${fmtBs(resumen.totalDirectasBs)})`,
        ['Categoría de gasto', 'Gasto ($)', 'Gasto (Bs)'],
        resumen.comprasDirectasPorCategoriaGasto.map((c) => [c.categoria, c.usd, c.bs]),
      );
    }
    if (resumen.rankingDeptoCotizaciones.length) {
      bloque(
        'DEPARTAMENTOS POR COTIZACIONES MOVIDAS',
        ['Departamento', 'Cotizaciones'],
        resumen.rankingDeptoCotizaciones.map((d) => [d.departamento, d.cotizaciones]),
      );
    }
    bloque(
      'TOP CATEGORÍAS DE INVENTARIO (POR MONTO)',
      ['Categoría', 'Monto ($)'],
      resumen.topCategorias.map((t) => [t.nombre, t.usd]),
    );
    bloque(
      'TOP ÍTEMS (POR MONTO)',
      ['Ítem', 'Monto ($)', 'Cantidad'],
      resumen.topItems.map((t) => [t.nombre, t.usd, t.cantidad ?? 0]),
    );
  }

  // 2. Hoja de datos (listado)
  if (incluyeDetalle(meta) && columnas.length) {
    const orient = meta.orientacion === 'portrait' ? 'portrait' : meta.orientacion === 'landscape' ? 'landscape' : columnas.length > 7 ? 'landscape' : 'portrait';
    const ws = wb.addWorksheet('Compras', {
      pageSetup: { orientation: orient, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      views: [{ state: 'frozen', ySplit: 5 }],
    });
    ws.columns = [{ width: 4 }, ...columnas.map((c) => ({ width: Math.max(c.anchoExcel, c.etiqueta.length + 4) }))];

    ws.mergeCells(2, 2, 2, columnas.length + 1);
    const tit = ws.getCell(2, 2);
    tit.value = `${idEmp.nombre} · ${TITULO.toUpperCase()}`;
    tit.font = { name: 'Arial', size: 13, bold: true, color: { argb: NAR } };

    ws.mergeCells(3, 2, 3, columnas.length + 1);
    const sub = ws.getCell(3, 2);
    sub.value = `Período: ${fmtFecha(meta.desde)} al ${fmtFecha(meta.hasta)} | Agrupación: ${meta.agrupacion.toUpperCase()}${meta.subtituloFiltros ? ` | ${meta.subtituloFiltros}` : ''}`;
    sub.font = { name: 'Arial', size: 8.5, italic: true, color: { argb: 'FF64748B' } };

    const headerRow = ws.getRow(5);
    headerRow.height = 24;
    columnas.forEach((col, idx) => {
      const cell = headerRow.getCell(idx + 2);
      cell.value = col.etiqueta;
      cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAR } };
      cell.alignment = { horizontal: col.alineacion, vertical: 'middle', wrapText: true };
    });

    filas.forEach((f, fIdx) => {
      const r = ws.getRow(6 + fIdx);
      r.height = 18;
      const esPar = fIdx % 2 === 1;
      columnas.forEach((col, cIdx) => {
        const cell = r.getCell(cIdx + 2);
        if (col.formato === 'moneda' || col.formato === 'numero') {
          const n = numeroDeColumna(f, col.clave);
          cell.value = n ?? 0;
          cell.numFmt = col.formato === 'moneda' ? (col.clave === 'monto_bs' ? '"Bs "#,##0.00' : '"$"#,##0.00') : '#,##0.00';
        } else if (col.formato === 'porcentaje') {
          const n = numeroDeColumna(f, col.clave);
          cell.value = n != null ? n / 100 : 0;
          cell.numFmt = '0.0%';
        } else {
          const raw = rawDeColumna(f, col.clave);
          cell.value = col.clave === 'fecha' ? fmtFecha(String(raw ?? '')) : (raw != null && raw !== '' ? String(raw) : '-');
        }
        cell.font = { name: 'Arial', size: 8.5, color: { argb: 'FF1E293B' } };
        cell.alignment = { horizontal: col.alineacion, vertical: 'middle' };
        if (esPar) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAF6F0' } };
      });
    });

    // Totales
    const totUsd = filas.reduce((a, f) => a + (f.monto_usd || 0), 0);
    const totBs = filas.reduce((a, f) => a + (f.monto_bs || 0), 0);
    const totCant = filas.reduce((a, f) => a + (f.cantidad ?? 0), 0);
    const totRow = ws.getRow(6 + filas.length);
    totRow.height = 22;
    columnas.forEach((col, cIdx) => {
      const cell = totRow.getCell(cIdx + 2);
      cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF1E293B' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cell.alignment = { horizontal: col.alineacion, vertical: 'middle' };
      if (cIdx === 0) cell.value = 'TOTALES';
      else if (col.clave === 'monto_usd') { cell.value = totUsd; cell.numFmt = '"$"#,##0.00'; }
      else if (col.clave === 'monto_bs') { cell.value = totBs; cell.numFmt = '"Bs "#,##0.00'; }
      else if (col.clave === 'cantidad') { cell.value = totCant; cell.numFmt = '#,##0.00'; }
    });
  }

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function descargarComprasExcel(
  filas: FilaReporteCompras[],
  resumen: ResumenReporteCompras,
  columnasClaves: string[],
  meta: MetadatosExportacionCompras,
): Promise<void> {
  const bytes = await construirComprasExcel(filas, resumen, columnasClaves, meta);
  await previewExcelArchivo(bytes, `compras-${meta.ambito}-${hoyStr()}.xlsx`);
}

/* ============================================================
   2. PDF (jsPDF + autotable)
   ============================================================ */

export async function construirComprasPdf(
  filas: FilaReporteCompras[],
  resumen: ResumenReporteCompras,
  columnasClaves: string[],
  meta: MetadatosExportacionCompras,
): Promise<jsPDF> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const columnas = columnasVisibles(columnasClaves, meta);
  const orient = meta.orientacion === 'portrait' ? 'portrait' : meta.orientacion === 'landscape' ? 'landscape' : columnas.length > 6 ? 'landscape' : 'portrait';

  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: orient });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;
  const UW = W - M * 2;
  let y = M;

  const idEmp = identidadEmpresa('GT');
  const logo = await loadLogoPdfEmpresa('GT').catch(() => null);

  // 1. Membrete
  const cajaLogo = 40;
  if (logo) dibujarLogoPdf(doc, logo, M, y, cajaLogo);
  const tx = logo ? M + anchoLogoPdf(cajaLogo) + 12 : M;
  const anchoTexto = W - M - tx;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...NARANJA);
  doc.text(TITULO, tx, y + 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  const subLineas = doc.splitTextToSize(
    `${idEmp.nombre} · RIF ${idEmp.rif} · Período: ${fmtFecha(meta.desde)} al ${fmtFecha(meta.hasta)} · Tasa BCV: Bs ${fmtNum(meta.tasaBcv)}/$ · ${filas.length} registros`,
    anchoTexto,
  ) as string[];
  doc.text(subLineas, tx, y + 28);

  y = Math.max(y + cajaLogo + 6, y + 28 + subLineas.length * 10);
  doc.setDrawColor(...NARANJA);
  doc.setLineWidth(1.4);
  doc.line(M, y, W - M, y);
  y += 12;

  // 2. Tarjetas de KPIs (encabezado de totales, siempre)
  const cards = kpisDeResumen(resumen, meta);
  const cardGap = 8;
  const cardW = (UW - cardGap * (cards.length - 1)) / cards.length;
  const cardH = 44;
  cards.forEach((k, i) => {
    const cx = M + i * (cardW + cardGap);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...BORDE);
    doc.setLineWidth(0.6);
    doc.roundedRect(cx, y, cardW, cardH, 4, 4, 'FD');
    doc.setFillColor(...NARANJA);
    doc.rect(cx, y + 1, 3, cardH - 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(71, 85, 105);
    doc.text(pdfSafe(k.label), cx + 8, y + 11);
    doc.setFontSize(11);
    doc.setTextColor(...NARANJA);
    doc.text(pdfSafe(k.val), cx + 8, y + 25);
    if (k.sub) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.2);
      doc.setTextColor(148, 163, 184);
      doc.text(pdfSafe(doc.splitTextToSize(k.sub, cardW - 14)[0] ?? k.sub), cx + 8, y + 37);
    }
  });
  y += cardH + 12;

  // 3. Analítica (resumen e híbrido)
  if (incluyeResumen(meta)) {
    y = bloqueResumenPdf(doc, resumen, meta, M, UW, W, H, y);
  }

  // 4. Listado (detallado e híbrido)
  if (incluyeDetalle(meta) && columnas.length && filas.length) {
    const headCols = columnas.map((c) => pdfSafe(c.etiqueta));
    const bodyRows = filas.map((f) => columnas.map((c) => pdfSafe(textoCelda(f, c))));
    const totUsd = filas.reduce((a, f) => a + (f.monto_usd || 0), 0);
    const totBs = filas.reduce((a, f) => a + (f.monto_bs || 0), 0);
    const footRow = columnas.map((col, idx) => {
      if (idx === 0) return 'TOTALES';
      if (col.clave === 'monto_usd') return fmtUsd(totUsd);
      if (col.clave === 'monto_bs') return fmtBs(totBs);
      return '';
    });
    const columnStyles: Record<number, { halign: 'left' | 'right' | 'center' }> = {};
    columnas.forEach((col, idx) => { columnStyles[idx] = { halign: col.alineacion }; });
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, bottom: 24 },
      head: [headCols],
      body: bodyRows,
      foot: [footRow],
      theme: 'grid',
      styles: { fontSize: orient === 'landscape' ? 7.6 : 7.0, cellPadding: 2.2, lineColor: BORDE, lineWidth: 0.3, textColor: TINTA, overflow: 'linebreak', valign: 'middle' },
      headStyles: { fillColor: NARANJA, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
      footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: FONDO_ALT },
      columnStyles,
    });
  }

  // 5. Pies de página
  const numPaginas = doc.getNumberOfPages();
  for (let i = 1; i <= numPaginas; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BORDE);
    doc.setLineWidth(0.4);
    doc.line(M, H - 18, W - M, H - 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`${idEmp.nombre} · RIF ${idEmp.rif} · ${TITULO}`, M, H - 9);
    doc.text(`Página ${i} de ${numPaginas}`, W - M, H - 9, { align: 'right' });
  }
  return doc;
}

/** Bloque de analítica (rankings, directas, tops) en texto compacto. Devuelve la nueva y. */
function bloqueResumenPdf(
  doc: jsPDF, r: ResumenReporteCompras, meta: MetadatosExportacionCompras,
  M: number, _UW: number, W: number, H: number, y0: number,
): number {
  let y = y0;
  const dinero = (usd: number, bs: number) => (meta.mostrarUsd && meta.mostrarBs ? `${fmtUsd(usd)} · ${fmtBs(bs)}` : meta.mostrarUsd ? fmtUsd(usd) : fmtBs(bs));
  const salto = (alto: number) => { if (y + alto > H - 36) { doc.addPage(); y = 36; } };

  const titulo = (txt: string) => {
    salto(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...TINTA);
    doc.text(pdfSafe(txt), M, y);
    y += 13;
  };
  const linea = (izq: string, der: string, color: [number, number, number] = [71, 85, 105]) => {
    salto(12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...color);
    doc.text(pdfSafe(izq), M + 6, y);
    doc.text(pdfSafe(der), W - M, y, { align: 'right' });
    y += 11;
  };
  const nota = (txt: string) => {
    salto(10);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.8);
    doc.setTextColor(148, 163, 184);
    doc.text(pdfSafe(txt), M + 6, y);
    y += 10;
  };

  titulo('Ranking de departamentos por gasto');
  nota(AVISO_RANKING);
  for (const d of r.rankingDeptoGasto) linea(`${d.departamento} (${d.pct.toFixed(1)}%)`, dinero(d.usd, d.bs), VERDE);
  if (!r.rankingDeptoGasto.length) linea('Sin datos en el rango.', '');
  y += 6;

  if (r.comprasDirectasPorCategoriaGasto.length) {
    titulo(`Compras directas por categoría de gasto — total ${dinero(r.totalDirectasUsd, r.totalDirectasBs)}`);
    for (const c of r.comprasDirectasPorCategoriaGasto) linea(c.categoria, dinero(c.usd, c.bs), AZUL);
    y += 6;
  }

  if (r.rankingDeptoCotizaciones.length) {
    titulo('Departamentos por cotizaciones movidas');
    for (const d of r.rankingDeptoCotizaciones) linea(d.departamento, `${d.cotizaciones} cotización(es)`);
    y += 6;
  }

  if (r.topCategorias.length) {
    titulo('Top categorías de inventario (por monto)');
    for (const t of r.topCategorias) linea(t.nombre, fmtUsd(t.usd));
    y += 6;
  }

  if (r.topItems.length) {
    titulo('Top ítems (por monto)');
    for (const t of r.topItems) linea(`${t.nombre}${t.cantidad != null ? ` · ${fmtNum(t.cantidad)} u.` : ''}`, fmtUsd(t.usd));
    y += 6;
  }

  return y;
}

export async function descargarComprasPdf(
  filas: FilaReporteCompras[],
  resumen: ResumenReporteCompras,
  columnasClaves: string[],
  meta: MetadatosExportacionCompras,
): Promise<void> {
  const doc = await construirComprasPdf(filas, resumen, columnasClaves, meta);
  previewPdf(doc, `compras-${meta.ambito}-${hoyStr()}.pdf`);
}

/* ============================================================
   3. CSV
   ============================================================ */

/** Arma el CSV (con BOM) blindado contra «formula injection». Función pura. */
export function construirComprasCsv(
  filas: FilaReporteCompras[],
  columnasClaves: string[],
  meta: MetadatosExportacionCompras,
): string {
  const columnas = columnasVisibles(columnasClaves, meta);
  const escapar = (val: unknown) => {
    let s = String(val ?? '');
    // Anti «CSV formula injection»: si el texto empieza por = + - @ o tab/retorno,
    // se le antepone una comilla simple para que quede como TEXTO (el proveedor,
    // el departamento, el código y el ítem son texto libre que pudo escribir cualquiera).
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return (s.includes(';') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lineas: string[] = [];
  lineas.push(columnas.map((c) => escapar(c.etiqueta)).join(';'));
  for (const f of filas) {
    const vals = columnas.map((c) => {
      if (c.formato === 'moneda' || c.formato === 'numero' || c.formato === 'porcentaje') {
        const n = numeroDeColumna(f, c.clave);
        return n == null ? '' : String(n).replace('.', ','); // coma decimal para Excel en español
      }
      const raw = rawDeColumna(f, c.clave);
      if (raw == null) return '';
      return escapar(c.clave === 'fecha' ? fmtFecha(String(raw)) : raw);
    });
    lineas.push(vals.join(';'));
  }
  return '﻿' + lineas.join('\r\n');
}

export function descargarComprasCsv(
  filas: FilaReporteCompras[],
  columnasClaves: string[],
  meta: MetadatosExportacionCompras,
): void {
  const columnas = columnasVisibles(columnasClaves, meta);
  if (!columnas.length) throw new Error('Selecciona al menos una columna.');
  if (!filas.length) throw new Error('No hay datos para exportar.');
  const csvContent = construirComprasCsv(filas, columnasClaves, meta);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `compras-${meta.ambito}-${hoyStr()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
