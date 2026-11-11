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
   (Actualizado 11/11/2026: Formato editorial de alta fidelidad con
    híbrido de fichas ejecutivas y tablas autoTable, membrete dual
    institucional GT, caja de metadatos, cintillo de alcance,
    tarjetas de KPIs con pestaña de color superior, ranking
    departamental con mini-barras de progreso y tablas analíticas
    estructuradas para compras directas y cotizaciones)
   ============================================================ */

/** Helper para dibujar el encabezado formal de sección con acento vertical naranja */
function dibujarHeaderSeccion(
  doc: jsPDF,
  titulo: string,
  subtitulo: string | null,
  M: number,
  y: number,
  NARANJA: [number, number, number],
  TINTA: [number, number, number],
  GRIS_TEXTO: [number, number, number],
): number {
  doc.setFillColor(...NARANJA);
  doc.rect(M, y, 3.5, 10, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...TINTA);
  doc.text(pdfSafe(titulo), M + 7, y + 8);

  if (subtitulo) {
    const titleW = doc.getTextWidth(pdfSafe(titulo));
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(pdfSafe(subtitulo), M + 7 + titleW + 8, y + 8);
  }

  return y + 14;
}

export async function construirComprasPdf(
  filas: FilaReporteCompras[],
  resumen: ResumenReporteCompras,
  columnasClaves: string[],
  meta: MetadatosExportacionCompras,
): Promise<jsPDF> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const columnas = columnasVisibles(columnasClaves, meta);
  const orient =
    meta.orientacion === 'portrait'
      ? 'portrait'
      : meta.orientacion === 'landscape'
        ? 'landscape'
        : columnas.length > 6
          ? 'landscape'
          : 'portrait';

  const esLandscape = orient === 'landscape';
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: orient });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const MARGIN = esLandscape ? 32 : 28;
  const UW = PAGE_W - MARGIN * 2;
  let y = MARGIN;

  const idEmp = identidadEmpresa('GT');
  const logo = await loadLogoPdfEmpresa('GT').catch(() => null);

  // Paleta corporativa Golden Touch
  const NARANJA_GT: [number, number, number] = [255, 138, 0];
  const VERDE_GT: [number, number, number] = [22, 101, 52];
  const AZUL_GT: [number, number, number] = [2, 132, 199];
  const AMBAR_GT: [number, number, number] = [245, 158, 11];
  const TINTA_GT: [number, number, number] = [30, 41, 59];
  const GRIS_TEXTO_GT: [number, number, number] = [100, 116, 139];
  const GRIS_CLARO_GT: [number, number, number] = [148, 163, 184];
  const BORDE_GT: [number, number, number] = [226, 232, 240];
  const FONDO_SUAVE_GT: [number, number, number] = [250, 247, 245];
  const FONDO_ALT_GT: [number, number, number] = [254, 252, 248];

  const colores = {
    NARANJA: NARANJA_GT,
    VERDE: VERDE_GT,
    AZUL: AZUL_GT,
    AMBAR: AMBAR_GT,
    TINTA: TINTA_GT,
    GRIS_TEXTO: GRIS_TEXTO_GT,
    GRIS_CLARO: GRIS_CLARO_GT,
    BORDE: BORDE_GT,
    FONDO_SUAVE: FONDO_SUAVE_GT,
    FONDO_ALT: FONDO_ALT_GT,
  };

  // Fecha y hora formateada en español
  const ahoraDate = new Date();
  const meses = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'];
  const dia = ahoraDate.getDate();
  const mes = meses[ahoraDate.getMonth()];
  const anio = ahoraDate.getFullYear();
  let h = ahoraDate.getHours();
  const mMin = String(ahoraDate.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'p. m.' : 'a. m.';
  h = h % 12 || 12;
  const fechaHoraEmision = `${dia} ${mes} ${anio}, ${h}:${mMin} ${ampm}`;

  // 1. MEMBRETE DUAL INSTITUCIONAL (Identidad GT + Caja de Metadatos)
  const cajaLogo = esLandscape ? 40 : 38;
  if (logo) {
    dibujarLogoPdf(doc, logo, MARGIN, y, cajaLogo);
  }
  const tx = logo ? MARGIN + anchoLogoPdf(cajaLogo) + 12 : MARGIN;

  // Lado izquierdo: datos corporativos GT
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(esLandscape ? 11 : 10.5);
  doc.setTextColor(...TINTA_GT);
  doc.text(idEmp.nombre || 'MINERA GOLDEN TOUCH 1127, C.A.', tx, y + 11);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(...GRIS_TEXTO_GT);
  doc.text('EXPLOTACIÓN Y BENEFICIO DE MINERALES', tx, y + 21);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.0);
  doc.setTextColor(...GRIS_TEXTO_GT);
  doc.text(`RIF: ${idEmp.rif || 'J-50129993-5'} · Mina Peramanal`, tx, y + 30);

  doc.setFontSize(6.8);
  doc.setTextColor(...GRIS_CLARO_GT);
  doc.text('EL CALLAO · ESTADO BOLÍVAR · VENEZUELA', tx, y + 38);

  // Lado derecho: Caja ejecutiva formal de metadatos del reporte
  const boxW = Math.min(235, Math.max(195, UW * 0.36));
  const boxH = 46;
  const bx = PAGE_W - MARGIN - boxW;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...BORDE_GT);
  doc.setLineWidth(0.6);
  doc.roundedRect(bx, y, boxW, boxH, 3, 3, 'FD');

  const barH = 14;
  doc.setFillColor(...NARANJA_GT);
  doc.roundedRect(bx, y, boxW, barH, 3, 3, 'F');
  doc.rect(bx, y + barH - 3, boxW, 3, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(255, 255, 255);
  doc.text('REPORTE DE COMPRAS', bx + boxW / 2, y + 10, { align: 'center' });

  // Filas internas alineadas
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...GRIS_TEXTO_GT);
  doc.text('EMITIDO:', bx + 8, y + 23);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TINTA_GT);
  doc.text(fechaHoraEmision, bx + 52, y + 23);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...GRIS_TEXTO_GT);
  doc.text('PERÍODO:', bx + 8, y + 32);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TINTA_GT);
  let perTxt = pdfSafe(`${fmtFecha(meta.desde)} al ${fmtFecha(meta.hasta)}`);
  if (doc.getTextWidth(perTxt) > boxW - 58) {
    while (perTxt.length > 3 && doc.getTextWidth(perTxt + '…') > boxW - 58) {
      perTxt = perTxt.slice(0, -1);
    }
    perTxt += '…';
  }
  doc.text(perTxt, bx + 52, y + 32);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...GRIS_TEXTO_GT);
  doc.text('ALCANCE:', bx + 8, y + 41);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TINTA_GT);
  doc.text(`${resumen.totalCompras} compras (${filas.length} en listado)`, bx + 52, y + 41);

  y = Math.max(y + cajaLogo + 6, y + boxH + 8);

  // 2. CINTILLO DE ALCANCE DEL REPORTE (A todo el ancho útil)
  const stripH = 17;
  doc.setFillColor(...FONDO_SUAVE_GT);
  doc.setDrawColor(...BORDE_GT);
  doc.setLineWidth(0.5);
  doc.roundedRect(MARGIN, y, UW, stripH, 2.5, 2.5, 'FD');

  doc.setFillColor(...NARANJA_GT);
  doc.roundedRect(MARGIN, y, 3.5, stripH, 2.5, 2.5, 'F');
  doc.rect(MARGIN + 2, y, 1.5, stripH, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.0);
  doc.setTextColor(...NARANJA_GT);
  doc.text('ALCANCE DEL REPORTE:', MARGIN + 8, y + 11.5);
  const alcW = doc.getTextWidth('ALCANCE DEL REPORTE:');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.0);
  doc.setTextColor(...TINTA_GT);
  const descFiltros = meta.subtituloFiltros ? ` · Filtros: ${meta.subtituloFiltros}` : '';
  const textoAlcance = pdfSafe(
    `Ámbito: ${meta.ambito.toUpperCase()} · Agrupación: ${meta.agrupacion.toUpperCase()} · Formato: ${meta.formato.toUpperCase()} · Tasa BCV: Bs ${fmtNum(meta.tasaBcv)}/$${descFiltros}`,
  );
  doc.text(textoAlcance, MARGIN + 8 + alcW + 5, y + 11.5);

  y += stripH + 8;

  // 3. TARJETAS DE KPIS SUPERIORES (con pestaña superior de color)
  const cardGap = 6;
  const numKpis = 4;
  const cardW = (UW - cardGap * (numKpis - 1)) / numKpis;
  const cardH = esLandscape ? 38 : 39;

  const kpis = [
    {
      titulo: 'TOTAL DE COMPRAS',
      valor: `${fmtNum(resumen.totalCompras, 0)}`,
      sub: `${fmtUsd(resumen.totalUsd)} · ${fmtBs(resumen.totalBs)}`,
      colorTab: NARANJA_GT,
    },
    {
      titulo: 'COMPRAS FINALIZADAS',
      valor: `${fmtNum(resumen.finalizadasCount, 0)}`,
      sub: `${fmtUsd(resumen.finalizadasUsd)} · ${fmtBs(resumen.finalizadasBs)}`,
      colorTab: VERDE_GT,
    },
    {
      titulo: 'COMPRAS PENDIENTES',
      valor: `${fmtNum(resumen.pendientesCount, 0)}`,
      sub: `${fmtUsd(resumen.pendientesUsd)} · ${fmtBs(resumen.pendientesBs)}`,
      colorTab: AMBAR_GT,
    },
    {
      titulo: 'TOTAL PAGADO / ABONADO',
      valor: fmtUsd(resumen.pagadoUsd),
      sub: `${fmtBs(resumen.pagadoBs)}${resumen.deptoQueMasGasto ? ` · Mayor gasto: ${resumen.deptoQueMasGasto}` : ''}`,
      colorTab: AZUL_GT,
    },
  ];

  kpis.forEach((kpi, idx) => {
    const kx = MARGIN + idx * (cardW + cardGap);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...BORDE_GT);
    doc.setLineWidth(0.6);
    doc.roundedRect(kx, y, cardW, cardH, 2.5, 2.5, 'FD');

    // Pestaña superior de color
    doc.setFillColor(...kpi.colorTab);
    doc.roundedRect(kx, y, cardW, 2.5, 1, 1, 'F');

    // Título de la tarjeta
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(...GRIS_TEXTO_GT);
    doc.text(pdfSafe(kpi.titulo), kx + 6, y + 10);

    // Valor prominente
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(esLandscape ? 10.5 : 9.5);
    doc.setTextColor(...TINTA_GT);
    doc.text(pdfSafe(kpi.valor), kx + 6, y + (esLandscape ? 21.5 : 21));

    // Subtítulo
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(esLandscape ? 5.8 : 5.4);
    doc.setTextColor(...GRIS_CLARO_GT);
    let subTxt = pdfSafe(kpi.sub);
    if (doc.getTextWidth(subTxt) > cardW - 12) {
      while (subTxt.length > 3 && doc.getTextWidth(subTxt + '…') > cardW - 12) {
        subTxt = subTxt.slice(0, -1);
      }
      subTxt += '…';
    }
    doc.text(subTxt, kx + 6, y + (esLandscape ? 30.5 : 30));
  });

  y += cardH + 12;

  let seccionNum = 1;

  // 4. ANALÍTICA (Resumen e Híbrido)
  if (incluyeResumen(meta)) {
    const resBloque = bloqueResumenPdf(
      doc,
      autoTable,
      resumen,
      meta,
      MARGIN,
      UW,
      PAGE_W,
      PAGE_H,
      y,
      esLandscape,
      colores,
      seccionNum,
    );
    y = resBloque.y;
    seccionNum = resBloque.siguienteSeccion;
  }

  // 5. LISTADO DETALLADO (Detallado e Híbrido)
  if (incluyeDetalle(meta) && columnas.length && filas.length) {
    if (y + 60 > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
    y = dibujarHeaderSeccion(
      doc,
      `${seccionNum++}. Listado Detallado de Compras (${filas.length} registros)`,
      `Ámbito: ${meta.ambito.toUpperCase()} · Agrupación: ${meta.agrupacion.toUpperCase()} · Monedas: ${meta.mostrarUsd ? 'USD ' : ''}${meta.mostrarBs ? 'Bs' : ''}`,
      MARGIN,
      y,
      NARANJA_GT,
      TINTA_GT,
      GRIS_TEXTO_GT,
    );

    const headCols = columnas.map((c) => pdfSafe(c.etiqueta));
    const bodyRows = filas.map((f) => columnas.map((c) => pdfSafe(textoCelda(f, c))));
    const totUsd = filas.reduce((a, f) => a + (f.monto_usd || 0), 0);
    const totBs = filas.reduce((a, f) => a + (f.monto_bs || 0), 0);
    const totCant = filas.reduce((a, f) => a + (f.cantidad || 0), 0);

    const footRow = columnas.map((col, idx) => {
      if (idx === 0) return 'TOTALES';
      if (col.clave === 'monto_usd') return fmtUsd(totUsd);
      if (col.clave === 'monto_bs') return fmtBs(totBs);
      if (col.clave === 'cantidad') return `${fmtNum(totCant, 2)} u.`;
      return '';
    });

    const columnStyles: Record<number, { halign: 'left' | 'right' | 'center'; fontStyle?: 'bold' | 'normal' }> = {};
    columnas.forEach((col, idx) => {
      columnStyles[idx] = {
        halign: col.alineacion,
        fontStyle: col.clave === 'monto_usd' || col.clave === 'codigo' ? 'bold' : 'normal',
      };
    });

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, bottom: 24 },
      head: [headCols],
      body: bodyRows,
      foot: [footRow],
      theme: 'grid',
      styles: {
        fontSize: esLandscape ? 7.2 : 6.6,
        cellPadding: esLandscape ? 2.4 : 1.8,
        lineColor: BORDE_GT,
        lineWidth: 0.3,
        textColor: TINTA_GT,
        overflow: 'linebreak',
        valign: 'middle',
      },
      headStyles: {
        fillColor: NARANJA_GT,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
        fontSize: esLandscape ? 7.2 : 6.6,
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: TINTA_GT,
        fontStyle: 'bold',
        fontSize: esLandscape ? 7.2 : 6.6,
      },
      alternateRowStyles: { fillColor: FONDO_ALT_GT },
      columnStyles,
    });

    const lastTableDet = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    y = (lastTableDet?.finalY ?? y) + 4;
  }

  // 6. PIES DE PÁGINA FORMALES MULTIPÁGINA
  const numPaginas = doc.getNumberOfPages();
  for (let i = 1; i <= numPaginas; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BORDE_GT);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, PAGE_H - (esLandscape ? 20 : 18), PAGE_W - MARGIN, PAGE_H - (esLandscape ? 20 : 18));
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(esLandscape ? 7.0 : 6.5);
    doc.setTextColor(...GRIS_TEXTO_GT);
    doc.text(
      `Documento generado por el sistema · Reporte de Compras · ${idEmp.nombre} · RIF ${idEmp.rif}`,
      MARGIN,
      PAGE_H - (esLandscape ? 10 : 9),
    );
    doc.text(
      `Página ${i} de ${numPaginas}`,
      PAGE_W - MARGIN,
      PAGE_H - (esLandscape ? 10 : 9),
      { align: 'right' },
    );
  }

  return doc;
}

/**
 * Bloque de analítica (tarjetas de top departamentos y tablas estructuradas
 * de rankings, compras directas, cotizaciones y tops de conceptos).
 */
function bloqueResumenPdf(
  doc: jsPDF,
  autoTable: typeof import('jspdf-autotable').default,
  r: ResumenReporteCompras,
  _meta: MetadatosExportacionCompras,
  M: number,
  UW: number,
  _PAGE_W: number,
  PAGE_H: number,
  y0: number,
  esLandscape: boolean,
  colores: {
    NARANJA: [number, number, number];
    VERDE: [number, number, number];
    AZUL: [number, number, number];
    AMBAR: [number, number, number];
    TINTA: [number, number, number];
    GRIS_TEXTO: [number, number, number];
    GRIS_CLARO: [number, number, number];
    BORDE: [number, number, number];
    FONDO_ALT: [number, number, number];
    FONDO_SUAVE: [number, number, number];
  },
  seccionInicial = 1,
): { y: number; siguienteSeccion: number } {
  let y = y0;
  let seccionNum = seccionInicial;

  // 1. Tarjetas híbridas de departamentos destacados (Top Gasto)
  const topDeptos = r.rankingDeptoGasto.slice(0, 6);
  if (topDeptos.length > 0) {
    if (y + 55 > PAGE_H - M) {
      doc.addPage();
      y = M;
    }
    y = dibujarHeaderSeccion(
      doc,
      'DISTRIBUCIÓN PUNTUAL POR DEPARTAMENTO · TOP GASTO',
      'Unidades solicitantes con mayor volumen presupuestario en el período',
      M,
      y,
      colores.NARANJA,
      colores.TINTA,
      colores.GRIS_TEXTO,
    );

    const colsFichas = esLandscape
      ? topDeptos.length <= 3
        ? topDeptos.length
        : 3
      : topDeptos.length <= 2
        ? topDeptos.length
        : 2;

    const cardGap = 6;
    const cardW = (UW - (colsFichas - 1) * cardGap) / colsFichas;
    const cardH = esLandscape ? 38 : 39;

    topDeptos.forEach((d, idx) => {
      const col = idx % colsFichas;
      const row = Math.floor(idx / colsFichas);
      const cardX = M + col * (cardW + cardGap);
      const cardY = y + row * (cardH + cardGap);

      // Tarjeta con fondo blanco y borde suave
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...colores.BORDE);
      doc.setLineWidth(0.6);
      doc.roundedRect(cardX, cardY, cardW, cardH, 2.5, 2.5, 'FD');

      // Acento vertical izquierdo naranja
      doc.setFillColor(...colores.NARANJA);
      doc.rect(cardX, cardY, 2.5, cardH, 'F');

      // Fila 1: Nombre del departamento y Badge de %
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(esLandscape ? 7.2 : 6.8);
      doc.setTextColor(15, 23, 42);
      const maxLen = esLandscape ? 22 : 18;
      const nombreTruncado =
        d.departamento.length > maxLen
          ? d.departamento.slice(0, maxLen - 2) + '…'
          : d.departamento;
      doc.text(pdfSafe(nombreTruncado.toUpperCase()), cardX + 7, cardY + 9.5);

      // Badge a la derecha
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.0);
      doc.setTextColor(...colores.GRIS_TEXTO);
      doc.text(`${d.pct.toFixed(1)}%`, cardX + cardW - 6, cardY + 9.5, { align: 'right' });

      // Fila 2: Saldo en dólares prominente y valor en bolívares en verde
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(esLandscape ? 10.5 : 10.0);
      doc.setTextColor(...colores.NARANJA);
      doc.text(fmtUsd(d.usd), cardX + 7, cardY + (esLandscape ? 21 : 20.5));

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(esLandscape ? 7.5 : 7.0);
      doc.setTextColor(...colores.VERDE);
      let bsTxt = fmtBs(d.bs);
      if (doc.getTextWidth(bsTxt) > cardW * 0.48) {
        doc.setFontSize(esLandscape ? 6.5 : 6.0);
      }
      doc.text(bsTxt, cardX + cardW - 6, cardY + (esLandscape ? 20.5 : 20.0), { align: 'right' });

      // Fila 3: Detalle técnico inferior
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(esLandscape ? 5.8 : 5.4);
      doc.setTextColor(...colores.GRIS_TEXTO);
      doc.text('Gasto operativo consolidado', cardX + 7, cardY + (esLandscape ? 30 : 29.5));

      doc.text(
        `Participación: ${d.pct.toFixed(1)}%`,
        cardX + cardW - 6,
        cardY + (esLandscape ? 30 : 29.5),
        { align: 'right' },
      );

      // Mini-barra de progreso de participación en la base de la ficha
      const barY = cardY + cardH - 3;
      const barMaxW = cardW - 14;
      doc.setFillColor(241, 245, 249);
      doc.rect(cardX + 7, barY, barMaxW, 1.8, 'F');

      const barFillW = Math.max(1, Math.min(barMaxW, (d.pct / 100) * barMaxW));
      doc.setFillColor(...colores.NARANJA);
      doc.rect(cardX + 7, barY, barFillW, 1.8, 'F');
    });

    const totalFichasRows = Math.ceil(topDeptos.length / colsFichas);
    y += totalFichasRows * (cardH + cardGap) + 10;
  }

  // 2. Tabla de Ranking Consolidado de Departamentos por Gasto
  if (y + 60 > PAGE_H - M) {
    doc.addPage();
    y = M;
  }
  y = dibujarHeaderSeccion(
    doc,
    `${seccionNum++}. Ranking de Departamentos por Gasto`,
    'Distribución presupuestaria por unidad solicitante',
    M,
    y,
    colores.NARANJA,
    colores.TINTA,
    colores.GRIS_TEXTO,
  );

  const totDeptoUsd = r.rankingDeptoGasto.reduce((acc, d) => acc + (d.usd || 0), 0);
  const totDeptoBs = r.rankingDeptoGasto.reduce((acc, d) => acc + (d.bs || 0), 0);

  const bodyRanking = r.rankingDeptoGasto.map((d, idx) => [
    String(idx + 1),
    pdfSafe(d.departamento),
    fmtUsd(d.usd),
    fmtBs(d.bs),
    `${d.pct.toFixed(1)} %`,
  ]);

  if (!bodyRanking.length) {
    bodyRanking.push(['—', 'Sin datos en el rango seleccionado', '—', '—', '—']);
  }

  const footRanking = r.rankingDeptoGasto.length
    ? [
        '',
        'TOTAL DEPARTAMENTOS',
        fmtUsd(totDeptoUsd),
        fmtBs(totDeptoBs),
        '100.0 %',
      ]
    : undefined;

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, bottom: 24 },
    head: [['#', 'Departamento', 'Total USD ($)', 'Total Bs (BCV)', '% Participación']],
    body: bodyRanking,
    foot: footRanking ? [footRanking] : undefined,
    theme: 'grid',
    styles: {
      fontSize: esLandscape ? 7.2 : 6.6,
      cellPadding: esLandscape ? 2.5 : 2.0,
      lineColor: colores.BORDE,
      lineWidth: 0.3,
      textColor: colores.TINTA,
      valign: 'middle',
    },
    headStyles: {
      fillColor: colores.NARANJA,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: esLandscape ? 7.2 : 6.6,
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: colores.TINTA,
      fontStyle: 'bold',
      fontSize: esLandscape ? 7.2 : 6.6,
    },
    alternateRowStyles: {
      fillColor: colores.FONDO_ALT,
    },
    columnStyles: {
      0: { cellWidth: 26, halign: 'center' },
      1: { halign: 'left', fontStyle: 'bold' },
      2: { halign: 'right', fontStyle: 'bold' },
      3: { halign: 'right' },
      4: { halign: 'right', cellWidth: esLandscape ? 85 : 75 },
    },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 4 && r.rankingDeptoGasto.length > 0) {
        const rawDepto = r.rankingDeptoGasto[data.row.index];
        const pct = rawDepto?.pct ?? 0;
        if (pct > 0) {
          const barH = 1.6;
          const barY = data.cell.y + data.cell.height - barH - 1.5;
          const barMaxW = data.cell.width - 8;
          const barX = data.cell.x + 4;
          doc.setFillColor(226, 232, 240);
          doc.rect(barX, barY, barMaxW, barH, 'F');
          const fillW = Math.max(1, Math.min(barMaxW, (pct / 100) * barMaxW));
          doc.setFillColor(...colores.NARANJA);
          doc.rect(barX, barY, fillW, barH, 'F');
        }
      }
    },
  });

  const lastTable1 = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
  y = (lastTable1?.finalY ?? y) + 4;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(...colores.GRIS_TEXTO);
  doc.text(`* ${AVISO_RANKING}`, M + 2, y + 4);
  y += 14;

  // 3. Compras directas por categoría de gasto (si existen)
  if (r.comprasDirectasPorCategoriaGasto.length > 0) {
    if (y + 60 > PAGE_H - M) {
      doc.addPage();
      y = M;
    }
    y = dibujarHeaderSeccion(
      doc,
      `${seccionNum++}. Compras Directas por Categoría de Gasto`,
      `Total acumulado: ${fmtUsd(r.totalDirectasUsd)} · ${fmtBs(r.totalDirectasBs)}`,
      M,
      y,
      colores.NARANJA,
      colores.TINTA,
      colores.GRIS_TEXTO,
    );

    const totDirUsd = r.totalDirectasUsd || 1;
    const bodyDirectas = r.comprasDirectasPorCategoriaGasto.map((c, idx) => {
      const pct = totDirUsd > 0 ? (c.usd / totDirUsd) * 100 : 0;
      return [
        String(idx + 1),
        pdfSafe(c.categoria || 'Sin categoría asignada'),
        fmtUsd(c.usd),
        fmtBs(c.bs),
        `${pct.toFixed(1)} %`,
      ];
    });

    const footDirectas = [
      '',
      'TOTAL COMPRAS DIRECTAS',
      fmtUsd(r.totalDirectasUsd),
      fmtBs(r.totalDirectasBs),
      '100.0 %',
    ];

    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, bottom: 24 },
      head: [['#', 'Categoría de Gasto', 'Total USD ($)', 'Total Bs (BCV)', '% del Total Directas']],
      body: bodyDirectas,
      foot: [footDirectas],
      theme: 'grid',
      styles: {
        fontSize: esLandscape ? 7.2 : 6.6,
        cellPadding: esLandscape ? 2.5 : 2.0,
        lineColor: colores.BORDE,
        lineWidth: 0.3,
        textColor: colores.TINTA,
        valign: 'middle',
      },
      headStyles: {
        fillColor: [51, 65, 85],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
        fontSize: esLandscape ? 7.2 : 6.6,
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: colores.TINTA,
        fontStyle: 'bold',
        fontSize: esLandscape ? 7.2 : 6.6,
      },
      alternateRowStyles: { fillColor: colores.FONDO_ALT },
      columnStyles: {
        0: { cellWidth: 26, halign: 'center' },
        1: { halign: 'left', fontStyle: 'bold' },
        2: { halign: 'right', fontStyle: 'bold' },
        3: { halign: 'right' },
        4: { halign: 'right', cellWidth: esLandscape ? 85 : 75 },
      },
    });

    const lastTable2 = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    y = (lastTable2?.finalY ?? y) + 14;
  }

  // 4. Departamentos por cotizaciones movidas (si existen)
  if (r.rankingDeptoCotizaciones.length > 0) {
    if (y + 60 > PAGE_H - M) {
      doc.addPage();
      y = M;
    }
    y = dibujarHeaderSeccion(
      doc,
      `${seccionNum++}. Departamentos por Cotizaciones Movidas`,
      'Volumen operativo de cotizaciones tramitadas en el período',
      M,
      y,
      colores.NARANJA,
      colores.TINTA,
      colores.GRIS_TEXTO,
    );

    const totCotizaciones = r.rankingDeptoCotizaciones.reduce(
      (acc, d) => acc + (d.cotizaciones || 0),
      0,
    );
    const bodyCotiz = r.rankingDeptoCotizaciones.map((d, idx) => {
      const pct = totCotizaciones > 0 ? (d.cotizaciones / totCotizaciones) * 100 : 0;
      return [
        String(idx + 1),
        pdfSafe(d.departamento),
        `${fmtNum(d.cotizaciones, 0)} cotización(es)`,
        `${pct.toFixed(1)} %`,
      ];
    });

    const footCotiz = [
      '',
      'TOTAL COTIZACIONES REGISTRADAS',
      `${fmtNum(totCotizaciones, 0)} cotizaciones`,
      '100.0 %',
    ];

    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, bottom: 24 },
      head: [['#', 'Departamento Solicitante', 'Cotizaciones Registradas', '% Actividad']],
      body: bodyCotiz,
      foot: [footCotiz],
      theme: 'grid',
      styles: {
        fontSize: esLandscape ? 7.2 : 6.6,
        cellPadding: esLandscape ? 2.5 : 2.0,
        lineColor: colores.BORDE,
        lineWidth: 0.3,
        textColor: colores.TINTA,
        valign: 'middle',
      },
      headStyles: {
        fillColor: [51, 65, 85],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
        fontSize: esLandscape ? 7.2 : 6.6,
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: colores.TINTA,
        fontStyle: 'bold',
        fontSize: esLandscape ? 7.2 : 6.6,
      },
      alternateRowStyles: { fillColor: colores.FONDO_ALT },
      columnStyles: {
        0: { cellWidth: 26, halign: 'center' },
        1: { halign: 'left', fontStyle: 'bold' },
        2: { halign: 'right' },
        3: { halign: 'right', cellWidth: esLandscape ? 85 : 75 },
      },
    });

    const lastTable3 = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    y = (lastTable3?.finalY ?? y) + 14;
  }

  // 5. Top Categorías e Ítems con mayor inversión (si existen)
  if (r.topCategorias.length > 0 || r.topItems.length > 0) {
    if (y + 60 > PAGE_H - M) {
      doc.addPage();
      y = M;
    }
    y = dibujarHeaderSeccion(
      doc,
      `${seccionNum++}. Top Categorías e Ítems con Mayor Inversión`,
      'Concentración de compras por conceptos e inventario',
      M,
      y,
      colores.NARANJA,
      colores.TINTA,
      colores.GRIS_TEXTO,
    );

    if (r.topCategorias.length > 0) {
      const bodyTopCat = r.topCategorias.map((t, idx) => [
        String(idx + 1),
        pdfSafe(t.nombre),
        fmtUsd(t.usd),
      ]);

      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M, bottom: 24 },
        head: [['#', 'Top Categorías de Inventario', 'Total Invertido USD ($)']],
        body: bodyTopCat,
        theme: 'grid',
        styles: {
          fontSize: esLandscape ? 7.2 : 6.6,
          cellPadding: 2.0,
          lineColor: colores.BORDE,
          lineWidth: 0.3,
          textColor: colores.TINTA,
          valign: 'middle',
        },
        headStyles: {
          fillColor: [71, 85, 105],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center',
          fontSize: esLandscape ? 7.2 : 6.6,
        },
        alternateRowStyles: { fillColor: colores.FONDO_ALT },
        columnStyles: {
          0: { cellWidth: 26, halign: 'center' },
          1: { halign: 'left', fontStyle: 'bold' },
          2: { halign: 'right', fontStyle: 'bold', cellWidth: esLandscape ? 120 : 100 },
        },
      });

      const lastTopCat = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
      y = (lastTopCat?.finalY ?? y) + 10;
    }

    if (r.topItems.length > 0) {
      const bodyTopItems = r.topItems.map((t, idx) => [
        String(idx + 1),
        pdfSafe(t.nombre),
        t.cantidad != null ? `${fmtNum(t.cantidad, 2)} u.` : '—',
        fmtUsd(t.usd),
      ]);

      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M, bottom: 24 },
        head: [['#', 'Top Ítems Registrados', 'Cantidad', 'Total Invertido USD ($)']],
        body: bodyTopItems,
        theme: 'grid',
        styles: {
          fontSize: esLandscape ? 7.2 : 6.6,
          cellPadding: 2.0,
          lineColor: colores.BORDE,
          lineWidth: 0.3,
          textColor: colores.TINTA,
          valign: 'middle',
        },
        headStyles: {
          fillColor: [71, 85, 105],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center',
          fontSize: esLandscape ? 7.2 : 6.6,
        },
        alternateRowStyles: { fillColor: colores.FONDO_ALT },
        columnStyles: {
          0: { cellWidth: 26, halign: 'center' },
          1: { halign: 'left', fontStyle: 'bold' },
          2: { halign: 'right', cellWidth: esLandscape ? 75 : 65 },
          3: { halign: 'right', fontStyle: 'bold', cellWidth: esLandscape ? 100 : 90 },
        },
      });

      const lastTopItems = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
      y = (lastTopItems?.finalY ?? y) + 14;
    }
  }

  return { y, siguienteSeccion: seccionNum };
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
