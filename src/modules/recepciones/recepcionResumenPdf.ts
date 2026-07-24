/* ============================================================
   Golden Touch · Recepciones · Resumen (hoja de recepción de mineral)
   Reconstruye la hoja clásica de RECEPCIÓN a partir de los datos que ya
   tiene el sistema (recepción/pesadas, conciliación, humedad, Fe y análisis):
     RECEPCIÓN# · FECHA · Procedencia · Kg neto Centro de Acopio · Merma no llegó
     · Kg neto Recibidos por Ops · Merma humedad · Kg neto Secos · Merma Fe
     · Kg neto finales seco y limpio · Tenor Sn (lecturas) · Kg Neto de Sn.
   Vista previa embebida + descarga (previewPdf).
   ============================================================ */
import { loadLogoDataUrl } from '@/shared/lib/pdfLogo';
import { previewPdf } from '@/shared/lib/reportePreview';

export interface ResumenRecepcionData {
  numero: string;
  fecha: string;            // texto ya formateado (dd-mm-aa)
  procedencia: string;
  /** Observación de la fila «Centro de Acopio» (p. ej. «Cantidad de bolsas: 6»). */
  obsBolsas: string;
  /** Observación de la fila «Recibidos por Ops» (p. ej. «se recepcionó en 6 big bags»). */
  obsBigbags: string;
  kgCentroAcopio: number;
  mermaNoLlego: number;
  pctNoLlego: number;
  kgRecibidos: number;
  mermaHumedad: number;
  pctHumedad: number;
  kgSecos: number;
  mermaFe: number;
  pctFe: number;
  kgFinales: number;
  /** Lecturas del Tenor Sn (A/B/C…). */
  tenores: number[];
  tenorProm: number;
  kgNetoSn: number;
  /** Desglose por procedencia (Humedad Final): neto húmedo, recogido seco, merma y %. */
  desgloseProc?: Array<{ procedencia: string; netoHumedo: number; recogido: number; merma: number; pct: number }>;
}

const NOMBRE_ARCHIVO = 'recepcion-resumen.pdf';

const kg = (n: number) => (Number.isFinite(n) ? Number(n) : 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => `${(Number.isFinite(n) ? Number(n) : 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

async function construirDoc(d: ResumenRecepcionData) {
  const [logo, { jsPDF }, { default: autoTable }] = await Promise.all([
    loadLogoDataUrl().catch(() => null),
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const MARGIN = 42.52; // 1.5 cm
  let y = MARGIN;

  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 46, 46); } catch { /* opcional */ } }
  const tx = logo ? MARGIN + 58 : MARGIN;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text('Recepción de mineral · Resumen', tx, y + 16);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text('GOLDEN TOUCH 1127 C.A. · Centro de Costo PERAMANAL', tx, y + 31);
  y += 54;

  // Cabecera RECEPCIÓN# / FECHA (recuadro superior).
  autoTable(doc, {
    startY: y,
    body: [
      [{ content: 'RECEPCIÓN#', styles: { fontStyle: 'bold' } }, { content: d.numero || '—', styles: { halign: 'center', fontStyle: 'bold' } }],
      [{ content: 'FECHA:', styles: { fontStyle: 'bold' } }, { content: d.fecha || '—', styles: { halign: 'center', fontStyle: 'bold' } }],
    ],
    theme: 'grid',
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: 11, cellPadding: 5, lineColor: [0, 0, 0], lineWidth: 0.8, textColor: 20 },
    columnStyles: { 0: { cellWidth: 160 }, 1: { cellWidth: 130 } },
    tableWidth: 290,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 12;

  // Cuerpo principal: Concepto | Valor(es) | Observaciones.
  // Filas «merma» en gris; «Kg neto finales» resaltada.
  const V = { halign: 'center', fontStyle: 'bold' } as const;
  const merma = { fillColor: [245, 245, 245] as [number, number, number] };

  const filaValor = (label: string, valor: number, obs: string, opts?: { bold?: boolean; fill?: [number, number, number] }) => ([
    { content: label, styles: { fontStyle: (opts?.bold ? 'bold' : 'bold') as 'bold', fillColor: opts?.fill } },
    { content: kg(valor), colSpan: 3, styles: { ...V, fillColor: opts?.fill } },
    { content: obs, styles: { fontSize: 8, fillColor: opts?.fill } },
  ]);
  const filaMerma = (label: string, valor: number, porc: number) => ([
    { content: label, styles: { fontStyle: 'normal' as const, fillColor: merma.fillColor } },
    { content: kg(valor), colSpan: 3, styles: { halign: 'center' as const, fillColor: merma.fillColor } },
    { content: pct(porc), styles: { fontSize: 8, fillColor: merma.fillColor } },
  ]);

  // Fila del Tenor Sn: TODAS las muestras/lecturas obtenidas, en una celda combinada.
  const tenorTxt = d.tenores.length ? d.tenores.map((x) => kg(x)).join('   ·   ') : '—';
  const tenorFila = [
    { content: 'Tenor Sn:', styles: { fontStyle: 'bold' as const } },
    { content: tenorTxt, colSpan: 3, styles: { ...V, fontStyle: 'bold' as const } },
    { content: d.tenorProm ? `Prom: ${kg(d.tenorProm)}` : '', styles: { fontSize: 8 } },
  ];

  autoTable(doc, {
    startY: y,
    head: [[
      { content: 'Procedencia C/A:', styles: { halign: 'left' } },
      { content: '', colSpan: 3 },
      { content: 'Observaciones', styles: { halign: 'center' } },
    ]],
    body: [
      [
        { content: 'Procedencia C/A:', styles: { fontStyle: 'bold' } },
        { content: d.procedencia || '—', colSpan: 3, styles: { halign: 'center' } },
        { content: '', styles: {} },
      ],
      filaValor('Kg neto Centro de Acopio:', d.kgCentroAcopio, d.obsBolsas),
      filaMerma('Merma no llegó', d.mermaNoLlego, d.pctNoLlego),
      filaValor('Kg neto Recibidos por Ops:', d.kgRecibidos, d.obsBigbags),
      filaMerma('Merma humedad', d.mermaHumedad, d.pctHumedad),
      filaValor('Kg neto Secos:', d.kgSecos, 'Si el material viene seco se repite el paso de Ops'),
      filaMerma('Merma Fe', d.mermaFe, d.pctFe),
      filaValor('Kg neto finales seco y limpio:', d.kgFinales, 'Si el material viene sin Fe y limpio se repite el paso de Ops', { bold: true, fill: [255, 242, 204] }),
      tenorFila,
      [
        { content: 'Kg Neto de Sn:', styles: { fontStyle: 'bold' } },
        { content: kg(d.kgNetoSn), colSpan: 3, styles: { halign: 'center', fontStyle: 'bold', fontSize: 13 } },
        { content: '', styles: {} },
      ],
    ],
    theme: 'grid',
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: 10, cellPadding: 5, lineColor: [0, 0, 0], lineWidth: 0.8, textColor: 20, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: [255, 255, 255], textColor: 20, fontStyle: 'bold', lineWidth: 0.8, lineColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 200 },
      1: { cellWidth: (PAGE_W - 2 * MARGIN - 200 - 140) / 3 },
      2: { cellWidth: (PAGE_W - 2 * MARGIN - 200 - 140) / 3 },
      3: { cellWidth: (PAGE_W - 2 * MARGIN - 200 - 140) / 3 },
      4: { cellWidth: 140 },
    },
  });

  // Desglose por procedencia (Humedad Final): una fila por procedencia + total.
  if (d.desgloseProc && d.desgloseProc.length) {
    const startY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    const tNH = d.desgloseProc.reduce((a, x) => a + (Number(x.netoHumedo) || 0), 0);
    const tRec = d.desgloseProc.reduce((a, x) => a + (Number(x.recogido) || 0), 0);
    const tMer = d.desgloseProc.reduce((a, x) => a + (Number(x.merma) || 0), 0);
    const tPct = tNH > 0 ? (tMer / tNH) * 100 : 0;
    autoTable(doc, {
      startY: startY + 16,
      head: [['Procedencia', 'Neto húmedo', 'Peso recogido (seco)', 'Merma H2O', '% Humedad final']],
      body: d.desgloseProc.map((x) => [x.procedencia || '—', kg(x.netoHumedo), kg(x.recogido), kg(x.merma), pct(x.pct)]),
      foot: [['TOTAL', kg(tNH), kg(tRec), kg(tMer), pct(tPct)]],
      theme: 'grid',
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 9, cellPadding: 4, lineColor: [0, 0, 0], lineWidth: 0.6, textColor: 20, valign: 'middle' },
      headStyles: { fillColor: [230, 230, 230], textColor: 20, fontStyle: 'bold' },
      footStyles: { fillColor: [255, 242, 204], textColor: 20, fontStyle: 'bold' },
      columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    });
  }

  return doc;
}

export async function descargarResumenRecepcionPdf(d: ResumenRecepcionData): Promise<void> {
  const doc = await construirDoc(d);
  previewPdf(doc, NOMBRE_ARCHIVO);
}
