/* ============================================================
   Golden Touch · RRHH · Generador de Reportes (Excel / PDF / CSV)
   (04/11/2026)

   Exportación profesional de Recursos Humanos y Nómina:
     · Multi-empresa nativo: Membrete de la empresa seleccionada o consolidado de grupo.
     · Excel (ExcelJS): Hoja "Resumen Ejecutivo" con KPIs institucionales y
       hoja "Personal" con estilos, formato de moneda $ y anchos auto-ajustables.
     · PDF (jsPDF + autotable): Base estética GT (logotipo institucional,
       banner superior de KPIs, tarjetas ejecutivas o tabla tabular).
     · CSV: Delimitado con punto y coma (;), codificación UTF-8 con BOM (\uFEFF)
       y protección contra inyecciones de fórmulas.
   ============================================================ */

import { previewExcelArchivo, previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import { identidadEmpresa } from '@/shared/lib/empresa';
import { loadLogoPdfEmpresa, dibujarLogoPdf, anchoLogoPdf } from '@/shared/lib/pdfLogo';
import type {
  AmbitoReportePersonal,
  CampoColumnaPersonal,
  FilaReportePersonal,
  GrupoFilasPersonal,
  ModoAgrupacionPersonal,
  ResumenReportePersonal,
} from './personalMoldeable';
import {
  CAMPOS_REPORTE_PERSONAL,
  calcularKpisCabeceraDinamicos,
  obtenerMetricasFichaPersonal,
} from './personalMoldeable';

const NARANJA: [number, number, number] = [255, 138, 0];
const TINTA: [number, number, number] = [30, 41, 59];
const BORDE: [number, number, number] = [203, 213, 225];
const FONDO_ALT: [number, number, number] = [250, 246, 240];

const hoyStr = () => new Date().toISOString().slice(0, 10);

export interface MetadatosExportacionPersonal {
  ambito: AmbitoReportePersonal;
  agrupacion: ModoAgrupacionPersonal;
  formatoPresentacion: 'fichas' | 'tabla';
  orientacion: 'vertical' | 'horizontal';
  empresaPrincipal?: string | null;
  subtituloFiltros?: string;
  incluirResumen: boolean;
}

function formatearValorCelda(fila: FilaReportePersonal, col: CampoColumnaPersonal): string {
  const val = (fila as unknown as Record<string, unknown>)[col.clave];
  if (val == null || val === '') return '—';

  if (col.clave === 'variacion_sueldo_usd') {
    const num = Number(val || 0);
    const pref = num > 0 ? '+$ ' : num < 0 ? '-$ ' : '$ ';
    return `${pref}${Math.abs(num).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (col.clave === 'variacion_sueldo_pct') {
    const num = Number(val || 0);
    return `${num > 0 ? '+' : ''}${num.toFixed(1)}%`;
  }

  switch (col.formato) {
    case 'moneda':
      return `$ ${Number(val || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'numero':
      return Number(val).toLocaleString('es-VE');
    default:
      return String(val);
  }
}

/* ============================================================
   1. EXCEL (ExcelJS)
   ============================================================ */

export async function descargarPersonalExcel(
  filas: FilaReportePersonal[],
  resumen: ResumenReportePersonal,
  _grupos: GrupoFilasPersonal[],
  columnasClaves: string[],
  meta: MetadatosExportacionPersonal,
): Promise<void> {
  const [{ default: ExcelJS }] = await Promise.all([import('exceljs')]);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Golden Touch 1127 C.A.';
  wb.created = new Date();

  const emp = identidadEmpresa(meta.empresaPrincipal || 'GT');
  const esMultiEmpresa = !meta.empresaPrincipal || meta.empresaPrincipal === 'TODAS';

  const columnas = columnasClaves
    .map((c) => CAMPOS_REPORTE_PERSONAL.find((col) => col.clave === c))
    .filter(Boolean) as CampoColumnaPersonal[];

  /* ───── Hoja 1: Resumen Ejecutivo de RRHH ───── */
  const wsRes = wb.addWorksheet('Resumen Ejecutivo', {
    views: [{ showGridLines: true }],
  });

  wsRes.getColumn('A').width = 4;
  wsRes.getColumn('B').width = 24;
  wsRes.getColumn('C').width = 22;
  wsRes.getColumn('D').width = 22;
  wsRes.getColumn('E').width = 22;

  // Título
  wsRes.mergeCells('B2:E2');
  const r2 = wsRes.getCell('B2');
  r2.value = esMultiEmpresa
    ? 'REPORTE CONSOLIDADO DE RECURSOS HUMANOS · GRUPO GOLDEN TOUCH'
    : `REPORTE DE RECURSOS HUMANOS · ${emp.nombre}`;
  r2.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFF8A00' } };

  wsRes.mergeCells('B3:E3');
  const r3 = wsRes.getCell('B3');
  r3.value = `Generado: ${hoyStr()}  |  Agrupado por: ${meta.agrupacion.toUpperCase()}  |  Total personas: ${resumen.totalPersonal}`;
  r3.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF64748B' } };

  // Tarjetas KPI dinámicas según checks
  const kpisDinamicos = calcularKpisCabeceraDinamicos(filas, resumen, columnasClaves, meta.ambito);
  const celdas = ['B5', 'C5', 'D5', 'E5'];

  kpisDinamicos.forEach((k, idx) => {
    if (idx >= celdas.length) return;
    const c = wsRes.getCell(celdas[idx]);
    c.value = `${k.titulo}\n${k.valor}\n${k.sub}`;
    c.alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' };
    c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1E293B' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    c.border = {
      top: { style: 'medium', color: { argb: 'FFFF8A00' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });
  wsRes.getRow(5).height = 48;

  // Top Departamentos
  wsRes.getCell('B8').value = 'DISTRIBUCIÓN POR DEPARTAMENTOS';
  wsRes.getCell('B8').font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1E293B' } };

  wsRes.getCell('B9').value = 'Departamento';
  wsRes.getCell('C9').value = 'Personal';
  wsRes.getCell('D9').value = 'Masa Salarial ($)';
  wsRes.getCell('E9').value = '% del Personal';
  ['B9', 'C9', 'D9', 'E9'].forEach((cellId) => {
    const c = wsRes.getCell(cellId);
    c.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    c.alignment = { horizontal: cellId === 'B9' ? 'left' : 'right', vertical: 'middle' };
  });

  resumen.topDepartamentos.forEach((d, idx) => {
    const rIdx = 10 + idx;
    wsRes.getCell(`B${rIdx}`).value = d.nombre;
    wsRes.getCell(`C${rIdx}`).value = d.personal;
    wsRes.getCell(`D${rIdx}`).value = d.masaSalarialUsd;
    wsRes.getCell(`D${rIdx}`).numFmt = '"$"#,##0.00';
    wsRes.getCell(`E${rIdx}`).value = d.porcentajePersonal / 100;
    wsRes.getCell(`E${rIdx}`).numFmt = '0.0%';

    ['B', 'C', 'D', 'E'].forEach((colLet) => {
      const c = wsRes.getCell(`${colLet}${rIdx}`);
      c.font = { name: 'Calibri', size: 9 };
      c.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
    });
  });

  /* ───── Hoja 2: Listado Detallado de Personal ───── */
  const wsDet = wb.addWorksheet('Directorio Personal', {
    views: [{ showGridLines: true, state: 'frozen', ySplit: 5 }],
  });

  wsDet.mergeCells('B2:H2');
  const rTit = wsDet.getCell('B2');
  rTit.value = esMultiEmpresa
    ? 'DIRECTORIO DE PERSONAL · GRUPO GOLDEN TOUCH'
    : `DIRECTORIO DE PERSONAL · ${emp.nombre}`;
  rTit.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFF8A00' } };

  wsDet.mergeCells('B3:H3');
  const rSub = wsDet.getCell('B3');
  rSub.value = meta.subtituloFiltros || `Agrupado por: ${meta.agrupacion.toUpperCase()} · Registros: ${filas.length}`;
  rSub.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF64748B' } };

  // Encabezados
  const headerRow = wsDet.getRow(5);
  headerRow.height = 24;
  columnas.forEach((col, idx) => {
    const c = headerRow.getCell(idx + 2);
    c.value = col.etiqueta.toUpperCase();
    c.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF8A00' } };
    c.alignment = { horizontal: col.alineacion, vertical: 'middle' };
    c.border = {
      top: { style: 'medium', color: { argb: 'FFFF8A00' } },
      bottom: { style: 'medium', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
    wsDet.getColumn(idx + 2).width = Math.max(col.anchoExcel, 12);
  });

  // Datos
  filas.forEach((f, fIdx) => {
    const r = wsDet.getRow(6 + fIdx);
    r.height = 19;
    const esPar = fIdx % 2 === 1;

    columnas.forEach((col, cIdx) => {
      const c = r.getCell(cIdx + 2);
      const rawVal = (f as unknown as Record<string, unknown>)[col.clave];

      if (col.formato === 'moneda') {
        c.value = Number(rawVal || 0);
        c.numFmt = '"$"#,##0.00';
      } else if (col.formato === 'numero') {
        c.value = Number(rawVal || 0);
        c.numFmt = '#,##0';
      } else {
        c.value = rawVal != null && rawVal !== '' ? String(rawVal) : '—';
      }

      c.font = { name: 'Calibri', size: 9, color: { argb: 'FF1E293B' } };
      c.alignment = { horizontal: col.alineacion, vertical: 'middle' };
      if (esPar) {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAF6F0' } };
      }
      c.border = {
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });
  });

  // Totales al pie
  const totRow = wsDet.getRow(6 + filas.length);
  totRow.height = 22;
  columnas.forEach((col, cIdx) => {
    const c = totRow.getCell(cIdx + 2);
    c.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF1E293B' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    c.border = {
      top: { style: 'medium', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'double', color: { argb: 'FF94A3B8' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
    c.alignment = { horizontal: col.alineacion, vertical: 'middle' };

    if (cIdx === 0) {
      c.value = 'TOTALES';
    } else if (col.clave === 'sueldo_base') {
      c.value = resumen.masaSalarialTotalUsd;
      c.numFmt = '"$"#,##0.00';
    } else if (col.clave === 'cantidad_hijos') {
      c.value = resumen.totalHijosRegistrados;
      c.numFmt = '#,##0';
    }
  });

  const bytes = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const nombreSufijo = meta.empresaPrincipal ? `${meta.empresaPrincipal.toLowerCase()}-` : '';
  await previewExcelArchivo(bytes, `rrhh-${nombreSufijo}${meta.agrupacion}-${hoyStr()}.xlsx`);
}

/* ============================================================
   2. PDF (jsPDF + autotable)
   ============================================================ */

export async function descargarPersonalPdf(
  filas: FilaReportePersonal[],
  resumen: ResumenReportePersonal,
  _grupos: GrupoFilasPersonal[],
  columnasClaves: string[],
  meta: MetadatosExportacionPersonal,
): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const columnas = columnasClaves
    .map((c) => CAMPOS_REPORTE_PERSONAL.find((col) => col.clave === c))
    .filter(Boolean) as CampoColumnaPersonal[];

  if (!columnas.length) throw new Error('Selecciona al menos una columna para exportar.');
  if (!filas.length) throw new Error('No hay personas para exportar con los filtros seleccionados.');

  const esFichas = meta.formatoPresentacion === 'fichas';
  const orient = meta.orientacion === 'horizontal' || (esFichas && columnas.length > 5) ? 'landscape' : 'portrait';

  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: orient });

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;
  const UW = W - M * 2;
  let y = M;

  const emp = identidadEmpresa(meta.empresaPrincipal || 'GT');
  const esMultiEmpresa = !meta.empresaPrincipal || meta.empresaPrincipal === 'TODAS';
  const logo = await loadLogoPdfEmpresa(esMultiEmpresa ? 'GT' : meta.empresaPrincipal).catch(() => null);

  // 1. Cabecera institucional
  if (logo) {
    dibujarLogoPdf(doc, logo, M, y, 40);
  }

  const logoW = logo ? anchoLogoPdf(40) + 12 : 0;
  const tx = M + logoW;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...NARANJA);
  const tituloPdf = esMultiEmpresa
    ? 'Reporte Consolidado de Personal'
    : `Reporte de Personal · ${emp.nombre}`;
  doc.text(pdfSafe(tituloPdf), tx, y + 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  const subtitulo = esMultiEmpresa
    ? `GRUPO GOLDEN TOUCH · Generado el ${hoyStr()} · Agrupado por: ${meta.agrupacion.toUpperCase()} · ${filas.length} registros`
    : `${emp.nombre} · RIF ${emp.rif} · Generado: ${hoyStr()} · Agrupado por: ${meta.agrupacion.toUpperCase()} · ${filas.length} registros`;
  doc.text(pdfSafe(subtitulo), tx, y + 26);

  if (meta.subtituloFiltros) {
    doc.setFontSize(7);
    doc.text(pdfSafe(`Filtros: ${meta.subtituloFiltros}`), tx, y + 36);
    y += 44;
  } else {
    y += 38;
  }

  // Línea divisoria naranja
  doc.setDrawColor(...NARANJA);
  doc.setLineWidth(1.2);
  doc.line(M, y, W - M, y);
  y += 10;

  // 2. Banner de KPIs (si está activado)
  if (meta.incluirResumen) {
    const kpis = calcularKpisCabeceraDinamicos(filas, resumen, columnasClaves, meta.ambito);
    const cardGap = 8;
    const cardW = (UW - cardGap * (kpis.length - 1)) / Math.max(1, kpis.length);
    const cardH = 38;

    kpis.forEach((k, idx) => {
      const cx = M + idx * (cardW + cardGap);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(...BORDE);
      doc.setLineWidth(0.5);
      doc.roundedRect(cx, y, cardW, cardH, 3, 3, 'FD');

      // Borde superior con el color del KPI
      doc.setFillColor(...k.colorRgb);
      doc.rect(cx, y, cardW, 2.5, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.2);
      doc.setTextColor(71, 85, 105);
      doc.text(pdfSafe(k.titulo), cx + 6, y + 10);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(...k.colorRgb);
      doc.text(pdfSafe(k.valor), cx + 6, y + 23);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.2);
      doc.setTextColor(148, 163, 184);
      doc.text(pdfSafe(k.sub), cx + 6, y + 33);
    });

    y += cardH + 12;
  }

  // 3. Contenido: FICHAS EJECUTIVAS vs TABLA TABULAR
  if (esFichas) {
    const cols = orient === 'landscape' ? 2 : 1;
    const cardGap = 10;
    const cardW = (UW - (cols - 1) * cardGap) / cols;
    const maxMetricas = Math.max(
      ...filas.map((f) => obtenerMetricasFichaPersonal(f, columnasClaves).length),
      1,
    );
    const colsPorFila = orient === 'landscape'
      ? (maxMetricas <= 3 ? Math.max(1, maxMetricas) : maxMetricas === 4 ? 4 : 3)
      : (maxMetricas <= 4 ? Math.max(1, maxMetricas) : 4);
    const numFilasMetricas = Math.ceil(maxMetricas / colsPorFila);
    const altoHeader = 32;
    const altoFilaMetrica = 25;
    const cardH = altoHeader + numFilasMetricas * altoFilaMetrica + 8;

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

        // Badge superior derecho (Estado o Empresa) - SOLO si están marcados
        const mostrarEstado = columnasClaves.includes('estado_texto') || columnasClaves.includes('activo');
        const mostrarEmpresa = columnasClaves.includes('empresa') || columnasClaves.includes('empresa_nombre');
        const tieneBadge = mostrarEstado || mostrarEmpresa;

        const badgeW = tieneBadge ? Math.min(cardW * 0.38, 92) : 0;
        const badgeH = 15;
        const bx = cx + cardW - badgeW - 6;
        const by = cy + 4;

        if (tieneBadge) {
          doc.setFillColor(f.activo ? 240 : 254, f.activo ? 253 : 242, f.activo ? 244 : 242);
          doc.roundedRect(bx, by, badgeW, badgeH, 3, 3, 'F');

          if (mostrarEstado && mostrarEmpresa) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6.5);
            doc.setTextColor(f.activo ? 22 : 220, f.activo ? 101 : 38, f.activo ? 52 : 38);
            doc.text(f.activo ? 'ACTIVO' : 'INACTIVO', bx + badgeW / 2, by + 6, { align: 'center' });

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(5.2);
            doc.setTextColor(100, 116, 139);
            doc.text(pdfSafe(f.empresa_nombre), bx + badgeW / 2, by + 12, { align: 'center' });
          } else if (mostrarEstado) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7);
            doc.setTextColor(f.activo ? 22 : 220, f.activo ? 101 : 38, f.activo ? 52 : 38);
            doc.text(f.activo ? 'ACTIVO' : 'INACTIVO', bx + badgeW / 2, by + 10, { align: 'center' });
          } else {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6.8);
            doc.setTextColor(71, 85, 105);
            doc.text(pdfSafe(f.empresa_nombre), bx + badgeW / 2, by + 10, { align: 'center' });
          }
        }

        // Título de la Persona (Nombre Completo)
        const maxTitleW = tieneBadge ? Math.max(60, (bx - 6) - (cx + 10)) : cardW - 20;
        let titleFontSize = 9.5;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(titleFontSize);
        const nomSafe = pdfSafe(f.nombre_completo);

        while (doc.getTextWidth(nomSafe) > maxTitleW && titleFontSize > 7.5) {
          titleFontSize -= 0.3;
          doc.setFontSize(titleFontSize);
        }

        let titleFinal = nomSafe;
        if (doc.getTextWidth(titleFinal) > maxTitleW) {
          while (titleFinal.length > 3 && doc.getTextWidth(titleFinal + '…') > maxTitleW) {
            titleFinal = titleFinal.slice(0, -1);
          }
          titleFinal += '…';
        }
        doc.setTextColor(...TINTA);
        doc.text(titleFinal, cx + 10, cy + 13);

        // Subtítulo con Ficha, Cédula, Cargo y Departamento según checks
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        const partesMeta: string[] = [];
        if (columnasClaves.includes('ficha_nro') && f.ficha_nro) partesMeta.push(`Ficha ${f.ficha_nro}`);
        if (columnasClaves.includes('cedula')) partesMeta.push(f.cedula || 'Sin cédula');
        if (columnasClaves.includes('cargo')) partesMeta.push(f.cargo || 'Sin cargo');
        if (columnasClaves.includes('departamento')) partesMeta.push(f.departamento || 'Sin dpto.');
        if (partesMeta.length === 0 && columnasClaves.includes('fecha_ingreso') && f.fecha_ingreso) {
          partesMeta.push(`Ingreso: ${f.fecha_ingreso}`);
        }
        const metaTxt = pdfSafe(partesMeta.length > 0 ? partesMeta.join(' · ') : '—');
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

        // Métricas dinámicas inferiores según las columnas marcadas
        const metricasCard = obtenerMetricasFichaPersonal(f, columnasClaves);
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
            while (lblTxt.length > 3 && doc.getTextWidth(lblTxt + '…') > maxTextW) lblTxt = lblTxt.slice(0, -1);
            lblTxt += '…';
          }
          doc.text(lblTxt, mx, my);

          doc.setFont('helvetica', 'bold');
          let valSize = 8.2;
          doc.setFontSize(valSize);
          doc.setTextColor(...m.colorRgb);
          let valTxt = pdfSafe(m.valor);
          while (doc.getTextWidth(valTxt) > maxTextW && valSize > 6.0) {
            valSize -= 0.3;
            doc.setFontSize(valSize);
          }
          if (doc.getTextWidth(valTxt) > maxTextW) {
            while (valTxt.length > 3 && doc.getTextWidth(valTxt + '…') > maxTextW) valTxt = valTxt.slice(0, -1);
            valTxt += '…';
          }
          doc.text(valTxt, mx, my + 8.5);

          if (m.sub) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(5.4);
            doc.setTextColor(148, 163, 184);
            let subTxt = pdfSafe(m.sub);
            if (doc.getTextWidth(subTxt) > maxTextW) {
              while (subTxt.length > 3 && doc.getTextWidth(subTxt + '…') > maxTextW) subTxt = subTxt.slice(0, -1);
              subTxt += '…';
            }
            doc.text(subTxt, mx, my + 14.5);
          }
        });
      }

      y += cardH + cardGap;
    }
  } else {
    // MODO TABLA TABULAR (con autoTable)
    const encabezados = columnas.map((c) => c.etiqueta.toUpperCase());
    const cuerpo = filas.map((f) => columnas.map((c) => formatearValorCelda(f, c)));

    autoTable(doc, {
      startY: y,
      head: [encabezados],
      body: cuerpo,
      margin: { left: M, right: M, top: 36, bottom: 36 },
      theme: 'plain',
      styles: {
        fontSize: 7.2,
        cellPadding: 4,
        textColor: TINTA,
        lineColor: BORDE,
        lineWidth: 0.4,
        valign: 'middle',
      },
      headStyles: {
        fillColor: NARANJA,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.5,
      },
      alternateRowStyles: {
        fillColor: FONDO_ALT,
      },
      columnStyles: columnas.reduce((acc, col, idx) => {
        acc[idx] = { halign: col.alineacion };
        return acc;
      }, {} as Record<number, { halign: 'left' | 'right' | 'center' }>),
    });
  }

  // Paginación al pie
  const totalPaginas = doc.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    const pie = `Página ${p} de ${totalPaginas}  ·  Sistema de Gestión Golden Touch  ·  Recursos Humanos`;
    doc.text(pdfSafe(pie), W / 2, H - 20, { align: 'center' });
  }

  const nombreSufijo = meta.empresaPrincipal ? `${meta.empresaPrincipal.toLowerCase()}-` : '';
  await previewPdf(doc, `rrhh-${nombreSufijo}${meta.agrupacion}-${hoyStr()}.pdf`);
}

/* ============================================================
   3. CSV (Valores separados por punto y coma con UTF-8 BOM)
   ============================================================ */

export function descargarPersonalCsv(
  filas: FilaReportePersonal[],
  columnasClaves: string[],
  meta: MetadatosExportacionPersonal,
): void {
  const columnas = columnasClaves
    .map((c) => CAMPOS_REPORTE_PERSONAL.find((col) => col.clave === c))
    .filter(Boolean) as CampoColumnaPersonal[];

  if (!columnas.length) throw new Error('Selecciona al menos una columna para exportar.');

  const limpiar = (txt: string) => {
    let s = txt.replace(/"/g, '""');
    // Prevenir inyección de fórmulas CSV
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s}"`;
  };

  const lineas: string[] = [];
  // Encabezados
  lineas.push(columnas.map((c) => limpiar(c.etiqueta)).join(';'));

  // Filas
  filas.forEach((f) => {
    const valores = columnas.map((c) => {
      const val = (f as unknown as Record<string, unknown>)[c.clave];
      return limpiar(val != null ? String(val) : '');
    });
    lineas.push(valores.join(';'));
  });

  const blob = new Blob(['\uFEFF' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const nombreSufijo = meta.empresaPrincipal ? `${meta.empresaPrincipal.toLowerCase()}-` : '';
  a.download = `rrhh-${nombreSufijo}${meta.agrupacion}-${hoyStr()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
