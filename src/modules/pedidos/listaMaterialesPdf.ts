/* Lista de materiales de una solicitud, en PDF.
 *
 * POR QUÉ EXISTE
 * El PDF de trazabilidad cuenta la historia COMPLETA de una orden —ofertas,
 * comparativa, OC, recepción— y por eso solo sirve cuando esa historia ya pasó.
 * En la etapa «Pendiente (cargar ofertas)» no hay nada de eso todavía: sale un
 * documento casi vacío, con las columnas de precio en cero.
 *
 * Lo que hace falta ahí es otra cosa: la lista de lo que se necesita, con sus
 * CANTIDADES y sus MEDIDAS, para mandarla a cotizar. La tabla de ítems de la
 * trazabilidad ni siquiera trae la medida, que es justo el dato que el proveedor
 * necesita para saber si le estás pidiendo un litro o un tambor.
 *
 * Por eso la última columna, «Precio unit.», va VACÍA a propósito: el documento
 * se imprime o se manda para que el proveedor la llene.
 *
 * Sigue el patrón de los otros PDF del sistema: jsPDF + autotable con import
 * perezoso (no carga la librería hasta que alguien pide el PDF), logo opcional y
 * `previewPdf`, que abre la vista previa y descarga solo si se pulsa Descargar.
 */
import { dateTime, num } from '@/shared/lib/format';
import { loadLogoDataUrl } from '@/shared/lib/pdfLogo';
import { previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import type { ItemOrden, Orden } from '@/shared/lib/types';

/** Marca/modelo en una sola celda: muchos ítems traen uno u otro, pocos los dos. */
function marcaModelo(it: ItemOrden): string {
  const partes = [it.marca, it.modelo].map((s) => pdfSafe(s?.trim() ?? '')).filter(Boolean);
  return partes.length ? partes.join(' / ') : '—';
}

export async function descargarListaMaterialesPdf(orden: Orden): Promise<void> {
  const [logoDataUrl, { jsPDF }, { default: autoTable }] = await Promise.all([
    loadLogoDataUrl().catch(() => null),
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const esServicio = orden.tipo === 'servicio';
  // Solo se cotiza lo que está marcado para comprar. Los demás renglones quedan
  // fuera y se avisa al pie, para que nadie los eche de menos en silencio.
  const todos = Array.isArray(orden.items) ? orden.items : [];
  const items = todos.filter((it) => it.comprar !== false);
  const excluidos = todos.length - items.length;

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const MARGIN = 42.52; // 1.5 cm
  let y = MARGIN;

  // ─── Encabezado ────────────────────────────────────────
  const LOGO_SIZE = 56;
  const TEXT_X = logoDataUrl ? MARGIN + LOGO_SIZE + 14 : MARGIN;
  if (logoDataUrl) {
    try { doc.addImage(logoDataUrl, 'JPEG', MARGIN, y, LOGO_SIZE, LOGO_SIZE); } catch { /* logo opcional */ }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(esServicio ? 'Lista de servicios a cotizar' : 'Lista de materiales a cotizar', TEXT_X, y + 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`GOLDEN TOUCH 1127 C.A. · Generado ${dateTime(new Date().toISOString())}`, TEXT_X, y + 36);
  y += Math.max(LOGO_SIZE, 36) + 10;

  doc.setDrawColor(200);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 16;

  // ─── Datos de la solicitud ─────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Solicitud ${orden.codigo}`, MARGIN, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  const filas: Array<[string, string]> = [
    ['Unidad solicitante', pdfSafe(orden.unidad_solicitante) || '—'],
    ['Solicitante', pdfSafe(orden.solicitante) || orden.solicitante_email],
    ['Fecha de solicitud', dateTime(orden.created_at)],
    ['Prioridad', orden.urgente ? 'URGENTE' : 'Normal'],
    ['Renglones a cotizar', String(items.length)],
    ...(orden.motivo ? ([['Motivo', pdfSafe(orden.motivo)]] as Array<[string, string]>) : []),
    ...(orden.finalidad ? ([['Finalidad', pdfSafe(orden.finalidad)]] as Array<[string, string]>) : []),
    ...(orden.notas ? ([['Nota', pdfSafe(orden.notas)]] as Array<[string, string]>) : []),
  ];
  autoTable(doc, {
    startY: y,
    body: filas,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 4 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 140 }, 1: { cellWidth: 'auto' } },
    margin: MARGIN,
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;

  // ─── La lista ──────────────────────────────────────────
  if (!items.length) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(11);
    doc.text('Esta solicitud no tiene renglones marcados para comprar.', MARGIN, y + 6);
    previewPdf(doc, `lista-materiales-${orden.codigo}.pdf`);
    return;
  }

  autoTable(doc, {
    startY: y,
    head: [['#', 'SKU', esServicio ? 'Servicio' : 'Material', 'Marca / Modelo', 'Cantidad', 'Medida', 'Finalidad', 'Precio unit.']],
    body: items.map((it, i) => [
      String(i + 1),
      it.sku ?? '—',
      pdfSafe(it.nombre),
      marcaModelo(it),
      num(it.cantidad),
      pdfSafe(it.unidad?.trim() ?? '') || 'UND',
      pdfSafe(it.finalidad?.trim() ?? '') || '—',
      '', // en blanco a propósito: lo llena el proveedor
    ]),
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: {
      0: { cellWidth: 22, halign: 'right' },
      1: { cellWidth: 58 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 78 },
      4: { cellWidth: 50, halign: 'right' },
      5: { cellWidth: 52 },
      6: { cellWidth: 78 },
      7: { cellWidth: 62 },
    },
    margin: MARGIN,
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(90);
  if (excluidos > 0) {
    doc.text(
      `${excluidos} renglon${excluidos === 1 ? '' : 'es'} de la solicitud no está${excluidos === 1 ? '' : 'n'} marcado${excluidos === 1 ? '' : 's'} para comprar y no aparece${excluidos === 1 ? '' : 'n'} en esta lista.`,
      MARGIN, y,
    );
    y += 12;
  }
  doc.text('La columna «Precio unit.» se deja en blanco para que el proveedor la complete.', MARGIN, y);

  previewPdf(doc, `lista-materiales-${orden.codigo}.pdf`);
}
