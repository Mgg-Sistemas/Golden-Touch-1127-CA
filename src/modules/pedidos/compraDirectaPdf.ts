/* ============================================================
   Golden Touch · Compra Directa · Comprobante PDF
   Se descarga SOLO al hacer clic (regla del sistema).
   ============================================================ */
import type { CompraDirecta } from './compras.repository';
import { previewPdf } from '@/shared/lib/reportePreview';

export async function descargarCompraDirectaPdf(compra: CompraDirecta): Promise<void> {
  const [{ jsPDF }, { default: autoTable }, fmt, { loadLogoDataUrl }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/format'),
    import('@/shared/lib/pdfLogo'),
  ]);
  const logo = await loadLogoDataUrl().catch(() => null);
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const MARGIN = 42.52; // 1.5 cm
  let y = MARGIN;
  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 46, 46); } catch { /* opcional */ } }
  const tx = logo ? MARGIN + 60 : MARGIN;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text('Comprobante de Compra Directa', tx, y + 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`GOLDEN TOUCH 1127 C.A. · ${fmt.dateTime(new Date().toISOString())}`, tx, y + 33);
  y += 60;

  const gasto = compra.gasto != null ? Number(compra.gasto) : null;
  const totalItems = compra.items.length;
  // Monto en la MONEDA de la compra (Bs → "Bs …"; el resto "$ …").
  const mon = (n: number | null | undefined) => {
    const v = Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return compra.moneda === 'Bs' ? `Bs ${v}` : `$ ${v}`;
  };

  const ficha: Array<[string, string]> = [
    ['Código', compra.codigo || '—'],
    ['Proveedor', compra.proveedor_nombre || '—'],
    ['Almacén destino', compra.almacen || '—'],
    ['Materiales', `${totalItems} renglón(es)`],
    ['Estado', compra.estado === 'finalizada' ? 'Finalizada (ingresó a inventario)' : 'En proceso'],
    ['Gasto total', gasto != null ? mon(gasto) : '—'],
    ['Generó', compra.actor_name || compra.actor || '—'],
    ['Fecha de creación', fmt.dateTime(compra.created_at)],
    ['Fecha de compra', compra.finalizada_at ? fmt.dateTime(compra.finalizada_at) : '—'],
    ['Adjunto', compra.adjunto_nombre || '—'],
    ...(compra.nota ? [['Nota', compra.nota] as [string, string]] : []),
  ];
  autoTable(doc, {
    startY: y, body: ficha, theme: 'plain',
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 160 } },
    margin: MARGIN,
  });

  // Tabla de materiales: cantidad y precio (gasto + costo unitario) de cada renglón comprado.
  const startY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  const body = compra.items.map((it, i) => {
    const cant = Number(it.cantidad) || 0;
    const g = it.gasto != null ? Number(it.gasto) : null;
    const cu = g != null && cant > 0 ? g / cant : null;
    return [
      String(i + 1),
      it.producto_sku ? `${it.producto_nombre} · ${it.producto_sku}` : it.producto_nombre,
      fmt.num(cant),
      cu != null ? mon(cu) : '—',
      g != null ? mon(g) : '—',
    ];
  });
  autoTable(doc, {
    startY: startY + 14,
    head: [['#', 'Material', 'Cant.', 'Costo unit.', 'Precio']],
    body,
    foot: gasto != null ? [[{ content: 'TOTAL', colSpan: 4, styles: { halign: 'right' } }, mon(gasto)]] : undefined,
    styles: { fontSize: 9, cellPadding: 4, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: [210, 210, 210], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: [255, 138, 0], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { halign: 'center', cellWidth: 24 },
      2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' },
    },
    margin: MARGIN,
  });

  previewPdf(doc, `compra-directa-${(compra.codigo ?? compra.producto_sku ?? 'material')}-${compra.id.slice(0, 8)}.pdf`);
}
