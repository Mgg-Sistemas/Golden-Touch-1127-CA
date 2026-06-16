/* ============================================================
   Golden Touch · Salidas / Traslados · Reportes PDF
   Comprobantes de salida/traslado de material y de salida de
   dinero. Se descargan SOLO al hacer clic (regla del sistema).
   ============================================================ */
import type { Movimiento, MovimientoCaja, SolicitudSalida } from '@/shared/lib/types';

async function nuevoDoc(titulo: string) {
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
  doc.text(titulo, tx, y + 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`GOLDEN TOUCH 1127 C.A. · ${fmt.dateTime(new Date().toISOString())}`, tx, y + 33);
  y += 60;
  return { doc, autoTable, fmt, MARGIN, y };
}

/** Comprobante de salida o traslado de material. */
export async function descargarSalidaMaterialPdf(mov: Movimiento, esTraslado: boolean): Promise<void> {
  const { doc, autoTable, fmt, MARGIN, y } = await nuevoDoc(esTraslado ? 'Comprobante de Traslado' : 'Comprobante de Salida');
  const prod = mov.producto;
  const cant = Math.abs(Number(mov.delta) || 0);
  const precio = Number(mov.precio_unitario) || 0;
  const ficha: Array<[string, string]> = [
    ['Producto', prod ? `${prod.sku} — ${prod.nombre}` : '—'],
    ['Almacén origen', mov.almacen || '—'],
    [esTraslado ? 'Almacén destino' : 'Dirigido a', mov.destino || '—'],
    ['Cantidad', `${fmt.num(cant)} ${prod?.unidad ?? ''}`.trim()],
    ['Precio unitario', precio ? fmt.money(precio) : '—'],
    ['Precio total', precio ? fmt.money(precio * cant) : '—'],
    ['Fecha de entrega', mov.fecha_entrega ? fmt.date(mov.fecha_entrega) : '—'],
    ['Motivo / detalle', mov.detalle || '—'],
    ...(mov.nota_entrega ? [['Nota de entrega', mov.nota_entrega] as [string, string]] : []),
    ['Registrado por', mov.actor_name || mov.actor],
    ['Fecha de registro', fmt.dateTime(mov.at)],
  ];
  autoTable(doc, {
    startY: y, body: ficha, theme: 'plain',
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 150 } },
    margin: MARGIN,
  });
  doc.save(`${esTraslado ? 'traslado' : 'salida'}-${(prod?.sku ?? 'material')}-${mov.id.slice(0, 8)}.pdf`);
}

/** Igual que el comprobante de salida/traslado pero devuelve el PDF en base64
 *  (para adjuntarlo en un correo vía Edge Function). No descarga nada. */
export async function obtenerSalidaMaterialPdfBase64(
  mov: Movimiento,
  esTraslado: boolean,
): Promise<{ base64: string; filename: string }> {
  const { doc, autoTable, fmt, MARGIN, y } = await nuevoDoc(esTraslado ? 'Comprobante de Traslado' : 'Comprobante de Salida');
  const prod = mov.producto;
  const cant = Math.abs(Number(mov.delta) || 0);
  const precio = Number(mov.precio_unitario) || 0;
  const ficha: Array<[string, string]> = [
    ['Producto', prod ? `${prod.sku} — ${prod.nombre}` : '—'],
    ['Almacén origen', mov.almacen || '—'],
    [esTraslado ? 'Almacén destino' : 'Dirigido a', mov.destino || '—'],
    ['Cantidad', `${fmt.num(cant)} ${prod?.unidad ?? ''}`.trim()],
    ['Precio unitario', precio ? fmt.money(precio) : '—'],
    ['Precio total', precio ? fmt.money(precio * cant) : '—'],
    ['Fecha de entrega', mov.fecha_entrega ? fmt.date(mov.fecha_entrega) : '—'],
    ['Motivo / detalle', mov.detalle || '—'],
    ...(mov.nota_entrega ? [['Nota de entrega', mov.nota_entrega] as [string, string]] : []),
    ['Registrado por', mov.actor_name || mov.actor],
    ['Fecha de registro', fmt.dateTime(mov.at)],
  ];
  autoTable(doc, {
    startY: y, body: ficha, theme: 'plain',
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 150 } },
    margin: MARGIN,
  });
  const dataUri = doc.output('datauristring');
  const base64 = dataUri.split(',')[1] ?? '';
  return { base64, filename: `${esTraslado ? 'traslado' : 'salida'}-${(prod?.sku ?? 'material')}-${mov.id.slice(0, 8)}.pdf` };
}

/** Comprobante de salida de dinero (anticipo). */
export async function descargarSalidaDineroPdf(mov: MovimientoCaja): Promise<void> {
  const { doc, autoTable, fmt, MARGIN, y } = await nuevoDoc('Comprobante de Salida de Dinero');
  const ficha: Array<[string, string]> = [
    ['Caja', mov.caja ? `${mov.caja.nombre} (${mov.caja.moneda})` : '—'],
    ['Dirigido a', mov.destino || '—'],
    ['Motivo', mov.motivo || '—'],
    ['Monto', `${fmt.money(Number(mov.monto) || 0)} ${mov.moneda}`],
    ['Estado', mov.estado_mineral === 'conciliada' ? 'Conciliada con mineral' : 'Pendiente de recepción'],
    ['Registrado por', mov.actor_name || mov.actor],
    ['Fecha', fmt.dateTime(mov.at)],
  ];
  if (mov.estado_mineral === 'conciliada') {
    ficha.push(
      ['— Mineral recibido —', ''],
      ['Mineral', mov.mineral_producto_nombre || '—'],
      ['Total entrante', `${fmt.num(Number(mov.mineral_cantidad) || 0)} ${mov.mineral_unidad ?? ''}`.trim()],
      ['Costo por unidad', mov.mineral_costo_unit != null ? fmt.money(Number(mov.mineral_costo_unit)) : '—'],
      ['Descripción', mov.mineral_descripcion || '—'],
    );
  }
  autoTable(doc, {
    startY: y, body: ficha, theme: 'plain',
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 160 } },
    margin: MARGIN,
  });
  doc.save(`salida-dinero-${mov.id.slice(0, 8)}.pdf`);
}

/** Comprobante de traslado de dinero entre cajas (incluye nota de entrega). */
export async function descargarTrasladoDineroPdf(mov: MovimientoCaja): Promise<void> {
  const { doc, autoTable, fmt, MARGIN, y } = await nuevoDoc('Comprobante de Traslado de Dinero');
  const ficha: Array<[string, string]> = [
    ['Caja origen', mov.caja ? `${mov.caja.nombre} (${mov.caja.moneda})` : '—'],
    ['Caja destino', mov.destino || '—'],
    ['Monto', `${fmt.money(Number(mov.monto) || 0)} ${mov.moneda}`],
    ['Motivo', mov.motivo || '—'],
    ...(mov.nota_entrega ? [['Nota de entrega', mov.nota_entrega] as [string, string]] : []),
    ['Registrado por', mov.actor_name || mov.actor],
    ['Fecha', fmt.dateTime(mov.at)],
  ];
  autoTable(doc, {
    startY: y, body: ficha, theme: 'plain',
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 160 } },
    margin: MARGIN,
  });
  doc.save(`traslado-dinero-${mov.id.slice(0, 8)}.pdf`);
}

/* ============================================================
   ORDEN DE SALIDA (formato formal con firmas, estilo OP/OC)
   Para salidas y traslados de MATERIAL. Indica el material, el
   solicitante, el motivo, quién autorizó, y deja las líneas de
   firma de "Solicitado/Creado por" y "Autorizado por".
   ============================================================ */
export async function descargarOrdenSalidaPdf(sol: SolicitudSalida): Promise<void> {
  const [{ jsPDF }, { default: autoTable }, fmt, { loadLogoDataUrl }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/format'),
    import('@/shared/lib/pdfLogo'),
  ]);
  const logo = await loadLogoDataUrl().catch(() => null);

  const esTraslado = sol.scope === 'traslado';
  const cant = Number(sol.cantidad) || 0;
  const precio = Number(sol.precio_unit) || 0;
  const autorizo = sol.ejecutada_por || sol.aprobada_por || null;
  const creo = sol.actor_name || sol.actor || sol.solicitante;

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const MARGIN = 42.52; // 1.5 cm
  let y = MARGIN;

  // ── Encabezado: logo + título + N° ──
  const LOGO = 60;
  const TX = logo ? MARGIN + LOGO + 14 : MARGIN;
  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, LOGO, LOGO); } catch { /* opcional */ } }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text('ORDEN DE SALIDA', TX, y + 20);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(`N° ${sol.codigo}  ·  ${esTraslado ? 'Traslado de material' : 'Salida de material'}`, TX, y + 38);
  doc.text(`Emitida: ${fmt.dateTime(new Date().toISOString())}`, PAGE_W - MARGIN, y + 38, { align: 'right' });
  y += Math.max(LOGO, 42) + 8;

  doc.setDrawColor(255, 138, 0); doc.setLineWidth(1.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 18;
  doc.setLineWidth(0.5); doc.setDrawColor(180);

  // ── Emisor ──
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('EMISOR', MARGIN, y);
  y += 14;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text('Mineral Group Guayana C.A.', MARGIN, y);
  doc.text('Sistema de Gestión de Inventarios', MARGIN, y + 12);
  y += 30;

  // ── Detalle de la salida ──
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('DETALLE DE LA SALIDA', MARGIN, y);
  y += 8;
  const esMulti = !!(sol.items && sol.items.length);
  const ficha: Array<[string, string]> = [
    ...(esMulti ? [] : ([
      ['Material a salir', sol.producto_nombre || '—'],
      ['Cantidad', fmt.num(cant)],
    ] as Array<[string, string]>)),
    [esTraslado ? 'Almacén origen' : 'Almacén de salida', sol.almacen_origen || '—'],
    [esTraslado ? 'Almacén destino' : 'Dirigido a', (esTraslado ? sol.almacen_destino : sol.destino) || '—'],
    ...((!esMulti && precio) ? ([
      ['Precio unitario', `${fmt.money(precio)} USD`],
      ['Precio total', `${fmt.money(precio * cant)} USD`],
    ] as Array<[string, string]>) : []),
    ['Motivo de la salida', sol.motivo || '—'],
    ['Solicitado por', sol.solicitante || '—'],
    ...(sol.unidad_solicitante ? [['Unidad solicitante', sol.unidad_solicitante] as [string, string]] : []),
    ['Fecha de solicitud', fmt.dateTime(sol.created_at)],
    ...(sol.fecha_entrega ? [['Fecha de entrega', fmt.date(sol.fecha_entrega)] as [string, string]] : []),
    ['Autorizado por', autorizo || '— (pendiente de aprobación) —'],
    ...(sol.aprobada_en ? [['Aprobada el', fmt.dateTime(sol.aprobada_en)] as [string, string]] : []),
    ...(sol.ejecutada_en ? [['Ejecutada el', fmt.dateTime(sol.ejecutada_en)] as [string, string]] : []),
  ];
  autoTable(doc, {
    startY: y, body: ficha, theme: 'plain',
    styles: { fontSize: 10, cellPadding: 3.5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 170 }, 1: { cellWidth: 'auto' } },
    margin: MARGIN,
  });

  // Tabla de materiales (solicitudes con varios renglones).
  if (esMulti && sol.items) {
    const itemsTotal = sol.items.reduce((a, it) => a + (Number(it.cantidad) || 0) * (Number(it.precio_unit) || 0), 0);
    // @ts-expect-error lastAutoTable lo agrega jspdf-autotable en runtime
    const afterFichaY = (doc.lastAutoTable?.finalY ?? y) + 14;
    autoTable(doc, {
      startY: afterFichaY,
      head: [['Material', 'Cantidad', 'P. unit. (USD)', 'Subtotal (USD)']],
      body: sol.items.map((it) => [
        `${it.producto_nombre}${it.producto_sku ? ` · ${it.producto_sku}` : ''}`,
        `${fmt.num(Number(it.cantidad) || 0)} ${it.unidad ?? ''}`.trim(),
        fmt.money(Number(it.precio_unit) || 0),
        fmt.money((Number(it.cantidad) || 0) * (Number(it.precio_unit) || 0)),
      ]),
      foot: [['', '', 'TOTAL', fmt.money(itemsTotal)]],
      theme: 'grid',
      headStyles: { fillColor: [255, 138, 0], textColor: 255 },
      footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 4 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      margin: MARGIN,
    });
  }

  // ── Firmas al pie ──
  const fy = PAGE_H - MARGIN - 50;
  const colW = (PAGE_W - MARGIN * 2 - 40) / 2;
  doc.setDrawColor(120); doc.setLineWidth(0.7);
  doc.line(MARGIN, fy, MARGIN + colW, fy);
  doc.line(MARGIN + colW + 40, fy, MARGIN + colW * 2 + 40, fy);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text('Solicitado / Creado por', MARGIN + colW / 2, fy + 14, { align: 'center' });
  doc.text('Autorizado por', MARGIN + colW + 40 + colW / 2, fy + 14, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text(creo || '—', MARGIN + colW / 2, fy + 27, { align: 'center' });
  doc.text(autorizo || '—', MARGIN + colW + 40 + colW / 2, fy + 27, { align: 'center' });

  doc.setFontSize(8); doc.setTextColor(120);
  doc.text(`Documento auto-generado · ${sol.codigo} · ${fmt.dateTime(new Date().toISOString())}`, MARGIN, PAGE_H - 24);

  doc.save(`orden-salida-${sol.codigo}.pdf`);
}
