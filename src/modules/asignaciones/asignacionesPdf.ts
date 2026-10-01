/* ============================================================
   Golden Touch · Asignaciones · reporte PDF (vista previa)

   Dos usos con el mismo papel:
     · el listado filtrado del módulo (varios trabajadores);
     · el HISTORIAL de un trabajador: sus datos arriba, todo lo que se le
       asignó en el rango y dos líneas de firma (entrega y recibe).
   Arriba, un resumen por categoría. Todo pasa por `pdfSafe`.
   ============================================================ */
import { previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import {
  CATEGORIA, CONDICION_LABEL, ESTADO_LABEL, detalleCorto, nombreDe, ordenarAsignaciones, porCategoria,
  resumenAsignaciones, valorTotal, type Asignacion, type PersonaMin,
} from './asignacionesReglas';

const NARANJA: [number, number, number] = [255, 138, 0];
const usd = (v: number) => `$ ${Number(v || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v: number) => Number(v || 0).toLocaleString('es-VE', { maximumFractionDigits: 2 });
const dia = (f?: string | null) => {
  const d = String(f ?? '').slice(0, 10);
  return d.length === 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—';
};

export interface OpcionesAsignacionesPdf {
  titulo: string;
  /** Una línea con los filtros o el rango. */
  detalle?: string;
  lista: Asignacion[];
  personas: Map<string, PersonaMin>;
  /** Si viene, es el historial de ESA persona (datos arriba + firmas). */
  persona?: PersonaMin | null;
  archivo: string;
}

export const nombreArchivoPdf = (base: string) =>
  `${base.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}.pdf`;

export async function descargarAsignacionesPdf(op: OpcionesAsignacionesPdf): Promise<void> {
  const [{ jsPDF }, { default: autoTable }, { loadLogoDataUrl }] = await Promise.all([
    import('jspdf'), import('jspdf-autotable'), import('@/shared/lib/pdfLogo'),
  ]);
  const logo = await loadLogoDataUrl().catch(() => null);
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;
  let y = M;
  const fin = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;

  if (logo) { try { doc.addImage(logo, 'JPEG', M, y, 40, 40); } catch { /* opcional */ } }
  doc.setTextColor(...NARANJA); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(pdfSafe(op.titulo.toUpperCase()), W / 2, y + 16, { align: 'center' });
  doc.setTextColor(80, 80, 80); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(pdfSafe('GOLDEN TOUCH 1127 C.A.  ·  Asignaciones al personal'), W / 2, y + 31, { align: 'center' });
  y += 52;
  doc.setFontSize(8.5); doc.setTextColor(90, 90, 90);
  const emitido = `Emitido el ${dia(new Date().toISOString())}`;
  doc.text(pdfSafe(op.detalle ? `${op.detalle}   ·   ${emitido}` : emitido), M, y, { maxWidth: W - M * 2 });
  y += 14;

  if (op.persona) {
    const p = op.persona;
    autoTable(doc, {
      startY: y,
      body: [[
        `Trabajador: ${nombreDe(p)}`, `C.I.: ${p.cedula || '—'}`, `Ficha: ${p.ficha_nro || '—'}`,
        `Cargo: ${p.cargo || '—'}`, `Nómina: ${p.empresa || '—'}${p.activo === false ? ' (inactivo)' : ''}`,
      ].map(pdfSafe)],
      styles: { fontSize: 8.5, cellPadding: 4, textColor: [30, 30, 30] },
      bodyStyles: { fillColor: [255, 244, 230] },
      margin: M,
    });
    y = fin() + 10;
  }

  const lista = ordenarAsignaciones(op.lista);
  const r = resumenAsignaciones(lista, op.personas);
  autoTable(doc, {
    startY: y,
    head: [['ASIGNACIONES', 'VALOR TOTAL', 'EN SU PODER (RETORNAN)', 'VALOR EN SU PODER', 'DEVUELTAS', 'ENTREGADAS (NO RETORNAN)']],
    body: [[String(r.total), usd(r.valor), String(r.pendientes), usd(r.valorPendiente), String(r.devueltas), String(r.entregadas)]],
    styles: { fontSize: 10, cellPadding: 5, halign: 'center', fontStyle: 'bold', textColor: [30, 30, 30] },
    headStyles: { fillColor: NARANJA, textColor: [255, 255, 255], fontSize: 7.5 },
    margin: M,
  });
  y = fin() + 8;

  const cats = porCategoria(lista);
  if (cats.length > 1) {
    autoTable(doc, {
      startY: y,
      head: [['CATEGORÍA', 'ASIGNACIONES', 'EN SU PODER', 'VALOR'].map(pdfSafe)],
      body: cats.map((c) => [pdfSafe(CATEGORIA[c.categoria].label), String(c.cantidad), String(c.pendientes), usd(c.valor)]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [70, 70, 70], textColor: [255, 255, 255], fontSize: 7 },
      columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'right' } },
      tableWidth: 360,
      margin: M,
    });
    y = fin() + 10;
  }

  const conPersona = !op.persona;
  const head = ['CÓDIGO', 'FECHA', ...(conPersona ? ['TRABAJADOR'] : []), 'CATEGORÍA', 'DESCRIPCIÓN', 'CANT.', 'VALOR', 'ORIGEN', 'ESTADO', 'DEVOLUCIÓN'];
  autoTable(doc, {
    startY: y,
    head: [head.map(pdfSafe)],
    body: lista.map((a) => {
      const det = detalleCorto(a);
      const dev = a.estado === 'devuelto'
        ? `${dia(a.fecha_devolucion)} · ${a.condicion_devolucion ? CONDICION_LABEL[a.condicion_devolucion] : ''}${a.reingresa_inventario ? ' · reingresó' : ''}`
        : a.estado === 'asignado' ? 'Pendiente' : 'No retorna';
      return [
        a.codigo, dia(a.fecha), ...(conPersona ? [nombreDe(op.personas.get(a.personal_id))] : []),
        CATEGORIA[a.categoria]?.label ?? a.categoria,
        `${a.descripcion}${det ? `\n${det}` : ''}${a.observacion ? `\n${a.observacion}` : ''}`,
        `${num(a.cantidad)}${a.unidad ? ` ${a.unidad}` : ''}`,
        usd(valorTotal(a)), a.producto_id ? 'Inventario' : 'Externo', ESTADO_LABEL[a.estado], dev,
      ].map((c) => pdfSafe(String(c)));
    }),
    styles: { fontSize: 7.6, cellPadding: 3, overflow: 'linebreak', valign: 'top' },
    headStyles: { fillColor: NARANJA, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7, halign: 'center' },
    columnStyles: conPersona
      ? { 0: { cellWidth: 62 }, 1: { cellWidth: 52 }, 2: { cellWidth: 100 }, 3: { cellWidth: 78 }, 5: { cellWidth: 44, halign: 'right' }, 6: { cellWidth: 58, halign: 'right' }, 7: { cellWidth: 52 }, 8: { cellWidth: 70 }, 9: { cellWidth: 92 } }
      : { 0: { cellWidth: 62 }, 1: { cellWidth: 52 }, 2: { cellWidth: 84 }, 4: { cellWidth: 48, halign: 'right' }, 5: { cellWidth: 60, halign: 'right' }, 6: { cellWidth: 56 }, 7: { cellWidth: 74 }, 8: { cellWidth: 104 } },
    didParseCell: (d) => {
      if (d.section !== 'body') return;
      const a = lista[d.row.index];
      const colEstado = conPersona ? 8 : 7;
      if (d.column.index === colEstado && a?.estado === 'asignado') d.cell.styles.textColor = [200, 110, 0];
      if (d.column.index === colEstado && a?.estado === 'devuelto') d.cell.styles.textColor = [30, 140, 70];
    },
    margin: M,
  });
  y = fin() + 12;

  if (!lista.length) {
    doc.setFontSize(10); doc.setTextColor(110, 110, 110);
    doc.text(pdfSafe('No hay asignaciones con estos filtros.'), M, y); y += 16;
  }

  if (op.persona) {
    if (y > H - 90) { doc.addPage(); y = M + 30; }
    y = Math.max(y + 30, H - 80);
    doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.6);
    doc.line(M + 30, y, M + 250, y); doc.line(W - M - 250, y, W - M - 30, y);
    doc.setFontSize(8.5); doc.setTextColor(60, 60, 60);
    doc.text(pdfSafe('Entrega (Golden Touch 1127 C.A.)'), M + 140, y + 12, { align: 'center' });
    doc.text(pdfSafe(`Recibe: ${nombreDe(op.persona)}${op.persona.cedula ? ` · C.I. ${op.persona.cedula}` : ''}`), W - M - 140, y + 12, { align: 'center' });
  }

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFontSize(7); doc.setTextColor(120, 120, 120);
    doc.text(pdfSafe(`Asignaciones  ·  Página ${i} de ${n}`), W / 2, H - 14, { align: 'center' });
  }
  previewPdf(doc, op.archivo);
}
