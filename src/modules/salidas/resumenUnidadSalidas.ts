/* ============================================================
   Golden Touch · Salidas · Resumen del gasto de material POR
   UNIDAD SOLICITANTE. Exporta a PDF, Excel y correo (Brevo).
   El gasto de cada salida = cantidad × costo unitario (PMP).
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';

/** Una salida ejecutada, normalizada para el resumen. */
export interface SalidaResumenRow {
  unidad: string;
  at: string;            // fecha/hora de ejecución
  solicitante: string;
  producto: string;
  cantidad: number;
  unidadMedida: string;
  monto: number;         // cantidad × precio_unit (valor del material)
}

/** Acumulado por unidad solicitante. */
export interface GrupoUnidad {
  unidad: string;
  monto: number;
  cantidad: number;
  count: number;
}

export interface ResumenMeta {
  desde?: string | null;
  hasta?: string | null;
}

function rangoLabel(meta: ResumenMeta): string {
  if (meta.desde && meta.hasta) return `Del ${meta.desde} al ${meta.hasta}`;
  if (meta.desde) return `Desde ${meta.desde}`;
  if (meta.hasta) return `Hasta ${meta.hasta}`;
  return 'Todo el período';
}

async function construirPdf(grupos: GrupoUnidad[], filas: SalidaResumenRow[], meta: ResumenMeta) {
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
  doc.text('Gasto de material por unidad solicitante', tx, y + 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`GOLDEN TOUCH 1127 C.A. · ${fmt.dateTime(new Date().toISOString())} · ${rangoLabel(meta)}`, tx, y + 33);
  y += 60;

  const totalMonto = grupos.reduce((a, g) => a + g.monto, 0);
  const totalCant = grupos.reduce((a, g) => a + g.cantidad, 0);

  // Tabla 1: resumen por unidad.
  autoTable(doc, {
    startY: y,
    head: [['Unidad solicitante', 'Salidas', 'Cantidad', 'Gasto (USD)']],
    body: grupos.map((g) => [g.unidad, fmt.num(g.count), fmt.num(g.cantidad), fmt.money(g.monto)]),
    foot: [['TOTAL', fmt.num(grupos.reduce((a, g) => a + g.count, 0)), fmt.num(totalCant), fmt.money(totalMonto)]],
    theme: 'grid',
    headStyles: { fillColor: [255, 138, 0], textColor: 255 },
    footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    margin: MARGIN,
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;

  // Tabla 2: detalle de cada salida.
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('Detalle de salidas', MARGIN, y);
  y += 6;
  autoTable(doc, {
    startY: y,
    head: [['Fecha', 'Unidad', 'Solicitó', 'Material', 'Cantidad', 'Gasto (USD)']],
    body: filas.map((f) => [
      fmt.dateTime(f.at), f.unidad, f.solicitante, f.producto,
      `${fmt.num(f.cantidad)} ${f.unidadMedida}`.trim(), fmt.money(f.monto),
    ]),
    theme: 'striped',
    headStyles: { fillColor: [255, 138, 0], textColor: 255, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' } },
    margin: MARGIN,
  });
  return doc;
}

export async function descargarResumenUnidadPdf(grupos: GrupoUnidad[], filas: SalidaResumenRow[], meta: ResumenMeta): Promise<void> {
  const doc = await construirPdf(grupos, filas, meta);
  doc.save(`gasto-material-por-unidad-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function descargarResumenUnidadExcel(grupos: GrupoUnidad[], filas: SalidaResumenRow[], meta: ResumenMeta): Promise<void> {
  const [XLSXmod, { money, num, dateTime }] = await Promise.all([
    import('xlsx-js-style'),
    import('@/shared/lib/format'),
  ]);
  const XLSX = XLSXmod as unknown as {
    utils: {
      aoa_to_sheet: (d: unknown[][]) => Record<string, unknown>;
      encode_cell: (c: { r: number; c: number }) => string;
      book_new: () => unknown;
      book_append_sheet: (wb: unknown, ws: unknown, name: string) => void;
    };
    writeFile: (wb: unknown, name: string) => void;
  };
  const HEADER_STYLE = {
    font: { name: 'Arial', sz: 12, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'FF8A00' } },
    alignment: { horizontal: 'left', vertical: 'center' },
  };

  const totalMonto = grupos.reduce((a, g) => a + g.monto, 0);
  const headResumen = ['Unidad solicitante', 'Salidas', 'Cantidad', 'Gasto (USD)'];
  const headDetalle = ['Fecha', 'Unidad', 'Solicitó', 'Material', 'Cantidad', 'Unidad medida', 'Gasto (USD)'];

  const aoa: unknown[][] = [
    ['GASTO DE MATERIAL POR UNIDAD SOLICITANTE · GOLDEN TOUCH 1127 C.A.'],
    [rangoLabel(meta)],
    [],
    headResumen,
    ...grupos.map((g) => [g.unidad, g.count, g.cantidad, g.monto]),
    ['TOTAL', grupos.reduce((a, g) => a + g.count, 0), grupos.reduce((a, g) => a + g.cantidad, 0), totalMonto],
    [],
    ['DETALLE DE SALIDAS'],
    headDetalle,
    ...filas.map((f) => [dateTime(f.at), f.unidad, f.solicitante, f.producto, f.cantidad, f.unidadMedida, f.monto]),
  ];
  void money; void num;
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  (ws as Record<string, unknown>)['!cols'] = [{ wch: 26 }, { wch: 22 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  (ws as Record<string, unknown>)['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
  ];
  const cellAt = (r: number, c: number) => (ws as Record<string, { s?: unknown }>)[XLSX.utils.encode_cell({ r, c })];
  const tituloCell = cellAt(0, 0); if (tituloCell) tituloCell.s = { ...HEADER_STYLE, font: { ...HEADER_STYLE.font, sz: 14 } };
  headResumen.forEach((_, c) => { const cell = cellAt(3, c); if (cell) cell.s = HEADER_STYLE; });
  const detalleHeadRow = 8 + grupos.length; // fila del head del detalle
  headDetalle.forEach((_, c) => { const cell = cellAt(detalleHeadRow, c); if (cell) cell.s = HEADER_STYLE; });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Gasto por unidad');
  XLSX.writeFile(wb, `gasto-material-por-unidad-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/** Envía el resumen (PDF) por correo vía la Edge Function genérica `enviar-reporte`. */
export async function enviarResumenUnidadCorreo(
  emails: string[],
  grupos: GrupoUnidad[],
  filas: SalidaResumenRow[],
  meta: ResumenMeta,
): Promise<{ destinatarios: string[] }> {
  const lista = Array.from(new Set(
    emails.map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
  ));
  if (!lista.length) throw new Error('Indicá al menos un correo válido');
  const doc = await construirPdf(grupos, filas, meta);
  const base64 = (doc.output('datauristring').split(',')[1]) ?? '';
  const { data, error } = await supabase.functions.invoke<
    { ok: true; destinatarios: string[] } | { error: string }
  >('enviar-reporte', {
    body: {
      pdf_base64: base64,
      nombre_archivo: `gasto-material-por-unidad-${new Date().toISOString().slice(0, 10)}.pdf`,
      asunto: 'Gasto de material por unidad solicitante',
      mensaje: `Resumen del gasto de material por unidad solicitante · ${rangoLabel(meta)}.`,
      to_emails: lista,
    },
  });
  if (error) throw new Error(error.message ?? 'No se pudo enviar el correo');
  if (!data || 'error' in data) throw new Error((data as { error?: string })?.error || 'Respuesta inválida');
  return { destinatarios: data.destinatarios };
}
