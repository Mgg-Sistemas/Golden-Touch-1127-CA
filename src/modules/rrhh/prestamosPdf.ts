/* ============================================================
   Golden Touch · RRHH · Préstamos y anticipos (PDF)

   El papel que dice cuánto se le prestó a cada quien, cuánto pagó y cuánto
   debe. Sirve tanto para UN trabajador (estado de cuenta individual) como
   para el listado filtrado de la pestaña: son los mismos grupos, uno o muchos.

   Debajo de cada préstamo van sus abonos (fecha, origen, monto), así el
   trabajador puede cotejar quincena por quincena qué se le descontó.

   Diseño ejecutivo corporativo de alta calidad:
   - Tarjetas KPI métricas en cabecera
   - Banner de trabajador estructurado con tarjeta independiente y protección de salto de página
   - Tabla de estado de cuenta estilizada con jerarquía tipográfica y de color
   - Numeración de páginas y pie de página en todas las hojas
   - 100% saneado con `pdfSafe` para fuentes estándar Windows-1252
   ============================================================ */
import { previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import type { AnticipoPago, AnticipoPrestamo, EmpresaRrhh, Personal } from '@/shared/lib/types';
import { ETIQUETA_ORIGEN, ETIQUETA_TIPO, nombreCompleto, ordenarPagos, pagadoDe, r2 } from './anticiposResumen';
import { dibujarLogoPdf } from '@/shared/lib/pdfLogo';

const usd = (v: number | null | undefined) =>
  `$ ${Number(v ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dia = (f: string | null | undefined) => {
  const d = String(f ?? '').slice(0, 10);
  return d.length === 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—';
};

export interface GrupoPrestamosPdf {
  persona: Personal;
  anticipos: AnticipoPrestamo[];
  /** Abonos de esos préstamos (de cualquiera de ellos; se reparten por anticipo_id). */
  pagos: AnticipoPago[];
}

export interface OpcionesPrestamosPdf {
  titulo: string;
  empresa: EmpresaRrhh;
  /** Una línea debajo del título: qué filtros o qué período abarca. */
  detalle?: string;
  grupos: GrupoPrestamosPdf[];
  archivo: string;
}

const BRAND_ORANGE: [number, number, number] = [234, 88, 12]; // #EA580C corporate warm brand orange

export async function construirPrestamosPdf(op: OpcionesPrestamosPdf): Promise<import('jspdf').jsPDF> {
  const [{ jsPDF }, { default: autoTable }, { loadLogoPdfEmpresa }, { identidadEmpresa }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/pdfLogo'),
    import('@/shared/lib/empresa'),
  ]);
  const emp = identidadEmpresa(op.empresa);
  const logo = await loadLogoPdfEmpresa(op.empresa).catch(() => null);
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const MARGIN = 48; // Márgenes balanceados (~1.7 cm) para máxima legibilidad de 7 columnas
  let y = MARGIN;

  // ── Encabezado y Marca ──
  if (logo) {
    dibujarLogoPdf(doc, logo, MARGIN, y, 38);
  }

  doc.setTextColor(...BRAND_ORANGE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(pdfSafe(op.titulo.toUpperCase()), W / 2, y + 15, { align: 'center' });

  doc.setTextColor(80, 90, 105);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(pdfSafe(`${emp.nombre}  ·  RIF ${emp.rif}  ·  Nómina ${op.empresa}`), W / 2, y + 29, { align: 'center' });

  const emitido = `Emitido el ${dia(new Date().toISOString())}`;
  const detalleTxt = op.detalle ? `${op.detalle}   ·   ${emitido}` : emitido;
  doc.setFontSize(8);
  doc.setTextColor(120, 130, 145);
  doc.text(pdfSafe(detalleTxt), W / 2, y + 42, { align: 'center' });

  y += 50;

  // Línea divisoria elegante del encabezado
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y, W - MARGIN, y);
  y += 12;

  // ── Totales Generales (Tarjetas KPI Ejecutivas) ──
  const todos = op.grupos.flatMap((g) => g.anticipos);
  const totalPrestado = r2(todos.reduce((s, a) => s + (Number(a.monto_total) || 0), 0));
  const totalPagado = r2(todos.reduce((s, a) => s + pagadoDe(a), 0));
  const totalSaldo = r2(todos.reduce((s, a) => s + (Number(a.saldo) || 0), 0));
  const conSaldo = new Set(todos.filter((a) => (Number(a.saldo) || 0) > 0).map((a) => a.personal_id)).size;

  const kpis = [
    { label: 'TOTAL PRESTADO', value: usd(totalPrestado), color: [30, 41, 59], accent: [234, 88, 12] },
    { label: 'TOTAL PAGADO', value: usd(totalPagado), color: [16, 149, 93], accent: [16, 185, 129] },
    { label: 'PENDIENTE', value: usd(totalSaldo), color: [220, 38, 38], accent: [239, 68, 68] },
    { label: 'PRÉSTAMOS', value: String(todos.length), color: [30, 41, 59], accent: [100, 116, 139] },
    { label: 'CON SALDO', value: String(conSaldo), color: [217, 119, 6], accent: [245, 158, 11] },
  ];

  const totalKpiW = W - MARGIN * 2;
  const kpiGap = 6;
  const cardW = (totalKpiW - (kpis.length - 1) * kpiGap) / kpis.length;
  const cardH = 40;

  kpis.forEach((kpi, idx) => {
    const cx = MARGIN + idx * (cardW + kpiGap);
    const cy = y;

    // Fondo de tarjeta con bordes redondeados
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.roundedRect(cx, cy, cardW, cardH, 3, 3, 'FD');

    // Barra superior de acento de color
    doc.setFillColor(kpi.accent[0], kpi.accent[1], kpi.accent[2]);
    doc.roundedRect(cx, cy, cardW, 2.5, 1.5, 1.5, 'F');

    // Etiqueta
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(pdfSafe(kpi.label), cx + cardW / 2, cy + 13.5, { align: 'center' });

    // Valor numérico
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.text(pdfSafe(kpi.value), cx + cardW / 2, cy + 29, { align: 'center' });
  });

  y += cardH + 16;

  // ── Bloque por Trabajador ──
  for (const g of op.grupos) {
    const p = g.persona;
    const nombre = nombreCompleto(p);
    const chips: string[] = [];
    if (p.ficha_nro) chips.push(`Ficha: ${p.ficha_nro}`);
    if (p.cedula) chips.push(`C.I.: ${p.cedula}`);
    if (p.cargo) chips.push(`Cargo: ${p.cargo}`);
    if (p.departamento) chips.push(`Dpto: ${p.departamento}`);

    const gPrestado = r2(g.anticipos.reduce((s, a) => s + (Number(a.monto_total) || 0), 0));
    const gPagado = r2(g.anticipos.reduce((s, a) => s + pagadoDe(a), 0));
    const gSaldo = r2(g.anticipos.reduce((s, a) => s + (Number(a.saldo) || 0), 0));

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const metaTxt = chips.length ? chips.join('   ·   ') : 'Sin datos adicionales';
    const cardContentW = W - MARGIN * 2 - 24;
    const metaLines = doc.splitTextToSize(pdfSafe(metaTxt), cardContentW) as string[];

    const bannerH = 10 + 13 + (metaLines.length * 10.5) + 6;

    // Salto de página seguro: banner + cabecera y 2 filas mínimas de tabla
    if (y + bannerH + 75 > H) {
      doc.addPage();
      y = MARGIN;
    }

    const bannerW = W - MARGIN * 2;

    // Contenedor tarjeta del trabajador
    doc.setFillColor(254, 252, 248);
    doc.setDrawColor(240, 230, 220);
    doc.setLineWidth(0.6);
    doc.roundedRect(MARGIN, y, bannerW, bannerH, 3, 3, 'FD');

    // Acento lateral naranja corporativo
    doc.setFillColor(...BRAND_ORANGE);
    doc.roundedRect(MARGIN, y, 3.5, bannerH, 1, 1, 'F');

    // Nombre completo del trabajador
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(pdfSafe(nombre), MARGIN + 12, y + 14);

    // Estado/Saldo a la derecha
    if (gSaldo > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(220, 38, 38);
      doc.text(pdfSafe(`Saldo pendiente: ${usd(gSaldo)}`), W - MARGIN - 12, y + 14, { align: 'right' });
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(16, 149, 93);
      doc.text(pdfSafe('✓ Solvente'), W - MARGIN - 12, y + 14, { align: 'right' });
    }

    // Datos del trabajador (Ficha, CI, Cargo, Dpto) con salto seguro de renglón
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(90, 100, 115);
    doc.text(metaLines, MARGIN + 12, y + 26);

    y += bannerH + 6;

    // Filas de préstamos y sus abonos
    type Fila = { celdas: string[]; abono?: boolean; subtotal?: boolean; debe?: boolean };
    const filas: Fila[] = [];
    const orden = [...g.anticipos].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

    for (const a of orden) {
      const saldoNum = Number(a.saldo) || 0;
      filas.push({
        debe: saldoNum > 0,
        celdas: [
          dia(a.fecha),
          ETIQUETA_TIPO[a.tipo] + (a.historico ? ' (hist.)' : ''),
          a.motivo || '—',
          usd(a.monto_total),
          usd(pagadoDe(a)),
          usd(a.saldo),
          a.estado === 'saldado' ? 'Saldado' : 'Activo',
        ],
      });
      for (const pg of ordenarPagos(g.pagos.filter((x) => x.anticipo_id === a.id))) {
        filas.push({
          abono: true,
          celdas: [
            `  • ${dia(pg.fecha)}`,
            `  • ${ETIQUETA_ORIGEN[pg.origen] ?? pg.origen}`,
            pg.nota || 'Abono a préstamo',
            '—',
            usd(pg.monto),
            '—',
            '—',
          ],
        });
      }
    }

    filas.push({
      subtotal: true,
      celdas: ['', '', 'Subtotal del trabajador', usd(gPrestado), usd(gPagado), usd(gSaldo), ''],
    });

    autoTable(doc, {
      startY: y,
      head: [['FECHA', 'TIPO / ORIGEN', 'MOTIVO / NOTA DE ABONO', 'PRESTADO', 'PAGADO', 'SALDO', 'ESTADO']],
      body: filas.map((f) => f.celdas.map((c) => pdfSafe(c))),
      styles: {
        fontSize: 7.5,
        cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 },
        overflow: 'linebreak',
        lineColor: [230, 235, 240],
        lineWidth: 0.3,
      },
      headStyles: {
        fillColor: BRAND_ORANGE,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
        fontSize: 7.2,
      },
      columnStyles: {
        0: { cellWidth: 54, halign: 'center' },
        1: { cellWidth: 72 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 62, halign: 'right' },
        4: { cellWidth: 62, halign: 'right' },
        5: { cellWidth: 62, halign: 'right' },
        6: { cellWidth: 46, halign: 'center' },
      },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const f = filas[data.row.index];
        if (!f) return;

        if (f.abono) {
          data.cell.styles.textColor = [100, 116, 139];
          data.cell.styles.fontSize = 7;
          data.cell.styles.fillColor = [250, 251, 252];
          if (data.column.index === 4) {
            data.cell.styles.textColor = [16, 149, 93];
            data.cell.styles.fontStyle = 'bold';
          }
        } else if (f.subtotal) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [255, 247, 237];
          data.cell.styles.textColor = [30, 41, 59];
          if (data.column.index === 4) {
            data.cell.styles.textColor = [16, 149, 93];
          } else if (data.column.index === 5) {
            data.cell.styles.textColor = gSaldo > 0 ? [220, 38, 38] : [16, 149, 93];
          }
        } else {
          // Fila del préstamo principal
          if (data.column.index === 0 || data.column.index === 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = [30, 41, 59];
          }
          if (data.column.index === 3) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = [30, 41, 59];
          }
          if (data.column.index === 4 && data.cell.raw !== '$ 0,00') {
            data.cell.styles.textColor = [16, 149, 93];
          }
          if (data.column.index === 5) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = f.debe ? [220, 38, 38] : [16, 149, 93];
          }
          if (data.column.index === 6) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = f.debe ? [217, 119, 6] : [16, 149, 93];
          }
        }
      },
      margin: MARGIN,
    });

    // @ts-expect-error lastAutoTable lo agrega el plugin
    y = ((doc.lastAutoTable?.finalY ?? y) as number) + 16;
  }

  if (!op.grupos.length) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9.5);
    doc.setTextColor(120, 130, 140);
    doc.text(pdfSafe('No hay préstamos ni anticipos registrados con los filtros seleccionados.'), MARGIN, y);
    y += 18;
  }

  // ── Nota aclaratoria final ──
  if (y > H - 65) {
    doc.addPage();
    y = MARGIN;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(120, 130, 140);
  doc.text(pdfSafe(
    'Nota: Montos expresados en dólares americanos (USD). PAGADO = suma de abonos registrados (descuentos de nómina, '
    + 'pagos directos o saldo previo cargado); SALDO = Monto total - Pagado. Los préstamos marcados con (hist.) corresponden a saldos previos.',
  ), MARGIN, y, { maxWidth: W - MARGIN * 2 });

  // ── Pie de página en todas las hojas ──
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, H - 26, W - MARGIN, H - 26);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(130, 140, 150);
    doc.text(pdfSafe(`ESTADO DE CUENTA DE PRÉSTAMOS · ${emp.nombre} · RIF ${emp.rif}`), MARGIN, H - 15);
    doc.text(pdfSafe(`Página ${i} de ${paginas}`), W - MARGIN, H - 15, { align: 'right' });
  }

  return doc;
}

export async function descargarPrestamosPdf(op: OpcionesPrestamosPdf): Promise<void> {
  const doc = await construirPrestamosPdf(op);
  previewPdf(doc, op.archivo);
}

export const nombreArchivo = (base: string) =>
  `${base.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}.pdf`;
