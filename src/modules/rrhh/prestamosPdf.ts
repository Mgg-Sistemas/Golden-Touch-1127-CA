/* ============================================================
   Golden Touch · RRHH · Préstamos y anticipos (PDF)

   El papel que dice cuánto se le prestó a cada quien, cuánto pagó y cuánto
   debe. Sirve tanto para UN trabajador (estado de cuenta) como para el
   listado filtrado de la pestaña: son los mismos grupos, uno o muchos.

   Debajo de cada préstamo van sus abonos (fecha, origen, monto), así el
   trabajador puede cotejar quincena por quincena qué se le descontó.

   Todo pasa por `pdfSafe`: la helvetica de jsPDF solo escribe Windows-1252.
   ============================================================ */
import { previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import type { AnticipoPago, AnticipoPrestamo, EmpresaRrhh, Personal } from '@/shared/lib/types';
import { ETIQUETA_ORIGEN, ETIQUETA_TIPO, nombreCompleto, ordenarPagos, pagadoDe, r2 } from './anticiposResumen';

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

const NARANJA: [number, number, number] = [255, 138, 0];

export async function descargarPrestamosPdf(op: OpcionesPrestamosPdf): Promise<void> {
  const [{ jsPDF }, { default: autoTable }, { loadLogoDataUrl }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/pdfLogo'),
  ]);
  const logo = await loadLogoDataUrl().catch(() => null);
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const MARGIN = 40;
  let y = MARGIN;
  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 40, 40); } catch { /* el logo es opcional */ } }

  doc.setTextColor(...NARANJA); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(pdfSafe(op.titulo.toUpperCase()), W / 2, y + 16, { align: 'center' });
  doc.setTextColor(80, 80, 80); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(pdfSafe(`GOLDEN TOUCH 1127 C.A.  ·  Nómina ${op.empresa}`), W / 2, y + 31, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 52;

  doc.setFontSize(8.5); doc.setTextColor(90, 90, 90);
  const emitido = `Emitido el ${dia(new Date().toISOString())}`;
  doc.text(pdfSafe(op.detalle ? `${op.detalle}   ·   ${emitido}` : emitido), MARGIN, y, { maxWidth: W - MARGIN * 2 });
  doc.setTextColor(0, 0, 0);
  y += 16;

  // Totales generales arriba: es lo primero que se mira.
  const todos = op.grupos.flatMap((g) => g.anticipos);
  const totalPrestado = r2(todos.reduce((s, a) => s + (Number(a.monto_total) || 0), 0));
  const totalPagado = r2(todos.reduce((s, a) => s + pagadoDe(a), 0));
  const totalSaldo = r2(todos.reduce((s, a) => s + (Number(a.saldo) || 0), 0));
  const conSaldo = new Set(todos.filter((a) => (Number(a.saldo) || 0) > 0).map((a) => a.personal_id)).size;

  autoTable(doc, {
    startY: y,
    head: [['TOTAL PRESTADO', 'TOTAL PAGADO', 'PENDIENTE POR PAGAR', 'PRÉSTAMOS', 'TRABAJADORES CON SALDO']],
    body: [[usd(totalPrestado), usd(totalPagado), usd(totalSaldo), String(todos.length), String(conSaldo)]],
    styles: { fontSize: 10, cellPadding: 5, halign: 'center', fontStyle: 'bold' },
    headStyles: { fillColor: NARANJA, textColor: [255, 255, 255], fontSize: 7.5, halign: 'center' },
    bodyStyles: { textColor: [30, 30, 30] },
    columnStyles: { 2: { textColor: [190, 40, 40] } },
    margin: MARGIN,
  });
  // @ts-expect-error lastAutoTable lo agrega el plugin
  y = ((doc.lastAutoTable?.finalY ?? y) as number) + 14;

  for (const g of op.grupos) {
    if (y > H - 110) { doc.addPage(); y = MARGIN; }
    const p = g.persona;
    const datos: string[] = [nombreCompleto(p)];
    if (p.ficha_nro) datos.push(`Ficha ${p.ficha_nro}`);
    if (p.cedula) datos.push(`C.I. ${p.cedula}`);
    if (p.cargo) datos.push(p.cargo);
    if (p.departamento) datos.push(p.departamento);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(0, 0, 0);
    doc.text(pdfSafe(datos.join('  ·  ')), MARGIN, y, { maxWidth: W - MARGIN * 2 });
    y += 6;

    const gPrestado = r2(g.anticipos.reduce((s, a) => s + (Number(a.monto_total) || 0), 0));
    const gPagado = r2(g.anticipos.reduce((s, a) => s + pagadoDe(a), 0));
    const gSaldo = r2(g.anticipos.reduce((s, a) => s + (Number(a.saldo) || 0), 0));

    type Fila = { celdas: string[]; abono?: boolean; subtotal?: boolean; debe?: boolean };
    const filas: Fila[] = [];
    const orden = [...g.anticipos].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    for (const a of orden) {
      filas.push({
        debe: (Number(a.saldo) || 0) > 0,
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
            `   ${dia(pg.fecha)}`,
            `↳ ${ETIQUETA_ORIGEN[pg.origen] ?? pg.origen}`,
            pg.nota || '',
            '',
            usd(pg.monto),
            '',
            '',
          ],
        });
      }
    }
    filas.push({ subtotal: true, celdas: ['', '', 'Subtotal del trabajador', usd(gPrestado), usd(gPagado), usd(gSaldo), ''] });

    autoTable(doc, {
      startY: y,
      head: [['FECHA', 'TIPO', 'MOTIVO / ABONOS', 'TOTAL', 'PAGADO', 'SALDO', 'ESTADO']],
      body: filas.map((f) => f.celdas.map((c) => pdfSafe(c))),
      styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: NARANJA, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 7.5 },
      columnStyles: {
        0: { cellWidth: 58 },
        1: { cellWidth: 70 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 66, halign: 'right' },
        4: { cellWidth: 66, halign: 'right' },
        5: { cellWidth: 66, halign: 'right' },
        6: { cellWidth: 48, halign: 'center' },
      },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const f = filas[data.row.index];
        if (f?.abono) {
          data.cell.styles.textColor = [110, 110, 110];
          data.cell.styles.fontSize = 7.2;
          data.cell.styles.fillColor = [250, 250, 250];
        }
        if (f?.subtotal) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [255, 241, 224];
        }
        if (f?.debe && data.column.index === 5) {
          data.cell.styles.textColor = [190, 40, 40];
        }
      },
      margin: MARGIN,
    });
    // @ts-expect-error lastAutoTable lo agrega el plugin
    y = ((doc.lastAutoTable?.finalY ?? y) as number) + 16;
  }

  if (!op.grupos.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(110, 110, 110);
    doc.text(pdfSafe('No hay préstamos ni anticipos con estos filtros.'), MARGIN, y);
    y += 16;
  }

  if (y > H - 60) { doc.addPage(); y = MARGIN; }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(110, 110, 110);
  doc.text(pdfSafe(
    'Montos en dolares. PAGADO = suma de los abonos del prestamo (descuentos de nomina, abonos a mano y lo ya pagado '
    + 'de un prestamo historico); SALDO = total - pagado. Un prestamo "(hist.)" existia antes del sistema y se cargo con lo que ya se habia abonado.',
  ), MARGIN, y, { maxWidth: W - MARGIN * 2 });

  previewPdf(doc, op.archivo);
}

export const nombreArchivo = (base: string) =>
  `${base.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}.pdf`;
