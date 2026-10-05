/* ============================================================
   Golden Touch · Cocina · Control de distribución · PDF (vista previa)

   Dos formas, según desde dónde se pida:
   · Sin producto: el MERCADO entero, una fila por producto, lo que hay que
     comprar primero arriba. Es el papel con el que se sale a hacer el mercado.
   · Con un producto: su HOJA, igual que la del Excel de consumo — parámetros,
     tarjetas y la tabla día por día.

   Las dos llevan la cuenta del período completa (29/09/2026), que es lo que se
   pidió: lo que HABÍA, lo CONSUMIDO en comidas a la fecha, las SALIDAS y los
   AJUSTES que hizo Inventario, y lo que QUEDA. Antes el papel del mercado
   mostraba el stock y el consumo sueltos, sin de dónde salían ni contra qué.

   Y detrás del resumen va el DETALLE: cada movimiento del período en su renglón,
   con fecha, comprobante, motivo y responsable. El resumen dice cuánto; el
   detalle, de dónde. Sin él, un «Ajustes 120» obligaba a irse a Inventario a
   buscar cuáles fueron.
   ============================================================ */
import { previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import { ESTADO_STOCK_LABEL } from './controlDistribucion';
import { CLASE_LABEL, type Control, type ControlProducto, type MovimientoDetalle } from './controlDistribucion.repository';
import { totalesDetalle } from './detalleDistribucion';
import { dibujarLogoPdf } from '@/shared/lib/pdfLogo';

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
 * @param opciones.detalle  Los movimientos del período, ya recortados como en pantalla.
 *   Sin él el papel sale solo con el resumen.
 */
export async function descargarControlDistribucionPdf(
  control: Control,
  producto: ControlProducto | null,
  opciones?: {
    productos?: ControlProducto[]; subtitulo?: string; sufijoArchivo?: string;
    detalle?: MovimientoDetalle[];
  },
): Promise<void> {
  const [{ jsPDF }, { default: autoTable }, fmt, { loadLogoPdfDataUrl }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/format'),
    import('@/shared/lib/pdfLogo'),
  ]);
  const logo = await loadLogoPdfDataUrl().catch(() => null);
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const W = doc.internal.pageSize.getWidth();
  const MARGIN = 56.69; // 2 cm por lado
  let y = MARGIN;
  if (logo) { dibujarLogoPdf(doc, logo, MARGIN, y, 44); }

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

    const suma = (f: (q: ControlProducto) => number) =>
      Math.round(productos.reduce((a, q) => a + f(q), 0) * 100) / 100;
    const habia = suma((q) => q.totales.disponible);
    const consumido = suma((q) => q.totales.consumo);
    const salidas = suma((q) => q.totales.salidas);
    const ajustes = suma((q) => q.totales.ajustes);
    const queda = suma((q) => q.totales.invFinal);

    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(
      `${productos.length} productos   ·   ${reordenar} por reordenar   ·   ${alerta} en alerta   ·   ${comensales} comensales`,
      MARGIN, y,
    );
    // La cuenta del período en un renglón, para leerla sin sumar la tabla.
    doc.setFontSize(9); doc.setTextColor(255, 138, 0);
    doc.text(
      pdfSafe(`Habia ${num(habia)}   -   Consumido ${num(consumido)}   -   Salidas ${num(salidas)}`
        + `   -   Ajustes ${num(ajustes)}   =   Queda ${num(queda)}`),
      MARGIN, y + 12,
    );
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110, 110, 110);
    doc.text(
      `EOQ: $${num(control.generales.costoOrden)} por orden · $${num(control.generales.costoAlmacenar)} por unidad/año · entrega en ${control.generales.leadTimeDias} días`,
      MARGIN, y + 24,
    );
    doc.setTextColor(0, 0, 0);

    autoTable(doc, {
      startY: y + 34,
      head: [['PRODUCTO', 'UNID.', 'HABÍA', 'CONSUMIDO', 'SALIDAS INV.', 'AJUSTES', 'QUEDA',
        'PROM./DÍA', 'RATIO', 'MERMA', 'REORDEN', 'LOTE EOQ', 'ESTADO'].map((h) => pdfSafe(h))],
      body: productos.map((p) => [
        pdfSafe(p.nombre), p.unidad ?? '—',
        num(p.totales.disponible), num(p.totales.consumo),
        p.totales.salidas ? num(p.totales.salidas) : '—',
        p.totales.ajustes ? num(p.totales.ajustes) : '—',
        num(p.totales.invFinal),
        num(p.totales.promedioDiario),
        num(p.totales.ratioPromedio, 3), num(p.totales.merma),
        p.puntoReorden ? String(p.puntoReorden) : '—',
        p.lote ? String(p.lote) : '—',
        estadoCorto(p.estado),
      ]),
      foot: [['TOTAL', '', num(habia), num(consumido), num(salidas), num(ajustes), num(queda),
        '', '', num(suma((q) => q.totales.merma)), '', '', '']],
      styles: { fontSize: 7.5, cellPadding: 2.5, valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: [255, 138, 0], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
      footStyles: { fillColor: [245, 245, 245], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'right' },
      columnStyles: {
        0: { cellWidth: 'auto' }, 1: { cellWidth: 38 },
        2: { cellWidth: 54, halign: 'right' }, 3: { cellWidth: 60, halign: 'right' },
        4: { cellWidth: 58, halign: 'right' }, 5: { cellWidth: 48, halign: 'right' },
        6: { cellWidth: 54, halign: 'right' }, 7: { cellWidth: 52, halign: 'right' },
        8: { cellWidth: 44, halign: 'right' }, 9: { cellWidth: 46, halign: 'right' },
        10: { cellWidth: 50, halign: 'right' }, 11: { cellWidth: 52, halign: 'right' },
        12: { cellWidth: 78 },
      },
      margin: MARGIN,
    });

    doc.setFontSize(7); doc.setTextColor(110, 110, 110);
    doc.text(
      pdfSafe('HABIA = saldo con el que abrió el período + todo lo que entró después. CONSUMIDO = lo servido en comidas registradas. SALIDAS INV. = lo que sacó Inventario sin ser una comida (salida de material, salida manual). AJUSTES = lo que Inventario corrigió a la baja. QUEDA = lo que queda al cierre del período. REORDEN = con ese stock hay que volver a pedir (demanda diaria x días de entrega). LOTE EOQ = cuántas unidades conviene pedir de una vez. Un guion = nada de eso en el período.'),
      MARGIN, finalY() + 14, { maxWidth: W - MARGIN * 2 },
    );
    tablaDetalle(doc, autoTable, fmt, opciones?.detalle ?? [], MARGIN, W, finalY);

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
      ['Había (inicial + entradas)', `${num(p.totales.disponible)} ${unidad}`, 'Consumido a la fecha', `${num(p.totales.consumo)} ${unidad}`],
      ['Salidas de inventario', `${num(p.totales.salidas)} ${unidad}`, 'Ajustes manuales', `${num(p.totales.ajustes)} ${unidad}`],
      ['QUEDA al cierre', `${num(p.totales.invFinal)} ${unidad}`, 'Promedio diario', `${num(p.totales.promedioDiario)} ${unidad}/día`],
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
    head: [['FECHA', 'INV. INICIAL', 'ENTRADAS', 'HABÍA', 'CONSUMO', 'SALIDAS INV.', 'AJUSTES',
      'INV. TEÓRICO', 'INV. FÍSICO', 'MERMA', 'COMENSALES', 'RATIO', 'ESTADO'].map((h) => pdfSafe(h))],
    body: p.dias.map((d) => [
      fmt.date(d.fecha), num(d.invInicial),
      d.entradas ? num(d.entradas) : '—',
      num(d.disponible),
      d.consumo ? num(d.consumo) : '—',
      d.salidas ? num(d.salidas) : '—',
      d.ajustes ? num(d.ajustes) : '—',
      num(d.invTeorico),
      d.invFisico == null ? '—' : num(d.invFisico),
      d.diferencia == null ? '—' : num(d.diferencia),
      d.comensales ? String(d.comensales) : '—',
      d.comensales ? num(d.ratio, 3) : '—',
      estadoCorto(d.estado),
    ]),
    foot: [[
      'TOTAL', num(p.totales.invInicial), num(p.totales.entradas), num(p.totales.disponible),
      num(p.totales.consumo), num(p.totales.salidas), num(p.totales.ajustes),
      num(p.totales.invFinal), '', num(p.totales.merma), String(p.totales.comensales),
      num(p.totales.ratioGlobal, 3), '',
    ]],
    styles: { fontSize: 7.5, cellPadding: 2.5, valign: 'middle' },
    headStyles: { fillColor: [210, 210, 210], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: [245, 245, 245], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'right' },
    columnStyles: {
      0: { cellWidth: 64 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' },
      4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' },
      8: { halign: 'right' }, 9: { halign: 'right' }, 10: { halign: 'right' }, 11: { halign: 'right' },
      12: { cellWidth: 78 },
    },
    margin: MARGIN,
  });

  doc.setFontSize(7); doc.setTextColor(110, 110, 110);
  doc.text(
    pdfSafe('HABÍA = inventario inicial del día + entradas. CONSUMO = lo servido en comidas registradas (un reverso de comida lo resta). SALIDAS INV. = lo que sacó Inventario sin ser una comida. AJUSTES = lo que Inventario corrigió a la baja. MERMA = conteo físico menos inventario teórico (solo los días contados); el día siguiente abre con lo contado. La fila TOTAL trae la cuenta del período: HABÍA - CONSUMO - SALIDAS - AJUSTES = lo que QUEDA.'),
    MARGIN, finalY() + 14, { maxWidth: W - MARGIN * 2 },
  );

  // Solo los movimientos de este víver: la hoja es de él.
  tablaDetalle(
    doc, autoTable, fmt,
    (opciones?.detalle ?? []).filter((d) => d.producto_id === p.producto_id),
    MARGIN, W, finalY,
  );

  previewPdf(doc, `control-${p.sku || 'producto'}-${control.hasta}.pdf`);
}

/**
 * El detalle: un renglón por movimiento, en su propia página.
 *
 * Va en página aparte a propósito. El resumen es lo que se firma y se lleva al
 * mercado; el detalle es el respaldo, y mezclarlos dejaría media tabla cortada al
 * final de la primera hoja.
 */
function tablaDetalle(
  doc: import('jspdf').jsPDF,
  autoTable: typeof import('jspdf-autotable').default,
  fmt: typeof import('@/shared/lib/format'),
  detalle: MovimientoDetalle[],
  MARGIN: number,
  W: number,
  finalY: () => number,
): void {
  if (!detalle.length) return;
  const t = totalesDetalle(detalle);

  doc.addPage();
  doc.setTextColor(255, 138, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(pdfSafe('DETALLE DE MOVIMIENTOS'), W / 2, MARGIN + 12, { align: 'center' });
  doc.setTextColor(80, 80, 80); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.text(
    pdfSafe(`${detalle.length} movimientos   ·   Entradas ${num(t.entradas)}   ·   Consumo ${num(t.consumo)}`
      + `   ·   Salidas ${num(t.salidas)}   ·   Ajustes ${num(t.ajustes)}`),
    W / 2, MARGIN + 26, { align: 'center' },
  );
  doc.setTextColor(0, 0, 0);

  autoTable(doc, {
    startY: MARGIN + 36,
    head: [['FECHA', 'VÍVER', 'MOVIMIENTO', 'CANTIDAD', 'ORIGEN', 'COMPROBANTE', 'MOTIVO', 'RESPONSABLE']
      .map((h) => pdfSafe(h))],
    body: detalle.map((d) => [
      fmt.dateTime(d.fecha),
      pdfSafe(d.nombre),
      pdfSafe(CLASE_LABEL[d.clase]),
      `${d.clase === 'entrada' ? '+' : '-'}${num(d.cantidad)}`,
      pdfSafe(d.origen),
      d.comprobante ?? '—',
      pdfSafe(d.motivo ?? '—'),
      pdfSafe(d.responsable ?? '—'),
    ]),
    styles: { fontSize: 7, cellPadding: 2.5, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: [255, 138, 0], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: 82 }, 1: { cellWidth: 130 }, 2: { cellWidth: 82 },
      3: { cellWidth: 56, halign: 'right' }, 4: { cellWidth: 88 }, 5: { cellWidth: 76 },
      6: { cellWidth: 'auto' }, 7: { cellWidth: 96 },
    },
    margin: MARGIN,
  });

  doc.setFontSize(7); doc.setTextColor(110, 110, 110);
  doc.text(
    pdfSafe('Es el mismo kardex de Inventario, recortado a los víveres y al rango del reporte. Un consumo de cocina con signo «+» es un reverso o una corrección de comida: resta de lo consumido.'),
    MARGIN, finalY() + 14, { maxWidth: W - MARGIN * 2 },
  );
}
