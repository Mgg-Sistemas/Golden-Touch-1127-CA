/* ============================================================
   Golden Touch · Control de Alimentación · PDF (vista previa)
   Resumen del consumo (platos, total, promedio por plato), víveres
   más consumidos y el detalle de movimientos por tipo de comida.
   ============================================================ */
import { previewPdf } from '@/shared/lib/reportePreview';
import type { CocinaMovimiento, ResumenCocina } from './cocina.repository';
import { labelTipoComida } from './cocina.repository';

export async function descargarCocinaPdf(input: {
  titulo: string;            // p. ej. "Consumo · 23/06/2026" o "Consumo · 01/06–30/06"
  resumen: ResumenCocina;
  movs: CocinaMovimiento[];
}): Promise<void> {
  const [{ jsPDF }, { default: autoTable }, fmt, { loadLogoDataUrl }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/format'),
    import('@/shared/lib/pdfLogo'),
  ]);
  const logo = await loadLogoDataUrl().catch(() => null);
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
  const W = doc.internal.pageSize.getWidth();
  const MARGIN = 42.52;
  const money = (n: number) => fmt.money(n);
  let y = MARGIN;
  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 44, 44); } catch { /* opcional */ } }

  doc.setTextColor(255, 138, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text('CONTROL DE ALIMENTACIÓN (COCINA)', W / 2 + 28, y + 18, { align: 'center' });
  doc.setTextColor(80, 80, 80); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(input.titulo, W / 2 + 28, y + 34, { align: 'center' });
  doc.setTextColor(120, 120, 120); doc.setFontSize(8);
  doc.text(`GOLDEN TOUCH 1127 C.A. · Generado ${fmt.dateTime(new Date().toISOString())}`, W / 2 + 28, y + 48, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 64;

  // KPIs
  const r = input.resumen;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(`${r.platos} platos   ·   Consumo total ${money(r.valorTotal)}   ·   Promedio por plato ${money(r.promedioPorPlato)}`, MARGIN, y);
  y += 10;

  // Por tipo de comida
  autoTable(doc, {
    startY: y + 6,
    head: [['TIPO DE COMIDA', 'MOVIMIENTOS', 'PLATOS', 'CONSUMO $', 'PROM. / PLATO']],
    body: (['desayuno', 'almuerzo', 'cena'] as const).map((t) => {
      const x = r.porTipo[t];
      return [labelTipoComida(t), String(x.movimientos), String(x.platos), money(x.valor), x.platos > 0 ? money(x.valor / x.platos) : '—'];
    }),
    styles: { fontSize: 9, cellPadding: 4, valign: 'middle' },
    headStyles: { fillColor: [255, 138, 0], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
    columnStyles: { 0: { cellWidth: 130 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    margin: MARGIN,
  });
  // @ts-expect-error lastAutoTable lo agrega el plugin
  y = (doc.lastAutoTable?.finalY ?? y) + 16;

  // Víveres más consumidos (top, por valor)
  if (r.topProductos.length) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text('Víveres más consumidos', MARGIN, y);
    autoTable(doc, {
      startY: y + 6,
      head: [['#', 'SKU', 'PRODUCTO', 'CANTIDAD', 'CONSUMO $']],
      body: r.topProductos.slice(0, 20).map((p, i) => [String(i + 1), p.sku, p.nombre, String(p.cantidad), money(p.valor)]),
      styles: { fontSize: 8, cellPadding: 3, valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: [210, 210, 210], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'center' },
      columnStyles: { 0: { cellWidth: 24, halign: 'right' }, 1: { cellWidth: 90 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 70, halign: 'right' }, 4: { cellWidth: 80, halign: 'right' } },
      margin: MARGIN,
    });
    // @ts-expect-error plugin
    y = (doc.lastAutoTable?.finalY ?? y) + 16;
  }

  // Detalle de movimientos
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text('Movimientos', MARGIN, y);
  autoTable(doc, {
    startY: y + 6,
    head: [['CÓDIGO', 'TIPO', 'FECHA / HORA', 'PLATOS', 'VALOR $']],
    body: input.movs.map((m) => [m.codigo ?? '—', labelTipoComida(m.tipo_comida), fmt.dateTime(m.at), String(m.platos), money(Number(m.valor_total))]),
    foot: [['', '', 'TOTAL', String(r.platos), money(r.valorTotal)]],
    styles: { fontSize: 8, cellPadding: 3, valign: 'middle' },
    headStyles: { fillColor: [210, 210, 210], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: [245, 245, 245], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'right' },
    columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 80 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 60, halign: 'right' }, 4: { cellWidth: 80, halign: 'right' } },
    margin: MARGIN,
  });

  previewPdf(doc, `cocina-${new Date().toISOString().slice(0, 10)}.pdf`);
}
