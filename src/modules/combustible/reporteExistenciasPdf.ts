/* ============================================================
   Golden Touch · Combustible · Reporte PDF de Existencias y Movimientos
   (Actualizado 04/11/2026: Soporte para corte histórico, rangos de fechas,
    KPIs de cabecera dinámicos, saldo puntual por tanque en cabecera
    y selector de orientación Vertical / Horizontal)
   ============================================================ */
import { dateTime, money, num } from '@/shared/lib/format';
import { loadLogoPdfDataUrl, anchoLogoPdf, dibujarLogoPdf } from '@/shared/lib/pdfLogo';
import type { MovimientoTanque, TanqueCombustible } from '@/shared/lib/types';
import type { ReporteTanque } from './tanques.repository';
import { type TotalesCorteCombustible, obtenerTituloRangoReporte } from './reporteExistenciasCorte';
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
  orientacion?: 'landscape' | 'portrait';
  fechaDesde?: string | null;
  fechaHasta?: string | null;
  tituloRango?: string;
  incluirTarjetas?: boolean;
  incluirMovimientos?: boolean;
}

export async function descargarReporteExistenciasPdf({
  reportes: _reportes,
  detallePorTanque,
  periodoLabel,
  totalesCorte,
  orientacion = 'landscape',
  fechaDesde,
  fechaHasta,
  tituloRango,
  incluirTarjetas = true,
  incluirMovimientos = true,
}: ReporteExistenciasPdfArgs): Promise<void> {
  void _reportes;
  const [logo, { jsPDF }, { default: autoTable }] = await Promise.all([
    loadLogoPdfDataUrl().catch(() => null),
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const esLandscape = orientacion === 'landscape';
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: orientacion });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const MARGIN = esLandscape ? 36 : 30;
  let y = MARGIN;

  const tituloPrincipal =
    tituloRango ||
    obtenerTituloRangoReporte(fechaDesde, fechaHasta);

  // 1. Membrete oficial
  const logoH = esLandscape ? 36 : 32;
  if (logo) {
    dibujarLogoPdf(doc, logo, MARGIN, y, logoH);
  }
  const tx = logo ? MARGIN + anchoLogoPdf(logoH) + 12 : MARGIN;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(esLandscape ? 11 : 10);
  doc.setTextColor(30, 41, 59);
  doc.text('GOLDEN TOUCH 1127 C.A. · CONTROL DE COMBUSTIBLE', tx, y + 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(esLandscape ? 7.5 : 7);
  doc.setTextColor(100, 116, 139);
  doc.text('J-50129993-5 · Existencias, Saldos al Corte y Arqueo', tx, y + 23);

  const ahora = dateTime(new Date().toISOString());
  doc.setFontSize(esLandscape ? 7.5 : 7);
  doc.setTextColor(71, 85, 105);
  doc.text(`Emitido: ${ahora}`, PAGE_W - MARGIN, y + 12, { align: 'right' });
  doc.text(`${detallePorTanque.length} tanque(s) en reporte`, PAGE_W - MARGIN, y + 23, { align: 'right' });

  // TÍTULO FORMAL CENTRADO EN GRANDE CON LAS FECHAS DEL REPORTE (ej. "Reporte del 01 al 31 de Octubre 2026")
  y += esLandscape ? 32 : 28;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(esLandscape ? 14 : 12.5);
  doc.setTextColor(15, 23, 42);
  doc.text(tituloPrincipal, PAGE_W / 2, y + 10, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(esLandscape ? 8 : 7.2);
  doc.setTextColor(100, 116, 139);
  doc.text(`Existencias, Saldos al Corte y Arqueo de Movimientos · ${periodoLabel}`, PAGE_W / 2, y + 21, { align: 'center' });

  y += 27;
  doc.setDrawColor(234, 88, 12); // Naranja corporativo
  doc.setLineWidth(1.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 9;

  // 2. Tarjetas resumen de totales consolidados (KPIs dinámicos)
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

  const kpis = [
    {
      titulo: 'TOTAL AL CIERRE',
      valor: `${num(totalLitrosCierre)} L`,
      sub: `${detallePorTanque.length} tanque(s) en reporte`,
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
      sub: 'Promedio ponderado',
      colorBorde: [59, 130, 246] as [number, number, number],
    },
    {
      titulo: 'SURTIDOS EN PERIODO',
      valor: `${num(totalSurtidos)} L`,
      sub: totalCountSurtidos > 0 ? `${totalCountSurtidos} despacho(s)` : 'Sin despachos',
      colorBorde: [245, 158, 11] as [number, number, number],
    },
  ];

  // Dibujar las 4 cajitas KPI (en Landscape: 4 columnas; en Portrait: 2 filas x 2 columnas)
  const numColsKpi = esLandscape ? 4 : 2;
  const kpiSeparacion = 7;
  const kpiW = (PAGE_W - 2 * MARGIN - (numColsKpi - 1) * kpiSeparacion) / numColsKpi;
  const kpiH = esLandscape ? 32 : 28;

  kpis.forEach((kpi, idx) => {
    const colIdx = idx % numColsKpi;
    const rowIdx = Math.floor(idx / numColsKpi);
    const kpiX = MARGIN + colIdx * (kpiW + kpiSeparacion);
    const kpiY = y + rowIdx * (kpiH + kpiSeparacion);

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.8);
    doc.roundedRect(kpiX, kpiY, kpiW, kpiH, 2.5, 2.5, 'FD');

    // Borde izquierdo de color para acento
    doc.setFillColor(kpi.colorBorde[0], kpi.colorBorde[1], kpi.colorBorde[2]);
    doc.rect(kpiX, kpiY, 3, kpiH, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(esLandscape ? 6.5 : 6);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.titulo, kpiX + 6, kpiY + 9);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(esLandscape ? 10 : 9);
    doc.setTextColor(15, 23, 42);
    doc.text(kpi.valor, kpiX + 6, kpiY + (esLandscape ? 19.5 : 18));

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(esLandscape ? 6 : 5.5);
    doc.setTextColor(148, 163, 184);
    doc.text(kpi.sub, kpiX + 6, kpiY + (esLandscape ? 27 : 24.5));
  });

  const totalKpiRows = Math.ceil(kpis.length / numColsKpi);
  y += totalKpiRows * (kpiH + kpiSeparacion) + 8;

  // 3. SECCIÓN: SALDO PUNTUAL POR TANQUE EN CABECERA (activada por check de tarjetas)
  if (incluirTarjetas) {
    const rawCorte =
      totalesCorte?.cierreFechaLabel ||
      (fechaHasta ? isoAVe(fechaHasta) : 'Corte actual');
    const fechaLimpia = rawCorte.replace(/^cierre\s+(al\s+)?/i, '').trim();
    const fechaCorteLabel = fechaLimpia ? `AL ${fechaLimpia.toUpperCase()}` : 'AL CORTE';

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text(`SALDO PUNTUAL POR TANQUE · CIERRE ${fechaCorteLabel}`, MARGIN, y + 2);
    y += 7;

    // Cuadrícula dinámica de fichas por tanque (como en la vista de selección)
    const numTanques = detallePorTanque.length;
    const colsFichas = esLandscape
      ? numTanques <= 3
        ? numTanques
        : numTanques <= 6
          ? 3
          : 4
      : numTanques <= 2
        ? numTanques
        : 3;

    const cardGap = 6;
    const cardW = (PAGE_W - 2 * MARGIN - (colsFichas - 1) * cardGap) / colsFichas;
    const cardH = esLandscape ? 36 : 38;

    detallePorTanque.forEach((d, idx) => {
      const col = idx % colsFichas;
      const row = Math.floor(idx / colsFichas);
      const cardX = MARGIN + col * (cardW + cardGap);
      const cardY = y + row * (cardH + cardGap);

      const cap = Number(d.tanque.capacidad_litros) || 0;
      const cierre = (d.saldoCierreLitros ?? d.disponible) ?? 0;
      const tasa = d.tasaCierre ?? (Number(d.tanque.tasa_usd_litro) || 0);
      const valor = d.saldoCierreUsd ?? cierre * tasa;
      const pct = cap > 0 ? Math.min(100, Math.max(0, (cierre / cap) * 100)) : 0;

      // Fondo y borde de la tarjeta
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.7);
      doc.roundedRect(cardX, cardY, cardW, cardH, 2.5, 2.5, 'FD');

      // Borde lateral de acento (naranja si positivo, rojo si negativo, gris si cero)
      const colorAcento =
        cierre > 0 ? [234, 88, 12] : cierre < 0 ? [220, 38, 38] : [148, 163, 184];
      doc.setFillColor(colorAcento[0], colorAcento[1], colorAcento[2]);
      doc.rect(cardX, cardY, 3, cardH, 'F');

      // Fila 1: Nombre del tanque y % Capacidad / Tipo
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(esLandscape ? 7 : 6.5);
      doc.setTextColor(15, 23, 42);
      const maxLen = esLandscape ? 22 : 18;
      const nombreTruncado =
        d.tanque.nombre.length > maxLen
          ? d.tanque.nombre.slice(0, maxLen - 2) + '…'
          : d.tanque.nombre;
      doc.text(nombreTruncado.toUpperCase(), cardX + 7, cardY + 9);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      const capInfo =
        cap > 0
          ? `${pct.toFixed(0)}%`
          : esBidon(d.tanque.nombre)
            ? 'Bidón'
            : d.tanque.es_movil
              ? 'Móvil'
              : 'Estac.';
      doc.text(capInfo, cardX + cardW - 6, cardY + 9, { align: 'right' });

      // Fila 2: Saldo puntual prominente en litros y valor en USD
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(esLandscape ? 10.5 : 9.5);
      doc.setTextColor(colorAcento[0], colorAcento[1], colorAcento[2]);
      doc.text(`${num(cierre)} L`, cardX + 7, cardY + (esLandscape ? 20.5 : 20));

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(esLandscape ? 7.5 : 6.8);
      doc.setTextColor(22, 101, 52); // Verde contable
      doc.text(money(valor), cardX + cardW - 6, cardY + (esLandscape ? 20 : 19.5), { align: 'right' });

      // Fila 3: Subtítulo con fecha de cierre y datos técnicos
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(esLandscape ? 5.8 : 5.2);
      doc.setTextColor(100, 116, 139);
      doc.text(`Cierre: ${fechaLimpia || 'al corte'}`, cardX + 7, cardY + (esLandscape ? 30 : 31));

      const subtasa =
        cap > 0
          ? `Cap: ${num(cap)} L · ${money(tasa)}`
          : `Tasa: ${money(tasa)}/L`;
      doc.text(subtasa, cardX + cardW - 6, cardY + (esLandscape ? 30 : 31), { align: 'right' });
    });

    const totalFichasRows = Math.ceil(numTanques / colsFichas);
    y += totalFichasRows * (cardH + cardGap) + 10;
  }

  // 4. DETALLADO ENUMERADO 1: Tabla de Arqueo y Saldos al Corte por Tanque
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);
  doc.text('1. Existencias y Saldos al Corte por Tanque', MARGIN, y + 2);
  y += 7;

  const filasCorte = detallePorTanque.map((d) => {
    const cap = Number(d.tanque.capacidad_litros) || 0;
    const inicial = d.saldoInicialLitros ?? 0;
    const entradas = d.entradasLitros ?? 0;
    const surtidos = d.surtidosLitros ?? 0;
    const traslados = d.trasladosLitros ?? 0;
    const cierre = (d.saldoCierreLitros ?? d.disponible) ?? 0;
    const tasa = d.tasaCierre ?? (Number(d.tanque.tasa_usd_litro) || 0);
    const valor = d.saldoCierreUsd ?? cierre * tasa;
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
    styles: {
      fontSize: esLandscape ? 7.5 : 6.5,
      cellPadding: esLandscape ? 2.8 : 2,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [234, 88, 12],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: esLandscape ? 7.5 : 6.5,
    },
    columnStyles: esLandscape
      ? {
          0: { cellWidth: 135, fontStyle: 'bold' },
          1: { cellWidth: 55 },
          2: { cellWidth: 55, halign: 'right' },
          3: { cellWidth: 52, halign: 'right' },
          4: { cellWidth: 52, halign: 'right' },
          5: { cellWidth: 52, halign: 'right' },
          6: { cellWidth: 65, halign: 'right', fontStyle: 'bold' },
          7: { cellWidth: 55, halign: 'right' },
          8: { cellWidth: 42, halign: 'center' },
          9: { cellWidth: 50, halign: 'right' },
          10: { cellWidth: 'auto', halign: 'right', fontStyle: 'bold' },
        }
      : {
          0: { cellWidth: 95, fontStyle: 'bold' },
          1: { cellWidth: 44 },
          2: { cellWidth: 43, halign: 'right' },
          3: { cellWidth: 43, halign: 'right' },
          4: { cellWidth: 43, halign: 'right' },
          5: { cellWidth: 43, halign: 'right' },
          6: { cellWidth: 52, halign: 'right', fontStyle: 'bold' },
          7: { cellWidth: 45, halign: 'right' },
          8: { cellWidth: 35, halign: 'center' },
          9: { cellWidth: 42, halign: 'right' },
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
  y = (lastTable?.finalY ?? y) + 14;

  // 5. DETALLADO ENUMERADO 2: Detalle de Movimientos en el Periodo (activado por check de movimientos)
  if (incluirMovimientos) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    doc.text(`2. Detalle de Movimientos Registrados en el Periodo · ${periodoLabel}`, MARGIN, y + 2);
    y += 8;

    for (const item of detallePorTanque) {
      if (y > PAGE_H - 100) {
        doc.addPage();
        y = MARGIN;
      }

      // Cabecera por tanque con datos de corte
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.8);
      doc.roundedRect(MARGIN, y, PAGE_W - 2 * MARGIN, 18, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(esLandscape ? 8 : 7.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`TANQUE: ${item.tanque.nombre.toUpperCase()}`, MARGIN + 7, y + 12);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(esLandscape ? 7 : 6.5);
      doc.setTextColor(71, 85, 105);

      const statsLine = `Apertura: ${num(item.saldoInicialLitros ?? 0)} L   |   Entradas: +${num(item.entradasLitros ?? 0)} L   |   Surtidos: -${num(item.surtidosLitros ?? 0)} L   |   Traslados: -${num(item.trasladosLitros ?? 0)} L   |   Saldo Cierre: ${num((item.saldoCierreLitros ?? item.disponible) ?? 0)} L`;
      doc.text(statsLine, PAGE_W - MARGIN - 7, y + 12, { align: 'right' });
      y += 22;

      if (!item.movimientos.length) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text('Sin movimientos registrados en este periodo.', MARGIN + 7, y + 4);
        y += 12;
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
        styles: {
          fontSize: esLandscape ? 7.2 : 6.5,
          cellPadding: esLandscape ? 2.5 : 1.8,
          textColor: [30, 41, 59],
        },
        headStyles: {
          fillColor: [51, 65, 85],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: esLandscape ? 7.2 : 6.5,
        },
        columnStyles: esLandscape
          ? {
              0: { cellWidth: 95 },
              1: { cellWidth: 55, fontStyle: 'bold' },
              2: { cellWidth: 155 },
              3: { cellWidth: 65, halign: 'right', fontStyle: 'bold' },
              4: { cellWidth: 65, halign: 'right' },
              5: { cellWidth: 110 },
              6: { cellWidth: 'auto' },
            }
          : {
              0: { cellWidth: 80 },
              1: { cellWidth: 45, fontStyle: 'bold' },
              2: { cellWidth: 115 },
              3: { cellWidth: 50, halign: 'right', fontStyle: 'bold' },
              4: { cellWidth: 50, halign: 'right' },
              5: { cellWidth: 85 },
              6: { cellWidth: 'auto' },
            },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 3) {
            const val = String(data.cell.raw ?? '');
            if (val.startsWith('-')) {
              data.cell.styles.textColor = [185, 28, 28];
            } else if (val.startsWith('+')) {
              data.cell.styles.textColor = [21, 128, 61];
            }
          }
        },
      });

      const currentTable = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
      y = (currentTable?.finalY ?? y) + 12;
    }
  }

  // Pie de página con numeración
  const totalPaginas = doc.getNumberOfPages();
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(esLandscape ? 7.5 : 7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Golden Touch 1127 C.A. · Control de Combustible · Pagina ${i} de ${totalPaginas}`,
      PAGE_W / 2,
      PAGE_H - (esLandscape ? 18 : 15),
      { align: 'center' },
    );
  }

  // Vista previa e impresión
  previewPdf(doc, `reporte-combustible-corte-${dateTime(new Date().toISOString()).slice(0, 10)}.pdf`);
}
