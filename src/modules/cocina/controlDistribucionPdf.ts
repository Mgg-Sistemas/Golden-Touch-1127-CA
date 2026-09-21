/* ============================================================
   Golden Touch · Cocina · Control de distribución · PDF (vista previa)

   Dos formas, según desde dónde se pida:
   · Sin producto: el MERCADO entero, una fila por producto, lo que hay que
     comprar primero arriba. Es el papel con el que se sale a hacer el mercado.
   · Con un producto: su HOJA, igual que la del Excel de consumo — parámetros,
     tarjetas y la tabla día por día.
   ============================================================ */
import { previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import { ESTADO_STOCK_LABEL } from './controlDistribucion';
import type { Control, ControlProducto } from './controlDistribucion.repository';

const num = (v: number, dec = 2) =>
  Number(v ?? 0).toLocaleString('es-VE', { minimumFractionDigits: dec, maximumFractionDigits: dec });

/**
 * El estado sin el paréntesis explicativo (en una celda de tabla no entra) y sin el emoji.
 *
 * Lo de quitar el emoji viene de MGG (21/09/2026): la helvetica de jsPDF solo escribe
 * Windows-1252, y un glifo que no existe ahí no solo sale como basura — jsPDF pierde el
 * ancho del carácter y abre el renglón entero letra por letra.
 */
const estadoCorto = (e: keyof typeof ESTADO_STOCK_LABEL) => pdfSafe(ESTADO_STOCK_LABEL[e].split(' (')[0]);

/**
 * @param opciones.productos  El listado tal como se ve en pantalla, ya filtrado
 *   y ordenado: el PDF sale con eso y nada más. Sin él sale el mercado entero.
 * @param opciones.subtitulo  Qué recorte es, impreso bajo las fechas.
 * @param opciones.sufijoArchivo  Se agrega al nombre del archivo.
 */
export async function descargarControlDistribucionPdf(
  control: Control,
  producto: ControlProducto | null,
  opciones?: { productos?: ControlProducto[]; subtitulo?: string; sufijoArchivo?: string },
): Promise<void> {
  const [{ jsPDF }, { default: autoTable }, fmt, { loadLogoDataUrl }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/format'),
    import('@/shared/lib/pdfLogo'),
  ]);
  const logo = await loadLogoDataUrl().catch(() => null);
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const W = doc.internal.pageSize.getWidth();
  const MARGIN = 42.52;
  let y = MARGIN;
  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 44, 44); } catch { /* opcional */ } }

  const titulo = pdfSafe(producto ? `CONTROL DE DISTRIBUCIÓN · ${producto.nombre}` : 'CONTROL DE DISTRIBUCIÓN DEL MERCADO');
  doc.setTextColor(255, 138, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(titulo, W / 2, y + 18, { align: 'center' });
  doc.setTextColor(80, 80, 80); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(`${fmt.date(control.desde)} al ${fmt.date(control.hasta)}`, W / 2, y + 34, { align: 'center' });
  doc.setTextColor(120, 120, 120); doc.setFontSize(8);
  doc.text(
    `GOLDEN TOUCH 1127 C.A. · Generado ${fmt.dateTime(new Date().toISOString())}`,
    W / 2, y + 48, { align: 'center' },
  );
  const subtitulo = producto ? '' : pdfSafe(String(opciones?.subtitulo ?? '').trim());
  if (subtitulo) {
    doc.setTextColor(255, 138, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text(subtitulo, W / 2, y + 62, { align: 'center' });
    doc.setFont('helvetica', 'normal');
  }
  doc.setTextColor(0, 0, 0);
  y += subtitulo ? 78 : 64;

  const finalY = () => {
    // @ts-expect-error lastAutoTable lo agrega el plugin
    return (doc.lastAutoTable?.finalY ?? y) as number;
  };

  if (!producto) {
    const productos = opciones?.productos ?? control.productos;
    const reordenar = productos.filter((p) => p.estado === 'reordenar').length;
    const alerta = productos.filter((p) => p.estado === 'alerta').length;
    const comensales = [...control.comensalesPorDia.values()].reduce((a, b) => a + b, 0);

    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(
      `${productos.length} productos   ·   ${reordenar} por reordenar   ·   ${alerta} en alerta   ·   ${comensales} comensales`,
      MARGIN, y,
    );
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110, 110, 110);
    doc.text(
      `EOQ: $${num(control.generales.costoOrden)} por orden · $${num(control.generales.costoAlmacenar)} por unidad/año · entrega en ${control.generales.leadTimeDias} días`,
      MARGIN, y + 12,
    );
    doc.setTextColor(0, 0, 0);

    autoTable(doc, {
      startY: y + 22,
      head: [['PRODUCTO', 'UNID.', 'STOCK', 'CONSUMO', 'PROM./DÍA', 'RATIO', 'MERMA', 'REORDEN', 'LOTE EOQ', 'ESTADO']],
      body: productos.map((p) => [
        pdfSafe(p.nombre), p.unidad ?? '—', num(p.stockActual), num(p.totales.consumo), num(p.totales.promedioDiario),
        num(p.totales.ratioPromedio, 3), num(p.totales.merma),
        p.puntoReorden ? String(p.puntoReorden) : '—',
        p.lote ? String(p.lote) : '—',
        estadoCorto(p.estado),
      ]),
      styles: { fontSize: 8, cellPadding: 3, valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: [255, 138, 0], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        0: { cellWidth: 'auto' }, 1: { cellWidth: 44 },
        2: { cellWidth: 56, halign: 'right' }, 3: { cellWidth: 60, halign: 'right' },
        4: { cellWidth: 62, halign: 'right' }, 5: { cellWidth: 52, halign: 'right' },
        6: { cellWidth: 52, halign: 'right' }, 7: { cellWidth: 56, halign: 'right' },
        8: { cellWidth: 60, halign: 'right' }, 9: { cellWidth: 90 },
      },
      margin: MARGIN,
    });

    doc.setFontSize(7); doc.setTextColor(110, 110, 110);
    doc.text(
      pdfSafe('REORDEN = con ese stock hay que volver a pedir (demanda diaria x días de entrega). LOTE EOQ = cuántas unidades conviene pedir de una vez. Un guion = todavía sin consumo registrado en el período.'),
      MARGIN, finalY() + 14, { maxWidth: W - MARGIN * 2 },
    );
    const sufijo = String(opciones?.sufijoArchivo ?? '').trim();
    previewPdf(doc, `control-distribucion${sufijo ? `-${sufijo}` : ''}-${control.hasta}.pdf`);
    return;
  }

  const p = producto;
  const unidad = p.unidad ?? 'UND';

  autoTable(doc, {
    startY: y,
    head: [['PARÁMETRO', 'VALOR', 'INDICADOR', 'VALOR']],
    body: [
      ['Demanda anual (D)', `${num(p.demandaAnual)} ${unidad}/año${p.demandaEstimada ? ' (estimada)' : ''}`, 'Stock actual', `${num(p.stockActual)} ${unidad}`],
      ['Costo por emitir orden (S)', `$${num(p.costoOrden)}`, 'Punto de reorden', p.puntoReorden ? `${p.puntoReorden} ${unidad}` : '—'],
      ['Costo de almacenar (H)', `$${num(p.costoAlmacenar)} / ${unidad}·año`, 'Lote óptimo (Q*)', p.lote ? `${p.lote} ${unidad}` : '—'],
      ['Tiempo de entrega (L)', `${p.leadTimeDias} días`, 'Ciclo de compra', p.cicloDias ? `${p.cicloDias} días · ${num(p.ordenesPorAno)} órd./año` : '—'],
      ['Consumo del período', `${num(p.totales.consumo)} ${unidad}`, 'Promedio diario', `${num(p.totales.promedioDiario)} ${unidad}/día`],
      ['Comensales', String(p.totales.comensales), 'Ratio promedio', `${num(p.totales.ratioPromedio, 3)} ${unidad}/com.`],
      ['Merma del período', `${num(p.totales.merma)} ${unidad}`, 'Estado', estadoCorto(p.estado)],
    ],
    styles: { fontSize: 9, cellPadding: 4, valign: 'middle' },
    headStyles: { fillColor: [255, 138, 0], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: 170, fontStyle: 'bold' }, 1: { cellWidth: 'auto' },
      2: { cellWidth: 150, fontStyle: 'bold' }, 3: { cellWidth: 'auto' },
    },
    margin: MARGIN,
  });

  autoTable(doc, {
    startY: finalY() + 16,
    head: [['FECHA', 'INV. INICIAL', 'ENTRADAS', 'CONSUMO', 'OTRAS SALIDAS', 'INV. TEÓRICO', 'INV. FÍSICO', 'MERMA', 'COMENSALES', 'RATIO', 'ESTADO']],
    body: p.dias.map((d) => [
      fmt.date(d.fecha), num(d.invInicial),
      d.entradas ? num(d.entradas) : '—',
      d.consumo ? num(d.consumo) : '—',
      d.otrasSalidas ? num(d.otrasSalidas) : '—',
      num(d.invTeorico),
      d.invFisico == null ? '—' : num(d.invFisico),
      d.diferencia == null ? '—' : num(d.diferencia),
      d.comensales ? String(d.comensales) : '—',
      d.comensales ? num(d.ratio, 3) : '—',
      estadoCorto(d.estado),
    ]),
    foot: [[
      'TOTAL', '', num(p.totales.entradas), num(p.totales.consumo), num(p.totales.otrasSalidas),
      num(p.totales.invFinal), '', num(p.totales.merma), String(p.totales.comensales),
      num(p.totales.ratioGlobal, 3), '',
    ]],
    styles: { fontSize: 8, cellPadding: 3, valign: 'middle' },
    headStyles: { fillColor: [210, 210, 210], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: [245, 245, 245], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'right' },
    columnStyles: {
      0: { cellWidth: 68 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' },
      4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' },
      8: { halign: 'right' }, 9: { halign: 'right' }, 10: { cellWidth: 84 },
    },
    margin: MARGIN,
  });

  doc.setFontSize(7); doc.setTextColor(110, 110, 110);
  doc.text(
    pdfSafe('CONSUMO = lo servido en comidas registradas. OTRAS SALIDAS = lo que bajó el inventario sin ser una comida. MERMA = conteo físico menos inventario teórico (solo los días contados); el día siguiente abre con lo contado.'),
    MARGIN, finalY() + 14, { maxWidth: W - MARGIN * 2 },
  );

  previewPdf(doc, `control-${p.sku || 'producto'}-${control.hasta}.pdf`);
}
