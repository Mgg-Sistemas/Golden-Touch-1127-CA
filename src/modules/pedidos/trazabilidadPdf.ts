import type { jsPDF as jsPDFType } from 'jspdf';
import { supabase } from '@/shared/lib/supabase';
import { dateTime, money, montoMoneda, num } from '@/shared/lib/format';
import { loadLogoDataUrl } from '@/shared/lib/pdfLogo';
import type {
  EvaluacionRecepcion,
  OfertaProveedor,
  Orden,
  Proveedor,
} from '@/shared/lib/types';
import { previewPdf } from '@/shared/lib/reportePreview';

interface TrazabilidadData {
  orden: Orden;
  proveedorFinal: Proveedor | null;
  proveedoresPorId: Map<string, Proveedor>;
  ofertas: OfertaProveedor[];
  evaluacion: EvaluacionRecepcion | null;
  /** Nombre legible de quien aprobó la OP (resuelto desde su correo). */
  aprobadaPorNombre: string | null;
}

async function cargarTrazabilidad(ordenId: string): Promise<TrazabilidadData> {
  const [{ data: orden, error: oe }, { data: ofertas, error: ofe }, { data: evals, error: ee }] = await Promise.all([
    supabase.from('ordenes').select('*').eq('id', ordenId).single(),
    supabase.from('ofertas_proveedor').select('*').eq('orden_id', ordenId).order('precio_total'),
    supabase.from('evaluaciones_recepcion').select('*').eq('orden_id', ordenId).maybeSingle(),
  ]);
  if (oe || !orden) throw oe ?? new Error('Orden no encontrada');
  if (ofe) throw ofe;
  if (ee) throw ee;

  const provIds = new Set<string>();
  if (orden.proveedor_id) provIds.add(orden.proveedor_id);
  (ofertas ?? []).forEach((o) => provIds.add(o.proveedor_id));
  const proveedoresPorId = new Map<string, Proveedor>();
  if (provIds.size) {
    const { data: provs } = await supabase
      .from('proveedores')
      .select('*')
      .in('id', Array.from(provIds));
    (provs ?? []).forEach((p: Proveedor) => proveedoresPorId.set(p.id, p));
  }

  // Nombre legible de quien aprobó la OP (el correo se guarda en aprobada_por).
  let aprobadaPorNombre: string | null = null;
  if (orden.aprobada_por) {
    const { data: u } = await supabase
      .from('usuarios')
      .select('nombre, apellido')
      .eq('email', orden.aprobada_por)
      .maybeSingle();
    if (u) aprobadaPorNombre = `${u.nombre ?? ''} ${u.apellido ?? ''}`.trim() || null;
  }

  return {
    orden: orden as Orden,
    proveedorFinal: orden.proveedor_id ? proveedoresPorId.get(orden.proveedor_id) ?? null : null,
    proveedoresPorId,
    ofertas: (ofertas ?? []) as OfertaProveedor[],
    evaluacion: (evals ?? null) as EvaluacionRecepcion | null,
    aprobadaPorNombre,
  };
}

interface BuildResult {
  doc: jsPDFType;
  codigo: string;
  filename: string;
}

async function buildTrazabilidadPdf(ordenId: string): Promise<BuildResult> {
  const [data, logoDataUrl, { jsPDF }, { default: autoTable }] = await Promise.all([
    cargarTrazabilidad(ordenId),
    loadLogoDataUrl().catch(() => null),
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const { orden, proveedorFinal, proveedoresPorId, ofertas, evaluacion, aprobadaPorNombre } = data;

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const MARGIN = 42.52; // 1.5 cm
  let y = MARGIN;

  // ─── Header ────────────────────────────────────────────
  const LOGO_SIZE = 56;
  const TEXT_X = logoDataUrl ? MARGIN + LOGO_SIZE + 14 : MARGIN;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'JPEG', MARGIN, y, LOGO_SIZE, LOGO_SIZE);
    } catch {
      /* logo opcional: ignorar si falla */
    }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Trazabilidad de solicitud de pedido', TEXT_X, y + 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    `GOLDEN TOUCH 1127 C.A. · Generado ${dateTime(new Date().toISOString())}`,
    TEXT_X,
    y + 36,
  );
  y += Math.max(LOGO_SIZE, 36) + 10;

  doc.setDrawColor(200);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 16;

  // ─── 1. Solicitud ──────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`1. Solicitud · ${orden.codigo}`, MARGIN, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const filasSolicitud: Array<[string, string]> = [
    ['Unidad solicitante', orden.unidad_solicitante ?? '—'],
    ['Solicitante', orden.solicitante ?? '—'],
    ['Correo', orden.solicitante_email],
    ['Fecha de solicitud', dateTime(orden.created_at)],
    ['Prioridad', orden.urgente ? 'URGENTE' : 'Normal'],
    ['Estado actual', orden.estado],
    ...(orden.aprobada_en
      ? ([
          ['Aprobada por', aprobadaPorNombre || orden.aprobada_por || '—'],
          ['Fecha de aprobación', dateTime(orden.aprobada_en)],
        ] as Array<[string, string]>)
      : []),
    ['Clasificación', orden.clasificacion?.length ? orden.clasificacion.join(' · ') : '—'],
    ['Nota / Justificación', orden.notas ?? '—'],
  ];
  autoTable(doc, {
    startY: y,
    body: filasSolicitud,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 4 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 140 }, 1: { cellWidth: 'auto' } },
    margin: MARGIN,
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;

  // ─── 2. Ítems solicitados ──────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.text('2. Ítems solicitados', MARGIN, y);
  y += 6;
  autoTable(doc, {
    startY: y,
    head: [['SKU', 'Producto', 'Finalidad', 'Cantidad', 'Precio unit.', 'Subtotal']],
    body: orden.items.map((it) => [
      it.sku,
      it.nombre,
      it.finalidad?.trim() || '—',
      num(it.cantidad),
      montoMoneda(it.precio, orden.total_moneda),
      montoMoneda(it.cantidad * it.precio, orden.total_moneda),
    ]),
    foot: (() => {
      const desc = Math.max(0, Number(orden.descuento_obtenido) || 0);
      if (desc > 0) {
        const sub = Math.round((Number(orden.total) + desc) * 100) / 100;
        return [
          ['', '', '', '', 'Subtotal', montoMoneda(sub, orden.total_moneda)],
          ['', '', '', '', 'Descuento obtenido', `− ${montoMoneda(desc, orden.total_moneda)}`],
          ['', '', '', '', 'TOTAL', montoMoneda(orden.total, orden.total_moneda)],
        ];
      }
      return [['', '', '', '', 'TOTAL', montoMoneda(orden.total, orden.total_moneda)]];
    })(),
    theme: 'grid',
    headStyles: { fillColor: [230, 230, 230], textColor: 20 },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    margin: MARGIN,
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;

  // ─── 3. Ofertas de proveedores ─────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.text(`3. Ofertas de proveedores (${ofertas.length})`, MARGIN, y);
  y += 6;
  if (!ofertas.length) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.text('Sin ofertas registradas.', MARGIN, y + 12);
    y += 28;
  } else {
    autoTable(doc, {
      startY: y,
      head: [['Proveedor', 'BCV', 'Divisa/efec.', 'Ahorro', 'Entrega prom.', 'Estado', 'Score']],
      body: ofertas.map((of) => {
        const bcv = Number(of.precio_total);
        const div = of.precio_divisa != null ? Number(of.precio_divisa) : null;
        const dif = div != null ? bcv - div : null;
        const pct = div != null && bcv > 0 ? (dif! / bcv) * 100 : null;
        return [
          proveedoresPorId.get(of.proveedor_id)?.razon_social ?? '—',
          money(bcv),
          div != null ? money(div) : '—',
          pct != null ? `${money(dif!)} (${pct.toFixed(2)}%)` : '—',
          of.fecha_entrega_prometida ?? '—',
          of.estado,
          of.score_calculado != null ? `${(of.score_calculado * 100).toFixed(0)}` : '—',
        ];
      }),
      theme: 'grid',
      headStyles: { fillColor: [230, 230, 230], textColor: 20 },
      styles: { fontSize: 8.5, cellPadding: 3 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 6: { halign: 'right' } },
      margin: MARGIN,
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;

    // Comparativa por producto (Pago en Bs a BCV vs Pago en USD) de la oferta elegida,
    // o de la primera oferta si aún no se eligió. Los ítems de la oferta NO están escalados.
    const ofComparar = ofertas.find((o) => o.estado === 'aceptada') ?? ofertas[0];
    if (ofComparar && ofComparar.items.some((it) => Number(it.precio_usd) > 0)) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`Comparativa por producto · ${proveedoresPorId.get(ofComparar.proveedor_id)?.razon_social ?? ''}`.trim(), MARGIN, y);
      y += 6;
      const totalBs = ofComparar.items.reduce((a, it) => a + (Number(it.cantidad) || 0) * (Number(it.precio) || 0), 0);
      const totalU = ofComparar.items.reduce((a, it) => a + (Number(it.cantidad) || 0) * (Number(it.precio_usd) || 0), 0);
      const difT = totalBs - totalU;
      const pctT = totalBs > 0 ? (difT / totalBs) * 100 : 0;
      autoTable(doc, {
        startY: y,
        head: [['Producto', 'Cant', 'Bs Precio', 'Bs Total', 'USD Precio', 'USD Total', 'Diferencia', 'Var %']],
        body: ofComparar.items.map((it) => {
          const cant = Number(it.cantidad) || 0;
          const precio = Number(it.precio) || 0;
          const precioU = Number(it.precio_usd) || 0;
          const dif = (precio - precioU) * cant;
          const pct = precio > 0 ? ((precio - precioU) / precio) * 100 : 0;
          const nombreVar = (it.marca || it.modelo)
            ? `${it.nombre} (${[it.marca, it.modelo].filter(Boolean).join(' · ')})`
            : it.nombre;
          return [
            nombreVar, num(cant), money(precio), money(cant * precio),
            precioU > 0 ? money(precioU) : '—', precioU > 0 ? money(cant * precioU) : '—',
            precioU > 0 ? money(dif) : '—', precioU > 0 ? `${pct.toFixed(2)}%` : '—',
          ];
        }),
        foot: [['TOTAL', '', '', money(totalBs), '', money(totalU), money(difT), `${pctT.toFixed(2)}%`]],
        theme: 'grid',
        headStyles: { fillColor: [230, 230, 230], textColor: 20 },
        styles: { fontSize: 8, cellPadding: 3 },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
        margin: MARGIN,
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
    }

    // Fichas de los productos ofertados (marca/modelo/… + costos logísticos).
    const conFicha = ofertas.filter((o) => o.ficha && Object.keys(o.ficha).length);
    if (conFicha.length) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Fichas de los productos ofertados', MARGIN, y);
      y += 6;
      autoTable(doc, {
        startY: y,
        head: [['Proveedor', 'Marca', 'Modelo', 'Procedencia', 'Calidad', 'Materiales', 'Dim./Peso', 'Logística']],
        body: conFicha.map((o) => {
          const f = o.ficha!;
          const log = f.logistica ?? {};
          const lbl = (v?: string | null) => (v === 'incluido' ? 'incl.' : v === 'comprador' ? 'compr.' : '—');
          const logStr = `F:${lbl(log.flete)} T:${lbl(log.transporte)} E:${lbl(log.embalaje)} S:${lbl(log.seguros)}`;
          return [
            proveedoresPorId.get(o.proveedor_id)?.razon_social ?? '—',
            f.marca ?? '—',
            f.modelo ?? '—',
            f.procedencia ?? '—',
            f.nivel_calidad ?? '—',
            f.materiales ?? '—',
            [f.dimensiones, f.peso].filter(Boolean).join(' · ') || '—',
            logStr,
          ];
        }),
        theme: 'grid',
        headStyles: { fillColor: [230, 230, 230], textColor: 20 },
        styles: { fontSize: 7.5, cellPadding: 2.5 },
        margin: MARGIN,
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
    }
  }

  // ─── 4. Orden de compra (proveedor aceptado) ───────────
  doc.setFont('helvetica', 'bold');
  doc.text(`4. Orden de compra${orden.oc_codigo ? ` · ${orden.oc_codigo}` : ''}`, MARGIN, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  const ofertaAceptada = ofertas.find((o) => o.estado === 'aceptada');
  const ocEvento = orden.historial?.find((h) => h.evento === 'oc_emitida');
  const documentosOc = ocEvento?.documentos ?? [];
  const filasOrden: Array<[string, string]> = [
    ['N° de orden de compra', orden.oc_codigo ?? '—'],
    ['Proveedor adjudicado', proveedorFinal?.razon_social ?? '—'],
    ['RIF', proveedorFinal?.rif ?? '—'],
    ['Contacto', proveedorFinal?.contacto ?? '—'],
    ...((Number(orden.descuento_obtenido) || 0) > 0
      ? ([['Descuento obtenido', `− ${money(Number(orden.descuento_obtenido))} (subtotal ${money(Math.round((Number(orden.total) + Number(orden.descuento_obtenido)) * 100) / 100)})`]] as Array<[string, string]>)
      : []),
    ['Total de la orden', montoMoneda(orden.total, orden.total_moneda)],
    ...(ofertaAceptada?.precio_divisa != null && Number(ofertaAceptada.precio_divisa) > 0 && Number(ofertaAceptada.precio_divisa) !== Number(ofertaAceptada.precio_total)
      ? ([['Precio con descuento (divisa)', `${money(Number(ofertaAceptada.precio_divisa))} · lista BCV ${money(Number(ofertaAceptada.precio_total))}`]] as Array<[string, string]>)
      : []),
    ...(orden.comprobante_tipo === 'factura'
      ? ([
          ['Tipo de soporte', 'Factura'],
          ['IVA', orden.iva_aplicado ? `Con IVA (16%) · ${money(Number(orden.iva_monto ?? 0))}` : 'Sin IVA'],
        ] as Array<[string, string]>)
      : []),
    ['Almacén destino', orden.almacen_destino ?? '—'],
    ['Fecha de aprobación', orden.aprobada_en ? dateTime(orden.aprobada_en) : '—'],
    ['Aprobada por', orden.aprobada_por ?? '—'],
    ['Fecha de entrega prometida', ofertaAceptada?.fecha_entrega_prometida ?? '—'],
    ['Condiciones de pago', ofertaAceptada?.condiciones_pago ?? '—'],
    ['Documentos de la OC', documentosOc.length ? documentosOc.join(' · ') : '—'],
  ];
  autoTable(doc, {
    startY: y,
    body: filasOrden,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 4 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 180 }, 1: { cellWidth: 'auto' } },
    margin: MARGIN,
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;

  // ─── 5. Recepción ──────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.text('5. Recepción de mercancía', MARGIN, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  const recibida = orden.historial?.find((h) => h.evento === 'recibida');
  // Una orden recibida puede luego finalizarse; en ambos estados sigue "recibida".
  const fueRecibida = ['recibida', 'finalizada'].includes(orden.estado) || !!recibida;
  const filasRecepcion: Array<[string, string]> = [
    ['Estado', fueRecibida ? 'Recibida' : 'Aún no recibida'],
    ['Fecha de recepción', recibida ? dateTime(recibida.at) : '—'],
    ['Recibida por', recibida?.actor ?? '—'],
    ['Calidad evaluada', evaluacion ? `${evaluacion.calidad} / 5` : '—'],
    ['Puntualidad', evaluacion ? (
      evaluacion.puntualidad_dias === 0
        ? 'En fecha prometida'
        : evaluacion.puntualidad_dias > 0
          ? `${evaluacion.puntualidad_dias} días adelantado`
          : `${Math.abs(evaluacion.puntualidad_dias)} días atrasado`
    ) : '—'],
    ['Comentario', evaluacion?.comentario ?? '—'],
  ];
  autoTable(doc, {
    startY: y,
    body: filasRecepcion,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 4 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 180 }, 1: { cellWidth: 'auto' } },
    margin: MARGIN,
  });

  // ─── Footer ────────────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    `Documento auto-generado · Orden ${orden.codigo} · ${dateTime(new Date().toISOString())}`,
    MARGIN,
    pageH - 24,
  );

  return { doc, codigo: orden.codigo, filename: `trazabilidad-${orden.codigo}.pdf` };
}

/** Descarga el PDF al disco del usuario. */
export async function descargarTrazabilidadPdf(ordenId: string): Promise<void> {
  const { doc, filename } = await buildTrazabilidadPdf(ordenId);
  previewPdf(doc, filename);
}

/** Devuelve el PDF como base64 (sin el prefijo data URI). Útil para enviarlo
 *  por correo desde la Edge Function. */
export async function obtenerTrazabilidadPdfBase64(
  ordenId: string,
): Promise<{ base64: string; codigo: string; filename: string }> {
  const { doc, codigo, filename } = await buildTrazabilidadPdf(ordenId);
  // jsPDF.output('datauristring') retorna `data:application/pdf;filename=...;base64,JVBE...`
  const dataUri = doc.output('datauristring');
  const base64 = dataUri.split(',', 2)[1] ?? '';
  return { base64, codigo, filename };
}
