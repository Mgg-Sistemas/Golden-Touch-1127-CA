/* ============================================================
   Golden Touch · Combustible · Reporte PDF de Existencias y Movimientos
   Incluye:
     1. Resumen consolidado y existencias actuales por tanque
     2. Detalle de movimientos (surtidos y traslados) por tanque
   ============================================================ */
import { dateTime, money, num } from '@/shared/lib/format';
import { loadLogoPdfDataUrl, anchoLogoPdf, dibujarLogoPdf } from '@/shared/lib/pdfLogo';
import type { MovimientoTanque, TanqueCombustible } from '@/shared/lib/types';
import type { ReporteTanque } from './tanques.repository';
import { previewPdf } from '@/shared/lib/reportePreview';
import { isoAVe } from '@/shared/lib/fechaVE';
import { esBidon } from './bidonCombustible';

export interface ReporteExistenciasPdfArgs {
  reportes: ReporteTanque[];
  detallePorTanque: Array<{
    tanque: TanqueCombustible;
    disponible: number;
    movimientos: MovimientoTanque[];
    surtidosLitros: number;
    trasladosLitros: number;
  }>;
  periodoLabel: string;
}

export async function descargarReporteExistenciasPdf({
  reportes,
  detallePorTanque,
  periodoLabel,
}: ReporteExistenciasPdfArgs): Promise<void> {
  const [logo, { jsPDF }, { default: autoTable }] = await Promise.all([
    loadLogoPdfDataUrl().catch(() => null),
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const MARGIN = 40;
  let y = MARGIN;

  // 1. Membrete oficial
  if (logo) {
    dibujarLogoPdf(doc, logo, MARGIN, y, 42);
  }
  const tx = logo ? MARGIN + anchoLogoPdf(42) + 12 : MARGIN;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(30, 30, 30);
  doc.text('GOLDEN TOUCH 1127 C.A. · REPORTE DE COMBUSTIBLE', tx, y + 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(`Existencias y Movimientos de Surtidos / Traslados · ${periodoLabel}`, tx, y + 28);

  const ahora = dateTime(new Date().toISOString());
  doc.setFontSize(8.5);
  doc.text(`Emitido: ${ahora}`, PAGE_W - MARGIN, y + 14, { align: 'right' });
  doc.text(`${reportes.length} tanque(s) en total`, PAGE_W - MARGIN, y + 28, { align: 'right' });

  y += 48;
  doc.setDrawColor(255, 138, 0);
  doc.setLineWidth(1.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 10;

  // 2. Tabla de Existencias Actuales ("Lo que queda")
  const totalLitros = reportes.reduce((acc, r) => acc + (Number(r.disponible) || 0), 0);
  const totalValor = reportes.reduce(
    (acc, r) => acc + (Number(r.disponible) || 0) * (Number(r.tanque.tasa_usd_litro) || 0),
    0,
  );
  const tasaProm = totalLitros > 0 ? totalValor / totalLitros : 0;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text('1. Existencias Actuales por Tanque (Saldos vigentes)', MARGIN, y + 2);
  y += 8;

  const filasExistencias = reportes.map((r) => {
    const cap = Number(r.tanque.capacidad_litros) || 0;
    const disp = Number(r.disponible) || 0;
    const tasa = Number(r.tanque.tasa_usd_litro) || 0;
    const pct = cap > 0 ? Math.min(100, Math.max(0, (disp / cap) * 100)) : 0;
    const tipoLabel = esBidon(r.tanque.nombre)
      ? 'Bidón'
      : r.tanque.es_movil
        ? 'Móvil'
        : 'Estacionario';

    return [
      r.tanque.nombre,
      tipoLabel,
      `${num(disp)} L`,
      `${num(cap)} L`,
      `${pct.toFixed(0)}%`,
      money(tasa),
      money(disp * tasa),
      r.tanque.estado === 'activo' ? 'Activo' : 'Inactivo',
    ];
  });

  // Fila resumen de totales
  filasExistencias.push([
    'TOTAL DISPONIBLE',
    `${reportes.length} tanques`,
    `${num(totalLitros)} L`,
    '—',
    '—',
    `${money(tasaProm)}/L`,
    money(totalValor),
    '—',
  ]);

  autoTable(doc, {
    startY: y + 2,
    head: [['Tanque', 'Tipo', 'Disponible', 'Capacidad', '% Lleno', 'Tasa $/L', 'Valor Total ($)', 'Estado']],
    body: filasExistencias,
    margin: MARGIN,
    styles: { fontSize: 8, cellPadding: 3.5 },
    headStyles: { fillColor: [255, 138, 0], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 140, fontStyle: 'bold' },
      1: { cellWidth: 70 },
      2: { cellWidth: 80, halign: 'right', fontStyle: 'bold' },
      3: { cellWidth: 70, halign: 'right' },
      4: { cellWidth: 50, halign: 'center' },
      5: { cellWidth: 60, halign: 'right' },
      6: { cellWidth: 80, halign: 'right', fontStyle: 'bold' },
      7: { cellWidth: 50, halign: 'center' },
    },
    didParseCell: (data) => {
      // Fila de totales en negrita y fondo sutil
      if (data.row.index === filasExistencias.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [245, 245, 245];
      }
    },
  });

  const lastTable = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
  y = (lastTable?.finalY ?? y) + 16;

  // 3. Detalle de Movimientos de Surtidos y Traslados por Tanque
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text(`2. Detalle de Movimientos (Surtidos y Traslados) · ${periodoLabel}`, MARGIN, y + 2);
  y += 10;

  // Recorrer cada tanque
  for (const item of detallePorTanque) {
    // Si no hay espacio suficiente en la página para el bloque del tanque, agregar página
    if (y > PAGE_H - 120) {
      doc.addPage();
      y = MARGIN;
    }

    // Cabecera del tanque
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 30, 30);
    const subHeader = `🛢 ${item.tanque.nombre} · Saldo actual: ${num(item.disponible)} L · Surtido en periodo: ${num(item.surtidosLitros)} L · Trasladado: ${num(item.trasladosLitros)} L`;
    doc.text(subHeader, MARGIN, y + 2);
    y += 8;

    if (!item.movimientos.length) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(110, 110, 110);
      doc.text('Sin movimientos de surtido o traslado en este período.', MARGIN + 10, y + 4);
      y += 18;
      continue;
    }

    const filasMovs = item.movimientos.map((m) => {
      const tipoTxt =
        m.tipo === 'uso'
          ? '⛽ Surtido'
          : m.tipo === 'traslado'
            ? '↔ Traslado'
            : m.tipo === 'entrada'
              ? '⬇ Entrada'
              : m.tipo;

      const destinoTxt =
        m.tipo === 'uso'
          ? `${m.equipo || 'Equipo'}${m.horometro_fin != null ? ` (H: ${num(m.horometro_fin)})` : m.kilometraje != null ? ` (Km: ${num(m.kilometraje)})` : ''}`
          : m.ubicacion || 'Traslado';

      const esSalida = m.tipo === 'uso' || m.tipo === 'traslado' || m.tipo === 'merma';
      const litrosTxt = `${esSalida ? '-' : '+'}${num(m.litros)} L`;
      const saldoTxt = m.saldo_litros != null ? `${num(m.saldo_litros)} L` : '—';

      return [
        `${isoAVe(m.fecha)}${m.hora ? ` ${m.hora}` : ''}`,
        tipoTxt,
        destinoTxt,
        litrosTxt,
        saldoTxt,
        m.autorizado_por || m.actor_name || m.created_by || '—',
        m.observacion || '—',
      ];
    });

    autoTable(doc, {
      startY: y + 2,
      head: [['Fecha / Hora', 'Tipo', 'Equipo / Destino', 'Litros', 'Saldo Tanque', 'Autorizado / Desp.', 'Observación']],
      body: filasMovs,
      margin: MARGIN,
      styles: { fontSize: 7.5, cellPadding: 2.5 },
      headStyles: { fillColor: [60, 64, 67], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 70, fontStyle: 'bold' },
        2: { cellWidth: 150 },
        3: { cellWidth: 70, halign: 'right', fontStyle: 'bold' },
        4: { cellWidth: 70, halign: 'right' },
        5: { cellWidth: 110 },
        6: { cellWidth: 'auto' },
      },
    });

    const currentTable = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    y = (currentTable?.finalY ?? y) + 14;
  }

  // Vista previa e impresión
  previewPdf(doc, `reporte-existencias-movimientos-combustible-${dateTime(new Date().toISOString()).slice(0, 10)}.pdf`);
}
