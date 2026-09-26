/* ============================================================
   Golden Touch · Combustible · Reporte del surtidor (PDF con fotos)

   El mismo reporte que se mira en el teléfono, en papel: los movimientos de
   un rango de fechas agrupados por TIPO (surtidos, traslados, entradas,
   mermas, retornos), con los litros de cada grupo y, debajo de cada
   movimiento, sus FOTOS como miniaturas. Se abre en vista previa y se
   descarga solo si el usuario lo pide.

   Las fotos se bajan por su URL firmada, se achican a 900 px y se pegan
   como JPEG: así el PDF no pesa 30 MB y HEIC/WEBP también entran.
   ============================================================ */
import { previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import { cargarImagenDesdeBlob } from '@/shared/lib/comprimirImagen';
import { esImagenAdjunto } from '@/modules/salidas/adjuntosSalidaReglas';
import type { AdjuntoSalida } from '@/modules/salidas/adjuntosSalida.repository';
import type { MovimientoTanque, TanqueCombustible, TipoMovTanque } from '@/shared/lib/types';

export const ORDEN_TIPOS: TipoMovTanque[] = ['uso', 'traslado', 'entrada', 'merma', 'retorno'];
export const TITULO_TIPO: Record<TipoMovTanque, string> = {
  uso: 'Surtidos (consumo de equipos)',
  traslado: 'Traslados',
  entrada: 'Entradas (ingresos)',
  merma: 'Mermas',
  retorno: 'Retornos',
};

/** Lado mayor de la foto dentro del PDF, en píxeles. */
export const LADO_FOTO_PDF = 900;

const NARANJA: [number, number, number] = [255, 138, 0];

const litros = (v: number | null | undefined) =>
  `${Number(v ?? 0).toLocaleString('es-VE', { maximumFractionDigits: 2 })} L`;

const dia = (f: string | null | undefined) => {
  const d = String(f ?? '').slice(0, 10);
  return d.length === 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—';
};

export interface ResumenTipo { tipo: TipoMovTanque; cantidad: number; litros: number }

/** Cuántos movimientos y cuántos litros por tipo, en el orden del reporte; omite los tipos vacíos. */
export function resumenPorTipo(movs: MovimientoTanque[]): ResumenTipo[] {
  return ORDEN_TIPOS
    .map((tipo) => {
      const lista = movs.filter((m) => m.tipo === tipo);
      return { tipo, cantidad: lista.length, litros: lista.reduce((s, m) => s + (Number(m.litros) || 0), 0) };
    })
    .filter((r) => r.cantidad > 0);
}

/** Lo que encabeza cada movimiento: el equipo, si no la observación, si no el tipo. */
export function tituloMovimiento(m: MovimientoTanque): string {
  return (m.equipo || m.observacion || TITULO_TIPO[m.tipo]).trim();
}

/** Segunda línea: fecha, hora, tanque (si se piden todos), autorizado y observación. */
export function detalleMovimiento(m: MovimientoTanque, nombreTanque?: string | null): string {
  const partes = [`${dia(m.fecha)}${m.hora ? ` ${m.hora}` : ''}`];
  if (nombreTanque) partes.push(nombreTanque);
  if (m.autorizado_por) partes.push(`Aut.: ${m.autorizado_por}`);
  if (m.equipo && m.observacion) partes.push(m.observacion);
  if (m.ubicacion) partes.push(m.ubicacion);
  return partes.join('  ·  ');
}

/** Medidas para que una foto de w×h entre en una caja de maxW×maxH sin deformarse. */
export function encajar(w: number, h: number, maxW: number, maxH: number): { w: number; h: number } {
  const e = Math.min(maxW / Math.max(w, 1), maxH / Math.max(h, 1));
  return { w: Math.max(1, w * e), h: Math.max(1, h * e) };
}

interface FotoPdf { data: string; w: number; h: number }

async function fotoParaPdf(url: string): Promise<FotoPdf | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const img = await cargarImagenDesdeBlob(await res.blob());
    const e = Math.min(1, LADO_FOTO_PDF / Math.max(img.width, img.height, 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * e));
    canvas.height = Math.max(1, Math.round(img.height * e));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    if ('close' in img && typeof img.close === 'function') img.close();
    return { data: canvas.toDataURL('image/jpeg', 0.8), w: canvas.width, h: canvas.height };
  } catch {
    return null;
  }
}

export interface OpcionesSurtidorReportePdf {
  tanques: TanqueCombustible[];
  /** Tanque elegido; vacío = todos. */
  tanqueId: string;
  desde: string;
  hasta: string;
  movs: MovimientoTanque[];
  fotos: AdjuntoSalida[];
  /** URL firmada por `path` (las que ya cargó la pantalla). */
  urls: Map<string, string>;
}

const nombreArchivo = (base: string) =>
  `${base.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}.pdf`;

export async function descargarSurtidorReportePdf(op: OpcionesSurtidorReportePdf): Promise<void> {
  const [{ jsPDF }, { default: autoTable }, { loadLogoDataUrl }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/pdfLogo'),
  ]);
  const logo = await loadLogoDataUrl().catch(() => null);

  // Las fotos se bajan todas juntas antes de dibujar: es lo que más tarda.
  const fotosImagen = op.fotos.filter((a) => esImagenAdjunto(a.content_type, a.nombre) && op.urls.get(a.path));
  const cargadas = new Map<string, FotoPdf>();
  await Promise.all(fotosImagen.map(async (a) => {
    const f = await fotoParaPdf(op.urls.get(a.path) as string);
    if (f) cargadas.set(a.id, f);
  }));

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const MARGIN = 40;
  const ANCHO = W - MARGIN * 2;
  let y = MARGIN;

  const nombreTanque = (id: string) => op.tanques.find((t) => t.id === id)?.nombre ?? '—';
  const tanqueTxt = op.tanqueId ? nombreTanque(op.tanqueId) : 'Todos los tanques';

  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 40, 40); } catch { /* el logo es opcional */ } }
  doc.setTextColor(...NARANJA); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(pdfSafe('REPORTE DEL SURTIDOR'), W / 2, y + 16, { align: 'center' });
  doc.setTextColor(80, 80, 80); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(pdfSafe('GOLDEN TOUCH 1127 C.A.  ·  Combustible'), W / 2, y + 31, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 52;

  doc.setFontSize(8.5); doc.setTextColor(90, 90, 90);
  doc.text(pdfSafe(`${tanqueTxt}   ·   Del ${dia(op.desde)} al ${dia(op.hasta)}   ·   Emitido el ${dia(new Date().toISOString())}`), MARGIN, y, { maxWidth: ANCHO });
  doc.setTextColor(0, 0, 0);
  y += 16;

  const resumen = resumenPorTipo(op.movs);
  const fotosDeTipo = (tipo: TipoMovTanque) =>
    op.fotos.filter((a) => op.movs.some((m) => m.id === a.ref_id && m.tipo === tipo)).length;
  autoTable(doc, {
    startY: y,
    head: [['TIPO DE MOVIMIENTO', 'MOVIMIENTOS', 'LITROS', 'FOTOS']],
    body: [
      ...resumen.map((r) => [pdfSafe(TITULO_TIPO[r.tipo]), String(r.cantidad), litros(r.litros), String(fotosDeTipo(r.tipo))]),
      [pdfSafe('Total'), String(op.movs.length), litros(op.movs.reduce((s, m) => s + (Number(m.litros) || 0), 0)), String(op.fotos.length)],
    ],
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: NARANJA, textColor: [255, 255, 255], fontSize: 7.5, halign: 'center' },
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'center' } },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === resumen.length) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [255, 241, 224];
      }
    },
    margin: MARGIN,
  });
  // @ts-expect-error lastAutoTable lo agrega el plugin
  y = ((doc.lastAutoTable?.finalY ?? y) as number) + 16;

  if (!op.movs.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(110, 110, 110);
    doc.text(pdfSafe('Sin movimientos en ese rango.'), MARGIN, y);
  }

  const GAP = 6;
  const FOTO_W = (ANCHO - GAP * 3) / 4;
  const FOTO_H = 110;

  for (const r of resumen) {
    const lista = op.movs.filter((m) => m.tipo === r.tipo);
    if (y > H - 80) { doc.addPage(); y = MARGIN; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...NARANJA);
    doc.text(pdfSafe(TITULO_TIPO[r.tipo]), MARGIN, y);
    doc.text(pdfSafe(`${r.cantidad}  ·  ${litros(r.litros)}`), W - MARGIN, y, { align: 'right' });
    doc.setDrawColor(...NARANJA); doc.setLineWidth(1.2);
    doc.line(MARGIN, y + 4, W - MARGIN, y + 4);
    y += 16;

    for (const m of lista) {
      const adj = op.fotos.filter((a) => a.ref_id === m.id);
      const imgs = adj.filter((a) => cargadas.has(a.id));
      const docs = adj.filter((a) => !cargadas.has(a.id));
      const filasFotos = Math.ceil(imgs.length / 4);
      const alto = 30 + filasFotos * (FOTO_H + GAP) + (docs.length ? 12 : 0);
      if (y + Math.min(alto, H - MARGIN * 2) > H - MARGIN) { doc.addPage(); y = MARGIN; }

      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
      doc.text(pdfSafe(tituloMovimiento(m)), MARGIN, y, { maxWidth: ANCHO - 70 });
      doc.text(litros(m.litros), W - MARGIN, y, { align: 'right' });
      y += 11;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.8); doc.setTextColor(100, 100, 100);
      const det = doc.splitTextToSize(pdfSafe(detalleMovimiento(m, op.tanqueId ? null : nombreTanque(m.tanque_id))), ANCHO) as string[];
      doc.text(det, MARGIN, y);
      y += det.length * 9.5 + 2;

      if (imgs.length) {
        imgs.forEach((a, i) => {
          const f = cargadas.get(a.id) as FotoPdf;
          const col = i % 4;
          if (col === 0 && i > 0) y += FOTO_H + GAP;
          if (col === 0 && y + FOTO_H > H - MARGIN) { doc.addPage(); y = MARGIN; }
          const x = MARGIN + col * (FOTO_W + GAP);
          const { w, h } = encajar(f.w, f.h, FOTO_W, FOTO_H);
          doc.setDrawColor(210, 210, 210); doc.setLineWidth(0.5);
          doc.rect(x, y, FOTO_W, FOTO_H);
          try { doc.addImage(f.data, 'JPEG', x + (FOTO_W - w) / 2, y + (FOTO_H - h) / 2, w, h); } catch { /* foto ilegible: queda la caja */ }
        });
        y += FOTO_H + GAP;
      } else if (!docs.length) {
        doc.setFontSize(7.5); doc.setTextColor(150, 150, 150);
        doc.text(pdfSafe('Sin fotos'), MARGIN, y);
        y += 9;
      }
      if (docs.length) {
        doc.setFontSize(7.5); doc.setTextColor(100, 100, 100);
        doc.text(pdfSafe(`Adjuntos: ${docs.map((a) => a.nombre).join(', ')}`), MARGIN, y, { maxWidth: ANCHO });
        y += 10;
      }
      doc.setDrawColor(225, 225, 225); doc.setLineWidth(0.4);
      doc.line(MARGIN, y + 2, W - MARGIN, y + 2);
      y += 10;
    }
    y += 6;
  }

  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120, 120, 120);
    doc.text(pdfSafe(`Reporte del surtidor  ·  ${tanqueTxt}  ·  Página ${i} de ${paginas}`), W / 2, H - 18, { align: 'center' });
  }

  previewPdf(doc, nombreArchivo(`reporte-surtidor-${op.tanqueId ? tanqueTxt : 'todos'}-${op.desde}-a-${op.hasta}`));
}
