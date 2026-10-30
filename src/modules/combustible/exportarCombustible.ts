/* ============================================================
   Golden Touch · Combustible · Exportación de Reportes (Excel / PDF / CSV)
   (29/10/2026)

   Exportación profesional moldeable de combustible:
   - Excel (ExcelJS): Hoja "Resumen" con tarjetas de KPIs y Top Consumidores;
     hoja principal con cabeceras naranjas, fuentes legibles, números y montos
     formateados, totales y vistas congeladas.
   - PDF (jsPDF + autotable): Base estética idéntica a Control de Maquinaria
     (logo institucional GT, barra naranja [255, 138, 0], tarjetas superiores
     de resumen/KPIs, alternancia de filas, pie "Página X de Y").
   - CSV: Exportación plana con BOM UTF-8 (\uFEFF) y delimitador ';' compatible
     con Excel en Windows sin alterar tildes ni caracteres especiales.
   ============================================================ */

import { previewExcelArchivo, previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import { identidadEmpresa } from '@/shared/lib/empresa';
import { loadLogoPdfEmpresa, dibujarLogoPdf, anchoLogoPdf } from '@/shared/lib/pdfLogo';
import type {
  FilaReporteCombustible,
  ResumenReporteCombustible,
  CampoColumnaCombustible,
  ModoAgrupacionCombustible,
  BaseTasaUsd,
} from './reporteMoldeable';
import { CAMPOS_REPORTE_COMBUSTIBLE } from './reporteMoldeable';

const NARANJA: [number, number, number] = [255, 138, 0];
const TINTA: [number, number, number] = [30, 41, 59];
const BORDE: [number, number, number] = [203, 213, 225];
const FONDO_ALT: [number, number, number] = [250, 246, 240];

const fmtNum = (v: number | null | undefined, dec = 2) =>
  v == null ? '-' : Number(v).toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: dec });

const fmtLitros = (v: number | null | undefined) =>
  v == null ? '-' : `${Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L`;

const fmtUsd = (v: number | null | undefined) =>
  v == null ? '-' : `$ ${Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtPct = (v: number | null | undefined) =>
  v == null ? '-' : `${Number(v).toFixed(1)} %`;

const fmtFecha = (f: string) => {
  const [y, m, d] = (f || '').split('-');
  return y && m && d ? `${d}/${m}/${y}` : f || '-';
};

const hoyStr = () => new Date().toISOString().slice(0, 10);

export interface MetadatosExportacion {
  desde: string;
  hasta: string;
  agrupacion: ModoAgrupacionCombustible;
  baseTasa: BaseTasaUsd;
  subtituloFiltros?: string;
  incluirResumen: boolean;
  orientacion?: 'auto' | 'portrait' | 'landscape';
}

function formatearValorCelda(fila: FilaReporteCombustible, col: CampoColumnaCombustible): string {
  const val = (fila as unknown as Record<string, unknown>)[col.clave];
  if (val == null || val === '') return '-';

  switch (col.formato) {
    case 'moneda':
      return fmtUsd(Number(val));
    case 'numero':
      if (col.clave === 'litros') return fmtLitros(Number(val));
      if (col.clave === 'surtidos') return String(Math.round(Number(val)));
      return fmtNum(Number(val), 2);
    case 'porcentaje':
      return fmtPct(Number(val));
    default:
      if (col.clave === 'fecha') return fmtFecha(String(val));
      return String(val);
  }
}

/* ============================================================
   1. EXCEL (ExcelJS)
   ============================================================ */

export async function descargarCombustibleExcel(
  filas: FilaReporteCombustible[],
  resumen: ResumenReporteCombustible,
  columnasClaves: string[],
  meta: MetadatosExportacion
): Promise<void> {
  const [{ default: ExcelJS }] = await Promise.all([import('exceljs')]);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Golden Touch 1127 C.A.';
  wb.created = new Date();

  const idEmp = identidadEmpresa('GT');
  const columnas = columnasClaves
    .map((c) => CAMPOS_REPORTE_COMBUSTIBLE.find((col) => col.clave === c))
    .filter(Boolean) as CampoColumnaCombustible[];

  // 1. Hoja Resumen (si está activa)
  if (meta.incluirResumen) {
    const wsResumen = wb.addWorksheet('Resumen', {
      views: [{ showGridLines: true }],
    });

    wsResumen.columns = [
      { width: 5 },
      { width: 28 },
      { width: 22 },
      { width: 20 },
      { width: 20 },
    ];

    // Encabezado
    wsResumen.mergeCells('B2:E2');
    const r2 = wsResumen.getCell('B2');
    r2.value = `${idEmp.nombre} · RESUMEN DE COMBUSTIBLE`;
    r2.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFF8A00' } };

    wsResumen.mergeCells('B3:E3');
    const r3 = wsResumen.getCell('B3');
    r3.value = `Período: ${fmtFecha(meta.desde)} al ${fmtFecha(meta.hasta)} | Agrupación: ${meta.agrupacion.toUpperCase()} | Emitido: ${new Date().toLocaleString('es-VE')}`;
    r3.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF64748B' } };

    // Tarjetas de KPIs (Fila 5-7)
    const kpis = [
      { label: 'TOTAL CONSUMO', val: `${fmtNum(resumen.totalLitros, 2)} L` },
      { label: 'VALOR TOTAL USD', val: fmtUsd(resumen.totalUsd) },
      { label: 'HORAS TRABAJADAS', val: `${fmtNum(resumen.totalHoras, 1)} h` },
      { label: 'DESPACHOS (SURTIDOS)', val: `${resumen.totalSurtidos}` },
    ];

    kpis.forEach((k, i) => {
      const colLetter = String.fromCharCode(66 + i); // B, C, D, E
      const cellLabel = wsResumen.getCell(`${colLetter}5`);
      cellLabel.value = k.label;
      cellLabel.font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF475569' } };
      cellLabel.alignment = { horizontal: 'center', vertical: 'middle' };
      cellLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

      const cellVal = wsResumen.getCell(`${colLetter}6`);
      cellVal.value = k.val;
      cellVal.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFF8A00' } };
      cellVal.alignment = { horizontal: 'center', vertical: 'middle' };
      cellVal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };

      const cellSub = wsResumen.getCell(`${colLetter}7`);
      cellSub.value = i === 0 ? (resumen.rendimientoPromedio > 0 ? `Prom: ${fmtNum(resumen.rendimientoPromedio, 2)} L/h` : '') : i === 1 ? `Tasa: ${fmtUsd(resumen.tasaPromedio)}/L` : '';
      cellSub.font = { name: 'Arial', size: 7.5, italic: true, color: { argb: 'FF94A3B8' } };
      cellSub.alignment = { horizontal: 'center', vertical: 'middle' };

      const bordeFino = { style: 'thin' as const, color: { argb: 'FFCBD5E1' } };
      ['5', '6', '7'].forEach((rowNum) => {
        wsResumen.getCell(`${colLetter}${rowNum}`).border = {
          left: bordeFino,
          right: bordeFino,
          top: rowNum === '5' ? bordeFino : undefined,
          bottom: rowNum === '7' ? bordeFino : undefined,
        };
      });
    });

    // Top Consumidores
    wsResumen.getCell('B9').value = 'TOP CONSUMIDORES (MAYOR VOLUMEN)';
    wsResumen.getCell('B9').font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1E293B' } };

    const headTop = wsResumen.getRow(10);
    headTop.getCell(2).value = '#';
    headTop.getCell(3).value = 'Equipo';
    headTop.getCell(4).value = 'Consumo (L)';
    headTop.getCell(5).value = '% del Total';
    for (let c = 2; c <= 5; c++) {
      headTop.getCell(c).font = { name: 'Arial', size: 8.5, bold: true, color: { argb: 'FFFFFFFF' } };
      headTop.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF8A00' } };
      headTop.getCell(c).alignment = { horizontal: c === 3 ? 'left' : 'center' };
    }

    resumen.topConsumidores.forEach((tc, idx) => {
      const r = wsResumen.getRow(11 + idx);
      r.getCell(2).value = idx + 1;
      r.getCell(3).value = tc.nombre;
      r.getCell(4).value = tc.litros;
      r.getCell(4).numFmt = '#,##0.00 "L"';
      r.getCell(5).value = tc.porcentaje / 100;
      r.getCell(5).numFmt = '0.0%';
      for (let c = 2; c <= 5; c++) {
        r.getCell(c).font = { name: 'Arial', size: 8.5, color: { argb: 'FF334155' } };
        r.getCell(c).border = {
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      }
    });
  }

  // 2. Hoja de Datos
  const orient = meta.orientacion === 'portrait' ? 'portrait' : meta.orientacion === 'landscape' ? 'landscape' : columnas.length > 7 ? 'landscape' : 'portrait';
  const wsDatos = wb.addWorksheet('Consumo Combustible', {
    pageSetup: { orientation: orient, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: 'frozen', ySplit: 5 }],
  });

  wsDatos.columns = [{ width: 4 }, ...columnas.map((c) => ({ width: Math.max(c.anchoExcel, c.etiqueta.length + 4) }))];

  // Membrete
  wsDatos.mergeCells(2, 2, 2, columnas.length + 1);
  const titCell = wsDatos.getCell(2, 2);
  titCell.value = `${idEmp.nombre} · REPORTE DE COMBUSTIBLE`;
  titCell.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFF8A00' } };

  wsDatos.mergeCells(3, 2, 3, columnas.length + 1);
  const subCell = wsDatos.getCell(3, 2);
  subCell.value = `Período: ${fmtFecha(meta.desde)} al ${fmtFecha(meta.hasta)} | Agrupación: ${meta.agrupacion.toUpperCase()}${meta.subtituloFiltros ? ` | ${meta.subtituloFiltros}` : ''} | Tasa: ${meta.baseTasa === 'actual' ? 'Actual del tanque' : 'Histórica del movimiento'}`;
  subCell.font = { name: 'Arial', size: 8.5, italic: true, color: { argb: 'FF64748B' } };

  // Encabezados
  const headerRow = wsDatos.getRow(5);
  headerRow.height = 24;
  columnas.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 2);
    cell.value = col.etiqueta;
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF8A00' } };
    cell.alignment = { horizontal: col.alineacion, vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  // Filas de datos
  filas.forEach((f, fIdx) => {
    const r = wsDatos.getRow(6 + fIdx);
    r.height = 18;
    const esPar = fIdx % 2 === 1;

    columnas.forEach((col, cIdx) => {
      const cell = r.getCell(cIdx + 2);
      const rawVal = (f as unknown as Record<string, unknown>)[col.clave];

      if (col.formato === 'numero') {
        cell.value = rawVal != null ? Number(rawVal) : 0;
        cell.numFmt = col.clave === 'surtidos' ? '#,##0' : '#,##0.00';
      } else if (col.formato === 'moneda') {
        cell.value = rawVal != null ? Number(rawVal) : 0;
        cell.numFmt = '"$"#,##0.00';
      } else if (col.formato === 'porcentaje') {
        cell.value = rawVal != null ? Number(rawVal) / 100 : 0;
        cell.numFmt = '0.0%';
      } else {
        cell.value = rawVal != null ? String(rawVal) : '-';
      }

      cell.font = { name: 'Arial', size: 8.5, color: { argb: 'FF1E293B' } };
      cell.alignment = { horizontal: col.alineacion, vertical: 'middle' };
      if (esPar) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAF6F0' } };
      }
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });
  });

  // Fila de Totales
  const totalRowIdx = 6 + filas.length;
  const totRow = wsDatos.getRow(totalRowIdx);
  totRow.height = 22;
  columnas.forEach((col, cIdx) => {
    const cell = totRow.getCell(cIdx + 2);
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF1E293B' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'double', color: { argb: 'FF94A3B8' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
    cell.alignment = { horizontal: col.alineacion, vertical: 'middle' };

    if (cIdx === 0) {
      cell.value = 'TOTALES';
    } else if (col.clave === 'litros') {
      cell.value = resumen.totalLitros;
      cell.numFmt = '#,##0.00';
    } else if (col.clave === 'usd') {
      cell.value = resumen.totalUsd;
      cell.numFmt = '"$"#,##0.00';
    } else if (col.clave === 'horas') {
      cell.value = resumen.totalHoras;
      cell.numFmt = '#,##0.0';
    } else if (col.clave === 'surtidos') {
      cell.value = resumen.totalSurtidos;
      cell.numFmt = '#,##0';
    } else if (col.clave === 'pct_total') {
      cell.value = 1.0;
      cell.numFmt = '100.0%';
    } else if (col.clave === 'rendimiento') {
      cell.value = resumen.rendimientoPromedio;
      cell.numFmt = '#,##0.00';
    } else if (col.clave === 'tasa_promedio') {
      cell.value = resumen.tasaPromedio;
      cell.numFmt = '"$"#,##0.00';
    }
  });

  const bytes = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  await previewExcelArchivo(bytes, `combustible-${meta.agrupacion}-${hoyStr()}.xlsx`);
}

/* ============================================================
   2. PDF (jsPDF + autotable)
   ============================================================ */

export async function descargarCombustiblePdf(
  filas: FilaReporteCombustible[],
  resumen: ResumenReporteCombustible,
  columnasClaves: string[],
  meta: MetadatosExportacion
): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const columnas = columnasClaves
    .map((c) => CAMPOS_REPORTE_COMBUSTIBLE.find((col) => col.clave === c))
    .filter(Boolean) as CampoColumnaCombustible[];

  if (!columnas.length) throw new Error('Selecciona al menos una columna.');
  if (!filas.length) throw new Error('No hay datos de combustible para el período seleccionado.');

  const orient = meta.orientacion === 'portrait' ? 'portrait' : meta.orientacion === 'landscape' ? 'landscape' : columnas.length > 6 ? 'landscape' : 'portrait';
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: orient });

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36; // Margen de 0.5 pulgada
  const UW = W - M * 2;
  let y = M;

  const idEmp = identidadEmpresa('GT');
  const logo = await loadLogoPdfEmpresa('GT').catch(() => null);

  // 1. Membrete Institucional
  const cajaLogo = 40;
  if (logo) {
    dibujarLogoPdf(doc, logo, M, y, cajaLogo);
  }
  const tx = logo ? M + anchoLogoPdf(cajaLogo) + 12 : M;
  const anchoTexto = W - M - tx;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...NARANJA);
  const titLineas = doc.splitTextToSize('REPORTE DE COMBUSTIBLE Y CONSUMO', anchoTexto) as string[];
  doc.text(titLineas, tx, y + 14);

  let yy = y + 14 + (titLineas.length - 1) * 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  const subLineas = doc.splitTextToSize(
    `${idEmp.nombre} · RIF ${idEmp.rif} · Período: ${fmtFecha(meta.desde)} al ${fmtFecha(meta.hasta)} · Agrupado por: ${meta.agrupacion.toUpperCase()} · ${filas.length} registros`,
    anchoTexto
  ) as string[];
  doc.text(subLineas, tx, yy + 12);
  yy += 12 + (subLineas.length - 1) * 10;

  y = Math.max(y + cajaLogo + 6, yy + 14);
  doc.setDrawColor(...NARANJA);
  doc.setLineWidth(1.4);
  doc.line(M, y, W - M, y);
  y += 12;

  // 2. Tarjetas de Resumen en Cabecera (KPIs)
  if (meta.incluirResumen) {
    const kpis = [
      { label: 'TOTAL CONSUMO', val: `${fmtNum(resumen.totalLitros, 2)} L`, sub: resumen.rendimientoPromedio > 0 ? `Rend: ${fmtNum(resumen.rendimientoPromedio, 2)} L/h` : '' },
      { label: 'VALOR TOTAL USD', val: fmtUsd(resumen.totalUsd), sub: `Tasa: ${fmtUsd(resumen.tasaPromedio)}/L` },
      { label: 'HORAS TRABAJADAS', val: `${fmtNum(resumen.totalHoras, 1)} h`, sub: `${resumen.totalEquipos} equipos` },
      { label: 'SURTIDOS / DESPACHOS', val: `${resumen.totalSurtidos}`, sub: `${filas.length} registros` },
    ];

    const cardGap = 8;
    const cardW = (UW - cardGap * (kpis.length - 1)) / kpis.length;
    const cardH = 38;

    kpis.forEach((k, i) => {
      const cx = M + i * (cardW + cardGap);
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...BORDE);
      doc.setLineWidth(0.6);
      doc.roundedRect(cx, y, cardW, cardH, 4, 4, 'FD');

      // Franja naranja vertical izquierda
      doc.setFillColor(...NARANJA);
      doc.rect(cx, y + 1, 3, cardH - 2, 'F');

      // Label
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(71, 85, 105);
      doc.text(pdfSafe(k.label), cx + 8, y + 10);

      // Valor
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...NARANJA);
      doc.text(pdfSafe(k.val), cx + 8, y + 24);

      // Sub
      if (k.sub) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(148, 163, 184);
        doc.text(pdfSafe(k.sub), cx + 8, y + 33);
      }
    });

    y += cardH + 12;
  }

  // 3. Tabla con AutoTable
  const headCols = columnas.map((c) => pdfSafe(c.etiqueta));
  const bodyRows = filas.map((f) => columnas.map((c) => pdfSafe(formatearValorCelda(f, c))));

  // Fila de Totales para el Pie de Tabla
  const footRow = columnas.map((col, idx) => {
    if (idx === 0) return 'TOTALES';
    if (col.clave === 'litros') return `${fmtNum(resumen.totalLitros, 2)} L`;
    if (col.clave === 'usd') return fmtUsd(resumen.totalUsd);
    if (col.clave === 'horas') return `${fmtNum(resumen.totalHoras, 1)} h`;
    if (col.clave === 'surtidos') return String(resumen.totalSurtidos);
    if (col.clave === 'pct_total') return '100.0 %';
    if (col.clave === 'rendimiento') return resumen.rendimientoPromedio > 0 ? `${fmtNum(resumen.rendimientoPromedio, 2)} L/h` : '-';
    if (col.clave === 'tasa_promedio') return `${fmtUsd(resumen.tasaPromedio)}/L`;
    return '';
  });

  const columnStyles: Record<number, { halign: 'left' | 'right' | 'center' }> = {};
  columnas.forEach((col, idx) => {
    columnStyles[idx] = { halign: col.alineacion };
  });

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, bottom: 24 },
    head: [headCols],
    body: bodyRows,
    foot: [footRow],
    theme: 'grid',
    styles: {
      fontSize: orient === 'landscape' ? 7.8 : 7.2,
      cellPadding: 2.2,
      lineColor: BORDE,
      lineWidth: 0.3,
      textColor: TINTA,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: NARANJA,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [30, 41, 59],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: FONDO_ALT,
    },
    columnStyles,
  });

  // 4. Pies de página en todas las hojas
  const numPaginas = doc.getNumberOfPages();
  for (let i = 1; i <= numPaginas; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BORDE);
    doc.setLineWidth(0.4);
    doc.line(M, H - 18, W - M, H - 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`${idEmp.nombre} · RIF ${idEmp.rif} · Combustible (${meta.agrupacion})`, M, H - 9);
    doc.text(`Página ${i} de ${numPaginas}`, W - M, H - 9, { align: 'right' });
  }

  previewPdf(doc, `combustible-${meta.agrupacion}-${hoyStr()}.pdf`);
}

/* ============================================================
   3. CSV
   ============================================================ */

export function descargarCombustibleCsv(
  filas: FilaReporteCombustible[],
  columnasClaves: string[],
  meta: MetadatosExportacion
): void {
  const columnas = columnasClaves
    .map((c) => CAMPOS_REPORTE_COMBUSTIBLE.find((col) => col.clave === c))
    .filter(Boolean) as CampoColumnaCombustible[];

  if (!columnas.length) throw new Error('Selecciona al menos una columna.');
  if (!filas.length) throw new Error('No hay datos para exportar.');

  const escapar = (val: unknown) => {
    const s = String(val ?? '');
    if (s.includes(';') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lineas: string[] = [];
  // Encabezados
  lineas.push(columnas.map((c) => escapar(c.etiqueta)).join(';'));

  // Filas
  for (const f of filas) {
    const vals = columnas.map((c) => {
      const raw = (f as unknown as Record<string, unknown>)[c.clave];
      if (raw == null) return '';
      if (c.formato === 'numero' || c.formato === 'moneda' || c.formato === 'porcentaje') {
        return String(raw).replace('.', ','); // Formato español para Excel
      }
      return escapar(raw);
    });
    lineas.push(vals.join(';'));
  }

  const csvContent = '\uFEFF' + lineas.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `combustible-${meta.agrupacion}-${hoyStr()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

