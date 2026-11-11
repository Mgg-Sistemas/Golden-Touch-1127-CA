/* ============================================================
   Golden Touch · Combustible · Reporte PDF de Existencias y Movimientos
   (Actualizado 11/11/2026: Formato editorial de alta fidelidad con
    híbrido de fichas y tablas, membrete dual corporativo GT,
    Hero KPI unificado, tarjetas de tanque con mini-barra de nivel
    y cabeceras estructuradas con acento de sección)
   ============================================================ */
import { dateTime, money, num } from '@/shared/lib/format';
import { loadLogoPdfEmpresa, anchoLogoPdf, dibujarLogoPdf } from '@/shared/lib/pdfLogo';
import { identidadEmpresa } from '@/shared/lib/empresa';
import type { MovimientoTanque, TanqueCombustible } from '@/shared/lib/types';
import type { ReporteTanque } from './tanques.repository';
import { type TotalesCorteCombustible, obtenerTituloRangoReporte } from './reporteExistenciasCorte';
import { previewPdf } from '@/shared/lib/reportePreview';
import { isoAVe } from '@/shared/lib/fechaVE';
import { esBidon } from './bidonCombustible';
import { pdfSafe } from '@/shared/lib/pdfSafe';

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
    loadLogoPdfEmpresa('GT').catch(() => null),
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const esLandscape = orientacion === 'landscape';
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: orientacion });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const MARGIN = esLandscape ? 32 : 28;
  const UW = PAGE_W - MARGIN * 2;
  let y = MARGIN;

  const idEmp = identidadEmpresa('GT');

  // Paleta corporativa Golden Touch
  const NARANJA: [number, number, number] = [255, 138, 0];
  const TINTA: [number, number, number] = [30, 41, 59];
  const GRIS_TEXTO: [number, number, number] = [100, 116, 139];
  const GRIS_CLARO: [number, number, number] = [148, 163, 184];
  const BORDE: [number, number, number] = [226, 232, 240];
  const FONDO_SUAVE: [number, number, number] = [250, 247, 245];
  const VERDE: [number, number, number] = [22, 101, 52];
  const ROJO: [number, number, number] = [185, 28, 28];

  const tituloPrincipal =
    tituloRango ||
    obtenerTituloRangoReporte(fechaDesde, fechaHasta);

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
  doc.setTextColor(...TINTA);
  doc.text(idEmp.nombre || 'MINERA GOLDEN TOUCH 1127, C.A.', tx, y + 11);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(...GRIS_TEXTO);
  doc.text('EXPLOTACIÓN Y BENEFICIO DE MINERALES', tx, y + 21);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.0);
  doc.setTextColor(...GRIS_TEXTO);
  doc.text(`RIF: ${idEmp.rif || 'J-50129993-5'} · Mina Peramanal`, tx, y + 30);

  doc.setFontSize(6.8);
  doc.setTextColor(...GRIS_CLARO);
  doc.text('EL CALLAO · ESTADO BOLÍVAR · VENEZUELA', tx, y + 38);

  // Lado derecho: Caja ejecutiva formal de metadatos del reporte
  const boxW = Math.min(235, Math.max(195, UW * 0.36));
  const boxH = 46;
  const bx = PAGE_W - MARGIN - boxW;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...BORDE);
  doc.setLineWidth(0.6);
  doc.roundedRect(bx, y, boxW, boxH, 3, 3, 'FD');

  const barH = 14;
  doc.setFillColor(...NARANJA);
  doc.roundedRect(bx, y, boxW, barH, 3, 3, 'F');
  doc.rect(bx, y + barH - 3, boxW, 3, 'F'); // Relleno esquinas inferiores

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(255, 255, 255);
  doc.text('CONTROL DE COMBUSTIBLE', bx + boxW / 2, y + 10, { align: 'center' });

  // Filas internas alineadas
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...GRIS_TEXTO);
  doc.text('EMITIDO:', bx + 8, y + 23);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TINTA);
  doc.text(fechaHoraEmision, bx + 50, y + 23);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...GRIS_TEXTO);
  doc.text('PERÍODO:', bx + 8, y + 32);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TINTA);
  let perTxt = pdfSafe(tituloPrincipal);
  if (doc.getTextWidth(perTxt) > boxW - 56) {
    while (perTxt.length > 3 && doc.getTextWidth(perTxt + '…') > boxW - 56) {
      perTxt = perTxt.slice(0, -1);
    }
    perTxt += '…';
  }
  doc.text(perTxt, bx + 50, y + 32);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...GRIS_TEXTO);
  doc.text('ALCANCE:', bx + 8, y + 41);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TINTA);
  doc.text(`${detallePorTanque.length} tanque(s) en reporte`, bx + 50, y + 41);

  y = Math.max(y + cajaLogo + 6, y + boxH + 8);

  // 2. CINTILLO DE ALCANCE DEL REPORTE (A todo el ancho útil)
  const stripH = 17;
  doc.setFillColor(...FONDO_SUAVE);
  doc.setDrawColor(...BORDE);
  doc.setLineWidth(0.5);
  doc.roundedRect(MARGIN, y, UW, stripH, 2.5, 2.5, 'FD');

  doc.setFillColor(...NARANJA);
  doc.roundedRect(MARGIN, y, 3.5, stripH, 2.5, 2.5, 'F');
  doc.rect(MARGIN + 2, y, 1.5, stripH, 'F'); // Unión de esquina

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.0);
  doc.setTextColor(...NARANJA);
  doc.text('ALCANCE DEL REPORTE:', MARGIN + 8, y + 11.5);
  const alcW = doc.getTextWidth('ALCANCE DEL REPORTE:');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.0);
  doc.setTextColor(...TINTA);
  doc.text(
    pdfSafe(`Existencias, Saldos al Corte y Arqueo de Movimientos · ${periodoLabel}`),
    MARGIN + 8 + alcW + 5,
    y + 11.5,
  );

  y += stripH + 8;

  // Cálculos de totales consolidados
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

  // 3. BLOQUE SUPERIOR DE KPIS: Hero Box Unificado + Trío Analítico
  const heroH = esLandscape ? 40 : 42;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...BORDE);
  doc.setLineWidth(0.6);
  doc.roundedRect(MARGIN, y, UW, heroH, 3.5, 3.5, 'FD');

  // Lado izquierdo del Hero Box: Saldo Total en Litros
  const heroMitad = UW * 0.52;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(...GRIS_TEXTO);
  doc.text('TOTAL AL CIERRE (VOLUMEN DISPONIBLE)', MARGIN + 10, y + 11.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(esLandscape ? 17 : 16);
  doc.setTextColor(15, 23, 42);
  doc.text(`${num(totalLitrosCierre)} L`, MARGIN + 10, y + (esLandscape ? 26.5 : 26));

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(...GRIS_TEXTO);
  doc.text(`Tasa promedio ponderada: ${money(tasaPromedio)} / L`, MARGIN + 10, y + (esLandscape ? 35 : 36));

  // Línea divisoria suave vertical
  doc.setDrawColor(...BORDE);
  doc.setLineWidth(0.5);
  doc.line(MARGIN + heroMitad, y + 6, MARGIN + heroMitad, y + heroH - 6);

  // Lado derecho del Hero Box: Panel destacado de Valuación USD
  const pRightX = MARGIN + heroMitad + 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(...NARANJA);
  doc.text('VALOR AL CIERRE (VALUACIÓN CONTABLE)', pRightX, y + 11.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(esLandscape ? 15 : 14);
  doc.setTextColor(...NARANJA);
  doc.text(money(totalValorCierre), pRightX, y + (esLandscape ? 25.5 : 25));

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.6);
  doc.setTextColor(...GRIS_TEXTO);
  doc.text(`Valoración contable total · ${detallePorTanque.length} tanque(s) analizados`, pRightX, y + (esLandscape ? 35 : 36));

  y += heroH + 6;

  // Trío analítico de tarjetas complementarias
  const trioKpis = [
    {
      titulo: 'SURTIDOS EN PERÍODO',
      valor: `${num(totalSurtidos)} L`,
      sub: totalCountSurtidos > 0 ? `${totalCountSurtidos} despacho(s) registrados` : 'Sin despachos registrados',
      colorAcento: [245, 158, 11] as [number, number, number],
    },
    {
      titulo: 'TRASLADOS Y MOVIMIENTOS',
      valor: `${num(totalTraslados)} L transferidos`,
      sub: totalEntradas > 0 ? `Entradas de combustible: +${num(totalEntradas)} L` : 'Sin entradas registradas',
      colorAcento: [59, 130, 246] as [number, number, number],
    },
    {
      titulo: 'INVENTARIO INICIAL Y VARIACIÓN',
      valor: `${num(totalApertura)} L iniciales`,
      sub: `Variación neta: ${totalLitrosCierre >= totalApertura ? '+' : ''}${num(totalLitrosCierre - totalApertura)} L`,
      colorAcento: [34, 197, 94] as [number, number, number],
    },
  ];

  const trioCols = 3;
  const trioGap = 6;
  const trioW = (UW - (trioCols - 1) * trioGap) / trioCols;
  const trioH = esLandscape ? 28 : 27;

  trioKpis.forEach((kpi, idx) => {
    const kx = MARGIN + idx * (trioW + trioGap);
    doc.setFillColor(...FONDO_SUAVE);
    doc.setDrawColor(...BORDE);
    doc.setLineWidth(0.5);
    doc.roundedRect(kx, y, trioW, trioH, 2.5, 2.5, 'FD');

    doc.setFillColor(kpi.colorAcento[0], kpi.colorAcento[1], kpi.colorAcento[2]);
    doc.rect(kx, y, 2.5, trioH, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(kpi.titulo, kx + 6, y + 8.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(esLandscape ? 9.5 : 9.0);
    doc.setTextColor(15, 23, 42);
    doc.text(kpi.valor, kx + 6, y + 17.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(...GRIS_CLARO);
    doc.text(kpi.sub, kx + 6, y + 24.5);
  });

  y += trioH + 10;

  // 4. SECCIÓN: SALDO PUNTUAL POR TANQUE EN CABECERA (Fichas híbridas con mini-barra de nivel)
  if (incluirTarjetas) {
    const rawCorte =
      totalesCorte?.cierreFechaLabel ||
      (fechaHasta ? isoAVe(fechaHasta) : 'Corte actual');
    const fechaLimpia = rawCorte.replace(/^cierre\s+(al\s+)?/i, '').trim();
    const fechaCorteLabel = fechaLimpia ? `AL ${fechaLimpia.toUpperCase()}` : 'AL CORTE';

    // Rótulo formal de sección con barra vertical naranja
    doc.setFillColor(...NARANJA);
    doc.rect(MARGIN, y, 3.5, 10, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...TINTA);
    doc.text(`SALDO PUNTUAL POR TANQUE · CIERRE ${fechaCorteLabel}`, MARGIN + 7, y + 8);
    const titleW = doc.getTextWidth(`SALDO PUNTUAL POR TANQUE · CIERRE ${fechaCorteLabel}`);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text('Inventario disponible y nivel al corte', MARGIN + 7 + titleW + 8, y + 8);
    y += 14;

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
    const cardW = (UW - (colsFichas - 1) * cardGap) / colsFichas;
    const cardH = esLandscape ? 38 : 39;

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

      // Tarjeta con fondo blanco y borde suave
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...BORDE);
      doc.setLineWidth(0.6);
      doc.roundedRect(cardX, cardY, cardW, cardH, 2.5, 2.5, 'FD');

      // Acento vertical izquierdo
      const colorAcento =
        cierre > 0 ? NARANJA : cierre < 0 ? ROJO : GRIS_CLARO;
      doc.setFillColor(...colorAcento);
      doc.rect(cardX, cardY, 2.5, cardH, 'F');

      // Fila 1: Nombre del tanque y Badge de % Capacidad / Tipo
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(esLandscape ? 7.2 : 6.8);
      doc.setTextColor(15, 23, 42);
      const maxLen = esLandscape ? 22 : 18;
      const nombreTruncado =
        d.tanque.nombre.length > maxLen
          ? d.tanque.nombre.slice(0, maxLen - 2) + '…'
          : d.tanque.nombre;
      doc.text(nombreTruncado.toUpperCase(), cardX + 7, cardY + 9.5);

      // Badge elegante a la derecha
      const capInfo =
        cap > 0
          ? `${pct.toFixed(0)}%`
          : esBidon(d.tanque.nombre)
            ? 'Bidón'
            : d.tanque.es_movil
              ? 'Móvil'
              : 'Estac.';
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.0);
      doc.setTextColor(...GRIS_TEXTO);
      doc.text(capInfo, cardX + cardW - 6, cardY + 9.5, { align: 'right' });

      // Fila 2: Saldo puntual prominente en naranja y valor en verde
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(esLandscape ? 10.5 : 10.0);
      doc.setTextColor(...colorAcento);
      doc.text(`${num(cierre)} L`, cardX + 7, cardY + (esLandscape ? 21 : 20.5));

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(esLandscape ? 7.5 : 7.0);
      doc.setTextColor(...VERDE);
      doc.text(money(valor), cardX + cardW - 6, cardY + (esLandscape ? 20.5 : 20.0), { align: 'right' });

      // Fila 3: Detalle técnico inferior
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(esLandscape ? 5.8 : 5.4);
      doc.setTextColor(...GRIS_TEXTO);
      doc.text(`Cierre: ${fechaLimpia || 'al corte'}`, cardX + 7, cardY + (esLandscape ? 30 : 29.5));

      const subtasa =
        cap > 0
          ? `Cap: ${num(cap)} L · ${money(tasa)}`
          : `Tasa: ${money(tasa)}/L`;
      doc.text(subtasa, cardX + cardW - 6, cardY + (esLandscape ? 30 : 29.5), { align: 'right' });

      // Mini-barra de progreso de capacidad en la base de la ficha
      if (cap > 0) {
        const barY = cardY + cardH - 3;
        const barMaxW = cardW - 14;
        doc.setFillColor(241, 245, 249);
        doc.rect(cardX + 7, barY, barMaxW, 1.8, 'F');

        const barFillW = Math.max(1, (pct / 100) * barMaxW);
        doc.setFillColor(...colorAcento);
        doc.rect(cardX + 7, barY, barFillW, 1.8, 'F');
      }
    });

    const totalFichasRows = Math.ceil(numTanques / colsFichas);
    y += totalFichasRows * (cardH + cardGap) + 10;
  }

  // 5. DETALLADO ENUMERADO 1: Tabla de Arqueo y Saldos al Corte por Tanque
  doc.setFillColor(...NARANJA);
  doc.rect(MARGIN, y, 3.5, 10, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.0);
  doc.setTextColor(...TINTA);
  doc.text('1. EXISTENCIAS Y SALDOS AL CORTE POR TANQUE', MARGIN + 7, y + 8);
  const t1W = doc.getTextWidth('1. EXISTENCIAS Y SALDOS AL CORTE POR TANQUE');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(...GRIS_TEXTO);
  doc.text('Arqueo consolidado de inventario y valuación por tanque', MARGIN + 7 + t1W + 8, y + 8);
  y += 13;

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
      ? 'Bidón'
      : d.tanque.es_movil
        ? 'Móvil'
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
    startY: y,
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
    theme: 'grid',
    styles: {
      fontSize: esLandscape ? 7.4 : 6.5,
      cellPadding: esLandscape ? 2.8 : 2.2,
      lineColor: BORDE,
      lineWidth: 0.3,
      textColor: TINTA,
      valign: 'middle',
    },
    alternateRowStyles: {
      fillColor: FONDO_SUAVE,
    },
    headStyles: {
      fillColor: NARANJA,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: esLandscape ? 7.4 : 6.5,
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
  y = (lastTable?.finalY ?? y) + 6;

  // Nota metodológica bajo la tabla 1
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.8);
  doc.setTextColor(...GRIS_TEXTO);
  doc.text(
    '* Saldos calculados al corte de fecha especificado. El valor contable en USD se determina multiplicando el saldo disponible por la tasa ponderada de cada tanque.',
    MARGIN,
    y,
  );
  y += 12;

  // 6. DETALLADO ENUMERADO 2: Detalle de Movimientos en el Periodo
  if (incluirMovimientos) {
    if (y > PAGE_H - 120) {
      doc.addPage();
      y = MARGIN;
    }

    doc.setFillColor(...NARANJA);
    doc.rect(MARGIN, y, 3.5, 10, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.0);
    doc.setTextColor(...TINTA);
    doc.text(`2. DETALLE DE MOVIMIENTOS REGISTRADOS EN EL PERÍODO`, MARGIN + 7, y + 8);
    const t2W = doc.getTextWidth(`2. DETALLE DE MOVIMIENTOS REGISTRADOS EN EL PERÍODO`);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(pdfSafe(`Historial cronológico de despachos, entradas y traslados · ${periodoLabel}`), MARGIN + 7 + t2W + 8, y + 8);
    y += 14;

    for (const item of detallePorTanque) {
      if (y > PAGE_H - 110) {
        doc.addPage();
        y = MARGIN;
      }

      // Cintillo-resumen de grupo por tanque (compacto, fondo suave, esquinas redondeadas)
      const groupH = 16;
      doc.setFillColor(...FONDO_SUAVE);
      doc.setDrawColor(...BORDE);
      doc.setLineWidth(0.5);
      doc.roundedRect(MARGIN, y, UW, groupH, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(esLandscape ? 7.8 : 7.2);
      doc.setTextColor(15, 23, 42);
      doc.text(`TANQUE: ${item.tanque.nombre.toUpperCase()}`, MARGIN + 7, y + 10.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(esLandscape ? 6.8 : 6.2);
      doc.setTextColor(71, 85, 105);

      const statsLine = `Apertura: ${num(item.saldoInicialLitros ?? 0)} L   |   Entradas: +${num(item.entradasLitros ?? 0)} L   |   Surtidos: -${num(item.surtidosLitros ?? 0)} L   |   Traslados: -${num(item.trasladosLitros ?? 0)} L   |   Saldo Cierre: ${num((item.saldoCierreLitros ?? item.disponible) ?? 0)} L`;
      doc.text(statsLine, PAGE_W - MARGIN - 7, y + 10.5, { align: 'right' });
      y += groupH + 4;

      if (!item.movimientos.length) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(6.8);
        doc.setTextColor(...GRIS_CLARO);
        doc.text('Sin movimientos registrados en este período para este tanque.', MARGIN + 7, y + 6);
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
          pdfSafe(destinoTxt),
          litrosTxt,
          saldoTxt,
          pdfSafe(m.autorizado_por || m.actor_name || m.created_by || '—'),
          pdfSafe(m.observacion || '—'),
        ];
      });

      autoTable(doc, {
        startY: y,
        head: [['Fecha / Hora', 'Tipo', 'Equipo / Destino', 'Litros', 'Saldo Tanque', 'Autorizado / Desp.', 'Observación']],
        body: filasMovs,
        margin: MARGIN,
        theme: 'grid',
        styles: {
          fontSize: esLandscape ? 7.0 : 6.3,
          cellPadding: esLandscape ? 2.5 : 1.8,
          lineColor: BORDE,
          lineWidth: 0.3,
          textColor: TINTA,
          valign: 'middle',
        },
        alternateRowStyles: {
          fillColor: FONDO_SUAVE,
        },
        headStyles: {
          fillColor: [51, 65, 85], // Gris azulado pizarra
          textColor: 255,
          fontStyle: 'bold',
          fontSize: esLandscape ? 7.0 : 6.3,
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
              data.cell.styles.textColor = ROJO;
            } else if (val.startsWith('+')) {
              data.cell.styles.textColor = VERDE;
            }
          }
        },
      });

      const currentTable = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
      y = (currentTable?.finalY ?? y) + 12;
    }
  }

  // 7. PIE DE PÁGINA FORMAL CON LÍNEA Y NUMERACIÓN
  const totalPaginas = doc.getNumberOfPages();
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);

    doc.setDrawColor(...BORDE);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, PAGE_H - (esLandscape ? 20 : 18), PAGE_W - MARGIN, PAGE_H - (esLandscape ? 20 : 18));

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(esLandscape ? 6.8 : 6.2);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(
      `Documento generado por el sistema · Control de Combustible GT · Minera Golden Touch 1127, C.A.`,
      MARGIN,
      PAGE_H - (esLandscape ? 10 : 9),
    );

    doc.text(
      `Página ${i} de ${totalPaginas}`,
      PAGE_W - MARGIN,
      PAGE_H - (esLandscape ? 10 : 9),
      { align: 'right' },
    );
  }

  // Vista previa e impresión
  previewPdf(doc, `reporte-combustible-corte-${dateTime(new Date().toISOString()).slice(0, 10)}.pdf`);
}
