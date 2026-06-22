/* ============================================================
   Golden Touch · Tesorería · PDF resumen de OC por pagar
   Relación de las órdenes de compra aprobadas pendientes por pagar:
   N°ODC, proveedor, finalidad y monto, con el total general. Vista previa.
   ============================================================ */
import type { OrdenPorPagar } from '@/modules/pedidos/pedidos.repository';
import { previewPdf } from '@/shared/lib/reportePreview';

export async function descargarOrdenesPorPagarPdf(rows: OrdenPorPagar[]): Promise<void> {
  const [{ jsPDF }, { default: autoTable }, fmt, { loadLogoDataUrl }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/format'),
    import('@/shared/lib/pdfLogo'),
  ]);
  const logo = await loadLogoDataUrl().catch(() => null);
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const W = doc.internal.pageSize.getWidth();
  const MARGIN = 42.52; // 1.5 cm
  let y = MARGIN;
  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 44, 44); } catch { /* opcional */ } }

  doc.setTextColor(255, 138, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text('ÓRDENES DE COMPRA PENDIENTES POR PAGAR', W / 2 + 28, y + 22, { align: 'center' });
  doc.setTextColor(120, 120, 120); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`GOLDEN TOUCH 1127 C.A. · Generado ${fmt.dateTime(new Date().toISOString())}`, W / 2 + 28, y + 38, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 58;

  // La finalidad puede estar a nivel OC o cargada POR ÍTEM (cada producto su finalidad).
  const finalidadDe = (r: OrdenPorPagar): string => {
    const oc = r.orden.finalidad?.trim();
    if (oc) return oc;
    const items = Array.isArray(r.orden.items) ? r.orden.items : [];
    const fs = Array.from(new Set(items.map((it) => (it.finalidad ?? '').trim()).filter(Boolean)));
    if (fs.length) return fs.join(' · ');
    return r.orden.motivo?.trim() || '—';
  };

  const total = rows.reduce((a, r) => a + Number(r.montoAPagar || 0), 0);
  const body = rows.map((r, i) => [
    String(i + 1),
    r.orden.oc_codigo ?? '—',
    r.proveedorNombre,
    finalidadDe(r),
    r.orden.notas?.trim() || '—',
    r.esperandoMetodo ? 'Esperando método' : 'Lista para pagar',
    fmt.money(Number(r.montoAPagar || 0)),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['ITEM', 'N°OC', 'PROVEEDOR', 'FINALIDAD', 'NOTAS', 'ESTADO', 'MONTO $']],
    body,
    foot: [['', '', '', '', '', 'TOTAL', fmt.money(total)]],
    styles: { fontSize: 8, cellPadding: 3, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: [210, 210, 210], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: [245, 245, 245], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'right' },
    // Solo se fijan las columnas angostas; PROVEEDOR/FINALIDAD/NOTAS quedan en
    // automático para que autoTable reparta el ancho restante y NO se salga del margen.
    tableWidth: 'auto',
    columnStyles: {
      0: { halign: 'center', cellWidth: 26 },
      1: { halign: 'center', cellWidth: 64 },
      2: { cellWidth: 90 },
      5: { halign: 'center', cellWidth: 66 },
      6: { halign: 'right', cellWidth: 52 },
    },
    margin: MARGIN,
  });

  previewPdf(doc, `oc-por-pagar-${new Date().toISOString().slice(0, 10)}.pdf`);
}
