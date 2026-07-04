/* ============================================================
   Golden Touch · Servicio Directo · Comprobante PDF (vista previa)
   Cabecera + tabla de servicios (categoría, tipo, equipo, cantidad,
   bombonas y KG en recargas de gas/oxígeno/extintores, y monto).
   Se abre en vista previa; se descarga solo al pulsar Descargar.
   ============================================================ */
import type { ServicioDirecto } from './serviciosDirectos.repository';
import { previewPdf } from '@/shared/lib/reportePreview';

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
    ['Servicio(s)', servicio.descripcion],
    ['Proveedor', servicio.proveedor_nombre || '—'],
    ['Equipo', servicio.equipo_nombre || '—'],
    ['Estado', servicio.estado === 'finalizada' ? 'Finalizada (pagada)' : 'En proceso'],
    ['Monto total', gasto != null ? fmt.money(gasto) : '—'],
    ['Generó', servicio.actor_name || servicio.actor || '—'],
    ['Fecha de creación', fmt.dateTime(servicio.created_at)],
    ['Fecha de pago', servicio.finalizada_at ? fmt.dateTime(servicio.finalizada_at) : '—'],
    ['Adjunto (factura)', servicio.adjunto_nombre || '—'],
    ...(servicio.nota ? [['Nota / motivo', servicio.nota] as [string, string]] : []),
    ...(servicio.pago_externo ? [['Pago a externo (reintegrar)', [servicio.pago_externo_nombre || '—', servicio.pago_externo_cedula, servicio.pago_externo_telefono ? `Tel: ${servicio.pago_externo_telefono}` : null, servicio.pago_externo_nota].filter(Boolean).join(' · ')] as [string, string]] : []),
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
      it.descripcion,
      it.categoria || '—',
      it.equipo_nombre || '—',
      fmt.num(cant),
      it.bombonas ? fmt.num(it.bombonas) : '—',
      it.kg_recarga ? fmt.num(it.kg_recarga) : '—',
      g != null ? fmt.money(g) : '—',
      cu != null ? fmt.money(cu) : '—',
    ];
  });
  autoTable(doc, {
    startY: startY + 14,
    head: [['#', 'Servicio', 'Categoría', 'Equipo', 'Cant.', 'Bombonas', 'KG', 'Monto', 'Costo unit.']],
    body,
    foot: gasto != null ? [[{ content: 'TOTAL', colSpan: 7, styles: { halign: 'right' } }, fmt.money(gasto), '']] : undefined,
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

  previewPdf(doc, `servicio-directo-${(servicio.codigo ?? 'sd')}-${servicio.id.slice(0, 8)}.pdf`);
}
