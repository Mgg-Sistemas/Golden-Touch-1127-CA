/* ============================================================
   Golden Touch · Combustible · Reporte PDF de Existencias y Movimientos
   (Actualizado 04/11/2026: Soporte para corte histórico, rangos de fechas,
    KPIs de cabecera dinámicos y arqueo de apertura/cierre)
   ============================================================ */
import { dateTime, money, num } from '@/shared/lib/format';
import { loadLogoPdfDataUrl, anchoLogoPdf, dibujarLogoPdf } from '@/shared/lib/pdfLogo';
import type { MovimientoTanque, TanqueCombustible } from '@/shared/lib/types';
import type { ReporteTanque } from './tanques.repository';
import type { TotalesCorteCombustible } from './reporteExistenciasCorte';
import { previewPdf } from '@/shared/lib/reportePreview';
import { isoAVe } from '@/shared/lib/fechaVE';
import { esBidon } from './bidonCombustible';

export interface DetalleTanqueReportePdf {
  tanque: TanqueCombustible;
  disponible: number;
  movimientos: MovimientoTanque[];
  surtidosLitros: number;
  surtidosCount?: number;
  trasladosLitros?: number;
  trasladosCount?: number;
  entradasLitros?: number;
  saldoInicialLitros?: number;
  saldoCierreLitros?: number;
  saldoCierreUsd?: number;
  tasaCierre?: number;
  porcentajeLleno?: number;
}

export interface ReporteExistenciasPdfArgs {
  reportes?: ReporteTanque[];
  detallePorTanque: DetalleTanqueReportePdf[];
  periodoLabel: string;
  totalesCorte?: TotalesCorteCombustible;
}

export async function descargarReporteExistenciasPdf({
  reportes: _reportes,
  detallePorTanque,
  periodoLabel,
  totalesCorte,
}: ReporteExistenciasPdfArgs): Promise<void> {
  void _reportes;
  const [logo, { jsPDF }, { default: autoTable }] = await Promise.all([
    loadLogoPdfDataUrl().catch(() => null),
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const MARGIN = 36;
  let y = MARGIN;

  // 1. Membrete oficial
  if (logo) {
    dibujarLogoPdf(doc, logo, MARGIN, y, 40);
  }
  const tx = logo ? MARGIN + anchoLogoPdf(40) + 12 : MARGIN;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(30, 41, 59);
  doc.text('GOLDEN TOUCH 1127 C.A. · REPORTE DE COMBUSTIBLE', tx, y + 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Existencias, Saldos al Corte y Arqueo de Movimientos · ${periodoLabel}`, tx, y + 26);

  const ahora = dateTime(new Date().toISOString());
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Emitido: ${ahora}`, PAGE_W - MARGIN, y + 13, { align: 'right' });
  doc.text(`${detallePorTanque.length} tanque(s) seleccionados`, PAGE_W - MARGIN, y + 26, { align: 'right' });

  y += 40;
  doc.setDrawColor(234, 88, 12); // Naranja corporativo
  doc.setLineWidth(1.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 10;

  // 2. Tarjetas resumen de cabecera (KPIs dinámicos)
  const totalLitrosCierre =
    totalesCorte?.totalLitrosCierre ??
    detallePorTanque.reduce((acc, d) => acc + (d.saldoCierreLitros ?? d.disponible ?? 0), 0);

  const totalValorCierre =
    totalesCorte?.totalValorCierre ??
    detallePorTanque.reduce(
      (acc, d) =>
        acc +
        (d.saldoCierreUsd ?? (d.disponible ?? 0) * (Number(d.tanque.tasa_usd_litro) || 0)),
      0,
    );

  const tasaPromedio =
    totalesCorte?.tasaPromedioCierre ??
    (totalLitrosCierre > 0 ? totalValorCierre / totalLitrosCierre : 0);

  const totalSurtidos =
    totalesCorte?.totalSurtidosLitros ??
    detallePorTanque.reduce((acc, d) => acc + (d.surtidosLitros || 0), 0);

  const totalCountSurtidos =
    totalesCorte?.totalSurtidosCount ??
    detallePorTanque.reduce((acc, d) => acc + (d.surtidosCount || 0), 0);

  const totalTraslados =
    totalesCorte?.totalTrasladosLitros ??
    detallePorTanque.reduce((acc, d) => acc + (d.trasladosLitros || 0), 0);

  const totalEntradas =
    totalesCorte?.totalEntradasLitros ??
    detallePorTanque.reduce((acc, d) => acc + (d.entradasLitros || 0), 0);

  const totalApertura =
    totalesCorte?.totalLitrosApertura ??
    detallePorTanque.reduce((acc, d) => acc + (d.saldoInicialLitros ?? 0), 0);

  // Dibujar 4 cajitas KPI horizontales
  const kpiAnchoTotal = PAGE_W - 2 * MARGIN;
  const numKpis = 4;
  const kpiSeparacion = 8;
  const kpiW = (kpiAnchoTotal - (numKpis - 1) * kpiSeparacion) / numKpis;
  const kpiH = 34;

  const kpis = [
    {
      titulo: 'TOTAL AL CIERRE',
      valor: `${num(totalLitrosCierre)} L`,
      sub: `${detallePorTanque.length} tanque(s)`,
      colorBorde: [234, 88, 12] as [number, number, number],
    },
    {
      titulo: 'VALOR AL CIERRE ($)',
      valor: money(totalValorCierre),
      sub: 'Valoración contable',
      colorBorde: [34, 197, 94] as [number, number, number],
    },
    {
      titulo: 'TASA PONDERADA',
      valor: `${money(tasaPromedio)} / L`,
      sub: 'Promedio de existencias',
      colorBorde: [59, 130, 246] as [number, number, number],
    },
    {
      titulo: 'SURTIDOS EN PERIODO',
      valor: `${num(totalSurtidos)} L`,
      sub: totalCountSurtidos > 0 ? `${totalCountSurtidos} despacho(s)` : 'Sin despachos',
      colorBorde: [245, 158, 11] as [number, number, number],
    },
  ];

  kpis.forEach((kpi, idx) => {
    const kpiX = MARGIN + idx * (kpiW + kpiSeparacion);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.8);
    doc.roundedRect(kpiX, y, kpiW, kpiH, 3, 3, 'FD');

    // Borde izquierdo de color para acento
    doc.setFillColor(kpi.colorBorde[0], kpi.colorBorde[1], kpi.colorBorde[2]);
    doc.rect(kpiX, y, 3, kpiH, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.titulo, kpiX + 7, y + 10);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(kpi.valor, kpiX + 7, y + 21);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(kpi.sub, kpiX + 7, y + 29);
  });

  y += kpiH + 12;

  // 3. Tabla Arqueo y Saldos al Corte por Tanque
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text('1. Existencias y Saldos al Corte por Tanque', MARGIN, y + 2);
  y += 8;

  const filasCorte = detallePorTanque.map((d) => {
    const cap = Number(d.tanque.capacidad_litros) || 0;
    const inicial = d.saldoInicialLitros ?? 0;
    const entradas = d.entradasLitros ?? 0;
    const surtidos = d.surtidosLitros ?? 0;
    const traslados = d.trasladosLitros ?? 0;
    const cierre = (d.saldoCierreLitros ?? d.disponible) ?? 0;
    const tasa = d.tasaCierre ?? (Number(d.tanque.tasa_usd_litro) || 0);
    const valor = d.saldoCierreUsd ?? (cierre * tasa);
    const pct = cap > 0 ? Math.min(100, Math.max(0, (cierre / cap) * 100)) : 0;

    const tipoLabel = esBidon(d.tanque.nombre)
      ? 'Bidon'
      : d.tanque.es_movil
        ? 'Movil'
        : 'Estacionario';

    return [
      d.tanque.nombre,
      tipoLabel,
      `${num(inicial)} L`,
      entradas > 0 ? `+${num(entradas)} L` : '0 L',
      surtidos > 0 ? `-${num(surtidos)} L` : '0 L',
      traslados > 0 ? `-${num(traslados)} L` : '0 L',
      `${num(cierre)} L`,
      cap > 0 ? `${num(cap)} L` : '—',
      cap > 0 ? `${pct.toFixed(0)}%` : '—',
      money(tasa),
      money(valor),
    ];
  });

  function entradasTotalTxt(val: number) {
    return val > 0 ? `+${num(val)} L` : '0 L';
  }
  function surtidosTotalTxt(val: number) {
    return val > 0 ? `-${num(val)} L` : '0 L';
  }
  function trasladosTotalTxt(val: number) {
    return val > 0 ? `-${num(val)} L` : '0 L';
  }

  // Fila resumen de totales
  filasCorte.push([
    'TOTAL CONSOLIDADO',
    `${detallePorTanque.length} tanque(s)`,
    `${num(totalApertura)} L`,
    entradasTotalTxt(totalEntradas),
    surtidosTotalTxt(totalSurtidos),
    trasladosTotalTxt(totalTraslados),
    `${num(totalLitrosCierre)} L`,
    '—',
    '—',
    `${money(tasaPromedio)}/L`,
    money(totalValorCierre),
  ]);

  autoTable(doc, {
    startY: y + 2,
    head: [
      [
        'Tanque',
        'Tipo',
        'Apertura',
        'Entradas (+)',
        'Surtidos (-)',
        'Traslados (-)',
        'Saldo Cierre',
        'Capacidad',
        '% Lleno',
        'Tasa $/L',
        'Valor Cierre ($)',
      ],
    ],
    body: filasCorte,
    margin: MARGIN,
    styles: { fontSize: 7.5, cellPadding: 3, textColor: [30, 41, 59] },
    headStyles: { fillColor: [234, 88, 12], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
    columnStyles: {
      0: { cellWidth: 140, fontStyle: 'bold' },
      1: { cellWidth: 55 },
      2: { cellWidth: 55, halign: 'right' },
      3: { cellWidth: 55, halign: 'right' },
      4: { cellWidth: 55, halign: 'right' },
      5: { cellWidth: 55, halign: 'right' },
      6: { cellWidth: 65, halign: 'right', fontStyle: 'bold' },
      7: { cellWidth: 55, halign: 'right' },
      8: { cellWidth: 40, halign: 'center' },
      9: { cellWidth: 52, halign: 'right' },
      10: { cellWidth: 'auto', halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.row.index === filasCorte.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [241, 245, 249];
        data.cell.styles.textColor = [15, 23, 42];
      }
    },
  });

  const lastTable = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
  y = (lastTable?.finalY ?? y) + 16;

  // 4. Detalle de Movimientos en el Periodo
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text(`2. Detalle de Movimientos Registrados en el Periodo · ${periodoLabel}`, MARGIN, y + 2);
  y += 10;

  for (const item of detallePorTanque) {
    if (y > PAGE_H - 110) {
      doc.addPage();
      y = MARGIN;
    }

    // Cabecera por tanque con datos de corte
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.8);
    doc.roundedRect(MARGIN, y, PAGE_W - 2 * MARGIN, 20, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`TANQUE: ${item.tanque.nombre.toUpperCase()}`, MARGIN + 8, y + 13.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);

    const statsLine = `Apertura: ${num(item.saldoInicialLitros ?? 0)} L   |   Entradas: +${num(item.entradasLitros ?? 0)} L   |   Surtidos: -${num(item.surtidosLitros ?? 0)} L   |   Traslados: -${num(item.trasladosLitros ?? 0)} L   |   Saldo Cierre: ${num((item.saldoCierreLitros ?? item.disponible) ?? 0)} L`;
    doc.text(statsLine, PAGE_W - MARGIN - 8, y + 13.5, { align: 'right' });
    y += 24;

    if (!item.movimientos.length) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text('Sin movimientos registrados en este periodo.', MARGIN + 8, y + 4);
      y += 14;
      continue;
    }

    const filasMovs = item.movimientos.map((m) => {
      const tipoTxt =
        m.tipo === 'uso'
          ? 'Surtido'
          : m.tipo === 'traslado'
            ? 'Traslado'
            : m.tipo === 'entrada'
              ? 'Entrada'
              : m.tipo === 'retorno'
                ? 'Retorno'
                : m.tipo === 'merma'
                  ? 'Merma'
                  : m.tipo;

      const destinoTxt =
        m.tipo === 'uso'
          ? `${m.equipo || 'Equipo'}${m.horometro_fin != null ? ` (H: ${num(m.horometro_fin)})` : m.kilometraje != null ? ` (Km: ${num(m.kilometraje)})` : ''}`
          : m.ubicacion || 'Traslado';

      const esSalida = m.tipo === 'uso' || m.tipo === 'traslado' || m.tipo === 'merma';
      const litrosTxt = `${esSalida ? '-' : '+'}${num(m.litros)} L`;
      const saldoTxt = m.saldo_litros != null ? `${num(m.saldo_litros)} L` : '—';
      const fechaHoraTxt = `${isoAVe(m.fecha)}${m.hora ? ` ${m.hora}` : ''}`;

      return [
        fechaHoraTxt,
        tipoTxt,
        destinoTxt,
        litrosTxt,
        saldoTxt,
        m.autorizado_por || m.actor_name || m.created_by || '—',
        m.observacion || '—',
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [['Fecha / Hora', 'Tipo', 'Equipo / Destino', 'Litros', 'Saldo Tanque', 'Autorizado / Desp.', 'Observacion']],
      body: filasMovs,
      margin: MARGIN,
      styles: { fontSize: 7.5, cellPadding: 2.8, textColor: [30, 41, 59] },
      headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
      columnStyles: {
        0: { cellWidth: 95 },
        1: { cellWidth: 55, fontStyle: 'bold' },
        2: { cellWidth: 155 },
        3: { cellWidth: 65, halign: 'right', fontStyle: 'bold' },
        4: { cellWidth: 65, halign: 'right' },
        5: { cellWidth: 110 },
        6: { cellWidth: 'auto' },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const val = String(data.cell.raw ?? '');
          if (val.startsWith('-')) {
            data.cell.styles.textColor = [185, 28, 28]; // Rojo suave para salidas
          } else if (val.startsWith('+')) {
            data.cell.styles.textColor = [21, 128, 61]; // Verde para entradas
          }
        }
      },
    });

    const currentTable = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    y = (currentTable?.finalY ?? y) + 12;
  }

  // Pie de página con numeración
  const totalPaginas = doc.getNumberOfPages();
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Golden Touch 1127 C.A. · Control de Combustible · Pagina ${i} de ${totalPaginas}`,
      PAGE_W / 2,
      PAGE_H - 18,
      { align: 'center' },
    );
  }

  // Vista previa e impresión
  previewPdf(doc, `reporte-combustible-corte-${dateTime(new Date().toISOString()).slice(0, 10)}.pdf`);
}
