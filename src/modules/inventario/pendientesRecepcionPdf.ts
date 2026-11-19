/* ============================================================
   Golden Touch · Reporte Dinámico de Pendientes por Recepcionar (PDF)
   (Alineado al diseño estándar MGG · 18/11/2026)
   ============================================================ */

import { previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import { loadLogoPdfEmpresa, dibujarLogoPdf, anchoLogoPdf } from '@/shared/lib/pdfLogo';
import { money, num } from '@/shared/lib/format';
import {
  calcularTotalesPendientes,
  type FilaPendienteRecepcion,
  type FiltrosReportePendientes,
} from './pendientesRecepcionReporte';

export async function generarReportePendientesRecepcionPdf(
  filas: FilaPendienteRecepcion[],
  filtros?: FiltrosReportePendientes,
  actor?: string | null,
): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const logo = await loadLogoPdfEmpresa('GT').catch(() => null);
  let y = 35;

  const cajaLogo = 48;
  if (logo) {
    try {
      dibujarLogoPdf(doc, logo, 36, y - 6, cajaLogo);
    } catch {
      /* ignore */
    }
  }
  const tx = logo ? 36 + anchoLogoPdf(cajaLogo) + 12 : 36;

  // Encabezado institucional idéntico al estándar MGG
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(30, 41, 59);
  doc.text(pdfSafe('GOLDEN TOUCH 1127 C.A.'), tx, y + 8);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(217, 119, 6); // ámbar ejecutivo
  doc.text(pdfSafe('REPORTE DE MERCANCÍA PENDIENTE POR RECEPCIONAR EN ALMACÉN'), tx, y + 23);

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(220, 38, 38); // rojo alerta
  doc.text(pdfSafe('ALERTA: NO HA LLEGADO A ALMACEN - DAR STATUS'), tx, y + 36);

  const ahora = new Date();
  const fechaHoraStr = `${ahora.toLocaleDateString('es-VE')} ${ahora.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(pdfSafe(`Emisión: ${fechaHoraStr}${actor ? ` · Por: ${actor}` : ''}`), tx, y + 49);

  // Filtros aplicados a la derecha
  const criteriosText: string[] = [];
  if (filtros?.sede) criteriosText.push(`Sede: ${filtros.sede}`);
  if (filtros?.analista) criteriosText.push(`Analista: ${filtros.analista}`);
  if (filtros?.tipo && filtros.tipo !== 'todos') {
    const etq = filtros.tipo === 'oc' ? 'Solo OC' : filtros.tipo === 'cs' ? 'Solo Servicios (CS)' : 'Solo Directas';
    criteriosText.push(`Tipo: ${etq}`);
  }
  if (filtros?.desde || filtros?.hasta) {
    criteriosText.push(`Rango: ${filtros.desde || '-'} al ${filtros.hasta || '-'}`);
  }

  if (criteriosText.length > 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(pdfSafe(`Filtros: ${criteriosText.join(' | ')}`), pageWidth - 36, y + 8, { align: 'right' });
  }

  y += 62;

  // Resumen en recuadro destacado
  const totales = calcularTotalesPendientes(filas);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(36, y, pageWidth - 72, 28, 4, 4, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);

  const desglose = [
    `${totales.totalOc} OC`,
    totales.totalCs > 0 ? `${totales.totalCs} CS` : null,
    `${totales.totalDirectas} Compras directas`,
  ].filter(Boolean).join(' · ');

  const txtResumen = [
    `Órdenes: ${totales.totalRegistros} (${desglose})`,
    `Total Ítems: ${totales.totalItems} (${num(totales.totalUnidades)} und. est.)`,
    totales.totalUsd > 0 ? `Total $: ${money(totales.totalUsd, 'USD')}` : null,
    totales.totalBs > 0 ? `Total Bs: ${money(totales.totalBs, 'Bs')}` : null,
  ].filter(Boolean).join('   |   ');

  doc.text(pdfSafe(txtResumen), 48, y + 17);

  y += 36;

  // Tabla detallada idéntica a MGG
  const body = filas.map((f, i) => [
    String(i + 1),
    pdfSafe(`${f.codigo}\n[${f.origenLabel}]`),
    pdfSafe(f.fechaMontadaFmt),
    pdfSafe(f.fechaPagoFmt),
    pdfSafe(f.analista),
    pdfSafe(f.proveedor),
    pdfSafe(f.almacenDestino),
    pdfSafe(`${f.numItems} ítem(s)\n(${num(f.totalUnidades)} und.)`),
    pdfSafe(money(f.montoNativo, f.moneda)),
    pdfSafe(f.estadoLabel),
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: 36, right: 36, bottom: 36 },
    head: [[
      '#',
      pdfSafe('Código / Tipo'),
      pdfSafe('Fecha Montada'),
      pdfSafe('Pagó Tesorería'),
      pdfSafe('Analista Encargado'),
      pdfSafe('Proveedor'),
      pdfSafe('Destino Sugerido'),
      pdfSafe('Ítems / Und.'),
      pdfSafe('Monto Total'),
      pdfSafe('Estado'),
    ]],
    body,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 4,
      textColor: [30, 41, 59],
      valign: 'middle',
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      1: { cellWidth: 84, fontStyle: 'bold' },
      2: { cellWidth: 68, halign: 'center' },
      3: { cellWidth: 74, halign: 'center' },
      4: { cellWidth: 92 },
      5: { cellWidth: 102 },
      6: { cellWidth: 92 },
      7: { cellWidth: 60, halign: 'center' },
      8: { cellWidth: 72, halign: 'right', fontStyle: 'bold' },
      9: { cellWidth: 54, halign: 'center' },
    },
    didDrawPage: (data) => {
      const pageNumber = data.pageNumber;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(
        pdfSafe(`Página ${pageNumber} · Golden Touch 1127 C.A. · Documento de Control Interno`),
        pageWidth / 2,
        pageHeight - 18,
        { align: 'center' },
      );
    },
  });

  const filename = `Pendientes_Recepcionar_${ahora.toISOString().slice(0, 10)}.pdf`;
  previewPdf(doc, filename);
}

/** Genera el PDF individual de una orden pendiente por recepcionar. */
export async function descargarDetallePendientePdf(
  f: FilaPendienteRecepcion,
  actor?: string | null,
): Promise<void> {
  await generarReportePendientesRecepcionPdf([f], undefined, actor);
}
