/* ============================================================
   Golden Touch · Inventario · PDF Dinámico de Pendientes por Recepcionar
   (18/11/2026)

   Genera y previsualiza (`previewPdf`) el reporte moldeable de órdenes
   pendientes por recepcionar en modo Tabla o Fichas Ejecutivas, incluyendo
   siempre las columnas seleccionadas (Analista encargado, Fecha montada,
   Fecha de pago de Tesorería, Proveedor, Solicitante, Destino, Ítems y Monto).
   ============================================================ */

import { previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import { identidadEmpresa } from '@/shared/lib/empresa';
import { loadLogoPdfEmpresa, dibujarLogoPdf, anchoLogoPdf } from '@/shared/lib/pdfLogo';
import { dateTime, money, num } from '@/shared/lib/format';
import {
  CAMPOS_PENDIENTES_RECEPCION,
  ETIQUETA_AGRUPACION_PENDIENTES,
  agruparPendientesRecepcion,
  calcularResumenPendientes,
  type AgrupacionPendientesRecepcion,
  type CampoPendienteRecepcion,
  type DefinicionCampoPendiente,
  type FilaPendienteRecepcion,
} from './pendientesRecepcionReporte';

const NARANJA: [number, number, number] = [255, 138, 0];
const VERDE: [number, number, number] = [16, 185, 129];
const AMBAR: [number, number, number] = [217, 119, 6];
const TINTA: [number, number, number] = [30, 41, 59];
const SUBTINTA: [number, number, number] = [100, 116, 139];
const BORDE: [number, number, number] = [203, 213, 225];
const FONDO_ALT: [number, number, number] = [250, 246, 240];
const FONDO_GRUPO: [number, number, number] = [255, 243, 224];

export interface OpcionesPdfPendientesRecepcion {
  filas: FilaPendienteRecepcion[];
  campos: CampoPendienteRecepcion[];
  agrupacion: AgrupacionPendientesRecepcion;
  formatoPresentacion: 'tabla' | 'fichas';
  orientacion: 'auto' | 'landscape' | 'portrait';
  incluirResumen: boolean;
  subtituloFiltros?: string;
}

const hoyStr = () => new Date().toISOString().slice(0, 10);

function textoCeldaTabla(f: FilaPendienteRecepcion, clave: CampoPendienteRecepcion): string {
  switch (clave) {
    case 'codigo':
      return f.codigoSolicitud ? `${f.codigo}\n(${f.codigoSolicitud})` : f.codigo;
    case 'tipo_estado':
      return `${f.origenCorto} · ${f.estadoLabel}`;
    case 'analista':
      return f.analista || 'Por asignar';
    case 'fecha_montada':
      return f.fechaMontadaFmt;
    case 'fecha_pago':
      return f.fechaPagoFmt;
    case 'dias':
      return `${f.diasPendiente} d`;
    case 'proveedor':
      return f.proveedor || '—';
    case 'solicitante':
      return f.unidadSolicitante ? `${f.solicitante}\n(${f.unidadSolicitante})` : f.solicitante;
    case 'almacen':
      return f.almacenDestino;
    case 'items':
      return `${num(f.numItems)} ítem(s) · ${num(f.totalUnidades)} und.`;
    case 'detalle_items':
      return f.itemsResumen;
    case 'monto':
      return f.moneda === 'Bs' ? `${f.montoNativoFmt}\n(${money(f.montoUsd)})` : money(f.montoUsd);
    default:
      return '—';
  }
}

export async function descargarPendientesRecepcionPdf({
  filas,
  campos,
  agrupacion,
  formatoPresentacion,
  orientacion,
  incluirResumen,
  subtituloFiltros,
}: OpcionesPdfPendientesRecepcion): Promise<void> {
  if (!filas.length) {
    throw new Error('No hay órdenes seleccionadas para generar el PDF.');
  }

  const camposActivosSet = new Set<CampoPendienteRecepcion>(
    campos.length ? campos : ['codigo', 'analista', 'fecha_montada', 'fecha_pago', 'monto'],
  );
  const columnas: DefinicionCampoPendiente[] = CAMPOS_PENDIENTES_RECEPCION.filter((c) => camposActivosSet.has(c.clave));
  if (!columnas.length) {
    throw new Error('Selecciona al menos un campo para generar el PDF.');
  }

  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const esFichas = formatoPresentacion === 'fichas';
  const orient: 'landscape' | 'portrait' =
    orientacion === 'portrait'
      ? 'portrait'
      : orientacion === 'landscape'
        ? 'landscape'
        : esFichas || columnas.length > 6
          ? 'landscape'
          : 'portrait';

  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: orient });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 32;
  const UW = W - M * 2;
  let y = M;

  const idEmp = identidadEmpresa('GT');
  const logo = await loadLogoPdfEmpresa('GT').catch(() => null);
  const resumen = calcularResumenPendientes(filas);

  // 1. Membrete corporativo Golden Touch
  const cajaLogo = 40;
  if (logo) dibujarLogoPdf(doc, logo, M, y, cajaLogo);
  const tx = logo ? M + anchoLogoPdf(cajaLogo) + 12 : M;
  const anchoTexto = W - M - tx;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.setTextColor(...NARANJA);
  doc.text(pdfSafe('REPORTE DE PENDIENTES POR RECEPCIONAR'), tx, y + 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(71, 85, 105);
  const lineaEmpresa = `${idEmp.nombre} · RIF ${idEmp.rif} · Corte: ${dateTime(new Date().toISOString())} · Agrupación: ${ETIQUETA_AGRUPACION_PENDIENTES[agrupacion]}`;
  const sub1 = doc.splitTextToSize(pdfSafe(lineaEmpresa), anchoTexto) as string[];
  doc.text(sub1, tx, y + 25);
  let yy = y + 25 + (sub1.length - 1) * 9.5;

  if (subtituloFiltros) {
    doc.setFontSize(7.6);
    doc.setTextColor(...SUBTINTA);
    const sub2 = doc.splitTextToSize(pdfSafe(`Filtros aplicados: ${subtituloFiltros}`), anchoTexto) as string[];
    doc.text(sub2, tx, yy + 10);
    yy += 10 + (sub2.length - 1) * 9;
  }

  y = Math.max(y + cajaLogo + 6, yy + 10);
  doc.setDrawColor(...NARANJA);
  doc.setLineWidth(1.4);
  doc.line(M, y, W - M, y);
  y += 12;

  // 2. Tarjetas ejecutivas de KPIs
  if (incluirResumen) {
    const mostrarMonto = camposActivosSet.has('monto');
    const desgloseTipos = [
      resumen.totalOc ? `${resumen.totalOc} OC` : '',
      resumen.totalCs ? `${resumen.totalCs} CS` : '',
      resumen.totalDirectas ? `${resumen.totalDirectas} CD` : '',
    ].filter(Boolean).join(' · ') || 'Sin desglose';

    const kpis = [
      {
        label: 'ÓRDENES POR RECEPCIONAR',
        val: num(resumen.totalOrdenes),
        sub: desgloseTipos,
      },
      {
        label: 'UNIDADES / RENGLONES',
        val: `${num(resumen.totalUnidades)} und.`,
        sub: `${num(resumen.totalItems)} renglón(es) en total`,
      },
      ...(mostrarMonto
        ? [{
            label: 'MONTO TOTAL PENDIENTE',
            val: money(resumen.totalMontoUsd),
            sub: `${num(resumen.totalPagadas)} pagada(s) · ${num(resumen.totalPorRecibirSinPago)} sin pago aún`,
          }]
        : []),
      {
        label: 'TIEMPO DE ESPERA',
        val: `${resumen.promedioDiasPendiente} d prom.`,
        sub: `Máxima espera: ${resumen.maxDiasPendiente} día(s)`,
      },
    ];

    const gap = 8;
    const cardW = (UW - gap * (kpis.length - 1)) / kpis.length;
    const cardH = 38;
    kpis.forEach((k, i) => {
      const cx = M + i * (cardW + gap);
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...BORDE);
      doc.setLineWidth(0.6);
      doc.roundedRect(cx, y, cardW, cardH, 4, 4, 'FD');
      doc.setFillColor(...NARANJA);
      doc.rect(cx, y + 1, 3, cardH - 2, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.6);
      doc.setTextColor(71, 85, 105);
      doc.text(pdfSafe(k.label), cx + 8, y + 10);

      doc.setFontSize(10.8);
      doc.setTextColor(...NARANJA);
      doc.text(pdfSafe(k.val), cx + 8, y + 23.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.4);
      doc.setTextColor(...SUBTINTA);
      doc.text(pdfSafe(k.sub), cx + 8, y + 33);
    });
    y += cardH + 12;
  }

  const grupos = agruparPendientesRecepcion(filas, agrupacion);

  // 3A. Presentación en FICHAS EJECUTIVAS
  if (esFichas) {
    const cols = orient === 'landscape' ? 2 : 1;
    const cardGap = 10;
    const cardW = (UW - (cols - 1) * cardGap) / cols;
    const conDetalle = camposActivosSet.has('detalle_items');

    for (const g of grupos) {
      if (agrupacion !== 'sin_agrupar') {
        if (y + 26 > H - 34) { doc.addPage(); y = M; }
        doc.setFillColor(...FONDO_GRUPO);
        doc.setDrawColor(...NARANJA);
        doc.setLineWidth(0.6);
        doc.roundedRect(M, y, UW, 18, 3, 3, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.2);
        doc.setTextColor(...TINTA);
        const subGrupo = camposActivosSet.has('monto')
          ? `${num(g.totalOrdenes)} orden(es) · ${num(g.totalUnidades)} und. · ${money(g.totalMontoUsd)}`
          : `${num(g.totalOrdenes)} orden(es) · ${num(g.totalUnidades)} und.`;
        doc.text(pdfSafe(g.titulo.toUpperCase()), M + 8, y + 12);
        doc.text(pdfSafe(subGrupo), W - M - 8, y + 12, { align: 'right' });
        y += 24;
      }

      for (let i = 0; i < g.filas.length; i += cols) {
        const par = g.filas.slice(i, i + cols);
        const maxExtraLineas = conDetalle
          ? Math.max(...par.map((f) => Math.min(4, f.items.length)), 0)
          : 0;
        const cardH = 82 + (maxExtraLineas > 0 ? 10 + maxExtraLineas * 9.5 : 0);

        if (y + cardH > H - 32) { doc.addPage(); y = M; }

        par.forEach((f, cIdx) => {
          const cx = M + cIdx * (cardW + cardGap);
          const cy = y;
          const acento = f.estado === 'pagada' ? VERDE : AMBAR;

          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(...BORDE);
          doc.setLineWidth(0.6);
          doc.roundedRect(cx, cy, cardW, cardH, 4, 4, 'FD');
          doc.setFillColor(...acento);
          doc.rect(cx, cy + 1, 3.5, cardH - 2, 'F');

          // Cabecera de ficha: Código + Badge Estado + Monto
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9.5);
          doc.setTextColor(...TINTA);
          const titCodigo = f.codigoSolicitud ? `${f.codigo} (${f.codigoSolicitud})` : f.codigo;
          doc.text(pdfSafe(titCodigo), cx + 10, cy + 13);

          const txtEstado = pdfSafe(`${f.origenCorto} · ${f.estadoLabel}`);
          doc.setFontSize(6.6);
          const bw = doc.getTextWidth(txtEstado) + 10;
          const bx = cx + cardW - bw - 8;
          doc.setFillColor(f.estado === 'pagada' ? 220 : 254, f.estado === 'pagada' ? 252 : 243, f.estado === 'pagada' ? 231 : 199);
          doc.roundedRect(bx, cy + 4.5, bw, 12, 3, 3, 'F');
          doc.setTextColor(...acento);
          doc.text(txtEstado, bx + bw / 2, cy + 12.5, { align: 'center' });

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.1);
          doc.setTextColor(...SUBTINTA);
          const subProveedor = [
            camposActivosSet.has('proveedor') ? `Proveedor: ${f.proveedor}` : '',
            camposActivosSet.has('almacen') ? `Destino: ${f.almacenDestino}` : '',
            camposActivosSet.has('monto') ? `Monto: ${money(f.montoUsd)}` : '',
          ].filter(Boolean).join(' · ');
          const subRecortado = (doc.splitTextToSize(pdfSafe(subProveedor), cardW - 18) as string[])[0] ?? '';
          doc.text(subRecortado, cx + 10, cy + 24);

          doc.setDrawColor(241, 245, 249);
          doc.setLineWidth(0.5);
          doc.line(cx + 8, cy + 28.5, cx + cardW - 8, cy + 28.5);

          // Bloque protagonista: Analista encargado · Fecha montada · Pago Tesorería
          const colMetW = (cardW - 20) / 3;
          const metricas = [
            { lbl: 'ANALISTA ENCARGADO', val: camposActivosSet.has('analista') ? f.analista : '—', color: TINTA },
            { lbl: 'FECHA MONTADA', val: camposActivosSet.has('fecha_montada') ? f.fechaMontadaFmt : '—', color: TINTA },
            { lbl: 'PAGO TESORERÍA', val: camposActivosSet.has('fecha_pago') ? f.fechaPagoFmt : '—', color: f.tienePagoTesoreria ? VERDE : AMBAR },
          ];
          metricas.forEach((m, mIdx) => {
            const mx = cx + 10 + mIdx * colMetW;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(5.7);
            doc.setTextColor(...SUBTINTA);
            doc.text(pdfSafe(m.lbl), mx, cy + 38);

            doc.setFontSize(7.6);
            doc.setTextColor(...m.color);
            const vRec = (doc.splitTextToSize(pdfSafe(m.val), colMetW - 4) as string[])[0] ?? '';
            doc.text(vRec, mx, cy + 47.5);
          });

          // Segunda fila de metadatos: Solicita · Ítems · Días pendientes
          const metricas2 = [
            {
              lbl: 'SOLICITA',
              val: camposActivosSet.has('solicitante')
                ? (f.unidadSolicitante ? `${f.solicitante} (${f.unidadSolicitante})` : f.solicitante)
                : '—',
            },
            {
              lbl: 'ÍTEMS / UNIDADES',
              val: camposActivosSet.has('items') ? `${num(f.numItems)} ítem(s) · ${num(f.totalUnidades)} und.` : '—',
            },
            {
              lbl: 'ESPERA',
              val: camposActivosSet.has('dias') ? `${f.diasPendiente} día(s)` : '—',
            },
          ];
          metricas2.forEach((m, mIdx) => {
            const mx = cx + 10 + mIdx * colMetW;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(5.7);
            doc.setTextColor(...SUBTINTA);
            doc.text(pdfSafe(m.lbl), mx, cy + 60);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.2);
            doc.setTextColor(...TINTA);
            const vRec = (doc.splitTextToSize(pdfSafe(m.val), colMetW - 4) as string[])[0] ?? '';
            doc.text(vRec, mx, cy + 69);
          });

          // Renglones detallados opcionales
          if (conDetalle && f.items.length > 0) {
            doc.setDrawColor(241, 245, 249);
            doc.line(cx + 8, cy + 75, cx + cardW - 8, cy + 75);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.6);
            doc.setTextColor(71, 85, 105);
            f.items.slice(0, 4).forEach((it, idxIt) => {
              const txtIt = `• ${it.nombre} (${num(it.cantidad)}${it.unidad ? ` ${it.unidad}` : ''})`;
              const lineaRec = (doc.splitTextToSize(pdfSafe(txtIt), cardW - 20) as string[])[0] ?? '';
              doc.text(lineaRec, cx + 10, cy + 84 + idxIt * 9.5);
            });
          }
        });

        y += cardH + 8;
      }
    }
  } else {
    // 3B. Presentación en TABLA EJECUTIVA (agrupada o plana)
    const headCols = columnas.map((c) => pdfSafe(c.etiquetaCorta));
    const columnStyles: Record<number, { halign: 'left' | 'center' | 'right' }> = {};
    columnas.forEach((col, idx) => {
      columnStyles[idx] = { halign: col.alineacion };
    });

    const bodyRows: Array<Array<string | { content: string; colSpan?: number; styles?: Record<string, unknown> }>> = [];

    for (const g of grupos) {
      if (agrupacion !== 'sin_agrupar') {
        const subTxt = camposActivosSet.has('monto')
          ? `${g.titulo.toUpperCase()}  —  ${num(g.totalOrdenes)} orden(es) · ${num(g.totalUnidades)} und. · Subtotal: ${money(g.totalMontoUsd)}`
          : `${g.titulo.toUpperCase()}  —  ${num(g.totalOrdenes)} orden(es) · ${num(g.totalUnidades)} und.`;
        bodyRows.push([{
          content: pdfSafe(subTxt),
          colSpan: columnas.length,
          styles: {
            fillColor: FONDO_GRUPO,
            textColor: [154, 52, 18],
            fontStyle: 'bold',
            halign: 'left',
          },
        }]);
      }

      for (const f of g.filas) {
        bodyRows.push(columnas.map((col) => pdfSafe(textoCeldaTabla(f, col.clave))));
      }
    }

    const footRow = columnas.map((col, idx) => {
      if (idx === 0) return pdfSafe(`TOTAL (${num(resumen.totalOrdenes)})`);
      if (col.clave === 'items') return pdfSafe(`${num(resumen.totalItems)} ít. · ${num(resumen.totalUnidades)} und.`);
      if (col.clave === 'monto') return pdfSafe(money(resumen.totalMontoUsd));
      return '';
    });

    const esCompacta = columnas.length >= 9;

    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, bottom: 26 },
      head: [headCols],
      body: bodyRows as never,
      foot: [footRow],
      theme: 'grid',
      styles: {
        fontSize: esCompacta ? 6.8 : orient === 'landscape' ? 7.6 : 7.1,
        cellPadding: esCompacta ? 2.8 : 3.6,
        lineColor: BORDE,
        lineWidth: 0.35,
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
        textColor: TINTA,
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: FONDO_ALT,
      },
      columnStyles,
    });
  }

  // 4. Pie de página numerado
  const numPaginas = doc.getNumberOfPages();
  for (let i = 1; i <= numPaginas; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BORDE);
    doc.setLineWidth(0.4);
    doc.line(M, H - 18, W - M, H - 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.3);
    doc.setTextColor(...SUBTINTA);
    doc.text(pdfSafe(`${idEmp.nombre} · RIF ${idEmp.rif} · Pendientes por recepcionar`), M, H - 8.5);
    doc.text(pdfSafe(`Página ${i} de ${numPaginas}`), W - M, H - 8.5, { align: 'right' });
  }

  previewPdf(doc, `pendientes-por-recepcionar-${hoyStr()}.pdf`);
}

/** Genera el PDF individual de una orden pendiente por recepcionar (en formato Ficha Detallada). */
export async function descargarDetallePendientePdf(f: FilaPendienteRecepcion): Promise<void> {
  await descargarPendientesRecepcionPdf({
    filas: [f],
    campos: [
      'codigo',
      'tipo_estado',
      'analista',
      'fecha_montada',
      'fecha_pago',
      'dias',
      'proveedor',
      'solicitante',
      'almacen',
      'items',
      'detalle_items',
      'monto',
    ],
    agrupacion: 'sin_agrupar',
    formatoPresentacion: 'fichas',
    orientacion: 'portrait',
    incluirResumen: false,
    subtituloFiltros: `Ficha individual · ${f.codigo}`,
  });
}
