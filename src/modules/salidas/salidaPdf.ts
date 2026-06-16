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

  // Renglones: varios (items) o uno solo (campos sueltos). Se muestran como factura.
  const items = (sol.items && sol.items.length)
    ? sol.items
    : [{ producto_nombre: sol.producto_nombre || '—', producto_sku: null as string | null, unidad: null as string | null, cantidad: cant, precio_unit: precio, almacen: sol.almacen_origen ?? null }];
  const total = items.reduce((a, it) => a + (Number(it.cantidad) || 0) * (Number(it.precio_unit) || 0), 0);

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const MARGIN = 42.52; // 1.5 cm
  const lastY = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? MARGIN;
  let y = MARGIN;

  // ── Encabezado: logo + título + N° ──
  const LOGO = 60;
  const TX = logo ? MARGIN + LOGO + 14 : MARGIN;
  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, LOGO, LOGO); } catch { /* opcional */ } }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text(esTraslado ? 'ORDEN DE TRASLADO' : 'ORDEN DE SALIDA', TX, y + 20);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(`N° ${sol.codigo}  ·  ${esTraslado ? 'Traslado de material' : 'Salida de material'}`, TX, y + 38);
  doc.text(`Emitida: ${fmt.dateTime(new Date().toISOString())}`, PAGE_W - MARGIN, y + 38, { align: 'right' });
  y += Math.max(LOGO, 42) + 8;

  doc.setDrawColor(255, 138, 0); doc.setLineWidth(1.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 16;
  doc.setLineWidth(0.5); doc.setDrawColor(180);

  // ── Datos en dos columnas (estilo factura): Emisor / Solicitud ──
  const COLGAP = 22;
  const HALF = (PAGE_W - MARGIN * 2 - COLGAP) / 2;
  const infoY = y;

  const izquierda: Array<[string, string]> = [
    ['Mineral Group Guayana C.A.', ''],
    ['Sistema de Gestión de Inventarios', ''],
    ['Solicitado por', sol.solicitante || creo || '—'],
    ...(sol.unidad_solicitante ? [['Unidad solicitante', sol.unidad_solicitante] as [string, string]] : []),
    [esTraslado ? 'Almacén origen' : 'Almacén de salida', sol.almacen_origen || '—'],
    ...(esTraslado ? [['Almacén destino', sol.almacen_destino || '—'] as [string, string]] : []),
  ];
  const derecha: Array<[string, string]> = [
    ['Fecha de solicitud', fmt.dateTime(sol.created_at)],
    ...(sol.fecha_entrega ? [['Fecha de entrega', fmt.date(sol.fecha_entrega)] as [string, string]] : []),
    ['Autorizado por', autorizo || '— (pendiente) —'],
    ...(sol.aprobada_en ? [['Aprobada el', fmt.dateTime(sol.aprobada_en)] as [string, string]] : []),
    ...(sol.ejecutada_en ? [['Ejecutada el', fmt.dateTime(sol.ejecutada_en)] as [string, string]] : []),
  ];

  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(120);
  doc.text('EMISOR / SOLICITUD', MARGIN, infoY);
  doc.text('DOCUMENTO', MARGIN + HALF + COLGAP, infoY);
  doc.setTextColor(20);
  autoTable(doc, {
    startY: infoY + 6, body: izquierda, theme: 'plain',
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 120 }, 1: { cellWidth: 'auto' } },
    margin: { left: MARGIN, right: MARGIN }, tableWidth: HALF,
  });
  const izqFin = lastY();
  autoTable(doc, {
    startY: infoY + 6, body: derecha, theme: 'plain',
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 95 }, 1: { cellWidth: 'auto' } },
    margin: { left: MARGIN + HALF + COLGAP, right: MARGIN }, tableWidth: HALF,
  });
  y = Math.max(izqFin, lastY()) + 16;

  // ── Tabla de productos (factura) ──
  // En salidas se muestra el almacén de cada renglón (puede salir de varios).
  const conAlmacen = !esTraslado && items.some((it) => it.almacen);
  autoTable(doc, {
    startY: y,
    head: [conAlmacen
      ? ['#', 'Producto', 'Almacén', 'Cantidad', 'Precio USD', 'Total USD']
      : ['#', 'Producto', 'Cantidad', 'Precio USD', 'Total USD']],
    body: items.map((it, i) => {
      const base = [
        String(i + 1),
        `${it.producto_nombre}${it.producto_sku ? ` · ${it.producto_sku}` : ''}`,
      ];
      if (conAlmacen) base.push(it.almacen ?? sol.almacen_origen ?? '—');
      return [
        ...base,
        `${fmt.num(Number(it.cantidad) || 0)} ${it.unidad ?? ''}`.trim(),
        fmt.money(Number(it.precio_unit) || 0),
        fmt.money((Number(it.cantidad) || 0) * (Number(it.precio_unit) || 0)),
      ];
    }),
    foot: [conAlmacen ? ['', '', '', '', 'TOTAL', fmt.money(total)] : ['', '', '', 'TOTAL', fmt.money(total)]],
    theme: 'grid',
    headStyles: { fillColor: [255, 138, 0], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
    styles: { fontSize: 9.5, cellPadding: 5 },
    columnStyles: conAlmacen
      ? { 0: { halign: 'center', cellWidth: 22 }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } }
      : { 0: { halign: 'center', cellWidth: 26 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    margin: MARGIN,
  });
  y = lastY() + 18;

  // ── Observaciones / notas ──
  const notas = [sol.motivo?.trim(), sol.nota_entrega?.trim()].filter(Boolean).join(' · ') || '—';
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(120);
  doc.text('OBSERVACIONES / NOTAS', MARGIN, y);
  doc.setTextColor(20); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  const notasWrap = doc.splitTextToSize(notas, PAGE_W - MARGIN * 2);
  doc.text(notasWrap, MARGIN, y + 15);

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

  doc.save(`orden-${esTraslado ? 'traslado' : 'salida'}-${sol.codigo}.pdf`);
}
