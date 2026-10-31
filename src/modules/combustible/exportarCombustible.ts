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
import { CAMPOS_REPORTE_COMBUSTIBLE, obtenerMetricasFicha } from './reporteMoldeable';

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
  formatoPresentacion?: 'fichas' | 'tabla';
  ordenarPor?: 'usd' | 'litros' | 'horas';
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

  const esFichas = meta.formatoPresentacion !== 'tabla';
  const orient = meta.orientacion === 'portrait'
    ? 'portrait'
    : meta.orientacion === 'landscape'
      ? 'landscape'
      : esFichas || columnas.length > 6
        ? 'landscape'
        : 'portrait';

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
  const tituloDoc = 'Reporte de consumo de Combustible';
  const titLineas = doc.splitTextToSize(tituloDoc, anchoTexto) as string[];
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

  // 2. Tarjetas de Resumen en Cabecera (KPIs condicionados a columnas seleccionadas)
  if (meta.incluirResumen) {
    const kpis: Array<{ label: string; val: string; sub?: string }> = [];

    if (columnasClaves.includes('litros')) {
      kpis.push({
        label: 'TOTAL CONSUMO',
        val: `${fmtNum(resumen.totalLitros, 2)} L`,
        sub: columnasClaves.includes('rendimiento') && resumen.rendimientoPromedio > 0
          ? `Rend: ${fmtNum(resumen.rendimientoPromedio, 2)} L/h`
          : '',
      });
    }

    if (columnasClaves.includes('usd')) {
      kpis.push({
        label: 'VALOR TOTAL USD',
        val: fmtUsd(resumen.totalUsd),
        sub: `Tasa: ${fmtUsd(resumen.tasaPromedio)}/L`,
      });
    }

    if (columnasClaves.includes('horas')) {
      kpis.push({
        label: 'HORAS TRABAJADAS',
        val: `${fmtNum(resumen.totalHoras, 1)} h`,
        sub: `${resumen.totalEquipos} equipos`,
      });
    }

    if (columnasClaves.includes('surtidos') || (!columnasClaves.includes('horas') && !columnasClaves.includes('usd'))) {
      kpis.push({
        label: 'SURTIDOS / DESPACHOS',
        val: `${resumen.totalSurtidos}`,
        sub: `${filas.length} registros`,
      });
    }

    if (columnasClaves.includes('rendimiento') && !columnasClaves.includes('litros')) {
      kpis.push({
        label: 'PROMEDIO L/H',
        val: resumen.rendimientoPromedio > 0 ? `${fmtNum(resumen.rendimientoPromedio, 2)} L/h` : '—',
      });
    }

    if (kpis.length > 0) {
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
  }

  // 3. Contenido: FICHAS EJECUTIVAS vs TABLA TABULAR
  if (esFichas) {
    const cols = orient === 'landscape' ? 2 : 1;
    const cardGap = 10;
    const cardW = (UW - (cols - 1) * cardGap) / cols;
    const cardH = orient === 'landscape' ? 76 : 68;

    for (let i = 0; i < filas.length; i += cols) {
      if (y + cardH > H - 36) {
        doc.addPage();
        y = 36;
      }

      for (let c = 0; c < cols; c++) {
        const f = filas[i + c];
        if (!f) break;
        const cx = M + c * (cardW + cardGap);
        const cy = y;

        // Tarjeta contenedora
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(...BORDE);
        doc.setLineWidth(0.6);
        doc.roundedRect(cx, cy, cardW, cardH, 4, 4, 'FD');

        // Borde izquierdo naranja
        doc.setFillColor(...NARANJA);
        doc.rect(cx, cy + 1, 3.5, cardH - 2, 'F');

        // Badge % Consumo con respecto al Tanque (calculado primero para delimitar el ancho del titulo)
        const tanqueCorto = f.tanque ? f.tanque.split('(')[0].trim() : 'Tanque';
        const txtPctTanque = `${(f.pct_tanque ?? f.pct_total).toFixed(1)}% con respecto a ${pdfSafe(tanqueCorto)}`;
        const txtSubBadge = f.pct_capacidad > 0
          ? `${f.pct_capacidad.toFixed(1)}% de la capacidad física (${fmtNum(f.capacidad_tanque || 0)} L)`
          : `${f.pct_total.toFixed(1)}% del consumo total del período`;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        const w1 = doc.getTextWidth(txtPctTanque);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.5);
        const w2 = doc.getTextWidth(txtSubBadge);

        // Ancho optimo del badge (maximo 44% de la tarjeta para dejar espacio amplio al titulo)
        const badgeW = Math.min(cardW * 0.44, Math.max(90, Math.max(w1, w2) + 12));
        const badgeH = 15;
        const bx = cx + cardW - badgeW - 6;
        const by = cy + 4;
        const esTraslado = f.es_traslado || f.equipo?.startsWith('Traslado');

        if (esTraslado) {
          doc.setFillColor(224, 242, 254); // azul suave
          doc.roundedRect(bx, by, badgeW, badgeH, 3, 3, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(3, 105, 161);
        } else {
          doc.setFillColor(254, 243, 199); // ambar suave
          doc.roundedRect(bx, by, badgeW, badgeH, 3, 3, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(217, 119, 6);
        }

        // Texto 1 del badge (auto-ajustable al ancho del badge)
        let fontPct = 6.8;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(fontPct);
        while (doc.getTextWidth(txtPctTanque) > badgeW - 6 && fontPct > 5.4) {
          fontPct -= 0.2;
          doc.setFontSize(fontPct);
        }
        doc.text(txtPctTanque, bx + badgeW / 2, by + 5.8, { align: 'center' });

        // Texto 2 del badge (auto-ajustable al ancho del badge)
        let fontSub = 5.5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(fontSub);
        doc.setTextColor(100, 116, 139);
        while (doc.getTextWidth(txtSubBadge) > badgeW - 6 && fontSub > 4.4) {
          fontSub -= 0.2;
          doc.setFontSize(fontSub);
        }
        doc.text(txtSubBadge, bx + badgeW / 2, by + 11.5, { align: 'center' });

        // Nombre de Equipo: delimitado exactamente antes del badge para evitar todo solapado
        const maxTitleW = Math.max(60, (bx - 8) - (cx + 10));
        const eqNombre = pdfSafe(f.equipo || 'Sin clasificar');
        let titleFontSize = 9.5;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(titleFontSize);
        while (doc.getTextWidth(eqNombre) > maxTitleW && titleFontSize > 7.4) {
          titleFontSize -= 0.3;
          doc.setFontSize(titleFontSize);
        }

        let titleFinal = eqNombre;
        if (doc.getTextWidth(titleFinal) > maxTitleW) {
          while (titleFinal.length > 3 && doc.getTextWidth(titleFinal + '…') > maxTitleW) {
            titleFinal = titleFinal.slice(0, -1);
          }
          titleFinal += '…';
        }

        doc.setTextColor(...TINTA);
        doc.text(titleFinal, cx + 10, cy + 13);

        // Subtitulo con Empresa / Tipo / Ubicacion
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.2);
        doc.setTextColor(100, 116, 139);
        const partesMeta = [
          f.empresa,
          f.tipo && f.tipo !== f.empresa && f.tipo !== f.equipo ? f.tipo : null,
          f.ubicacion && f.ubicacion !== f.equipo ? f.ubicacion : null,
        ].filter(Boolean);
        const metaTxt = pdfSafe(partesMeta.join(' · ') || 'Flota General');
        const maxMetaW = cardW - 20;
        let metaFinal = metaTxt;
        if (doc.getTextWidth(metaFinal) > maxMetaW) {
          while (metaFinal.length > 3 && doc.getTextWidth(metaFinal + '…') > maxMetaW) {
            metaFinal = metaFinal.slice(0, -1);
          }
          metaFinal += '…';
        }
        doc.text(metaFinal, cx + 10, cy + 24);

        // Divisor interior
        doc.setDrawColor(241, 245, 249);
        doc.setLineWidth(0.5);
        doc.line(cx + 8, cy + 29, cx + cardW - 8, cy + 29);

        // Metricas dinamicas de la tarjeta segun las columnas seleccionadas
        const metricasCard = obtenerMetricasFicha(f, columnasClaves);
        const innerW = cardW - 16;
        const colW = innerW / Math.max(1, metricasCard.length);
        const my = cy + 39;

        metricasCard.forEach((m, idx) => {
          const mx = cx + 8 + colW * idx;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.2);
          doc.setTextColor(71, 85, 105);
          doc.text(pdfSafe(m.etiqueta), mx, my);

          doc.setFontSize(10);
          doc.setTextColor(...m.colorRgb);
          doc.text(pdfSafe(m.valor), mx, my + 13);

          if (m.sub) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.2);
            doc.setTextColor(148, 163, 184);
            doc.text(pdfSafe(m.sub), mx, my + 23);
          }
        });
      }

      y += cardH + cardGap;
    }
  } else {
    // 3b. Tabla con AutoTable optimizada
    const headCols = columnas.map((c) => pdfSafe(c.etiqueta));
    const bodyRows = filas.map((f) => columnas.map((c) => pdfSafe(formatearValorCelda(f, c))));

    const footRow = columnas.map((col, idx) => {
      if (idx === 0) return 'TOTALES';
      if (col.clave === 'litros') return `${fmtNum(resumen.totalLitros, 2)} L`;
      if (col.clave === 'usd') return fmtUsd(resumen.totalUsd);
      if (col.clave === 'horas') return `${fmtNum(resumen.totalHoras, 1)} h`;
      if (col.clave === 'surtidos') return String(resumen.totalSurtidos);
      if (col.clave === 'pct_total') return '100.0 %';
      if (col.clave === 'pct_tanque') return '—';
      if (col.clave === 'pct_capacidad') return '—';
      if (col.clave === 'rendimiento') return resumen.rendimientoPromedio > 0 ? `${fmtNum(resumen.rendimientoPromedio, 2)} L/h` : '-';
      if (col.clave === 'tasa_promedio') return `${fmtUsd(resumen.tasaPromedio)}/L`;
      return '';
    });

    const columnStyles: Record<number, { halign: 'left' | 'right' | 'center'; cellWidth?: number }> = {};
    columnas.forEach((col, idx) => {
      columnStyles[idx] = { halign: col.alineacion };
    });

    const esMuchosCampos = columnas.length >= 10;

    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, bottom: 24 },
      head: [headCols],
      body: bodyRows,
      foot: [footRow],
      theme: 'grid',
      styles: {
        fontSize: esMuchosCampos ? 6.5 : orient === 'landscape' ? 7.6 : 7.0,
        cellPadding: esMuchosCampos ? 1.6 : 2.2,
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
  }

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

