/* ============================================================
   Golden Touch · Delivery · Reportes PDF (30/10/2026)

   · Histórico: DEL, OC, proveedor, motorizado, aceptado, entregado, estado
     y cancelaciones de los pedidos filtrados.
   · Pedidos por motorizado: entregados, en curso, cancelaciones y tiempo
     promedio de aceptado a entregado.
   Estilo del sistema: logo horizontal, título, período, impreso por y tabla,
   márgenes de 2 cm. `construir…` arma el documento; `pdf…` lo abre en la
   vista previa (`previewPdf`), donde se descarga o se imprime.
   ============================================================ */
import type { jsPDF as JsPDF } from 'jspdf';
import { previewPdf } from '@/shared/lib/reportePreview';
import { dibujarLogoPdf } from '@/shared/lib/pdfLogo';
import { MARGEN_PDF } from '@/shared/lib/pdfMargen';
import { textoPdf } from '@/shared/lib/textoPdf';
import { quienSync } from '@/shared/lib/directorioUsuarios';
import { supabase } from '@/shared/lib/supabase';
import type { PedidoDelivery, PedidoDeliveryVista } from './delivery.types';
import { etiquetaEstado, fechaHoraVE, textoDuracion, type ResumenRepartidor } from './delivery';

export interface FiltrosPdfDelivery {
  /** YYYY-MM-DD (hora de Venezuela). */
  desde?: string | null;
  hasta?: string | null;
  /** Texto del período ya armado por la pantalla (si viene, se usa tal cual). */
  rango?: string | null;
  /** Correo o nombre del motorizado filtrado. */
  repartidor?: string | null;
  estado?: string | null;
}

const NARANJA: [number, number, number] = [255, 138, 0];
const GRIS: [number, number, number] = [110, 110, 110];
const HEAD_STYLE = {
  fillColor: [210, 210, 210] as [number, number, number], textColor: [20, 20, 20] as [number, number, number],
  fontStyle: 'bold' as const, halign: 'center' as const,
};

const ddmmaaaa = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : d);

/** «Del 01/10/2026 al 30/10/2026 · Motorizado: … · Estado: …». */
export function textoPeriodo(f: FiltrosPdfDelivery): string {
  const partes: string[] = [];
  if (f.rango?.trim()) partes.push(f.rango.trim());
  else if (f.desde && f.hasta) partes.push(`Del ${ddmmaaaa(f.desde)} al ${ddmmaaaa(f.hasta)}`);
  else if (f.desde) partes.push(`Desde el ${ddmmaaaa(f.desde)}`);
  else if (f.hasta) partes.push(`Hasta el ${ddmmaaaa(f.hasta)}`);
  else partes.push('Todo el período');
  if (f.repartidor?.trim()) partes.push(`Motorizado: ${quienSync(f.repartidor, f.repartidor)}`);
  if (f.estado?.trim()) partes.push(`Estado: ${etiquetaEstado(f.estado)}`);
  return partes.join(' · ');
}

/** Quien imprime: el que se pasa, o el usuario con sesión (nombre y apellido). */
async function impresoPor(quien?: string | null): Promise<string> {
  if (quien?.trim()) return quien.trim();
  try {
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email ?? '';
    return email ? quienSync(null, email) : '';
  } catch {
    return '';
  }
}

async function nuevoDoc(orientacion: 'portrait' | 'landscape', titulo: string, filtros: FiltrosPdfDelivery, quien?: string | null) {
  const [{ jsPDF }, { default: autoTable }, { loadLogoPdfDataUrl }, imprime] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/pdfLogo'),
    impresoPor(quien),
  ]);
  const logo = await loadLogoPdfDataUrl().catch(() => null);
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: orientacion });
  const W = doc.internal.pageSize.getWidth();
  const M = MARGEN_PDF;
  const y = M;
  if (logo) { try { dibujarLogoPdf(doc, logo, M, y, 44); } catch { /* el logo es opcional */ } }
  doc.setTextColor(...NARANJA); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(textoPdf(titulo), W / 2 + 28, y + 16, { align: 'center' });
  doc.setTextColor(...GRIS); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(textoPdf(`GOLDEN TOUCH 1127 C.A. · ${textoPeriodo(filtros)}`), W / 2 + 28, y + 30, { align: 'center' });
  doc.text(
    textoPdf(`Impreso${imprime ? ` por ${imprime}` : ''} el ${fechaHoraVE(new Date().toISOString())}`),
    W / 2 + 28, y + 42, { align: 'center' },
  );
  doc.setTextColor(0, 0, 0);
  return { doc, autoTable, W, M, y: y + 58 };
}

/** Número de página al pie de cada hoja. */
function numerarPaginas(doc: JsPDF, M: number) {
  const n = doc.getNumberOfPages();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRIS);
    doc.text(textoPdf(`Delivery · Página ${i} de ${n}`), W - M, H - M + 14, { align: 'right' });
  }
}

const sufijo = (f: FiltrosPdfDelivery) => [f.desde, f.hasta].filter(Boolean).join('_') || new Date().toISOString().slice(0, 10);

/* ───────────── Histórico ───────────── */

/** El histórico de pedidos (los que se le pasan, ya filtrados). */
export async function construirPdfHistoricoDelivery(
  pedidos: PedidoDeliveryVista[], filtros: FiltrosPdfDelivery = {}, quien?: string | null,
): Promise<JsPDF> {
  const { doc, autoTable, M, y } = await nuevoDoc('landscape', 'DELIVERY · HISTÓRICO DE PEDIDOS', filtros, quien);

  const entregados = pedidos.filter((p) => p.estado === 'entregado').length;
  const enCurso = pedidos.filter((p) => p.estado === 'aceptado' || p.estado === 'en_ruta').length;
  const porTomar = pedidos.filter((p) => p.estado === 'por_tomar').length;
  const cancel = pedidos.reduce((a, p) => a + (Number(p.cancelaciones) || 0), 0);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text(textoPdf(
    `Pedidos: ${pedidos.length}   ·   Entregados: ${entregados}   ·   En curso: ${enCurso}   ·   Por tomar: ${porTomar}   ·   Cancelaciones: ${cancel}`,
  ), M, y);

  autoTable(doc, {
    startY: y + 10,
    head: [['DEL', 'OC', 'PROVEEDOR', 'MOTORIZADO', 'ACEPTADO', 'ENTREGADO', 'ESTADO', 'CANCEL.']],
    body: pedidos.length
      ? pedidos.map((p) => [
        p.codigo,
        p.orden?.oc_codigo || p.orden?.codigo || '—',
        p.proveedor?.razon_social || '—',
        quienSync(p.repartidor_nombre, p.repartidor_email) || '—',
        fechaHoraVE(p.aceptado_en) || '—',
        fechaHoraVE(p.entregado_en) || '—',
        etiquetaEstado(p.estado),
        p.cancelaciones ? String(p.cancelaciones) : '—',
      ].map(textoPdf))
      : [[{ content: 'No hay pedidos en ese período.', colSpan: 8, styles: { halign: 'center' as const } }]],
    styles: { fontSize: 8, cellPadding: 4, valign: 'middle', overflow: 'linebreak' },
    headStyles: HEAD_STYLE,
    columnStyles: {
      0: { cellWidth: 58, fontStyle: 'bold' },
      1: { cellWidth: 70 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 110 },
      4: { cellWidth: 80, halign: 'center' },
      5: { cellWidth: 80, halign: 'center' },
      6: { cellWidth: 62, halign: 'center' },
      7: { cellWidth: 48, halign: 'right' },
    },
    margin: M,
  });

  numerarPaginas(doc, M);
  return doc;
}

export async function pdfHistoricoDelivery(
  pedidos: PedidoDeliveryVista[], filtros: FiltrosPdfDelivery = {}, quien?: string | null,
): Promise<void> {
  const doc = await construirPdfHistoricoDelivery(pedidos, filtros, quien);
  previewPdf(doc, `delivery-historico-${sufijo(filtros)}.pdf`);
}

/* ───────────── Por motorizado ───────────── */

/** Los pedidos por motorizado (el resumen de `resumenPorRepartidor`). */
export async function construirPdfPedidosPorRepartidor(
  resumen: ResumenRepartidor[], filtros: FiltrosPdfDelivery = {}, quien?: string | null,
): Promise<JsPDF> {
  const { doc, autoTable, M, y } = await nuevoDoc('portrait', 'DELIVERY · PEDIDOS POR MOTORIZADO', filtros, quien);

  const tot = resumen.reduce((a, r) => ({
    entregados: a.entregados + r.entregados, en_curso: a.en_curso + r.en_curso, cancelaciones: a.cancelaciones + r.cancelaciones,
  }), { entregados: 0, en_curso: 0, cancelaciones: 0 });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text(textoPdf(
    `Motorizados: ${resumen.length}   ·   Entregados: ${tot.entregados}   ·   En curso: ${tot.en_curso}   ·   Cancelaciones: ${tot.cancelaciones}`,
  ), M, y);

  autoTable(doc, {
    startY: y + 10,
    head: [['MOTORIZADO', 'ACEPTADOS', 'ENTREGADOS', 'EN CURSO', 'CANCELACIONES', 'TIEMPO PROMEDIO']],
    body: resumen.length
      ? resumen.map((r) => [
        quienSync(r.repartidor_nombre, r.repartidor_email) || r.repartidor_email,
        String(r.aceptados), String(r.entregados), String(r.en_curso), String(r.cancelaciones),
        textoDuracion(r.minutos_promedio),
      ].map(textoPdf))
      : [[{ content: 'No hay motorizados en ese período.', colSpan: 6, styles: { halign: 'center' as const } }]],
    foot: resumen.length
      ? [['TOTAL', String(resumen.reduce((a, r) => a + r.aceptados, 0)), String(tot.entregados), String(tot.en_curso), String(tot.cancelaciones), '']]
      : undefined,
    styles: { fontSize: 9, cellPadding: 5, valign: 'middle', overflow: 'linebreak' },
    headStyles: HEAD_STYLE,
    footStyles: { fillColor: [240, 240, 240], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'right' },
    columnStyles: {
      0: { cellWidth: 'auto', fontStyle: 'bold', halign: 'left' },
      1: { cellWidth: 62, halign: 'right' },
      2: { cellWidth: 68, halign: 'right' },
      3: { cellWidth: 58, halign: 'right' },
      4: { cellWidth: 80, halign: 'right' },
      5: { cellWidth: 90, halign: 'right' },
    },
    margin: M,
  });

  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRIS);
  const finY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40;
  doc.text(textoPdf('Tiempo promedio: desde que el motorizado acepta el pedido hasta que lo entrega en el almacén.'), M, finY + 16);

  numerarPaginas(doc, M);
  return doc;
}

export async function pdfPedidosPorRepartidor(
  resumen: ResumenRepartidor[], filtros: FiltrosPdfDelivery = {}, quien?: string | null,
): Promise<void> {
  const doc = await construirPdfPedidosPorRepartidor(resumen, filtros, quien);
  previewPdf(doc, `delivery-por-motorizado-${sufijo(filtros)}.pdf`);
}

/** Solo para el tipo: los pedidos que no traen la vista también sirven para contar. */
export type PedidoParaPdf = PedidoDelivery;
