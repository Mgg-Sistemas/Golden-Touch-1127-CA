/* ============================================================
   Golden Touch · Inventario · Exportación de Reportes (Excel / PDF / CSV)
   (03/11/2026)

   Exportación profesional moldeable del reporte de inventario, calcada de la de
   Tesorería (exportarTesoreria.ts) y adaptada a un solo valor en dólares ($):
   - Excel (ExcelJS): hoja «Resumen» con KPIs (valor/stock o entradas/salidas) y
     Top categorías/almacenes; hoja principal con cabeceras naranjas, totales y
     vista congelada.
   - PDF (jsPDF + autotable): membrete GT, barra naranja, tarjetas de KPIs, y
     dualidad Fichas Ejecutivas vs Tabla Tabular.
   - CSV: plano con BOM UTF-8, delimitador ';' y BLINDAJE anti fórmula.
   ============================================================ */

import { previewExcelArchivo, previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import { identidadEmpresa } from '@/shared/lib/empresa';
import { loadLogoPdfEmpresa, dibujarLogoPdf, anchoLogoPdf } from '@/shared/lib/pdfLogo';
import type {
  FilaReporteInventario,
  ResumenReporteInventario,
  CampoColumnaInventario,
  ModoAgrupacionInventario,
  AmbitoInventario,
  OrdenReporteInventario,
} from './inventarioMoldeable';
import {
  CAMPOS_REPORTE_INVENTARIO,
  ETIQUETA_TIPO_MOV,
  obtenerMetricasFichaInventario,
} from './inventarioMoldeable';

const NARANJA: [number, number, number] = [255, 138, 0];
const VERDE: [number, number, number] = [16, 185, 129];
const ROJO: [number, number, number] = [220, 38, 38];
const AZUL: [number, number, number] = [56, 189, 248];
const TINTA: [number, number, number] = [30, 41, 59];
const BORDE: [number, number, number] = [203, 213, 225];
const FONDO_ALT: [number, number, number] = [250, 246, 240];

const fmtNum = (v: number | null | undefined, dec = 2) =>
  v == null ? '-' : Number(v).toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: dec });

const fmtUsd = (v: number | null | undefined) =>
  v == null ? '-' : `$ ${Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtPct = (v: number | null | undefined) =>
  v == null ? '-' : `${Number(v).toFixed(1)} %`;

const fmtFecha = (f: string) => {
  const [y, m, d] = (f || '').split('-');
  return y && m && d ? `${d}/${m}/${y}` : f || '-';
};

const hoyStr = () => new Date().toISOString().slice(0, 10);

const TITULO_AMBITO: Record<AmbitoInventario, string> = {
  existencias: 'Reporte de existencias de inventario',
  movimientos: 'Movimientos de inventario del período',
};

export interface MetadatosExportacionInventario {
  desde: string;
  hasta: string;
  ambito: AmbitoInventario;
  agrupacion: ModoAgrupacionInventario;
  subtituloFiltros?: string;
  incluirResumen: boolean;
  orientacion?: 'auto' | 'portrait' | 'landscape';
  formatoPresentacion?: 'fichas' | 'tabla';
  ordenarPor?: OrdenReporteInventario;
}

/** Color del borde/acento de una ficha según el ámbito/tipo. */
function colorAcento(f: FilaReporteInventario): [number, number, number] {
  if (f.ambito === 'existencias') return f.bajo_minimo ? ROJO : NARANJA;
  switch (f.tipo_mov) {
    case 'entrada': return VERDE;
    case 'salida':
    case 'consumo': return ROJO;
    case 'traslado': return AZUL;
    default: return NARANJA;
  }
}

/** KPIs del resumen según el ámbito. */
function kpisDeResumen(resumen: ResumenReporteInventario): Array<{ label: string; val: string; sub?: string }> {
  if (resumen.ambito === 'existencias') {
    return [
      { label: 'VALOR TOTAL ($)', val: fmtUsd(resumen.valorTotal), sub: `${resumen.numItems} existencia(s)` },
      { label: 'STOCK TOTAL', val: fmtNum(resumen.stockTotal, 2), sub: 'unidades' },
      { label: 'BAJO MÍNIMO', val: `${resumen.numBajoMinimo}`, sub: 'por reponer' },
      { label: 'PRODUCTOS·ALMACÉN', val: `${resumen.numItems}`, sub: 'renglones' },
    ];
  }
  return [
    { label: 'ENTRADAS', val: fmtNum(resumen.entradas, 2), sub: fmtUsd(resumen.valorEntradas) },
    { label: 'SALIDAS', val: fmtNum(resumen.salidas, 2), sub: fmtUsd(resumen.valorSalidas) },
    { label: 'CONSUMO', val: fmtNum(resumen.consumo, 2), sub: 'unidades' },
    { label: 'TRASLADOS', val: fmtNum(resumen.traslados, 2), sub: `${resumen.totalMovimientos} mov.` },
  ];
}

/** Valor crudo de una columna (resuelve clave→campo de la fila). */
function rawDeColumna(f: FilaReporteInventario, clave: string): unknown {
  switch (clave) {
    case 'costo': return f.costo_promedio;
    case 'tipo_mov': return f.tipo_mov ? ETIQUETA_TIPO_MOV[f.tipo_mov] : null;
    case 'bajo_minimo': return f.ambito === 'existencias' ? (f.bajo_minimo ? 'Sí' : 'No') : null;
    case 'pct_total': return f.pct_del_total;
    default: return (f as unknown as Record<string, unknown>)[clave];
  }
}

/** El número subyacente de una columna numérica (para Excel), o null si no aplica. */
function numeroDeColumna(f: FilaReporteInventario, clave: string): number | null {
  switch (clave) {
    case 'stock': return f.stock;
    case 'cantidad': return f.cantidad;
    case 'costo': return f.costo_promedio;
    case 'valor': return f.valor;
    case 'stock_min': return f.ambito === 'existencias' ? f.stock_min : null;
    case 'pct_total': return f.pct_del_total ?? null;
    default: return null;
  }
}

/** Texto formateado de una celda para PDF/CSV. */
function textoCelda(f: FilaReporteInventario, col: CampoColumnaInventario): string {
  const val = rawDeColumna(f, col.clave);
  if (val == null || val === '') return '-';
  switch (col.formato) {
    case 'moneda': return fmtUsd(Number(val));
    case 'numero': return fmtNum(Number(val), col.clave === 'stock' || col.clave === 'cantidad' || col.clave === 'stock_min' ? 2 : 2);
    case 'porcentaje': return fmtPct(Number(val));
    default:
      if (col.clave === 'fecha') return fmtFecha(String(val));
      return String(val);
  }
}

/** Columnas seleccionadas (en el orden del catálogo), filtradas por el ámbito. */
function columnasVisibles(columnasClaves: string[], ambito: AmbitoInventario): CampoColumnaInventario[] {
  return columnasClaves
    .map((c) => CAMPOS_REPORTE_INVENTARIO.find((col) => col.clave === c))
    .filter((c): c is CampoColumnaInventario => {
      if (!c) return false;
      if (c.ambito && c.ambito !== 'ambos' && c.ambito !== ambito) return false;
      return true;
    });
}

/* ============================================================
   1. EXCEL (ExcelJS)
   ============================================================ */

export async function descargarInventarioExcel(
  filas: FilaReporteInventario[],
  resumen: ResumenReporteInventario,
  columnasClaves: string[],
  meta: MetadatosExportacionInventario,
): Promise<void> {
  const [{ default: ExcelJS }] = await Promise.all([import('exceljs')]);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Golden Touch 1127 C.A.';
  wb.created = new Date();

  const idEmp = identidadEmpresa('GT');
  const columnas = columnasVisibles(columnasClaves, meta.ambito);

  // 1. Hoja Resumen
  if (meta.incluirResumen) {
    const ws = wb.addWorksheet('Resumen', { views: [{ showGridLines: true }] });
    ws.columns = [{ width: 5 }, { width: 28 }, { width: 22 }, { width: 22 }, { width: 22 }];

    ws.mergeCells('B2:E2');
    const r2 = ws.getCell('B2');
    r2.value = `${idEmp.nombre} · RESUMEN DE INVENTARIO`;
    r2.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFF8A00' } };

    ws.mergeCells('B3:E3');
    const r3 = ws.getCell('B3');
    const periodo = meta.ambito === 'movimientos' ? `Período: ${fmtFecha(meta.desde)} al ${fmtFecha(meta.hasta)}` : `Foto a ${fmtFecha(hoyStr())}`;
    r3.value = `${TITULO_AMBITO[meta.ambito]} | ${periodo} | Emitido: ${new Date().toLocaleString('es-VE')}`;
    r3.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF64748B' } };

    const kpis = kpisDeResumen(resumen);
    kpis.slice(0, 4).forEach((k, i) => {
      const colLetter = String.fromCharCode(66 + i);
      const label = ws.getCell(`${colLetter}5`);
      label.value = k.label;
      label.font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF475569' } };
      label.alignment = { horizontal: 'center', vertical: 'middle' };
      label.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      const val = ws.getCell(`${colLetter}6`);
      val.value = k.val;
      val.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFF8A00' } };
      val.alignment = { horizontal: 'center', vertical: 'middle' };
      const bordeFino = { style: 'thin' as const, color: { argb: 'FFCBD5E1' } };
      ['5', '6'].forEach((rowNum) => {
        ws.getCell(`${colLetter}${rowNum}`).border = {
          left: bordeFino, right: bordeFino,
          top: rowNum === '5' ? bordeFino : undefined,
          bottom: rowNum === '6' ? bordeFino : undefined,
        };
      });
    });

    // Top categorías / almacenes (por valor)
    ws.getCell('B8').value = 'TOP CATEGORÍAS (POR VALOR)';
    ws.getCell('B8').font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1E293B' } };
    const headTop = ws.getRow(9);
    headTop.getCell(2).value = '#';
    headTop.getCell(3).value = 'Categoría';
    headTop.getCell(4).value = 'Valor ($)';
    headTop.getCell(5).value = '% del Total';
    for (let c = 2; c <= 5; c++) {
      headTop.getCell(c).font = { name: 'Arial', size: 8.5, bold: true, color: { argb: 'FFFFFFFF' } };
      headTop.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF8A00' } };
      headTop.getCell(c).alignment = { horizontal: c === 3 ? 'left' : 'center' };
    }
    resumen.topCategorias.forEach((tc, idx) => {
      const r = ws.getRow(10 + idx);
      r.getCell(2).value = idx + 1;
      r.getCell(3).value = tc.nombre;
      r.getCell(4).value = tc.valor;
      r.getCell(4).numFmt = '"$"#,##0.00';
      r.getCell(5).value = tc.porcentaje / 100;
      r.getCell(5).numFmt = '0.0%';
      for (let c = 2; c <= 5; c++) {
        r.getCell(c).font = { name: 'Arial', size: 8.5, color: { argb: 'FF334155' } };
        r.getCell(c).border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
      }
    });

    const baseAlm = 10 + resumen.topCategorias.length + 1;
    ws.getCell(`B${baseAlm}`).value = 'TOP ALMACENES (POR VALOR)';
    ws.getCell(`B${baseAlm}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1E293B' } };
    resumen.topAlmacenes.forEach((ta, idx) => {
      const r = ws.getRow(baseAlm + 1 + idx);
      r.getCell(2).value = idx + 1;
      r.getCell(3).value = ta.nombre;
      r.getCell(4).value = ta.valor;
      r.getCell(4).numFmt = '"$"#,##0.00';
      r.getCell(5).value = ta.porcentaje / 100;
      r.getCell(5).numFmt = '0.0%';
      for (let c = 2; c <= 5; c++) r.getCell(c).font = { name: 'Arial', size: 8.5, color: { argb: 'FF334155' } };
    });
  }

  // 2. Hoja de datos
  const orient = meta.orientacion === 'portrait' ? 'portrait' : meta.orientacion === 'landscape' ? 'landscape' : columnas.length > 7 ? 'landscape' : 'portrait';
  const ws = wb.addWorksheet('Inventario', {
    pageSetup: { orientation: orient, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: 'frozen', ySplit: 5 }],
  });
  ws.columns = [{ width: 4 }, ...columnas.map((c) => ({ width: Math.max(c.anchoExcel, c.etiqueta.length + 4) }))];

  ws.mergeCells(2, 2, 2, columnas.length + 1);
  const tit = ws.getCell(2, 2);
  tit.value = `${idEmp.nombre} · ${TITULO_AMBITO[meta.ambito].toUpperCase()}`;
  tit.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFF8A00' } };

  ws.mergeCells(3, 2, 3, columnas.length + 1);
  const sub = ws.getCell(3, 2);
  const periodo = meta.ambito === 'movimientos' ? `Período: ${fmtFecha(meta.desde)} al ${fmtFecha(meta.hasta)}` : `Foto a ${fmtFecha(hoyStr())}`;
  sub.value = `${periodo} | Agrupación: ${meta.agrupacion.toUpperCase()}${meta.subtituloFiltros ? ` | ${meta.subtituloFiltros}` : ''}`;
  sub.font = { name: 'Arial', size: 8.5, italic: true, color: { argb: 'FF64748B' } };

  const headerRow = ws.getRow(5);
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

  filas.forEach((f, fIdx) => {
    const r = ws.getRow(6 + fIdx);
    r.height = 18;
    const esPar = fIdx % 2 === 1;
    columnas.forEach((col, cIdx) => {
      const cell = r.getCell(cIdx + 2);
      if (col.formato === 'moneda' || col.formato === 'numero') {
        const n = numeroDeColumna(f, col.clave);
        cell.value = n ?? 0;
        cell.numFmt = col.formato === 'moneda' ? '"$"#,##0.00' : '#,##0.00';
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
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });
  });

  // Totales (suma de las filas mostradas)
  const totValor = filas.reduce((a, f) => a + (f.valor || 0), 0);
  const totStock = filas.reduce((a, f) => a + (f.stock ?? 0), 0);
  const totCant = filas.reduce((a, f) => a + (f.cantidad ?? 0), 0);
  const totRow = ws.getRow(6 + filas.length);
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
    } else if (col.clave === 'valor') {
      cell.value = totValor; cell.numFmt = '"$"#,##0.00';
    } else if (col.clave === 'stock') {
      cell.value = totStock; cell.numFmt = '#,##0.00';
    } else if (col.clave === 'cantidad') {
      cell.value = totCant; cell.numFmt = '#,##0.00';
    }
  });

  const bytes = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  await previewExcelArchivo(bytes, `inventario-${meta.ambito}-${hoyStr()}.xlsx`);
}

/* ============================================================
   2. PDF (jsPDF + autotable)
   ============================================================ */

export async function descargarInventarioPdf(
  filas: FilaReporteInventario[],
  resumen: ResumenReporteInventario,
  columnasClaves: string[],
  meta: MetadatosExportacionInventario,
): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const columnas = columnasVisibles(columnasClaves, meta.ambito);
  if (!columnas.length) throw new Error('Selecciona al menos una columna.');
  if (!filas.length) throw new Error('No hay datos de inventario para el ámbito seleccionado.');

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
  const titLineas = doc.splitTextToSize(TITULO_AMBITO[meta.ambito], anchoTexto) as string[];
  doc.text(titLineas, tx, y + 14);

  let yy = y + 14 + (titLineas.length - 1) * 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  const periodo = meta.ambito === 'movimientos' ? `Período: ${fmtFecha(meta.desde)} al ${fmtFecha(meta.hasta)}` : `Foto a ${fmtFecha(hoyStr())}`;
  const subLineas = doc.splitTextToSize(
    `${idEmp.nombre} · RIF ${idEmp.rif} · ${periodo} · Agrupado por: ${meta.agrupacion.toUpperCase()} · ${filas.length} registros`,
    anchoTexto,
  ) as string[];
  doc.text(subLineas, tx, yy + 12);
  yy += 12 + (subLineas.length - 1) * 10;

  y = Math.max(y + cajaLogo + 6, yy + 14);
  doc.setDrawColor(...NARANJA);
  doc.setLineWidth(1.4);
  doc.line(M, y, W - M, y);
  y += 12;

  // 2. Tarjetas de KPIs
  if (meta.incluirResumen) {
    const cards = kpisDeResumen(resumen).slice(0, 4);
    if (cards.length > 0) {
      const cardGap = 8;
      const cardW = (UW - cardGap * (cards.length - 1)) / cards.length;
      const cardH = 38;
      cards.forEach((k, i) => {
        const cx = M + i * (cardW + cardGap);
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(...BORDE);
        doc.setLineWidth(0.6);
        doc.roundedRect(cx, y, cardW, cardH, 4, 4, 'FD');
        doc.setFillColor(...NARANJA);
        doc.rect(cx, y + 1, 3, cardH - 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(71, 85, 105);
        doc.text(pdfSafe(k.label), cx + 8, y + 10);
        doc.setFontSize(11);
        doc.setTextColor(...NARANJA);
        doc.text(pdfSafe(k.val), cx + 8, y + 24);
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

  // 3. Fichas vs Tabla
  if (esFichas) {
    const cols = orient === 'landscape' ? 2 : 1;
    const cardGap = 10;
    const cardW = (UW - (cols - 1) * cardGap) / cols;
    const cardH = orient === 'landscape' ? 72 : 66;

    for (let i = 0; i < filas.length; i += cols) {
      if (y + cardH > H - 36) { doc.addPage(); y = 36; }
      for (let c = 0; c < cols; c++) {
        const f = filas[i + c];
        if (!f) break;
        const cx = M + c * (cardW + cardGap);
        const cy = y;
        const acento = colorAcento(f);

        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(...BORDE);
        doc.setLineWidth(0.6);
        doc.roundedRect(cx, cy, cardW, cardH, 4, 4, 'FD');
        doc.setFillColor(...acento);
        doc.rect(cx, cy + 1, 3.5, cardH - 2, 'F');

        // Badge: % del total + etiqueta del ámbito/tipo
        const etiquetaTipo = f.ambito === 'movimientos' && f.tipo_mov ? ETIQUETA_TIPO_MOV[f.tipo_mov] : (f.bajo_minimo ? 'Bajo mínimo' : 'Existencia');
        const txtPct = f.pct_del_total != null ? `${f.pct_del_total.toFixed(1)}% · ${etiquetaTipo}` : etiquetaTipo;
        const txtSubBadge = f.ambito === 'movimientos' ? pdfSafe(f.fecha ? fmtFecha(f.fecha) : '') : pdfSafe(f.almacen || '');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        const w1 = doc.getTextWidth(txtPct);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.5);
        const w2 = doc.getTextWidth(txtSubBadge);
        const badgeW = Math.min(cardW * 0.44, Math.max(90, Math.max(w1, w2) + 12));
        const badgeH = 15;
        const bx = cx + cardW - badgeW - 6;
        const by = cy + 4;

        const [ar, ag, ab] = acento;
        doc.setFillColor(Math.min(255, ar + 180), Math.min(255, ag + 70), Math.min(255, ab + 60));
        doc.roundedRect(bx, by, badgeW, badgeH, 3, 3, 'F');

        let fontPct = 6.8;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(fontPct);
        doc.setTextColor(...acento);
        while (doc.getTextWidth(txtPct) > badgeW - 6 && fontPct > 5.4) { fontPct -= 0.2; doc.setFontSize(fontPct); }
        doc.text(txtPct, bx + badgeW / 2, by + 5.8, { align: 'center' });

        let fontSub = 5.5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(fontSub);
        doc.setTextColor(100, 116, 139);
        while (doc.getTextWidth(txtSubBadge) > badgeW - 6 && fontSub > 4.4) { fontSub -= 0.2; doc.setFontSize(fontSub); }
        doc.text(txtSubBadge, bx + badgeW / 2, by + 11.5, { align: 'center' });

        // Título: nombre del producto (o etiqueta del grupo)
        const maxTitleW = Math.max(60, (bx - 8) - (cx + 10));
        const tituloBase = f.nombre || f.categoria || 'Sin clasificar';
        const titulo = pdfSafe(tituloBase);
        let titleFontSize = 9.5;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(titleFontSize);
        while (doc.getTextWidth(titulo) > maxTitleW && titleFontSize > 7.4) { titleFontSize -= 0.3; doc.setFontSize(titleFontSize); }
        let titleFinal = titulo;
        if (doc.getTextWidth(titleFinal) > maxTitleW) {
          while (titleFinal.length > 3 && doc.getTextWidth(titleFinal + '…') > maxTitleW) titleFinal = titleFinal.slice(0, -1);
          titleFinal += '…';
        }
        doc.setTextColor(...TINTA);
        doc.text(titleFinal, cx + 10, cy + 13);

        // Subtítulo: sku · categoría · almacén · sede
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.2);
        doc.setTextColor(100, 116, 139);
        const partes = [
          f.sku && f.sku !== '—' && f.sku !== tituloBase ? f.sku : null,
          f.categoria && f.categoria !== tituloBase ? f.categoria : null,
          f.almacen || null,
          f.sede && f.sede !== f.almacen ? f.sede : null,
        ].filter(Boolean);
        const metaTxt = pdfSafe(partes.join(' · ') || 'Inventario');
        const maxMetaW = cardW - 20;
        let metaFinal = metaTxt;
        if (doc.getTextWidth(metaFinal) > maxMetaW) {
          while (metaFinal.length > 3 && doc.getTextWidth(metaFinal + '…') > maxMetaW) metaFinal = metaFinal.slice(0, -1);
          metaFinal += '…';
        }
        doc.text(metaFinal, cx + 10, cy + 24);

        doc.setDrawColor(241, 245, 249);
        doc.setLineWidth(0.5);
        doc.line(cx + 8, cy + 29, cx + cardW - 8, cy + 29);

        // Métricas dinámicas
        const metricas = obtenerMetricasFichaInventario(f, columnasClaves);
        const innerW = cardW - 16;
        const colW = innerW / Math.max(1, metricas.length);
        const my = cy + 39;
        metricas.forEach((m, idx) => {
          const mx = cx + 8 + colW * idx;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.2);
          doc.setTextColor(71, 85, 105);
          doc.text(pdfSafe(m.etiqueta), mx, my);
          doc.setFontSize(9.5);
          doc.setTextColor(...m.colorRgb);
          const valFit = doc.splitTextToSize(pdfSafe(m.valor), colW - 4) as string[];
          doc.text(valFit[0] ?? '', mx, my + 13);
          if (m.sub) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.0);
            doc.setTextColor(148, 163, 184);
            const subFit = doc.splitTextToSize(pdfSafe(m.sub), colW - 4) as string[];
            doc.text(subFit[0] ?? '', mx, my + 23);
          }
        });
      }
      y += cardH + cardGap;
    }
  } else {
    const headCols = columnas.map((c) => pdfSafe(c.etiqueta));
    const bodyRows = filas.map((f) => columnas.map((c) => pdfSafe(textoCelda(f, c))));

    const totValor = filas.reduce((a, f) => a + (f.valor || 0), 0);
    const totStock = filas.reduce((a, f) => a + (f.stock ?? 0), 0);
    const totCant = filas.reduce((a, f) => a + (f.cantidad ?? 0), 0);
    const footRow = columnas.map((col, idx) => {
      if (idx === 0) return 'TOTALES';
      if (col.clave === 'valor') return fmtUsd(totValor);
      if (col.clave === 'stock') return fmtNum(totStock, 2);
      if (col.clave === 'cantidad') return fmtNum(totCant, 2);
      return '';
    });

    const columnStyles: Record<number, { halign: 'left' | 'right' | 'center' }> = {};
    columnas.forEach((col, idx) => { columnStyles[idx] = { halign: col.alineacion }; });
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
        lineColor: BORDE, lineWidth: 0.3, textColor: TINTA, overflow: 'linebreak', valign: 'middle',
      },
      headStyles: { fillColor: NARANJA, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
      footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: FONDO_ALT },
      columnStyles,
    });
  }

  // 4. Pies de página
  const numPaginas = doc.getNumberOfPages();
  for (let i = 1; i <= numPaginas; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BORDE);
    doc.setLineWidth(0.4);
    doc.line(M, H - 18, W - M, H - 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`${idEmp.nombre} · RIF ${idEmp.rif} · Inventario (${meta.ambito})`, M, H - 9);
    doc.text(`Página ${i} de ${numPaginas}`, W - M, H - 9, { align: 'right' });
  }

  previewPdf(doc, `inventario-${meta.ambito}-${hoyStr()}.pdf`);
}

/* ============================================================
   3. CSV
   ============================================================ */

export function descargarInventarioCsv(
  filas: FilaReporteInventario[],
  columnasClaves: string[],
  meta: MetadatosExportacionInventario,
): void {
  const columnas = columnasVisibles(columnasClaves, meta.ambito);
  if (!columnas.length) throw new Error('Selecciona al menos una columna.');
  if (!filas.length) throw new Error('No hay datos para exportar.');

  const escapar = (val: unknown) => {
    let s = String(val ?? '');
    // Anti «CSV formula injection»: si el texto empieza por un carácter que
    // Excel/Sheets interpretarían como fórmula (= + - @ o tab/retorno), se le
    // antepone una comilla simple para que quede como TEXTO. El nombre, la
    // categoría, el destino, etc. son texto libre que pudo escribir cualquiera.
    // Las columnas numéricas se formatean aparte y no pasan por aquí.
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

  const csvContent = '﻿' + lineas.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `inventario-${meta.ambito}-${hoyStr()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
