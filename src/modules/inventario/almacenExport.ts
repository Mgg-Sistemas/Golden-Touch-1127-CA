/* ============================================================
   Golden Touch · Inventario · Export de productos por almacén
   Descarga (solo a pedido del usuario) los productos de un
   almacén en Excel y PDF. El `stock`/`precio` de cada fila ya
   vienen con los valores propios del almacén (PMP por almacén).
   ============================================================ */
import type { Almacen, Existencia, Producto } from '@/shared/lib/types';
import { previewPdf, previewExcel } from '@/shared/lib/reportePreview';
import { listAlmacenes, listExistencias, nombreCortoAlmacen } from './almacenes.repository';
import { supabase } from '@/shared/lib/supabase';

interface FilaAlmacen extends Producto { _valor?: number }

function valorDe(p: FilaAlmacen): number {
  return p._valor != null ? p._valor : (Number(p.stock) || 0) * (Number(p.precio) || 0);
}

const HEADER_STYLE = {
  font: { name: 'Arial', sz: 12, bold: true, color: { rgb: 'FFFFFF' } },
  fill: { patternType: 'solid', fgColor: { rgb: 'FF8A00' } },
  alignment: { horizontal: 'left', vertical: 'center' },
  border: {
    top: { style: 'thin', color: { rgb: '000000' } }, bottom: { style: 'thin', color: { rgb: '000000' } },
    left: { style: 'thin', color: { rgb: '000000' } }, right: { style: 'thin', color: { rgb: '000000' } },
  },
};
const TITLE_STYLE = { ...HEADER_STYLE, font: { ...HEADER_STYLE.font, sz: 14 } };

export async function descargarAlmacenExcel(almacen: string, rows: Producto[]): Promise<void> {
  const [XLSXmod, { money }] = await Promise.all([
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

  const head = ['SKU', 'Producto', 'Categoría', 'Unidad', 'Stock', 'Costo unit. (PMP)', 'Valor'];
  const filas = rows.map((p) => [
    p.sku, p.nombre, p.categoria, p.unidad, Number(p.stock) || 0, Number(p.precio) || 0, valorDe(p),
  ]);
  const valorTotal = rows.reduce((a, p) => a + valorDe(p), 0);

  const aoa: unknown[][] = [
    [`INVENTARIO · ALMACÉN ${almacen.toUpperCase()} · GOLDEN TOUCH 1127 C.A.`],
    [`${rows.length} producto(s) · valor total ${money(valorTotal)}`],
    [],
    head,
    ...filas,
    [],
    ['', '', '', '', '', 'VALOR TOTAL', valorTotal],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  (ws as Record<string, unknown>)['!cols'] = [{ wch: 16 }, { wch: 34 }, { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 14 }];
  (ws as Record<string, unknown>)['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
  ];

  const cellAt = (r: number, c: number) => (ws as Record<string, { s?: unknown }>)[XLSX.utils.encode_cell({ r, c })];
  const tituloCell = cellAt(0, 0); if (tituloCell) tituloCell.s = TITLE_STYLE;
  head.forEach((_, c) => { const cell = cellAt(3, c); if (cell) cell.s = HEADER_STYLE; });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Almacén');
  previewExcel(wb, `almacen-${almacen}.xlsx`);
}

export async function descargarAlmacenPdf(almacen: string, rows: Producto[]): Promise<void> {
  const [{ jsPDF }, { default: autoTable }, { money, num, dateTime }, { loadLogoDataUrl }] = await Promise.all([
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
  doc.text(`Inventario · Almacén ${almacen}`, tx, y + 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`GOLDEN TOUCH 1127 C.A. · ${dateTime(new Date().toISOString())}`, tx, y + 33);
  y += 60;

  const valorTotal = rows.reduce((a, p) => a + ((p as FilaAlmacen)._valor ?? (Number(p.stock) || 0) * (Number(p.precio) || 0)), 0);

  autoTable(doc, {
    startY: y,
    head: [['SKU', 'Producto', 'Categoría', 'Unidad', 'Stock', 'Costo unit.', 'Valor']],
    body: rows.map((p) => [
      p.sku, p.nombre, p.categoria, p.unidad,
      num(Number(p.stock) || 0), money(Number(p.precio) || 0),
      money((p as FilaAlmacen)._valor ?? (Number(p.stock) || 0) * (Number(p.precio) || 0)),
    ]),
    foot: [['', '', '', '', '', 'VALOR TOTAL', money(valorTotal)]],
    theme: 'grid',
    headStyles: { fillColor: [255, 138, 0], textColor: 255, fontSize: 8 },
    footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
    margin: MARGIN,
  });
  previewPdf(doc, `almacen-${almacen}.pdf`);
}

/* ============================================================
   Reporte GLOBAL por almacenes y subalmacenes
   Recorre toda la jerarquía sede → almacén → subalmacén y lista
   las existencias (stock, costo PMP, valor) de cada uno, con
   subtotales por almacén, por sede y total general.
   ============================================================ */

const SIN_SEDE = 'Sin sede';

interface NodoAlmacen {
  /** Nombre real (clave de existencias). */
  nombre: string;
  /** Nombre visible (sin el sufijo de des-duplicación). */
  display: string;
  /** Profundidad en el árbol: 0 = almacén principal, 1+ = subalmacén. */
  depth: number;
}

/** Ordena los almacenes de una sede en jerarquía (padre, luego sus hijos). */
function ordenJerarquico(sedeAlmacenes: Almacen[], todos: Almacen[]): NodoAlmacen[] {
  const ids = new Set(sedeAlmacenes.map((a) => a.id));
  const hijos = (parentId: string | null) =>
    sedeAlmacenes
      .filter((a) => (a.parent_id ?? null) === parentId)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const roots = sedeAlmacenes
    .filter((a) => !a.parent_id || !ids.has(a.parent_id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const out: NodoAlmacen[] = [];
  const walk = (a: Almacen, depth: number) => {
    out.push({ nombre: a.nombre, display: nombreCortoAlmacen(a, todos), depth });
    hijos(a.id).forEach((h) => walk(h, depth + 1));
  };
  roots.forEach((r) => walk(r, 0));
  return out;
}

export async function descargarReporteAlmacenesPdf(): Promise<void> {
  const [{ jsPDF }, { default: autoTable }, { money, num, dateTime }, { loadLogoDataUrl }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/format'),
    import('@/shared/lib/pdfLogo'),
  ]);

  // Datos: almacenes (jerarquía), existencias (stock+PMP por almacén) y ficha de producto.
  const [almacenes, existencias, prodRes] = await Promise.all([
    listAlmacenes(),
    listExistencias(),
    supabase.from('productos').select('id, sku, nombre, categoria, unidad'),
  ]);
  const productoById = new Map<string, { sku: string; nombre: string; unidad: string; categoria: string }>();
  ((prodRes.data ?? []) as Array<{ id: string; sku: string; nombre: string; unidad: string; categoria: string }>)
    .forEach((p) => productoById.set(p.id, { sku: p.sku, nombre: p.nombre, unidad: p.unidad, categoria: p.categoria }));

  // Existencias agrupadas por nombre de almacén.
  const exPorAlmacen = new Map<string, Existencia[]>();
  existencias.forEach((e) => {
    const k = e.almacen || 'General';
    const arr = exPorAlmacen.get(k) ?? [];
    arr.push(e);
    exPorAlmacen.set(k, arr);
  });

  // Sedes en orden alfabético.
  const sedes = Array.from(new Set(almacenes.map((a) => a.sede?.trim() || SIN_SEDE)))
    .sort((a, b) => a.localeCompare(b, 'es'));

  // Almacenes legados (nombre en existencias que no existe como entidad) → "Sin sede".
  const conocidos = new Set(almacenes.map((a) => a.nombre));
  const huérfanos = Array.from(exPorAlmacen.keys()).filter((n) => !conocidos.has(n)).sort((a, b) => a.localeCompare(b, 'es'));
  if (huérfanos.length && !sedes.includes(SIN_SEDE)) sedes.push(SIN_SEDE);

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const MARGIN = 42.52; // 1.5 cm
  let y = MARGIN;

  const logo = await loadLogoDataUrl().catch(() => null);
  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 46, 46); } catch { /* opcional */ } }
  const tx = logo ? MARGIN + 60 : MARGIN;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text('Inventario · Reporte por almacenes y subalmacenes', tx, y + 16);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`GOLDEN TOUCH 1127 C.A. · ${dateTime(new Date().toISOString())}`, tx, y + 32);
  y += 56;
  doc.setDrawColor(255, 138, 0); doc.setLineWidth(1.2);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 16;

  const valorDeEx = (e: Existencia) => (Number(e.stock) || 0) * (Number(e.costo_promedio) || 0);
  const saltoSiHaceFalta = (alto: number) => { if (y + alto > PAGE_H - MARGIN) { doc.addPage(); y = MARGIN; } };

  let totalGeneral = 0;

  for (const sede of sedes) {
    const sedeAlmacenes = almacenes.filter((a) => (a.sede?.trim() || SIN_SEDE) === sede);
    const nodos = ordenJerarquico(sedeAlmacenes, almacenes);
    // Los huérfanos cuelgan de "Sin sede" como almacenes principales.
    if (sede === SIN_SEDE) huérfanos.forEach((n) => nodos.push({ nombre: n, display: n, depth: 0 }));
    if (!nodos.length) continue;

    // Encabezado de SEDE.
    saltoSiHaceFalta(40);
    doc.setFillColor(33, 37, 41);
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 22, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text(`SEDE · ${sede}`, MARGIN + 8, y + 15);
    doc.setTextColor(0);
    y += 30;

    let totalSede = 0;

    for (const nodo of nodos) {
      const exs = (exPorAlmacen.get(nodo.nombre) ?? []).slice().sort((a, b) => {
        const na = productoById.get(a.producto_id)?.nombre ?? '';
        const nb = productoById.get(b.producto_id)?.nombre ?? '';
        return na.localeCompare(nb, 'es');
      });
      const subtotal = exs.reduce((acc, e) => acc + valorDeEx(e), 0);
      totalSede += subtotal;

      // Título del almacén / subalmacén (con sangría por nivel).
      const sangria = MARGIN + nodo.depth * 14;
      const etiqueta = nodo.depth === 0 ? '▣' : '└─ subalmacén';
      saltoSiHaceFalta(30);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      doc.text(`${etiqueta} ${nodo.display}`, sangria, y + 4);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(110);
      doc.text(`${exs.length} producto(s) · ${money(subtotal)}`, PAGE_W - MARGIN, y + 4, { align: 'right' });
      doc.setTextColor(0);
      y += 10;

      if (!exs.length) {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(140);
        doc.text('Sin existencias.', sangria + 8, y + 10);
        doc.setTextColor(0); doc.setFont('helvetica', 'normal');
        y += 20;
        continue;
      }

      autoTable(doc, {
        startY: y,
        head: [['SKU', 'Producto', 'Categoría', 'Unid.', 'Stock', 'Costo unit.', 'Valor']],
        body: exs.map((e) => {
          const p = productoById.get(e.producto_id);
          return [
            p?.sku ?? '—',
            p?.nombre ?? '(producto eliminado)',
            p?.categoria ?? '—',
            p?.unidad ?? '—',
            num(Number(e.stock) || 0),
            money(Number(e.costo_promedio) || 0),
            money(valorDeEx(e)),
          ];
        }),
        foot: [['', '', '', '', '', 'Subtotal almacén', money(subtotal)]],
        theme: 'grid',
        headStyles: { fillColor: [255, 138, 0], textColor: 255, fontSize: 7.5 },
        footStyles: { fillColor: [245, 245, 245], textColor: 20, fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 7.5, cellPadding: 2.5 },
        columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
        margin: { left: sangria, right: MARGIN },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
    }

    // Subtotal de la SEDE.
    saltoSiHaceFalta(22);
    doc.setDrawColor(200); doc.setLineWidth(0.5);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
    doc.text(`Subtotal sede ${sede}: ${money(totalSede)}`, PAGE_W - MARGIN, y + 14, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += 26;
    totalGeneral += totalSede;
  }

  // TOTAL GENERAL.
  saltoSiHaceFalta(30);
  doc.setFillColor(255, 138, 0);
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 24, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text('VALOR TOTAL DEL INVENTARIO', MARGIN + 8, y + 16);
  doc.text(money(totalGeneral), PAGE_W - MARGIN - 8, y + 16, { align: 'right' });
  doc.setTextColor(0);

  const stamp = new Date().toISOString().slice(0, 10);
  previewPdf(doc, `inventario-almacenes-${stamp}.pdf`);
}
