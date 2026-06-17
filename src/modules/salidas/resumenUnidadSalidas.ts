/* ============================================================
   Golden Touch · Salidas · Resumen del gasto de material.
   Toma SALIDAS y TRASLADOS de material ejecutados y los trata
   como GASTO, valorando cada uno a su costo unitario (PMP):
   gasto = cantidad × precio_unit. Se puede ver agrupado por
   UNIDAD SOLICITANTE y por PRODUCTO, y exporta a PDF, Excel y
   correo (Brevo). Cada fila trae el detalle completo: cuándo
   salió, quién lo solicitó y quién lo autorizó, origen/destino.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { previewPdf, previewExcel } from '@/shared/lib/reportePreview';

/** Una salida o traslado ejecutado, normalizado para el resumen. */
export interface SalidaResumenRow {
  unidad: string;
  producto: string;
  at: string;            // fecha/hora de ejecución
  tipo: 'Salida' | 'Traslado';
  codigo: string;
  solicitante: string;
  autorizo: string;      // quién autorizó (aprobó)
  autorizadoEn: string;  // cuándo se autorizó
  ejecutoPor: string;    // quién ejecutó
  origen: string;        // almacén de origen
  destinoTxt: string;    // almacén destino (traslado) o destinatario (salida)
  motivo: string;
  cantidad: number;
  precioUnit: number;    // costo unitario (PMP)
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

/** Acumulado por producto. */
export interface GrupoProducto {
  producto: string;
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

async function construirPdf(
  grupos: GrupoUnidad[], gruposProd: GrupoProducto[], filas: SalidaResumenRow[], meta: ResumenMeta,
) {
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
  doc.text('Gasto de material (salidas y traslados)', tx, y + 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`GOLDEN TOUCH 1127 C.A. · ${fmt.dateTime(new Date().toISOString())} · ${rangoLabel(meta)}`, tx, y + 33);
  y += 60;

  const totalMonto = grupos.reduce((a, g) => a + g.monto, 0);
  const totalCant = grupos.reduce((a, g) => a + g.cantidad, 0);
  const totalCount = grupos.reduce((a, g) => a + g.count, 0);

  // Tabla 1: resumen por unidad solicitante.
  autoTable(doc, {
    startY: y,
    head: [['Unidad solicitante', 'Movs.', 'Cantidad', 'Gasto (USD)']],
    body: grupos.map((g) => [g.unidad, fmt.num(g.count), fmt.num(g.cantidad), fmt.money(g.monto)]),
    foot: [['TOTAL', fmt.num(totalCount), fmt.num(totalCant), fmt.money(totalMonto)]],
    theme: 'grid',
    headStyles: { fillColor: [255, 138, 0], textColor: 255 },
    footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    margin: MARGIN,
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;

  // Tabla 2: resumen por producto.
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('Gasto por producto', MARGIN, y);
  y += 6;
  autoTable(doc, {
    startY: y,
    head: [['Producto', 'Movs.', 'Cantidad', 'Gasto (USD)']],
    body: gruposProd.map((g) => [g.producto, fmt.num(g.count), fmt.num(g.cantidad), fmt.money(g.monto)]),
    foot: [['TOTAL', fmt.num(totalCount), fmt.num(totalCant), fmt.money(totalMonto)]],
    theme: 'grid',
    headStyles: { fillColor: [255, 138, 0], textColor: 255 },
    footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    margin: MARGIN,
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;

  // Tabla 3: detalle de cada salida/traslado (todos los datos).
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('Detalle', MARGIN, y);
  y += 6;
  autoTable(doc, {
    startY: y,
    head: [['Fecha', 'Tipo', 'Unidad', 'Material', 'Solicitó', 'Autorizó', 'Origen → Destino', 'Cant.', 'Gasto (USD)']],
    body: filas.map((f) => [
      fmt.dateTime(f.at), f.tipo, f.unidad, f.producto, f.solicitante, f.autorizo || '—',
      [f.origen, f.destinoTxt].filter(Boolean).join(' → ') || '—',
      `${fmt.num(f.cantidad)} ${f.unidadMedida}`.trim(), fmt.money(f.monto),
    ]),
    theme: 'striped',
    headStyles: { fillColor: [255, 138, 0], textColor: 255, fontSize: 7 },
    styles: { fontSize: 7, cellPadding: 2.5, overflow: 'linebreak' },
    columnStyles: { 7: { halign: 'right' }, 8: { halign: 'right' } },
    margin: MARGIN,
  });
  return doc;
}

export async function descargarResumenUnidadPdf(
  grupos: GrupoUnidad[], gruposProd: GrupoProducto[], filas: SalidaResumenRow[], meta: ResumenMeta,
): Promise<void> {
  const doc = await construirPdf(grupos, gruposProd, filas, meta);
  previewPdf(doc, `gasto-material-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function descargarResumenUnidadExcel(
  grupos: GrupoUnidad[], gruposProd: GrupoProducto[], filas: SalidaResumenRow[], meta: ResumenMeta,
): Promise<void> {
  const [XLSXmod, { dateTime }] = await Promise.all([
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
  const totalCant = grupos.reduce((a, g) => a + g.cantidad, 0);
  const totalCount = grupos.reduce((a, g) => a + g.count, 0);
  const headUnidad = ['Unidad solicitante', 'Movimientos', 'Cantidad', 'Gasto (USD)'];
  const headProd = ['Producto', 'Movimientos', 'Cantidad', 'Gasto (USD)'];
  const headDetalle = ['Fecha', 'Tipo', 'Código', 'Unidad', 'Material', 'Solicitó', 'Autorizó', 'Autorizado', 'Ejecutó', 'Origen', 'Destino', 'Motivo', 'Cantidad', 'Costo unit. (USD)', 'Gasto (USD)'];

  const aoa: unknown[][] = [
    ['GASTO DE MATERIAL (SALIDAS Y TRASLADOS) · GOLDEN TOUCH 1127 C.A.'],
    [rangoLabel(meta)],
    [],
    ['GASTO POR UNIDAD SOLICITANTE'],
    headUnidad,
    ...grupos.map((g) => [g.unidad, g.count, g.cantidad, g.monto]),
    ['TOTAL', totalCount, totalCant, totalMonto],
    [],
    ['GASTO POR PRODUCTO'],
    headProd,
    ...gruposProd.map((g) => [g.producto, g.count, g.cantidad, g.monto]),
    ['TOTAL', totalCount, totalCant, totalMonto],
    [],
    ['DETALLE'],
    headDetalle,
    ...filas.map((f) => [
      dateTime(f.at), f.tipo, f.codigo, f.unidad, f.producto, f.solicitante,
      f.autorizo, f.autorizadoEn ? dateTime(f.autorizadoEn) : '', f.ejecutoPor,
      f.origen, f.destinoTxt, f.motivo, f.cantidad, f.precioUnit, f.monto,
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  (ws as Record<string, unknown>)['!cols'] = [
    { wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 22 }, { wch: 24 }, { wch: 18 },
    { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 24 },
    { wch: 12 }, { wch: 15 }, { wch: 14 },
  ];
  const lastCol = headDetalle.length - 1;
  (ws as Record<string, unknown>)['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } },
  ];
  const cellAt = (r: number, c: number) => (ws as Record<string, { s?: unknown }>)[XLSX.utils.encode_cell({ r, c })];
  const tituloCell = cellAt(0, 0); if (tituloCell) tituloCell.s = { ...HEADER_STYLE, font: { ...HEADER_STYLE.font, sz: 14 } };
  // Encabezados de cada bloque (filas calculadas según el largo de cada sección).
  const rowUnidadHead = 4;
  const rowProdHead = 4 + grupos.length + 1 + 2 + 1; // headUnidad + grupos + TOTAL + blanco + 'GASTO POR PRODUCTO' + headProd
  const rowDetHead = rowProdHead + 1 + gruposProd.length + 1 + 2; // headProd + prod + TOTAL + blanco + 'DETALLE'
  headUnidad.forEach((_, c) => { const cell = cellAt(rowUnidadHead, c); if (cell) cell.s = HEADER_STYLE; });
  headProd.forEach((_, c) => { const cell = cellAt(rowProdHead, c); if (cell) cell.s = HEADER_STYLE; });
  headDetalle.forEach((_, c) => { const cell = cellAt(rowDetHead, c); if (cell) cell.s = HEADER_STYLE; });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Gasto de material');
  previewExcel(wb, `gasto-material-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/** Envía el resumen (PDF) por correo vía la Edge Function genérica `enviar-reporte`. */
export async function enviarResumenUnidadCorreo(
  emails: string[],
  grupos: GrupoUnidad[],
  gruposProd: GrupoProducto[],
  filas: SalidaResumenRow[],
  meta: ResumenMeta,
): Promise<{ destinatarios: string[] }> {
  const lista = Array.from(new Set(
    emails.map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
  ));
  if (!lista.length) throw new Error('Indicá al menos un correo válido');
  const doc = await construirPdf(grupos, gruposProd, filas, meta);
  const base64 = (doc.output('datauristring').split(',')[1]) ?? '';
  const { data, error } = await supabase.functions.invoke<
    { ok: true; destinatarios: string[] } | { error: string }
  >('enviar-reporte', {
    body: {
      pdf_base64: base64,
      nombre_archivo: `gasto-material-${new Date().toISOString().slice(0, 10)}.pdf`,
      asunto: 'Gasto de material (salidas y traslados)',
      mensaje: `Resumen del gasto de material (salidas y traslados) · ${rangoLabel(meta)}.`,
      to_emails: lista,
    },
  });
  if (error) throw new Error(error.message ?? 'No se pudo enviar el correo');
  if (!data || 'error' in data) throw new Error((data as { error?: string })?.error || 'Respuesta inválida');
  return { destinatarios: data.destinatarios };
}
