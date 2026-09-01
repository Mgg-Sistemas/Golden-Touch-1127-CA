/* ============================================================
   Golden Touch · Servicio Directo · Comprobante PDF (vista previa)
   Cabecera + tabla de servicios (categoría, tipo, equipo, cantidad,
   recipientes y volumen en recargas — bombonas/KG en gas/oxígeno/extintores,
   cisternas/litros en agua — y monto).
   Se abre en vista previa; se descarga solo al pulsar Descargar.
   ============================================================ */
import type { ServicioDirecto } from './serviciosDirectos.repository';
import { previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';

export async function descargarServicioDirectoPdf(servicio: ServicioDirecto): Promise<void> {
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
  doc.text('Comprobante de Servicio Directo', tx, y + 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`GOLDEN TOUCH 1127 C.A. · ${fmt.dateTime(new Date().toISOString())}`, tx, y + 33);
  y += 60;

  const gasto = servicio.gasto != null ? Number(servicio.gasto) : null;
  const ficha: Array<[string, string]> = [
    ['Código', servicio.codigo || '—'],
    ['Servicio(s)', pdfSafe(servicio.descripcion)],
    ['Proveedor', pdfSafe(servicio.proveedor_nombre) || '—'],
    ['Equipo', pdfSafe(servicio.equipo_nombre) || '—'],
    ['Estado', servicio.estado === 'finalizada' ? 'Finalizada (pagada)' : 'En proceso'],
    ['Moneda', servicio.moneda === 'Bs' ? 'Bs' : '$ (USD)'],
    ['Monto total', fmt.montoMoneda(gasto, servicio.moneda)],
    ...((Number(servicio.anticipo_monto) || 0) > 0 ? [
      ['Pago anticipado', `${fmt.montoMoneda(Number(servicio.anticipo_monto), servicio.anticipo_moneda === 'Bs' ? 'Bs' : 'USD')} (adelanto · no descontó caja)`] as [string, string],
      ['Saldo pendiente', fmt.montoMoneda(Math.max(0, (Number(servicio.gasto) || 0) - (Number(servicio.abonado_total) || 0)), servicio.moneda ?? 'USD')] as [string, string],
    ] : []),
    ['Generó', pdfSafe(servicio.actor_name || servicio.actor) || '—'],
    ['Fecha de creación', fmt.dateTime(servicio.created_at)],
    ['Fecha de pago', servicio.finalizada_at ? fmt.dateTime(servicio.finalizada_at) : '—'],
    ['Adjunto (factura)', pdfSafe(servicio.adjunto_nombre) || '—'],
    ...(servicio.nota ? [['Nota / motivo', pdfSafe(servicio.nota)] as [string, string]] : []),
    ...(servicio.pago_externo ? [['Pago a externo (reintegrar)', pdfSafe([servicio.pago_externo_nombre || '—', servicio.pago_externo_cedula, servicio.pago_externo_telefono ? `Tel: ${servicio.pago_externo_telefono}` : null, servicio.pago_externo_nota].filter(Boolean).join(' · '))] as [string, string]] : []),
  ];
  autoTable(doc, {
    startY: y, body: ficha, theme: 'plain',
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 150 } },
    margin: MARGIN,
  });

  // Tabla de renglones de servicio.
  const startY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  const body = servicio.items.map((it, i) => {
    const cant = Number(it.cantidad) || 0;
    const g = it.gasto != null ? Number(it.gasto) : null;
    const cu = g != null && cant > 0 ? g / cant : null;
    return [
      String(i + 1),
      pdfSafe(it.descripcion),
      pdfSafe(it.categoria) || '—',
      pdfSafe(it.equipo_nombre) || '—',
      fmt.num(cant),
      it.bombonas ? fmt.num(it.bombonas) : '—',
      it.kg_recarga ? fmt.num(it.kg_recarga) : '—',
      fmt.montoMoneda(g, servicio.moneda),
      fmt.montoMoneda(cu, servicio.moneda),
    ];
  });
  autoTable(doc, {
    startY: startY + 14,
    head: [['#', 'Servicio', 'Categoría', 'Equipo', 'Cant.', 'Bomb./Cist.', 'KG/Lts', 'Monto', 'Costo unit.']],
    body,
    foot: gasto != null ? [[{ content: 'TOTAL', colSpan: 7, styles: { halign: 'right' } }, fmt.montoMoneda(gasto, servicio.moneda), '']] : undefined,
    styles: { fontSize: 8.5, cellPadding: 3.5, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: [210, 210, 210], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: [255, 138, 0], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { halign: 'center', cellWidth: 22 },
      4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' },
      7: { halign: 'right' }, 8: { halign: 'right' },
    },
    margin: MARGIN,
  });

  // Detalle del servicio (piezas + descripción + precio opcional), si lo tiene.
  const detalle = servicio.detalle_servicio ?? [];
  if (detalle.length) {
    const dY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY;
    const totalDetalle = Math.round(detalle.reduce((a, d) => a + (Number(d.precio) || 0), 0) * 100) / 100;
    const hayPrecios = totalDetalle > 0;
    autoTable(doc, {
      startY: dY + 12,
      head: [hayPrecios
        ? ['Detalle del servicio · Pieza / parte', 'Qué se hará', 'Precio']
        : ['Detalle del servicio · Pieza / parte', 'Qué se hará']],
      body: detalle.map((d) => hayPrecios
        ? [pdfSafe(d.parte) || '—', pdfSafe(d.descripcion) || '', (Number(d.precio) || 0) > 0 ? fmt.montoMoneda(Number(d.precio), servicio.moneda) : '—']
        : [pdfSafe(d.parte) || '—', pdfSafe(d.descripcion) || '']),
      foot: hayPrecios ? [['', 'Total del detalle', fmt.montoMoneda(totalDetalle, servicio.moneda)]] : undefined,
      styles: { fontSize: 8.5, cellPadding: 3.5, valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: [255, 138, 0], textColor: [255, 255, 255], fontStyle: 'bold' },
      footStyles: { fillColor: [245, 245, 245], textColor: [20, 20, 20], fontStyle: 'bold' },
      columnStyles: hayPrecios
        ? { 0: { cellWidth: 150 }, 2: { halign: 'right', cellWidth: 80 } }
        : { 0: { cellWidth: 150 } },
      margin: MARGIN,
    });
  }

  previewPdf(doc, `servicio-directo-${(servicio.codigo ?? 'sd')}-${servicio.id.slice(0, 8)}.pdf`);
}
