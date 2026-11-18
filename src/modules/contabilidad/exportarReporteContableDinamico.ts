/* ============================================================
   Golden Touch · Contabilidad · Exportación del Reporte Dinámico
   (Excel / PDF / CSV) · 18/11/2026

   Exportación bimoneda transparente (VES y USD), con soporte para:
   - Formatos: Resumen (KPIs + analítica), Detallado o Híbrido.
   - Selección dinámica de columnas activas.
   - Membrete oficial de la empresa activa (GT, GL, MGG, etc.).
   - Previsualización nativa antes de descargar (previewPdf / previewExcelArchivo).
   ============================================================ */

import { previewExcelArchivo, previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import { loadLogoPdfEmpresa, dibujarLogoPdf, anchoLogoPdf } from '@/shared/lib/pdfLogo';
import {
  CAMPOS_REPORTE_CONTABLE, ETIQUETA_MODO_CONTABLE,
  type ReporteContableGenerado,
} from './logica/reporteContableDinamico';

const NARANJA: [number, number, number] = [255, 138, 0];
const TINTA: [number, number, number] = [15, 23, 42];

const fmtBs = (v: number | null | undefined) =>
  v == null ? '—' : `Bs ${Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtUsd = (v: number | null | undefined) =>
  v == null ? '—' : `$ ${Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtNum = (v: number | null | undefined) =>
  v == null ? '—' : Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtFecha = (f: string) => {
  const [y, m, d] = (f || '').split('-');
  return y && m && d ? `${d}/${m}/${y}` : f || '—';
};

/* ───────────── Exportación a PDF ───────────── */

export async function exportarReporteContablePdf(
  reporte: ReporteContableGenerado,
  formato: 'resumen' | 'detallado' | 'hibrido' = 'hibrido',
): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const esLandscape = formato !== 'resumen';
  const doc = new jsPDF({
    orientation: esLandscape ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'letter',
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;
  let y = margin;

  const empNombre = (reporte.config.empresaNombre || 'GOLDEN TOUCH 1127, C.A.').toUpperCase();
  const empRif = reporte.config.empresaRif ? `RIF: ${reporte.config.empresaRif}` : '';
  const empClave = reporte.config.empresaClave || 'GT';

  // 1. Logo corporativo
  let logoH = 0;
  try {
    const logoImg = await loadLogoPdfEmpresa(empClave);
    if (logoImg) {
      dibujarLogoPdf(doc, logoImg, margin, y, 34);
      logoH = 34;
    }
  } catch { /* continuar sin logo */ }

  const logoW = anchoLogoPdf(34);
  const textX = logoH > 0 ? margin + logoW + 10 : margin;

  // 2. Encabezado institucional
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...TINTA);
  doc.text(pdfSafe(empNombre), textX, y + 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  if (empRif) doc.text(pdfSafe(empRif), textX, y + 21);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...NARANJA);
  doc.text('REPORTE DINÁMICO DE CONTABILIDAD', textX, y + (empRif ? 33 : 24));

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  const rangoTxt = `Período: ${fmtFecha(reporte.config.desde)} al ${fmtFecha(reporte.config.hasta)} | Agrupación: ${ETIQUETA_MODO_CONTABLE[reporte.config.agrupacion]}`;
  doc.text(pdfSafe(rangoTxt), textX, y + (empRif ? 44 : 35));

  y += Math.max(logoH, empRif ? 50 : 42) + 12;

  // 3. Resumen Ejecutivo y KPIs (para formato resumen o hibrido)
  if (formato === 'resumen' || formato === 'hibrido') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...TINTA);
    doc.text('RESUMEN GENERAL Y TOTALES DE CONTROL', margin, y);
    y += 8;

    const cuadreTxt = reporte.resumen.cuadra ? 'CUADRADO (Partida Doble Exacta)' : `DESCUADRADO (Dif Bs: ${fmtBs(reporte.resumen.diferenciaVes)})`;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'grid',
      headStyles: { fillColor: NARANJA, textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: TINTA },
      head: [['Métrica de Control', 'VES (Bolívares)', 'USD (Dólares)', 'Estado']],
      body: [
        ['Total Comprobantes', fmtNum(reporte.resumen.totalComprobantes), '—', 'Registrados en el rango'],
        ['Total Asientos / Renglones', fmtNum(reporte.resumen.totalAsientos), '—', 'Líneas contables evaluadas'],
        ['Total Debe (Cargos)', fmtBs(reporte.resumen.totalDebeVes), fmtUsd(reporte.resumen.totalDebeUsd), 'Suma total cargada'],
        ['Total Haber (Abonos)', fmtBs(reporte.resumen.totalHaberVes), fmtUsd(reporte.resumen.totalHaberUsd), 'Suma total abonada'],
        ['Diferencia de Cuadre', fmtBs(reporte.resumen.diferenciaVes), fmtUsd(reporte.resumen.diferenciaUsd), cuadreTxt],
      ],
    });

    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 80;
    y = finalY + 14;

    // Desglose por tipo si cabe
    if (formato === 'resumen' && reporte.resumen.porTipo.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('DESGLOSE POR TIPO DE COMPROBANTE', margin, y);
      y += 6;

      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        theme: 'striped',
        headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
        bodyStyles: { fontSize: 7.5, textColor: TINTA },
        head: [['Tipo de Comprobante', 'Cantidad', 'Total Debe (VES)', 'Total Debe (USD)']],
        body: reporte.resumen.porTipo.map((t) => [t.tipo, fmtNum(t.cantidad), fmtBs(t.totalVes), fmtUsd(t.totalUsd)]),
      });
      y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 60) + 14;
    }
  }

  // 4. Detallado Renglón a Renglón (para detallado o híbrido)
  if (formato === 'detallado' || formato === 'hibrido') {
    if (formato === 'hibrido') {
      doc.addPage();
      y = margin;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...TINTA);
    doc.text(`DETALLE DE ASIENTOS (${ETIQUETA_MODO_CONTABLE[reporte.config.agrupacion].toUpperCase()})`, margin, y);
    y += 8;

    const colsVisibles = CAMPOS_REPORTE_CONTABLE.filter((c) => reporte.config.columnasVisibles.includes(c.clave));
    const headRow = colsVisibles.map((c) => c.etiqueta);

    const bodyRows: Array<Array<string | number>> = [];

    for (const g of reporte.grupos) {
      if (reporte.config.agrupacion !== 'detallado') {
        bodyRows.push([
          {
            content: `▶ ${g.etiqueta} ${g.subetiqueta ? `(${g.subetiqueta})` : ''} · ${g.totalAsientos} asientos`,
            colSpan: colsVisibles.length,
            styles: { fillColor: [241, 245, 249], fontStyle: 'bold', textColor: [30, 41, 59] },
          } as unknown as string,
        ]);
      }

      for (const f of g.filas) {
        const row = colsVisibles.map((col) => {
          switch (col.clave) {
            case 'fecha': return fmtFecha(f.fecha);
            case 'comprobante': return f.comprobante;
            case 'tipo': return f.tipo;
            case 'origen': return f.origen;
            case 'referencia': return f.referencia;
            case 'descripcion': return f.descripcion;
            case 'cuenta_codigo': return f.cuenta_codigo;
            case 'cuenta_nombre': return f.cuenta_nombre;
            case 'centro': return f.centro;
            case 'auxiliar': return f.auxiliar;
            case 'moneda': return f.moneda;
            case 'debe_ves': return f.debe_ves > 0 ? fmtNum(f.debe_ves) : '—';
            case 'haber_ves': return f.haber_ves > 0 ? fmtNum(f.haber_ves) : '—';
            case 'debe_usd': return f.debe_usd > 0 ? fmtNum(f.debe_usd) : '—';
            case 'haber_usd': return f.haber_usd > 0 ? fmtNum(f.haber_usd) : '—';
            case 'saldo_ves': return fmtNum(f.saldo_ves);
            case 'saldo_usd': return fmtNum(f.saldo_usd);
            default: return '—';
          }
        });
        bodyRows.push(row);
      }

      if (reporte.config.agrupacion !== 'detallado') {
        const subtotalRow = colsVisibles.map((col) => {
          if (col.clave === 'cuenta_nombre' || col.clave === 'descripcion') return 'SUBTOTAL:';
          if (col.clave === 'debe_ves') return fmtNum(g.debe_ves);
          if (col.clave === 'haber_ves') return fmtNum(g.haber_ves);
          if (col.clave === 'debe_usd') return fmtNum(g.debe_usd);
          if (col.clave === 'haber_usd') return fmtNum(g.haber_usd);
          return '';
        });
        bodyRows.push(subtotalRow);
      }
    }

    // Fila final de totales
    const totalRow = colsVisibles.map((col) => {
      if (col.clave === 'cuenta_nombre' || col.clave === 'descripcion') return 'TOTAL GENERAL:';
      if (col.clave === 'debe_ves') return fmtNum(reporte.resumen.totalDebeVes);
      if (col.clave === 'haber_ves') return fmtNum(reporte.resumen.totalHaberVes);
      if (col.clave === 'debe_usd') return fmtNum(reporte.resumen.totalDebeUsd);
      if (col.clave === 'haber_usd') return fmtNum(reporte.resumen.totalHaberUsd);
      return '';
    });
    bodyRows.push(totalRow);

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'grid',
      headStyles: { fillColor: NARANJA, textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 7 },
      bodyStyles: { fontSize: 6.8, textColor: TINTA },
      columnStyles: colsVisibles.reduce<Record<number, { halign: 'left' | 'right' | 'center' }>>((acc, c, idx) => {
        acc[idx] = { halign: c.alineacion };
        return acc;
      }, {}),
      head: [headRow],
      body: bodyRows as unknown as string[][],
    });
  }

  // 5. Pie de página institucional en todas las hojas
  const totalPaginas = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(148, 163, 184);

    const txtPie = `${empNombre} · Sistema Contable VEN-NIF · Página ${p} de ${totalPaginas}`;
    doc.text(pdfSafe(txtPie), pageW / 2, pageH - 18, { align: 'center' });
  }

  const nombreArchivo = `Reporte-Contable-${empClave}-${reporte.config.desde}-al-${reporte.config.hasta}.pdf`;
  previewPdf(doc, nombreArchivo);
}

/* ───────────── Exportación a Excel ───────────── */

export async function exportarReporteContableExcel(
  reporte: ReporteContableGenerado,
  formato: 'resumen' | 'detallado' | 'hibrido' = 'hibrido',
): Promise<void> {
  const XLSX = await import('xlsx-js-style');

  const empNombre = reporte.config.empresaNombre || 'GOLDEN TOUCH 1127, C.A.';
  const empClave = reporte.config.empresaClave || 'GT';
  const wb = XLSX.utils.book_new();

  // Hoja 1: Resumen de Control y Totales
  if (formato === 'resumen' || formato === 'hibrido') {
    const ws1Data: unknown[][] = [
      [`${empNombre.toUpperCase()} - REPORTE DINÁMICO DE CONTABILIDAD`],
      [`Período: ${fmtFecha(reporte.config.desde)} al ${fmtFecha(reporte.config.hasta)} | Agrupación: ${ETIQUETA_MODO_CONTABLE[reporte.config.agrupacion]}`],
      [],
      ['KPIs Y TOTALES DE CONTROL CONTABLE'],
      ['Métrica', 'VES (Bolívares)', 'USD (Dólares)', 'Estado'],
      ['Total Comprobantes', reporte.resumen.totalComprobantes, null, 'Registrados'],
      ['Total Asientos / Renglones', reporte.resumen.totalAsientos, null, 'Líneas contables'],
      ['Total Debe (Cargos)', reporte.resumen.totalDebeVes, reporte.resumen.totalDebeUsd, 'Cargos'],
      ['Total Haber (Abonos)', reporte.resumen.totalHaberVes, reporte.resumen.totalHaberUsd, 'Abonos'],
      ['Diferencia de Cuadre', reporte.resumen.diferenciaVes, reporte.resumen.diferenciaUsd, reporte.resumen.cuadra ? 'CUADRADO' : 'DESCUADRADO'],
      [],
      ['DESGLOSE POR TIPO DE COMPROBANTE'],
      ['Tipo', 'Cantidad', 'Total Debe (VES)', 'Total Debe (USD)'],
      ...reporte.resumen.porTipo.map((t) => [t.tipo, t.cantidad, t.totalVes, t.totalUsd]),
    ];

    const ws1 = XLSX.utils.aoa_to_sheet(ws1Data);
    XLSX.utils.book_append_sheet(wb, ws1, 'Resumen Contable');
  }

  // Hoja 2: Detalle de Asientos
  if (formato === 'detallado' || formato === 'hibrido') {
    const colsVisibles = CAMPOS_REPORTE_CONTABLE.filter((c) => reporte.config.columnasVisibles.includes(c.clave));
    const ws2Data: unknown[][] = [
      [`${empNombre.toUpperCase()} - DETALLE DE MOVIMIENTOS CONTABLES`],
      [`Período: ${fmtFecha(reporte.config.desde)} al ${fmtFecha(reporte.config.hasta)}`],
      [],
      colsVisibles.map((c) => c.etiqueta),
    ];

    for (const f of reporte.filas) {
      const row = colsVisibles.map((col) => {
        switch (col.clave) {
          case 'fecha': return f.fecha;
          case 'comprobante': return f.comprobante;
          case 'tipo': return f.tipo;
          case 'origen': return f.origen;
          case 'referencia': return f.referencia;
          case 'descripcion': return f.descripcion;
          case 'cuenta_codigo': return f.cuenta_codigo;
          case 'cuenta_nombre': return f.cuenta_nombre;
          case 'centro': return f.centro;
          case 'auxiliar': return f.auxiliar;
          case 'moneda': return f.moneda;
          case 'debe_ves': return f.debe_ves;
          case 'haber_ves': return f.haber_ves;
          case 'debe_usd': return f.debe_usd;
          case 'haber_usd': return f.haber_usd;
          case 'saldo_ves': return f.saldo_ves;
          case 'saldo_usd': return f.saldo_usd;
          default: return '';
        }
      });
      ws2Data.push(row);
    }

    const ws2 = XLSX.utils.aoa_to_sheet(ws2Data);
    XLSX.utils.book_append_sheet(wb, ws2, 'Detalle Movimientos');
  }

  const nombreArchivo = `Reporte-Contable-${empClave}-${reporte.config.desde}-al-${reporte.config.hasta}.xlsx`;
  const wbOut = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const buf = wbOut instanceof ArrayBuffer ? wbOut : new Uint8Array(wbOut).buffer;
  previewExcelArchivo(buf, nombreArchivo);
}
