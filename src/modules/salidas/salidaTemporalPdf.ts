/* ============================================================
   Golden Touch · Salida Temporal · Reporte PDF (vista previa)
   ORDEN DE SALIDA TEMPORAL: sacar material a mantenimiento y
   retornarlo al inventario. Variante de la Orden de Salida:
   sin precio/total, con estado (pendiente/en tránsito/finalizada),
   quién autorizó (Leydis / Jesús) y el tiempo en tránsito.
   Se abre en vista previa; se descarga solo al pulsar Descargar.
   ============================================================ */
import type { SalidaTemporal } from '@/shared/lib/types';
import { previewPdf } from '@/shared/lib/reportePreview';
import { formatDuracion } from './salidasTemporales.repository';

/** Inventario único: el almacén guardado es `'General'`; se imprime «Inventario General». */
const invLabel = (a?: string | null): string => (a && a.trim().toLowerCase() === 'general' ? 'Inventario General' : (a || '—'));

export async function descargarSalidaTemporalPdf(
  s: SalidaTemporal,
  /** Resuelve email → "Nombre Apellido" (del directorio de usuarios). Sin resolver,
   *  o si el email no se encuentra, se usa el valor tal cual. */
  resolverNombre?: (email?: string | null) => string,
): Promise<void> {
  const [{ jsPDF }, { default: autoTable }, fmt, { loadLogoDataUrl, loadFirmaDataUrl, loadFirma2DataUrl }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/format'),
    import('@/shared/lib/pdfLogo'),
  ]);
  const logo = await loadLogoDataUrl().catch(() => null);

  // Nombre completo (no el email): resuelve del directorio de usuarios.
  const nombre = (email?: string | null): string => {
    if (!email) return '';
    const r = resolverNombre?.(email);
    return r && r !== email ? r : email;
  };

  // Estado legible.
  const estadoTxt = s.estado === 'finalizada' ? 'Finalizada'
    : s.estado === 'en_transito' ? 'En tránsito' : 'Pendiente';

  // Autorizador según la firma estampada al aprobar.
  const aprobada = !!(s.aprobada_en || s.firma);
  const autorizo = s.firma === 'leydis' ? 'LEYDIS RENGEL'
    : s.firma === 'gerente' ? 'JESÚS LOZADA'
      : '— (pendiente) —';
  // Firmas (solo si ya fue aprobada).
  const firma2 = (aprobada && s.firma === 'leydis') ? await loadFirma2DataUrl().catch(() => null) : null;
  const firmaGerente = (aprobada && s.firma === 'gerente') ? await loadFirmaDataUrl().catch(() => null) : null;

  // Solicitante / creador: nombre completo cuando se pueda resolver.
  const creoResuelto = nombre(s.actor);
  const creo = s.solicitante || (creoResuelto && creoResuelto !== s.actor ? creoResuelto : (s.actor_name || s.actor)) || '—';

  const items = s.items ?? [];

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
  doc.text('ORDEN DE SALIDA TEMPORAL', TX, y + 20);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(`N° ${s.codigo}  ·  Material a mantenimiento`, TX, y + 38);
  doc.text(`Emitida: ${fmt.dateTime(new Date().toISOString())}`, PAGE_W - MARGIN, y + 38, { align: 'right' });
  y += Math.max(LOGO, 42) + 8;

  doc.setDrawColor(255, 138, 0); doc.setLineWidth(1.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 16;
  doc.setLineWidth(0.5); doc.setDrawColor(180);

  // ── Datos en dos columnas (estilo factura): Emisor/Solicitud · Documento ──
  const COLGAP = 22;
  const HALF = (PAGE_W - MARGIN * 2 - COLGAP) / 2;
  const infoY = y;

  const chofer = [s.chofer_nombre, s.chofer_cedula ? `C.I. ${s.chofer_cedula}` : ''].filter(Boolean).join(' · ');
  const vehiculo = [s.vehiculo_descripcion, s.vehiculo_placa].filter(Boolean).join(' · ');
  const izquierda: Array<[string, string]> = [
    ['GOLDEN TOUCH 1127 C.A.', ''],
    ['Sistema de Gestión de Inventarios', ''],
    ['Solicitado por', s.solicitante || creo || '—'],
    ...(s.unidad_solicitante ? [['Unidad solicitante', s.unidad_solicitante] as [string, string]] : []),
    ...(chofer ? [['Responsable', chofer] as [string, string]] : []),
    ...(vehiculo ? [['Vehículo', vehiculo] as [string, string]] : []),
  ];

  // Tiempo en tránsito/mantenimiento: si finalizó usa duracion_min; si sigue en
  // tránsito, calcula lo transcurrido desde en_transito_en hasta ahora.
  let tiempoTxt: string | null = null;
  if (s.estado === 'finalizada' || s.duracion_min != null) {
    tiempoTxt = formatDuracion(s.duracion_min);
  } else if (s.estado === 'en_transito' && s.en_transito_en) {
    const transcurridoMin = Math.max(0, Math.round((Date.now() - new Date(s.en_transito_en).getTime()) / 60000));
    tiempoTxt = formatDuracion(transcurridoMin);
  }

  const derecha: Array<[string, string]> = [
    ['Fecha de solicitud', s.fecha ? fmt.date(s.fecha) : fmt.dateTime(s.created_at)],
    ...(s.direccion_despacho ? [['Dirección de despacho', s.direccion_despacho] as [string, string]] : []),
    ...(s.direccion_destino ? [['Dirección de destino', s.direccion_destino] as [string, string]] : []),
    ['Estado', estadoTxt],
    ['Autorizado por', autorizo],
    ...(s.aprobada_en ? [['Aprobada el', fmt.dateTime(s.aprobada_en)] as [string, string]] : []),
    ...(s.en_transito_en ? [['En tránsito desde', fmt.dateTime(s.en_transito_en)] as [string, string]] : []),
    ...(s.finalizada_en ? [['Finalizada el', fmt.dateTime(s.finalizada_en)] as [string, string]] : []),
    ...(tiempoTxt ? [['Tiempo en tránsito/mantenimiento', tiempoTxt] as [string, string]] : []),
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
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 120 }, 1: { cellWidth: 'auto' } },
    margin: { left: MARGIN + HALF + COLGAP, right: MARGIN }, tableWidth: HALF,
  });
  y = Math.max(izqFin, lastY()) + 16;

  // ── Tabla de materiales (sin precio ni total) ──
  // Columnas: # · Material · Almacén · Cantidad · [Observación].
  const conObs = items.some((it) => (it.observacion ?? '').trim());
  const head: string[] = ['#', 'Material', 'Almacén', 'Cantidad'];
  if (conObs) head.push('Observación');

  const body = items.map((it, i) => {
    const row: string[] = [
      String(i + 1),
      `${it.producto_nombre}${it.producto_sku ? ` · ${it.producto_sku}` : ''}`,
      invLabel(it.almacen),
      `${fmt.num(Number(it.cantidad) || 0)} ${it.unidad ?? ''}`.trim(),
    ];
    if (conObs) row.push((it.observacion ?? '').trim() || '—');
    return row;
  });

  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    theme: 'grid',
    headStyles: { fillColor: [255, 138, 0], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9.5, cellPadding: 5 },
    columnStyles: { 0: { halign: 'center', cellWidth: 22 }, 3: { halign: 'right' } },
    margin: MARGIN,
  });
  y = lastY() + 18;

  // ── Observaciones / notas ──
  const notas = s.motivo?.trim() || '—';
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(120);
  doc.text('OBSERVACIONES / NOTAS', MARGIN, y);
  doc.setTextColor(20); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  const notasWrap = doc.splitTextToSize(notas, PAGE_W - MARGIN * 2);
  doc.text(notasWrap, MARGIN, y + 15);

  // ── Firmas al pie ──
  const fy = PAGE_H - MARGIN - 50;
  const colW = (PAGE_W - MARGIN * 2 - 40) / 2;
  const cx = MARGIN + colW + 40 + colW / 2; // centro de la columna «Autorizado por»
  // Firma del autorizador estampada SOBRE la línea, solo si ya fue aprobada.
  if (firma2) {
    // LEYDIS RENGEL: firma con dimensiones naturales, centrada sobre la columna.
    const maxW = 300, maxH = 160;
    const ratio = Math.min(maxW / firma2.w, maxH / firma2.h);
    const sw = firma2.w * ratio, sh = firma2.h * ratio;
    const sx = Math.max(MARGIN, Math.min(cx - sw / 2, PAGE_W - MARGIN - sw));
    doc.addImage(firma2.dataUrl, 'JPEG', sx, fy - sh - 1, sw, sh);
  } else if (firmaGerente) {
    // JESÚS LOZADA: firma sin dimensiones, tamaño fijo razonable, centrada.
    const sw = 150, sh = 67;
    const sx = Math.max(MARGIN, Math.min(cx - sw / 2, PAGE_W - MARGIN - sw));
    try { doc.addImage(firmaGerente, 'PNG', sx, fy - sh + 6, sw, sh); } catch { /* firma opcional */ }
  }
  doc.setDrawColor(120); doc.setLineWidth(0.7);
  doc.line(MARGIN, fy, MARGIN + colW, fy);
  doc.line(MARGIN + colW + 40, fy, MARGIN + colW * 2 + 40, fy);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text('Solicitado / Creado por', MARGIN + colW / 2, fy + 14, { align: 'center' });
  doc.text('Autorizado por', cx, fy + 14, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text(creo || '—', MARGIN + colW / 2, fy + 27, { align: 'center' });
  doc.text(aprobada ? autorizo : '—', cx, fy + 27, { align: 'center' });

  doc.setFontSize(8); doc.setTextColor(120);
  doc.text(`Documento auto-generado · ${s.codigo} · ${fmt.dateTime(new Date().toISOString())}`, MARGIN, PAGE_H - 24);

  previewPdf(doc, `salida-temporal-${s.codigo}.pdf`);
}
