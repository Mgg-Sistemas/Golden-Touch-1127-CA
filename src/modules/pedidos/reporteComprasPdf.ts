/* ============================================================
   Golden Touch · Compras · PDF "Compras por estado"
   Relación de las OC del ciclo pendiente, agrupadas en los cuatro
   renglones que se piden:
     · Pendiente por Aprobar
     · Cuentas a crédito
     · Por indicar método de pago
     · Por pagar
   Cada renglón muestra código, motivo y monto en su moneda ($ o Bs),
   más el equivalente a la tasa BCV del día. Subtotales por renglón y
   total general. Vista previa.

   `construirReporteComprasPdf` solo arma el documento (es la que se
   prueba): la descarga trae logo, tasa y fecha y abre la vista previa.
   ============================================================ */
import type { Orden } from '@/shared/lib/types';
import { previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import { getTasaHoy } from '@/modules/tesoreria/tasas.repository';
import { agruparReporteCompras, aDolaresYBolivares } from './reporteCompras';

/** Bs con separador de miles VE y 2 decimales (sin prefijo). */
function bsNum(n: number): string {
  return Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* Paleta PASTEL del reporte (los mismos tonos van en el Excel). El naranja
   fuerte de la marca queda para los botones de la pantalla; esto se imprime y
   se manda por correo/WhatsApp, así que va suave para que no canse la vista. */
const PASTEL: Record<'titulo' | 'cabecera' | 'cabeceraTexto' | 'cebra' | 'pie' | 'caja' | 'cajaBorde', [number, number, number]> = {
  titulo: [192, 126, 70],        // terracota suave (títulos)
  cabecera: [246, 217, 184],     // durazno claro (encabezado de la tabla)
  cabeceraTexto: [92, 58, 28],   // café oscuro: legible sobre el durazno
  cebra: [253, 248, 242],        // crema casi blanco (filas alternas)
  pie: [251, 235, 216],          // arena (subtotales)
  caja: [251, 233, 211],         // arena clara (cuadro del total)
  cajaBorde: [214, 162, 110],    // terracota claro (borde del cuadro)
};

export interface OpcionesReporteComprasPdf {
  ordenes: Orden[];
  /** Bs por 1 USD (BCV). 0 = no se imprimen equivalencias ni Bs. */
  tasa: number;
  /** Fecha de la tasa, para decir de cuándo es. */
  tasaFecha?: string | null;
  /** Logo en data URL (opcional). */
  logo?: string | null;
  /** ISO del momento en que se genera. Hoy, si no se pasa. */
  generadoEn?: string;
}

export async function construirReporteComprasPdf(
  op: OpcionesReporteComprasPdf,
): Promise<import('jspdf').jsPDF> {
  const [{ jsPDF }, { default: autoTable }, fmt, { dibujarLogoPdf }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/format'),
    import('@/shared/lib/pdfLogo'),
  ]);
  const tasa = Number(op.tasa) || 0;
  const generado = op.generadoEn ?? new Date().toISOString();

  // Cada renglón con su equivalente en $ y Bs, y los subtotales del grupo.
  const grupos = agruparReporteCompras(op.ordenes).map((g) => {
    const filas = g.filas.map((f) => ({
      ...f,
      codigo: pdfSafe(f.codigo) || '—',
      motivo: pdfSafe(f.motivo) || '—',
      ...aDolaresYBolivares(f.monto, f.moneda, tasa),
    }));
    return {
      ...g,
      filas,
      subUsd: filas.reduce((a, f) => a + f.usd, 0),
      subBs: filas.reduce((a, f) => a + f.bs, 0),
    };
  });

  const totUsd = grupos.reduce((a, g) => a + g.subUsd, 0);
  const totBs = grupos.reduce((a, g) => a + g.subBs, 0);
  const totCant = grupos.reduce((a, g) => a + g.filas.length, 0);

  // ── Documento ──
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const MARGIN = 56.69; // 2 cm por lado
  let y = MARGIN;
  if (op.logo) { dibujarLogoPdf(doc, op.logo, MARGIN, y, 44); }

  doc.setTextColor(...PASTEL.titulo); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text('COMPRAS POR ESTADO', W / 2 + 28, y + 20, { align: 'center' });
  doc.setTextColor(120, 120, 120); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`GOLDEN TOUCH 1127 C.A. · Generado ${fmt.dateTime(generado)}`, W / 2 + 28, y + 35, { align: 'center' });
  doc.text('Órdenes de compra del ciclo pendiente, agrupadas por estado.', W / 2 + 28, y + 48, { align: 'center' });
  if (tasa > 0) {
    doc.text(`Tasa BCV: Bs ${bsNum(tasa)} / $${op.tasaFecha ? ' · ' + fmt.date(op.tasaFecha) : ''}`, W / 2 + 28, y + 61, { align: 'center' });
  }
  doc.setTextColor(0, 0, 0);
  y += tasa > 0 ? 82 : 70;

  const drawTabla = (grupo: (typeof grupos)[number]) => {
    // Título del renglón (salta de página si no cabe con al menos una fila).
    if (y > H - 120) { doc.addPage(); y = MARGIN; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...PASTEL.titulo);
    doc.text(grupo.titulo, MARGIN, y);
    doc.setTextColor(120, 120, 120); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    doc.text(`${grupo.filas.length} ítem(s)`, MARGIN + 300, y);
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8);
    doc.text(grupo.nota, MARGIN, y + 11);
    doc.setTextColor(0, 0, 0);
    y += 16;

    if (!grupo.filas.length) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(130, 130, 130);
      doc.text('Sin órdenes en este estado.', MARGIN, y + 8);
      doc.setTextColor(0, 0, 0);
      y += 26;
      return;
    }

    const body = grupo.filas.map((f, i) => [
      String(i + 1),
      f.codigo,
      f.motivo,
      fmt.montoMoneda(f.monto, f.moneda),
      fmt.money(f.usd),
      tasa > 0 ? bsNum(f.bs) : '—',
    ]);
    autoTable(doc, {
      startY: y,
      head: [['ITEM', 'CÓDIGO', 'MOTIVO', 'MONTO', 'MONTO $', 'MONTO Bs']],
      body,
      foot: [['', '', '', 'SUBTOTAL', fmt.money(grupo.subUsd), tasa > 0 ? bsNum(grupo.subBs) : '—']],
      styles: { fontSize: 9, cellPadding: 4, valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: PASTEL.cabecera, textColor: PASTEL.cabeceraTexto, fontStyle: 'bold', halign: 'center' },
      alternateRowStyles: { fillColor: PASTEL.cebra },
      footStyles: { fillColor: PASTEL.pie, textColor: [20, 20, 20], fontStyle: 'bold', halign: 'right', fontSize: 9 },
      tableWidth: 'auto',
      columnStyles: {
        0: { halign: 'center', cellWidth: 32 },
        1: { halign: 'center', cellWidth: 74 },
        2: { fontSize: 9.5 }, // motivo: se lleva el ancho restante
        3: { halign: 'right', cellWidth: 78 },
        4: { halign: 'right', cellWidth: 64 },
        5: { halign: 'right', cellWidth: 74 },
      },
      margin: MARGIN,
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 16;
  };

  for (const grupo of grupos) drawTabla(grupo);

  // ── TOTAL GENERAL en grande ($ y su equivalente en Bs) ──
  if (totCant > 0) {
    const boxH = tasa > 0 ? 76 : 48;
    if (y > H - (boxH + MARGIN)) { doc.addPage(); y = MARGIN; }
    const boxW = 340;
    const boxX = W - MARGIN - boxW;
    doc.setDrawColor(...PASTEL.cajaBorde); doc.setLineWidth(1.4);
    doc.setFillColor(...PASTEL.caja);
    doc.roundedRect(boxX, y, boxW, boxH, 6, 6, 'FD');

    doc.setTextColor(60, 60, 60); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text(`TOTAL GENERAL · ${totCant} ítem(s)`, boxX + 14, y + 22);
    doc.setTextColor(20, 20, 20); doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
    doc.text(fmt.money(totUsd), boxX + boxW - 14, y + 26, { align: 'right' });

    if (tasa > 0) {
      doc.setTextColor(...PASTEL.titulo); doc.setFont('helvetica', 'bold'); doc.setFontSize(19);
      doc.text(`Bs ${bsNum(totBs)}`, boxX + boxW - 14, y + 56, { align: 'right' });
      doc.setTextColor(120, 120, 120); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.text(`Convertido a la tasa BCV del día: Bs ${bsNum(tasa)} / $`, boxX + 14, y + 56);
    }
    doc.setTextColor(0, 0, 0);
    y += boxH + 18;

    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(120, 120, 120);
    doc.text('El total incluye las cuentas a crédito (saldo pendiente), que se saldan por abonos y no se pagan de inmediato.', MARGIN, y);
  }

  // ── Pie de página en cada hoja (estilo del sistema) ──
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setDrawColor(225, 225, 225); doc.setLineWidth(0.4);
    doc.line(MARGIN, H - 30, W - MARGIN, H - 30);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120, 120, 120);
    doc.text(pdfSafe(`COMPRAS POR ESTADO · GOLDEN TOUCH 1127 C.A. · Generado ${fmt.dateTime(generado)}`), MARGIN, H - 18);
    doc.text(pdfSafe(`Página ${i} de ${paginas}`), W - MARGIN, H - 18, { align: 'right' });
  }

  return doc;
}

/** Genera el reporte y abre la vista previa (logo, tasa BCV y fecha del día). */
export async function descargarReporteComprasPdf(ordenes: Orden[]): Promise<void> {
  const [tasaHoy, { loadLogoPdfDataUrl }] = await Promise.all([
    getTasaHoy().catch(() => ({ usd: null, eur: null, fecha: null })),
    import('@/shared/lib/pdfLogo'),
  ]);
  const doc = await construirReporteComprasPdf({
    ordenes,
    tasa: Number(tasaHoy?.usd) || 0,
    tasaFecha: tasaHoy?.fecha ?? null,
    logo: await loadLogoPdfDataUrl().catch(() => null),
  });
  previewPdf(doc, `compras-por-estado-${new Date().toISOString().slice(0, 10)}.pdf`);
}
