import { supabase } from '@/shared/lib/supabase';
import { dateTime, money, num } from '@/shared/lib/format';
import { loadLogoDataUrl, loadFirmaDataUrl } from '@/shared/lib/pdfLogo';
import type { OfertaProveedor, Orden, Proveedor } from '@/shared/lib/types';
import { previewPdf } from '@/shared/lib/reportePreview';

interface OcData {
  ordenes: Orden[];      // 1+ OPs que comparten la misma OC
  orden: Orden;          // la "principal" (referencia)
  proveedor: Proveedor | null;
  ofertaAceptada: OfertaProveedor | null;
  /** Todas las ofertas de la orden (para mostrar la del proveedor que desistió). */
  ofertas: OfertaProveedor[];
  /** Proveedores referenciados por id (oferentes / desistidos). */
  proveedoresMap: Map<string, Proveedor>;
  /** email (minúsculas) -> "Nombre Apellido" de quienes intervinieron (aprobaron / registraron). */
  personasMap: Map<string, string>;
}

async function cargarDatosOc(ordenId: string): Promise<OcData> {
  const { data: orden, error: oe } = await supabase
    .from('ordenes')
    .select('*')
    .eq('id', ordenId)
    .single();
  if (oe || !orden) throw oe ?? new Error('Orden no encontrada');

  // Solo la orden seleccionada (no se consolidan hermanas en el PDF).
  const ordenes: Orden[] = [orden as Orden];

  let proveedor: Proveedor | null = null;
  if (orden.proveedor_id) {
    const { data: prov } = await supabase
      .from('proveedores')
      .select('*')
      .eq('id', orden.proveedor_id)
      .maybeSingle();
    proveedor = (prov ?? null) as Proveedor | null;
  }

  // Todas las ofertas de la orden (la aceptada + las descartadas, incluida la
  // del proveedor que desistió).
  const { data: ofertasData } = await supabase
    .from('ofertas_proveedor')
    .select('*')
    .eq('orden_id', ordenId);
  const ofertas = (ofertasData ?? []) as OfertaProveedor[];
  const ofertaAceptada = ofertas.find((of) => of.estado === 'aceptada') ?? null;

  // Proveedores referenciados (oferentes + el que desistió en el historial).
  const provIds = new Set<string>();
  ofertas.forEach((of) => of.proveedor_id && provIds.add(of.proveedor_id));
  ((orden as Orden).historial ?? []).forEach((h) => {
    const pid = (h as { proveedorAnteriorId?: string }).proveedorAnteriorId;
    if (pid) provIds.add(pid);
  });
  const proveedoresMap = new Map<string, Proveedor>();
  if (provIds.size) {
    const { data: provs } = await supabase
      .from('proveedores')
      .select('*')
      .in('id', Array.from(provIds));
    (provs ?? []).forEach((p) => proveedoresMap.set((p as Proveedor).id, p as Proveedor));
  }

  // Personas que intervinieron: se guardan por correo (aprobaciones, actores del
  // historial). Resolvemos a "Nombre Apellido" para mostrar en el PDF.
  const o = orden as Orden;
  const emails = new Set<string>();
  const addEmail = (e?: string | null) => { if (e && e.includes('@')) emails.add(e.toLowerCase()); };
  addEmail(o.aprobada_por);
  addEmail(o.oc_aprobada_por);
  addEmail(o.solicitante_email);
  (o.historial ?? []).forEach((h) => addEmail(h.actor));
  const personasMap = new Map<string, string>();
  if (emails.size) {
    const { data: us } = await supabase
      .from('usuarios')
      .select('email, nombre, apellido')
      .in('email', Array.from(emails));
    (us ?? []).forEach((u: { email: string; nombre?: string | null; apellido?: string | null }) => {
      const nombre = `${u.nombre ?? ''} ${u.apellido ?? ''}`.trim();
      if (u.email && nombre) personasMap.set(u.email.toLowerCase(), nombre);
    });
  }

  return {
    ordenes,
    orden: orden as Orden,
    proveedor,
    ofertaAceptada,
    ofertas,
    proveedoresMap,
    personasMap,
  };
}

/** Nombre legible de un correo; si no se resolvió, devuelve el correo tal cual. */
function nombrePersona(email: string | null | undefined, map: Map<string, string>): string {
  if (!email) return '—';
  return map.get(email.toLowerCase()) ?? email;
}

export async function descargarOrdenCompraPdf(ordenId: string): Promise<void> {
  const [{ ordenes, orden, proveedor, ofertaAceptada, ofertas, proveedoresMap, personasMap }, logoDataUrl, firmaDataUrl, { jsPDF }, { default: autoTable }] = await Promise.all([
    cargarDatosOc(ordenId),
    loadLogoDataUrl().catch(() => null),
    loadFirmaDataUrl().catch(() => null),
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  // La firma del Gerente General solo se estampa cuando la OC ya fue aprobada
  // (confirmada). Es la aprobación de OC (oc_aprobada_*), no la del pedido.
  const ocAprobada = Boolean(orden.oc_aprobada_en || orden.oc_aprobada_por);
  const ocAprobPor = orden.oc_aprobada_por ?? orden.aprobada_por ?? null;
  const ocAprobEn = orden.oc_aprobada_en ?? orden.aprobada_en ?? null;

  const esConsolidada = ordenes.length > 1;
  const totalGeneral = ordenes.reduce((a, o) => a + Number(o.total ?? 0), 0);

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const MARGIN = 42.52; // 1.5 cm
  let y = MARGIN;

  const LOGO_SIZE = 60;
  const TEXT_X = logoDataUrl ? MARGIN + LOGO_SIZE + 14 : MARGIN;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'JPEG', MARGIN, y, LOGO_SIZE, LOGO_SIZE);
    } catch {
      /* logo opcional */
    }
  }
  const ocLabel = orden.oc_codigo ?? orden.codigo;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('ORDEN DE COMPRA', TEXT_X, y + 20);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(
    esConsolidada
      ? `N° ${ocLabel}  ·  Consolida ${ordenes.length} OPs`
      : `N° ${ocLabel}  ·  Ref. pedido: ${orden.codigo}`,
    TEXT_X,
    y + 38,
  );
  doc.text(
    `Emitida: ${dateTime(orden.oc_emitida_en ?? new Date().toISOString())}`,
    PAGE_W - MARGIN,
    y + 38,
    { align: 'right' },
  );
  y += Math.max(LOGO_SIZE, 42) + 8;

  doc.setDrawColor(255, 138, 0);
  doc.setLineWidth(1.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 18;
  doc.setLineWidth(0.5);
  doc.setDrawColor(180);

  // ─── Marca de ORDEN URGENTE ───
  if (orden.urgente) {
    const tagW = 150, tagH = 22;
    doc.setFillColor(220, 53, 69);
    doc.roundedRect(MARGIN, y - 4, tagW, tagH, 4, 4, 'F');
    doc.setTextColor(255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('ORDEN: URGENTE', MARGIN + tagW / 2, y + 11, { align: 'center' });
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    y += tagH + 10;
  }

  // ─── Banner de CANCELACIÓN (si la OC fue cancelada) ───
  const cancelEvent = (orden.historial ?? []).find((h) => h.evento === 'cancelada');
  if (cancelEvent) {
    const motivoCanc = (cancelEvent as { motivo?: string }).motivo?.trim() || '—';
    const motivoLines = doc.splitTextToSize(`Motivo: ${motivoCanc}`, PAGE_W - MARGIN * 2 - 24);
    const bannerH = 30 + motivoLines.length * 11;
    doc.setFillColor(253, 232, 232);
    doc.setDrawColor(220, 53, 69);
    doc.setLineWidth(1);
    doc.roundedRect(MARGIN, y, PAGE_W - MARGIN * 2, bannerH, 4, 4, 'FD');
    doc.setTextColor(176, 32, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('ORDEN DE COMPRA CANCELADA', MARGIN + 12, y + 18);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Cancelada por ${nombrePersona(cancelEvent.actor, personasMap)} · ${dateTime(cancelEvent.at)}`,
      PAGE_W - MARGIN - 12,
      y + 18,
      { align: 'right' },
    );
    doc.setFontSize(9.5);
    doc.text(motivoLines, MARGIN + 12, y + 30);
    doc.setTextColor(0);
    doc.setDrawColor(180);
    doc.setLineWidth(0.5);
    y += bannerH + 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('PROVEEDOR', PAGE_W / 2, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const emisorLines = [
    'GOLDEN TOUCH 1127 C.A.',
    'Sistema de Gestión de Inventarios',
  ];
  const provLines = [
    proveedor?.razon_social ?? '—',
    proveedor?.rif ? `RIF: ${proveedor.rif}` : '',
    proveedor?.contacto ? `Contacto: ${proveedor.contacto}` : '',
    proveedor?.email ?? '',
    proveedor?.telefono ?? '',
    proveedor?.direccion ?? '',
  ].filter(Boolean);
  emisorLines.forEach((t, i) => doc.text(t, MARGIN, y + i * 12));
  provLines.forEach((t, i) => doc.text(t, PAGE_W / 2, y + i * 12));
  y += Math.max(emisorLines.length, provLines.length) * 12 + 16;

  // ─── SOLICITUD: unidad, quién solicitó y fechas ───
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('SOLICITUD', MARGIN, y);
  y += 12;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const solicitud: Array<[string, string]> = [
    ['Unidad solicitante', orden.unidad_solicitante || '—'],
    ['Solicitado por', orden.solicitante || nombrePersona(orden.solicitante_email, personasMap)],
    ...(orden.ci_solicitante ? ([['Cédula del solicitante', orden.ci_solicitante]] as Array<[string, string]>) : []),
    ['Fecha de solicitud (SP)', orden.created_at ? dateTime(orden.created_at) : '—'],
    ['SP aprobada el', orden.aprobada_en ? dateTime(orden.aprobada_en) : '—'],
  ];
  autoTable(doc, {
    startY: y,
    body: solicitud,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 180 }, 1: { cellWidth: 'auto' } },
    margin: MARGIN,
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('CONDICIONES', MARGIN, y);
  y += 12;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const documentosOc = orden.historial?.find((h) => h.evento === 'oc_emitida')?.documentos ?? [];
  const clasificacion = orden.clasificacion ?? [];
  const cond: Array<[string, string]> = [
    ['Clasificación', clasificacion.length ? clasificacion.join(' · ') : '—'],
    ['Fecha de entrega prometida', ofertaAceptada?.fecha_entrega_prometida ?? '—'],
    ['Condiciones de pago', ofertaAceptada?.condiciones_pago ?? '—'],
    ['Documentos', documentosOc.length ? documentosOc.join(' · ') : '—'],
    ['Aprobada por (SP)', nombrePersona(orden.aprobada_por, personasMap)],
    ['Aprobada el', orden.aprobada_en ? dateTime(orden.aprobada_en) : '—'],
  ];
  // OC por factura con IVA: desglose del 16%.
  if (orden.comprobante_tipo === 'factura') {
    cond.push(['Tipo de soporte', 'Factura']);
    if (orden.iva_aplicado) {
      const iva = Number(orden.iva_monto ?? 0);
      const base = Number(orden.total) - iva;
      cond.push(['Base imponible', money(base)]);
      cond.push(['IVA (16%)', money(iva)]);
      cond.push(['Total con IVA', money(Number(orden.total))]);
    } else {
      cond.push(['IVA', 'Sin IVA']);
    }
  }
  // Precio en divisa/efectivo de la oferta aceptada (con diferencia y % vs BCV).
  if (ofertaAceptada?.precio_divisa != null) {
    const bcv = Number(ofertaAceptada.precio_total);
    const div = Number(ofertaAceptada.precio_divisa);
    const dif = bcv - div;
    const pct = bcv > 0 ? (dif / bcv) * 100 : 0;
    cond.push(['Precio BCV (referencia)', money(bcv)]);
    cond.push(['Precio en divisa / efectivo', money(div)]);
    cond.push(['Ahorro pagando en divisa', `${money(dif)} (${pct.toFixed(2)}%)`]);
  }
  // Ficha del producto ofertado por el proveedor adjudicado.
  const f = ofertaAceptada?.ficha;
  if (f && Object.keys(f).length) {
    if (f.marca) cond.push(['Marca', f.marca]);
    if (f.modelo) cond.push(['Modelo', f.modelo]);
    if (f.procedencia) cond.push(['Procedencia', f.procedencia]);
    if (f.nivel_calidad) cond.push(['Nivel de calidad', f.nivel_calidad]);
    if (f.materiales) cond.push(['Materiales', f.materiales]);
    if (f.dimensiones) cond.push(['Dimensiones', f.dimensiones]);
    if (f.peso) cond.push(['Peso', f.peso]);
    const log = f.logistica;
    if (log) {
      const lbl = (v?: string | null) => (v === 'incluido' ? 'incluido' : v === 'comprador' ? 'por cuenta del comprador' : '—');
      const ls: string[] = [];
      if (log.flete) ls.push(`Flete: ${lbl(log.flete)}`);
      if (log.transporte) ls.push(`Transporte: ${lbl(log.transporte)}`);
      if (log.embalaje) ls.push(`Embalaje: ${lbl(log.embalaje)}`);
      if (log.seguros) ls.push(`Seguros: ${lbl(log.seguros)}`);
      if (ls.length) cond.push(['Costos logísticos', ls.join(' · ')]);
    }
  }
  autoTable(doc, {
    startY: y,
    body: cond,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 180 }, 1: { cellWidth: 'auto' } },
    margin: MARGIN,
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;

  // ─── Desistimientos de proveedor (datos del proveedor + su oferta) ───
  const historial = orden.historial ?? [];
  if (historial.some((h) => h.evento === 'desistida_proveedor')) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('DESISTIMIENTOS DE PROVEEDOR', MARGIN, y);
    y += 10;

    let primero = true;
    historial.forEach((h, i) => {
      if (h.evento !== 'desistida_proveedor') return;

      // Evento "oferta_aceptada" inmediatamente anterior: trae proveedor, precio y
      // score del proveedor que estaba elegido cuando desistió (fallback robusto
      // cuando la orden no guardó `proveedorAnteriorId`).
      const prevAccept = historial
        .slice(0, i)
        .reverse()
        .find((e) => e.evento === 'oferta_aceptada') as
        | { proveedorId?: string; precio?: number; score?: number }
        | undefined;

      const pid = (h as { proveedorAnteriorId?: string }).proveedorAnteriorId ?? prevAccept?.proveedorId ?? null;
      const prov = pid ? proveedoresMap.get(pid) ?? null : null;
      const oferta = pid ? ofertas.find((of) => of.proveedor_id === pid) ?? null : null;

      // Valores de la oferta, con respaldo en el historial / total de la orden.
      const precioTotal = oferta?.precio_total ?? prevAccept?.precio ?? (orden.total != null ? Number(orden.total) : null);
      const score = oferta?.score_calculado ?? prevAccept?.score ?? null;

      if (!primero) y += 8;
      primero = false;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(20);
      doc.text(prov ? prov.razon_social : 'Proveedor (sin datos)', MARGIN, y + 4);
      y += 8;

      const filas: Array<[string, string]> = [
        ['RIF', prov?.rif ?? '—'],
        ['Contacto', prov?.contacto ?? '—'],
        ['Teléfono', prov?.telefono ?? '—'],
        ['Email', prov?.email ?? '—'],
        ['Oferta · Precio total', precioTotal != null ? money(precioTotal) : '—'],
        ['Oferta · Score', score != null ? num(score) : '—'],
        ['Oferta · Entrega prometida', oferta?.fecha_entrega_prometida ? dateTime(oferta.fecha_entrega_prometida) : '—'],
        ['Oferta · Condiciones de pago', oferta?.condiciones_pago ?? '—'],
        ['Desistió (fecha y hora)', dateTime(h.at)],
        ['Motivo', (h as { motivo?: string }).motivo ?? '—'],
        ['Registró', nombrePersona(h.actor, personasMap)],
      ];
      autoTable(doc, {
        startY: y,
        body: filas,
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 3 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 170, fillColor: [244, 244, 244] }, 1: { cellWidth: 'auto' } },
        margin: MARGIN,
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
    });
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(esConsolidada ? `ÍTEMS · ${ordenes.length} órdenes consolidadas` : 'ÍTEMS', MARGIN, y);
  y += 6;

  ordenes.forEach((o, idx) => {
    if (esConsolidada) {
      if (idx > 0) y += 8;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(o.codigo, MARGIN, y + 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(
        `Solicitante: ${o.solicitante ?? nombrePersona(o.solicitante_email, personasMap)}`,
        PAGE_W - MARGIN,
        y + 12,
        { align: 'right' },
      );
      doc.setTextColor(0);
      y += 18;
    }

    autoTable(doc, {
      startY: y,
      head: [['SKU', 'Descripción', 'Cantidad', 'Precio unit.', 'Subtotal']],
      body: o.items.map((it) => {
        // Marca/modelo cargados por el usuario (en la oferta) se muestran bajo el nombre.
        // En servicios de recarga (gas/oxígeno/extintores) se muestran bombonas y KG.
        const ficha = [
          it.marca && `Marca: ${it.marca}`, it.modelo && `Modelo: ${it.modelo}`,
          it.bombonas ? `Bombonas: ${num(it.bombonas)}` : '',
          it.kg_recarga ? `KG a recargar: ${num(it.kg_recarga)}` : '',
        ].filter(Boolean).join('   ');
        return [
          it.sku,
          ficha ? `${it.nombre}\n${ficha}` : it.nombre,
          num(it.cantidad),
          money(it.precio),
          money(it.cantidad * it.precio),
        ];
      }),
      foot: [['', '', '', esConsolidada ? `Subtotal ${o.codigo}` : 'TOTAL', money(o.total)]],
      theme: 'grid',
      headStyles: { fillColor: [255, 138, 0], textColor: 255 },
      footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 4 },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      margin: MARGIN,
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  });

  if (esConsolidada) {
    autoTable(doc, {
      startY: y + 4,
      body: [['TOTAL GENERAL DE LA OC', money(totalGeneral)]],
      theme: 'plain',
      styles: { fontSize: 11, fontStyle: 'bold', cellPadding: 6 },
      columnStyles: { 0: { halign: 'right' }, 1: { halign: 'right', textColor: [255, 138, 0] } },
      margin: MARGIN,
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  }
  y += 20;

  const pageH = doc.internal.pageSize.getHeight();
  const FOOTER_RESERVA = 100; // espacio reservado para firmas + pie

  if (orden.notas) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const split = doc.splitTextToSize(orden.notas, PAGE_W - MARGIN * 2);
    const altoNotas = 12 + split.length * 11 + 16;
    // Si las notas + el pie no caben en la página, saltamos a una nueva.
    if (y + altoNotas > pageH - FOOTER_RESERVA) {
      doc.addPage();
      y = MARGIN;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Notas / observaciones', MARGIN, y);
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(split, MARGIN, y);
    y += split.length * 11 + 16;
  }

  // Garantizar que el pie no se solape con el contenido: si no hay espacio, nueva página.
  if (y > pageH - FOOTER_RESERVA) {
    doc.addPage();
    y = MARGIN;
  }

  // Firma manuscrita del Gerente General sobre la línea de "Firma autorizada"
  // (abajo a la izquierda), únicamente si la OC ya está aprobada.
  if (ocAprobada && firmaDataUrl) {
    try {
      const SIG_W = 150;
      const SIG_H = 67; // conserva el aspecto real de firma.png (707×317 ≈ 2.23)
      doc.addImage(firmaDataUrl, 'PNG', MARGIN + 6, pageH - 80 - SIG_H + 8, SIG_W, SIG_H);
    } catch {
      /* firma opcional */
    }
  }

  doc.setDrawColor(180);
  doc.line(MARGIN, pageH - 80, MARGIN + 200, pageH - 80);
  doc.line(PAGE_W - MARGIN - 200, pageH - 80, PAGE_W - MARGIN, pageH - 80);
  doc.setFontSize(9);
  doc.text('Firma autorizada · GOLDEN TOUCH 1127 C.A.', MARGIN, pageH - 66);
  if (ocAprobada && ocAprobPor) {
    doc.setFontSize(7.5);
    doc.setTextColor(120);
    doc.text(
      `Aprobada por ${nombrePersona(ocAprobPor, personasMap)}${ocAprobEn ? ' · ' + dateTime(ocAprobEn) : ''}`,
      MARGIN,
      pageH - 56,
    );
    doc.setTextColor(0);
    doc.setFontSize(9);
  }
  doc.text('Recibido por proveedor', PAGE_W - MARGIN, pageH - 66, { align: 'right' });
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    `Documento auto-generado · ${orden.codigo} · ${dateTime(new Date().toISOString())}`,
    MARGIN,
    pageH - 24,
  );

  previewPdf(doc, `${ocLabel}.pdf`);
}
