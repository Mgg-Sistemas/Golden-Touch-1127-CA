/* ============================================================
   Golden Touch · Salidas / Traslados · Reportes PDF
   Comprobantes de salida/traslado de material y de salida de
   dinero. Se descargan SOLO al hacer clic (regla del sistema).
   ============================================================ */
import type { Movimiento, MovimientoCaja } from '@/shared/lib/types';

async function nuevoDoc(titulo: string) {
  const [{ jsPDF }, { default: autoTable }, fmt, { loadLogoDataUrl }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/format'),
    import('@/shared/lib/pdfLogo'),
  ]);
  const logo = await loadLogoDataUrl().catch(() => null);
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const MARGIN = 36;
  let y = MARGIN;
  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 46, 46); } catch { /* opcional */ } }
  const tx = logo ? MARGIN + 60 : MARGIN;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text(titulo, tx, y + 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`Golden Touch · ${fmt.dateTime(new Date().toISOString())}`, tx, y + 33);
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
    margin: { left: MARGIN, right: MARGIN },
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
    margin: { left: MARGIN, right: MARGIN },
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
    margin: { left: MARGIN, right: MARGIN },
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
    margin: { left: MARGIN, right: MARGIN },
  });
  doc.save(`traslado-dinero-${mov.id.slice(0, 8)}.pdf`);
}
