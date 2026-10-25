/* ============================================================
   Golden Touch · RRHH · Préstamos y anticipos (PDF)

   El papel que dice cuánto se le prestó a cada quien, cuánto pagó y cuánto
   debe. Sirve tanto para UN trabajador (estado de cuenta individual) como
   para el listado filtrado de la pestaña: son los mismos grupos, uno o muchos.

   Como en MGG, préstamos y abonos van en FILAS SEPARADAS, por fecha: cada entrega
   de dinero es una fila («Préstamo 1», «Préstamo 2»…) y cada abono, la suya, en el
   orden en que pasaron, con el saldo que iba quedando después de cada uno. Así el
   trabajador coteja quincena por quincena qué se le prestó y qué se le descontó.

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
import { ETIQUETA_ORIGEN, ETIQUETA_TIPO, nombreCompleto, ordenarPagos, pagadoDe, r2, extraerEntregasPrestamo } from './anticiposResumen';
import { dibujarLogoPdf } from '@/shared/lib/pdfLogo';

const usd = (v: number | null | undefined) =>
  `$ ${Number(v ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dia = (f: string | null | undefined) => {
  const d = String(f ?? '').slice(0, 10);
  return d.length === 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—';
};

/** Una fila del estado de cuenta: una entrega de dinero o un abono, con el saldo que queda tras ella. */
export interface MovimientoCuenta {
  tipo: 'prestamo' | 'abono';
  /** AAAA-MM-DD. */
  fecha: string;
  /** Texto de las celdas: fecha, tipo / origen, motivo o nota, prestado, pagado, saldo. */
  celdas: [string, string, string, string, string, string];
  /** Saldo del préstamo después de este movimiento. */
  saldo: number;
}

/**
 * Los movimientos de UN préstamo ordenados por fecha: cada entrega y cada abono en su
 * propia fila, con el saldo corrido. El mismo día va primero la entrega y después el abono.
 * `desde` numera las entregas de forma continua cuando la persona tiene varios préstamos.
 */
export function movimientosCuenta(a: AnticipoPrestamo, pagos: AnticipoPago[], numerarDesde = 0, totalEntregas = 0): MovimientoCuenta[] {
  const etiqueta = ETIQUETA_TIPO[a.tipo] ?? 'Préstamo';
  const hist = a.historico ? ' (hist.)' : '';
  const entregas = extraerEntregasPrestamo(a);
  const numerar = Math.max(totalEntregas, entregas.length) > 1;
  type Mov = { fecha: string; orden: number; entrega: boolean; monto: number; celdas: (saldo: number) => MovimientoCuenta['celdas'] };
  const movs: Mov[] = [
    ...entregas.map((e, i): Mov => {
      const fecha = String(e.fecha || a.fecha || '').slice(0, 10);
      return {
        fecha, orden: 0, entrega: true, monto: Number(e.monto) || 0,
        celdas: (saldo) => [
          dia(fecha),
          (numerar ? `${etiqueta} ${numerarDesde + i + 1}` : etiqueta) + hist,
          e.motivo || a.motivo || `${etiqueta} autorizado`,
          usd(e.monto), '—', usd(saldo),
        ],
      };
    }),
    ...ordenarPagos(pagos.filter((x) => x.anticipo_id === a.id)).map((pg): Mov => ({
      fecha: String(pg.fecha ?? '').slice(0, 10), orden: 1, entrega: false, monto: Number(pg.monto) || 0,
      celdas: (saldo) => [
        `• ${dia(pg.fecha)}`, `• ${ETIQUETA_ORIGEN[pg.origen] ?? pg.origen}`, pg.nota || 'Abono a préstamo',
        '—', usd(pg.monto), usd(saldo),
      ],
    })),
  ];
  movs.sort((x, y) => x.fecha.localeCompare(y.fecha) || x.orden - y.orden);
  let saldo = 0;
  return movs.map((m) => {
    saldo = Math.max(0, r2(saldo + (m.entrega ? m.monto : -m.monto)));
    return { tipo: m.entrega ? 'prestamo' : 'abono', fecha: m.fecha, celdas: m.celdas(saldo), saldo };
  });
}

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

    // Filas: cada entrega de dinero y cada abono en su propia fila, por fecha, con el saldo corrido.
    type Fila = { celdas: string[]; tipo: 'prestamo' | 'abono' | 'subtotal'; saldo: number };
    const filas: Fila[] = [];
    const orden = [...g.anticipos].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.created_at).localeCompare(String(b.created_at)));
    const totalEntregas = orden.reduce((n, a) => n + extraerEntregasPrestamo(a).length, 0);
    let numeradas = 0;
    for (const a of orden) {
      const movs = movimientosCuenta(a, g.pagos, numeradas, totalEntregas);
      numeradas += extraerEntregasPrestamo(a).length;
      movs.forEach((m, i) => {
        // Con varios préstamos, el estado de cada uno va en su última fila; con uno solo, en el subtotal.
        const estado = orden.length > 1 && i === movs.length - 1 ? (Number(a.saldo) > 0 ? 'Activo' : 'Saldado') : '';
        filas.push({ tipo: m.tipo, saldo: m.saldo, celdas: [...m.celdas, estado] });
      });
    }

    filas.push({
      tipo: 'subtotal', saldo: gSaldo,
      celdas: ['', '', 'Subtotal del trabajador', usd(gPrestado), usd(gPagado), usd(gSaldo), gSaldo > 0 ? 'Activo' : 'Saldado'],
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
        const colSaldo = data.column.index === 5;

        if (f.tipo === 'abono') {
          data.cell.styles.textColor = [71, 85, 105];
          data.cell.styles.fillColor = [250, 252, 254];
          if (data.column.index === 4) { data.cell.styles.textColor = [16, 149, 93]; data.cell.styles.fontStyle = 'bold'; }
          if (colSaldo) data.cell.styles.textColor = f.saldo > 0 ? [220, 38, 38] : [16, 149, 93];
        } else if (f.tipo === 'subtotal') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [255, 247, 237];
          data.cell.styles.textColor = [30, 41, 59];
          if (data.column.index === 2) data.cell.styles.halign = 'right';
          if (data.column.index === 4) data.cell.styles.textColor = [16, 149, 93];
          if (colSaldo || data.column.index === 6) data.cell.styles.textColor = gSaldo > 0 ? [220, 38, 38] : [16, 149, 93];
          if (data.column.index === 6 && gSaldo > 0) data.cell.styles.textColor = [217, 119, 6];
        } else {
          // Entrega del préstamo: fecha, tipo y cifras en negrita; el motivo, en texto normal.
          data.cell.styles.fillColor = [244, 245, 247];
          data.cell.styles.fontStyle = data.column.index === 2 ? 'normal' : 'bold';
          data.cell.styles.textColor = data.column.index === 2 ? [51, 65, 85] : [30, 41, 59];
          if (colSaldo) data.cell.styles.textColor = f.saldo > 0 ? [220, 38, 38] : [16, 149, 93];
          if (data.column.index === 6) data.cell.styles.textColor = [217, 119, 6];
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
    + 'pagos directos o saldo previo cargado); SALDO = lo que queda debiendo después de cada movimiento (préstamos y abonos van por fecha). Los préstamos marcados con (hist.) corresponden a saldos previos.',
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
