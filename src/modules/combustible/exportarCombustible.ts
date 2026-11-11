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
import {
  CAMPOS_REPORTE_COMBUSTIBLE,
  esColumnaAplicableModoCombustible,
  resolverCabeceraTarjetaCombustible,
  obtenerMetricasFicha,
} from './reporteMoldeable';

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
  const colsAplicables = columnasClaves.filter((c) => esColumnaAplicableModoCombustible(c, meta.agrupacion));
  const columnas = colsAplicables
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

  const colsAplicables = columnasClaves.filter((c) => esColumnaAplicableModoCombustible(c, meta.agrupacion));
  const columnas = colsAplicables
    .map((c) => CAMPOS_REPORTE_COMBUSTIBLE.find((col) => col.clave === c))
    .filter(Boolean) as CampoColumnaCombustible[];

  if (!columnas.length) throw new Error('Selecciona al menos una columna aplicable.');
  if (!filas.length) throw new Error('No hay datos de combustible para el período seleccionado.');

  const esFichas = meta.formatoPresentacion === 'fichas';
  const orient = meta.orientacion === 'portrait'
    ? 'portrait'
    : meta.orientacion === 'landscape'
      ? 'landscape'
      : esFichas || columnas.length > 7
        ? 'landscape'
        : 'portrait';

  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: orient });

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 32; // Margen optimizado de 32 pt
  const UW = W - M * 2;
  let y = M;

  const idEmp = identidadEmpresa('GT');
  const logo = await loadLogoPdfEmpresa('GT').catch(() => null);

  // Colores corporativos GT y auxiliares
  const GRIS_TEXTO: [number, number, number] = [100, 116, 139];
  const GRIS_CLARO: [number, number, number] = [148, 163, 184];
  const AZUL_DIESEL: [number, number, number] = [2, 132, 199];

  // Fecha y hora de emisión formateada en español
  const ahora = new Date();
  const meses = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'];
  const dia = ahora.getDate();
  const mes = meses[ahora.getMonth()];
  const anio = ahora.getFullYear();
  let h = ahora.getHours();
  const mMin = String(ahora.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'p. m.' : 'a. m.';
  h = h % 12 || 12;
  const fechaHoraEmision = `${dia} ${mes} ${anio}, ${h}:${mMin} ${ampm}`;

  // 1. MEMBRETE DUAL INSTITUCIONAL (Identidad GT + Caja Ejecutiva)
  const cajaLogo = 44;
  if (logo) {
    dibujarLogoPdf(doc, logo, M, y, cajaLogo);
  }
  const tx = logo ? M + anchoLogoPdf(cajaLogo) + 12 : M;

  // Lado izquierdo: datos corporativos GT
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...TINTA);
  doc.text(idEmp.nombre || 'MINERA GOLDEN TOUCH 1127, C.A.', tx, y + 12);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRIS_TEXTO);
  doc.text('EXPLOTACIÓN Y BENEFICIO DE MINERALES', tx, y + 22);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(...GRIS_TEXTO);
  doc.text(`RIF: ${idEmp.rif || 'J-50209170-0'} · Mina Peramanal`, tx, y + 31);

  doc.setFontSize(7);
  doc.setTextColor(...GRIS_CLARO);
  doc.text('EL CALLAO · ESTADO BOLÍVAR · VENEZUELA', tx, y + 40);

  // Lado derecho: Caja ejecutiva formal de metadatos del reporte
  const boxW = Math.min(235, Math.max(195, UW * 0.38));
  const boxH = 50;
  const bx = W - M - boxW;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...BORDE);
  doc.setLineWidth(0.6);
  doc.roundedRect(bx, y, boxW, boxH, 4, 4, 'FD');

  const barH = 15;
  doc.setFillColor(...NARANJA);
  doc.roundedRect(bx, y, boxW, barH, 4, 4, 'F');
  doc.rect(bx, y + barH - 4, boxW, 4, 'F'); // Relleno esquinas inferiores barra

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(255, 255, 255);
  doc.text('REPORTE DINÁMICO DE COMBUSTIBLE', bx + boxW / 2, y + 10.5, { align: 'center' });

  // Líneas internas de la caja
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(...GRIS_TEXTO);
  doc.text('EMITIDO:', bx + 8, y + 24);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TINTA);
  doc.text(fechaHoraEmision, bx + 52, y + 24);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...GRIS_TEXTO);
  doc.text('PERÍODO:', bx + 8, y + 34);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TINTA);
  doc.text(`${fmtFecha(meta.desde)} al ${fmtFecha(meta.hasta)}`, bx + 52, y + 34);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...GRIS_TEXTO);
  doc.text('REGISTROS:', bx + 8, y + 44);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TINTA);
  doc.text(`${filas.length} filas · ${resumen.totalEquipos} equipos`, bx + 52, y + 44);

  y = Math.max(y + cajaLogo + 6, y + boxH + 8);

  // 2. ALCANCE DEL REPORTE (Píldora con fondo suave redondeado)
  const pillH = 16;
  doc.setFillColor(...FONDO_ALT);
  doc.setDrawColor(...BORDE);
  doc.setLineWidth(0.5);
  doc.roundedRect(M, y, UW, pillH, 4, 4, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(...NARANJA);
  doc.text('ALCANCE:', M + 8, y + 10.5);
  const alcLblW = doc.getTextWidth('ALCANCE: ');

  const baseTasaTxt = meta.baseTasa === 'historica' ? 'Tasa histórica de cada movimiento' : 'Tasa actual de cada tanque';
  const textoAlcance = `Período: ${fmtFecha(meta.desde)} al ${fmtFecha(meta.hasta)} · Agrupación: ${meta.agrupacion.toUpperCase()} · Base: ${baseTasaTxt}${meta.subtituloFiltros ? ' · ' + meta.subtituloFiltros : ''}`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(...GRIS_TEXTO);

  let alcanceFin = pdfSafe(textoAlcance);
  const maxAlcanceW = UW - alcLblW - 16;
  while (doc.getTextWidth(alcanceFin) > maxAlcanceW && alcanceFin.length > 5) {
    alcanceFin = alcanceFin.slice(0, -1);
  }
  if (alcanceFin !== textoAlcance) alcanceFin += '…';
  doc.text(alcanceFin, M + 8 + alcLblW, y + 10.5);

  y += pillH + 8;

  // 3. TABLERO DE RESUMEN EJECUTIVO (HERO BANNER + TARJETAS SECUNDARIAS)
  if (meta.incluirResumen) {
    // 3a. Hero Banner de Alto Impacto (2 columnas: Litros Totales vs Valorización USD y Eficiencia)
    const heroH = 46;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...BORDE);
    doc.setLineWidth(0.6);
    doc.roundedRect(M, y, UW, heroH, 5, 5, 'FD');

    // Acento vertical GT Naranja
    doc.setFillColor(...NARANJA);
    doc.rect(M, y + 2, 4, heroH - 4, 'F');

    const col1W = UW * 0.52;
    // Columna 1: Total Consumo
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text('TOTAL CONSUMO EN LITROS', M + 12, y + 12);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...NARANJA);
    doc.text(`${fmtNum(resumen.totalLitros, 2)} L`, M + 12, y + 28);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...GRIS_TEXTO);
    const subHero1 = `Valor total equivalente: ${fmtUsd(resumen.totalUsd)} · Tasa promedio: ${fmtUsd(resumen.tasaPromedio)}/L`;
    doc.text(pdfSafe(subHero1), M + 12, y + 38);

    // Divisor sutil central
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.8);
    doc.line(M + col1W, y + 5, M + col1W, y + heroH - 5);

    // Columna 2: Valorización y Eficiencia
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text('VALORIZACIÓN TOTAL Y EFICIENCIA', M + col1W + 12, y + 12);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...TINTA);
    doc.text(fmtUsd(resumen.totalUsd), M + col1W + 12, y + 28);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...GRIS_TEXTO);
    const rendTxt = resumen.rendimientoPromedio > 0 ? `${fmtNum(resumen.rendimientoPromedio, 2)} L/h` : '—';
    const opTxt = resumen.totalHoras > 0 ? `${fmtNum(resumen.totalHoras, 1)} h operadas` : `${resumen.totalSurtidos} despachos`;
    const subHero2 = `Rendimiento global: ${rendTxt} · ${opTxt}`;
    doc.text(pdfSafe(subHero2), M + col1W + 12, y + 38);

    y += heroH + 8;

    // 3b. Grid Secundario de 3 Tarjetas (Surtidos · Rendimiento · Distribución Tanques)
    const cardGap = 8;
    const cardW = (UW - cardGap * 2) / 3;
    const cardH = 44;

    // Tarjeta 1: Surtidos y Despachos
    const c1x = M;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...BORDE);
    doc.setLineWidth(0.6);
    doc.roundedRect(c1x, y, cardW, cardH, 4, 4, 'FD');
    doc.setFillColor(...NARANJA);
    doc.rect(c1x, y + 1, 3, cardH - 2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text('SURTIDOS Y DESPACHOS', c1x + 8, y + 10);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...TINTA);
    doc.text(`${resumen.totalSurtidos} despachos`, c1x + 8, y + 22);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(`${resumen.totalEquipos} equipos atendidos`, c1x + 8, y + 31);
    doc.text(`${fmtNum(resumen.totalHoras, 1)} horas registradas`, c1x + 8, y + 39);

    // Tarjeta 2: Eficiencia Horaria y Costos
    const c2x = M + cardW + cardGap;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...BORDE);
    doc.setLineWidth(0.6);
    doc.roundedRect(c2x, y, cardW, cardH, 4, 4, 'FD');
    doc.setFillColor(...AZUL_DIESEL);
    doc.rect(c2x, y + 1, 3, cardH - 2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text('EFICIENCIA Y COSTO', c2x + 8, y + 10);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...AZUL_DIESEL);
    doc.text(resumen.rendimientoPromedio > 0 ? `${fmtNum(resumen.rendimientoPromedio, 2)} L/h` : '—', c2x + 8, y + 22);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(`Tasa prom: ${fmtUsd(resumen.tasaPromedio)}/L`, c2x + 8, y + 31);
    const costoSurtido = resumen.totalSurtidos > 0 ? fmtUsd(resumen.totalUsd / resumen.totalSurtidos) : '—';
    doc.text(`Costo/despacho: ${costoSurtido}`, c2x + 8, y + 39);

    // Tarjeta 3: Distribución por Tanque (Mini-tabla comparativa)
    const c3x = M + (cardW + cardGap) * 2;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...BORDE);
    doc.setLineWidth(0.6);
    doc.roundedRect(c3x, y, cardW, cardH, 4, 4, 'FD');
    doc.setFillColor(245, 158, 11);
    doc.rect(c3x, y + 1, 3, cardH - 2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text('CONSUMO POR TANQUE', c3x + 8, y + 10);

    // Agrupar litros por tanque origen
    const tanquesMap = new Map<string, number>();
    for (const f of filas) {
      const t = f.tanque ? f.tanque.split('(')[0].trim() : 'Tanque';
      tanquesMap.set(t, (tanquesMap.get(t) ?? 0) + (f.litros || 0));
    }
    const topTanques = Array.from(tanquesMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    if (topTanques.length > 0) {
      topTanques.forEach(([tName, tLitros], tIdx) => {
        const pct = resumen.totalLitros > 0 ? ((tLitros / resumen.totalLitros) * 100).toFixed(0) : '0';
        const ty = y + 20 + tIdx * 9.5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.2);
        doc.setTextColor(...TINTA);
        const maxTNameW = cardW - 65;
        let tShort = tName;
        while (doc.getTextWidth(tShort) > maxTNameW && tShort.length > 4) {
          tShort = tShort.slice(0, -1);
        }
        if (tShort !== tName) tShort += '…';
        doc.text(pdfSafe(tShort), c3x + 8, ty);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.2);
        doc.setTextColor(...NARANJA);
        doc.text(`${fmtNum(tLitros, 0)} L (${pct}%)`, c3x + cardW - 8, ty, { align: 'right' });
      });
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...GRIS_TEXTO);
      doc.text('Sin desglose de tanques', c3x + 8, y + 25);
    }

    y += cardH + 11;
  }

  // 4. SECCIÓN 1: PLANILLA PRINCIPAL DE CONSUMO
  if (esFichas) {
    // ── Modo Fichas Ejecutivas ──
    const cols = orient === 'landscape' ? 2 : 1;
    const cardGap = 10;
    const cardW = (UW - (cols - 1) * cardGap) / cols;

    const colsMetricas = colsAplicables.filter((c) => {
      if (meta.agrupacion === 'equipo' && c === 'equipo') return false;
      if (meta.agrupacion === 'empresa' && c === 'empresa') return false;
      if (meta.agrupacion === 'tipo' && c === 'tipo') return false;
      if (meta.agrupacion === 'tanque' && c === 'tanque') return false;
      if (meta.agrupacion === 'ubicacion' && c === 'ubicacion') return false;
      if ((meta.agrupacion === 'dia' || meta.agrupacion === 'mes') && c === 'fecha') return false;
      if (meta.agrupacion !== 'detallado' && (c === 'empresa' || c === 'tipo' || c === 'ubicacion' || c === 'tanque')) return false;
      return true;
    });

    const maxMetricas = Math.max(
      ...filas.map((f) => obtenerMetricasFicha(f, colsMetricas).length),
      1
    );
    const colsPorFila = orient === 'landscape'
      ? (maxMetricas <= 3 ? Math.max(1, maxMetricas) : maxMetricas === 4 ? 4 : 3)
      : (maxMetricas <= 4 ? Math.max(1, maxMetricas) : 4);
    const numFilasMetricas = Math.ceil(maxMetricas / colsPorFila);
    const altoHeader = 32;
    const altoFilaMetrica = 25;
    const cardH = altoHeader + numFilasMetricas * altoFilaMetrica + 8;

    // Rótulo de sección
    doc.setFillColor(...NARANJA);
    doc.rect(M, y, 3.5, 11, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(...TINTA);
    doc.text('FICHAS EJECUTIVAS DE CONSUMO', M + 8, y + 8.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(`Agrupado por ${meta.agrupacion.toUpperCase()} · ${filas.length} fichas detalladas`, M + 8 + 160, y + 8.5);
    y += 16;

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

        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(...BORDE);
        doc.setLineWidth(0.6);
        doc.roundedRect(cx, cy, cardW, cardH, 4, 4, 'FD');

        const esTraslado = f.es_traslado || f.equipo?.startsWith('Traslado');
        doc.setFillColor(esTraslado ? 2 : 255, esTraslado ? 132 : 138, esTraslado ? 199 : 0);
        doc.rect(cx, cy + 1, 3.5, cardH - 2, 'F');

        const tienePctTanque = colsAplicables.includes('pct_tanque');
        const tienePctTotal = colsAplicables.includes('pct_total');
        const tieneBadge = tienePctTanque || tienePctTotal;
        const tanqueCorto = f.tanque ? f.tanque.split('(')[0].trim() : 'Tanque';
        const txtPctTanque = tienePctTanque
          ? `${(f.pct_tanque ?? f.pct_total).toFixed(1)}% con respecto a ${pdfSafe(tanqueCorto)}`
          : `${f.pct_total.toFixed(1)}% del total período`;
        const txtSubBadge = f.pct_capacidad > 0
          ? `${f.pct_capacidad.toFixed(1)}% de la capacidad (${fmtNum(f.capacidad_tanque || 0)} L)`
          : `${f.pct_total.toFixed(1)}% del consumo total`;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        const w1 = doc.getTextWidth(txtPctTanque);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.5);
        const w2 = doc.getTextWidth(txtSubBadge);

        const badgeW = Math.min(cardW * 0.44, Math.max(90, Math.max(w1, w2) + 12));
        const badgeH = 15;
        const bx = cx + cardW - badgeW - 6;
        const by = cy + 4;

        if (tieneBadge) {
          if (esTraslado) {
            doc.setFillColor(224, 242, 254);
            doc.roundedRect(bx, by, badgeW, badgeH, 3, 3, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(3, 105, 161);
          } else {
            doc.setFillColor(254, 243, 199);
            doc.roundedRect(bx, by, badgeW, badgeH, 3, 3, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(217, 119, 6);
          }

          let fontPct = 6.8;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(fontPct);
          while (doc.getTextWidth(txtPctTanque) > badgeW - 6 && fontPct > 5.4) {
            fontPct -= 0.2;
            doc.setFontSize(fontPct);
          }
          doc.text(txtPctTanque, bx + badgeW / 2, by + 5.8, { align: 'center' });

          let fontSub = 5.5;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(fontSub);
          doc.setTextColor(100, 116, 139);
          while (doc.getTextWidth(txtSubBadge) > badgeW - 6 && fontSub > 4.4) {
            fontSub -= 0.2;
            doc.setFontSize(fontSub);
          }
          doc.text(txtSubBadge, bx + badgeW / 2, by + 11.5, { align: 'center' });
        }

        const cab = resolverCabeceraTarjetaCombustible(f, meta.agrupacion, colsAplicables);
        const maxTitleW = tieneBadge ? Math.max(60, (bx - 8) - (cx + 10)) : cardW - 20;
        const eqNombre = pdfSafe(cab.titulo);
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

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.2);
        doc.setTextColor(100, 116, 139);
        const metaTxt = pdfSafe(cab.subtitulo || '');
        const maxMetaW = cardW - 20;
        let metaFinal = metaTxt;
        if (doc.getTextWidth(metaFinal) > maxMetaW) {
          while (metaFinal.length > 3 && doc.getTextWidth(metaFinal + '…') > maxMetaW) {
            metaFinal = metaFinal.slice(0, -1);
          }
          metaFinal += '…';
        }
        if (metaFinal) {
          doc.text(metaFinal, cx + 10, cy + 24);
        }

        doc.setDrawColor(241, 245, 249);
        doc.setLineWidth(0.5);
        doc.line(cx + 8, cy + 29, cx + cardW - 8, cy + 29);

        const metricasCard = obtenerMetricasFicha(f, colsMetricas);
        const innerW = cardW - 16;
        const myBase = cy + 38;
        const colW = innerW / colsPorFila;
        const maxTextW = colW - 6;

        metricasCard.forEach((m, idx) => {
          const filaIdx = Math.floor(idx / colsPorFila);
          const colEnFila = idx % colsPorFila;
          const mx = cx + 8 + colW * colEnFila;
          const my = myBase + filaIdx * altoFilaMetrica;

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(5.8);
          doc.setTextColor(71, 85, 105);
          let lblTxt = pdfSafe(m.etiqueta);
          if (doc.getTextWidth(lblTxt) > maxTextW) {
            while (lblTxt.length > 3 && doc.getTextWidth(lblTxt + '…') > maxTextW) {
              lblTxt = lblTxt.slice(0, -1);
            }
            lblTxt += '…';
          }
          doc.text(lblTxt, mx, my);

          doc.setFontSize(8.2);
          doc.setTextColor(...m.colorRgb);
          let valTxt = pdfSafe(m.valor);
          while (doc.getTextWidth(valTxt) > maxTextW && doc.getFontSize() > 6.0) {
            doc.setFontSize(doc.getFontSize() - 0.3);
          }
          if (doc.getTextWidth(valTxt) > maxTextW) {
            while (valTxt.length > 3 && doc.getTextWidth(valTxt + '…') > maxTextW) {
              valTxt = valTxt.slice(0, -1);
            }
            valTxt += '…';
          }
          doc.text(valTxt, mx, my + 8.5);

          if (m.sub) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(5.4);
            doc.setTextColor(148, 163, 184);
            let subTxt = pdfSafe(m.sub);
            if (doc.getTextWidth(subTxt) > maxTextW) {
              while (subTxt.length > 3 && doc.getTextWidth(subTxt + '…') > maxTextW) {
                subTxt = subTxt.slice(0, -1);
              }
              subTxt += '…';
            }
            doc.text(subTxt, mx, my + 14.5);
          }
        });
      }

      y += cardH + cardGap;
    }
  } else {
    // ── Modo Tabular Principal con Micro-gráficos y Rótulo de Sección ──
    doc.setFillColor(...NARANJA);
    doc.rect(M, y, 3.5, 11, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(...TINTA);
    doc.text('PLANILLA PRINCIPAL DE CONSUMO', M + 8, y + 8.5);
    const titleW = doc.getTextWidth('PLANILLA PRINCIPAL DE CONSUMO');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(`Agrupación por ${meta.agrupacion.toUpperCase()} · ${filas.length} registros`, M + 8 + titleW + 8, y + 8.5);
    y += 15;

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
      margin: { left: M, right: M, bottom: 26 },
      head: [headCols],
      body: bodyRows,
      foot: [footRow],
      theme: 'grid',
      styles: {
        fontSize: esMuchosCampos ? 6.5 : orient === 'landscape' ? 7.6 : 7.0,
        cellPadding: esMuchosCampos ? 1.6 : 2.4,
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
      didDrawCell: (data) => {
        // Micro-gráfico de barra horizontal en columnas de porcentaje (Inspirado en PDF 1)
        if (data.section === 'body') {
          const col = columnas[data.column.index];
          if (col && (col.clave === 'pct_total' || col.clave === 'pct_tanque')) {
            const rawFila = filas[data.row.index];
            const pct = rawFila ? Number(rawFila[col.clave]) || 0 : 0;
            if (pct > 0) {
              const maxBarW = Math.min(26, data.cell.width * 0.35);
              const barW = Math.min(maxBarW, Math.max(1.5, (pct / 100) * maxBarW));
              const barH = 3.5;
              const bx = data.cell.x + 3.5;
              const by = data.cell.y + (data.cell.height - barH) / 2;
              doc.setFillColor(...NARANJA);
              doc.rect(bx, by, barW, barH, 'F');
            }
          }
        }
      },
    });

    const yFinal1 = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text('Litros auditados de surtidores certificados. Traslados inter-tanques no duplican volumen neto del período.', M, yFinal1 + 9);
    y = yFinal1 + 20;

    // 5. SECCIÓN 2: DESGLOSE POR TIPO DE MAQUINARIA / FLOTA (Inspirado en PDF 2)
    // Agregación secundaria si hay variedad de tipos de equipo en el listado
    const tiposMap = new Map<string, { tipo: string; equipos: Set<string>; litros: number; usd: number; horas: number }>();
    for (const f of filas) {
      const t = f.tipo?.trim() || f.clase?.trim() || 'OTROS';
      const curr = tiposMap.get(t) || { tipo: t, equipos: new Set<string>(), litros: 0, usd: 0, horas: 0 };
      if (f.equipo) curr.equipos.add(f.equipo);
      curr.litros += f.litros || 0;
      curr.usd += f.usd || 0;
      curr.horas += f.horas || 0;
      tiposMap.set(t, curr);
    }
    const desgloseTipos = Array.from(tiposMap.values())
      .map((d) => ({
        tipo: d.tipo,
        equipos: d.equipos.size || 1,
        litros: d.litros,
        usd: d.usd,
        horas: d.horas,
        rendimiento: d.horas > 0 ? d.litros / d.horas : 0,
        pct: resumen.totalLitros > 0 ? (d.litros / resumen.totalLitros) * 100 : 0,
      }))
      .sort((a, b) => b.litros - a.litros);

    // Solo se dibuja si hay al menos 2 categorías distintas
    if (desgloseTipos.length > 1) {
      // Salto de página si queda poco espacio vertical
      if (y + 100 > H - 36) {
        doc.addPage();
        y = 36;
      }

      doc.setFillColor(...NARANJA);
      doc.rect(M, y, 3.5, 11, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.8);
      doc.setTextColor(...TINTA);
      doc.text('DESGLOSE POR TIPO DE MAQUINARIA / FLOTA', M + 8, y + 8.5);
      const title2W = doc.getTextWidth('DESGLOSE POR TIPO DE MAQUINARIA / FLOTA');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(...GRIS_TEXTO);
      doc.text('Volumen acumulado y rendimiento por categoría de equipo en el período', M + 8 + title2W + 8, y + 8.5);
      y += 14;

      const headTipos = ['CATEGORÍA / TIPO', 'EQUIPOS', 'LITROS TOTALES', 'COSTO TOTAL USD', '% DEL TOTAL', 'RENDIMIENTO'];
      const bodyTipos = desgloseTipos.map((d) => [
        pdfSafe(d.tipo),
        String(d.equipos),
        `${fmtNum(d.litros, 2)} L`,
        fmtUsd(d.usd),
        `${d.pct.toFixed(1)} %`,
        d.rendimiento > 0 ? `${fmtNum(d.rendimiento, 2)} L/h` : '—',
      ]);

      const footTipos = [
        'TOTAL GENERAL',
        String(resumen.totalEquipos),
        `${fmtNum(resumen.totalLitros, 2)} L`,
        fmtUsd(resumen.totalUsd),
        '100.0 %',
        resumen.rendimientoPromedio > 0 ? `${fmtNum(resumen.rendimientoPromedio, 2)} L/h` : '—',
      ];

      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M, bottom: 26 },
        head: [headTipos],
        body: bodyTipos,
        foot: [footTipos],
        theme: 'grid',
        styles: {
          fontSize: 7.2,
          cellPadding: 2.2,
          lineColor: BORDE,
          lineWidth: 0.3,
          textColor: TINTA,
          overflow: 'linebreak',
          valign: 'middle',
        },
        headStyles: {
          fillColor: [30, 41, 59], // Encabezado oscuro institucional para la sección secundaria
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
        columnStyles: {
          0: { halign: 'left' },
          1: { halign: 'center' },
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
        },
        didDrawCell: (data) => {
          // Micro-barra de porcentaje en la columna 4 (% del total)
          if (data.section === 'body' && data.column.index === 4) {
            const d = desgloseTipos[data.row.index];
            const pct = d ? d.pct : 0;
            if (pct > 0) {
              const maxBarW = Math.min(26, data.cell.width * 0.35);
              const barW = Math.min(maxBarW, Math.max(1.5, (pct / 100) * maxBarW));
              const barH = 3.5;
              const bx = data.cell.x + 3.5;
              const by = data.cell.y + (data.cell.height - barH) / 2;
              doc.setFillColor(...NARANJA);
              doc.rect(bx, by, barW, barH, 'F');
            }
          }
        },
      });

      const yFinal2 = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6.5);
      doc.setTextColor(...GRIS_TEXTO);
      doc.text('Suma el consumo de cada tipo de equipo en el período. Rendimiento calculado sobre horas registradas.', M, yFinal2 + 9);
      y = yFinal2 + 16;
    }
  }

  // 6. PIE DE PÁGINA EN TODAS LAS HOJAS (Estandarizado GT)
  const numPaginas = doc.getNumberOfPages();
  for (let i = 1; i <= numPaginas; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BORDE);
    doc.setLineWidth(0.4);
    doc.line(M, H - 18, W - M, H - 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text('Documento generado por el sistema · Control de Combustible · Golden Touch 1127 C.A. · Mina Peramanal', M, H - 8);
    doc.text(`Página ${i} de ${numPaginas}`, W - M, H - 8, { align: 'right' });
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
  const colsAplicables = columnasClaves.filter((c) => esColumnaAplicableModoCombustible(c, meta.agrupacion));
  const columnas = colsAplicables
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

