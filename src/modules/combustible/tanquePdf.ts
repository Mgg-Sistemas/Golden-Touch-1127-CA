/* ============================================================
   Golden Touch · Combustible · Reporte PDF del libro mayor de un tanque
   Misma estética que el resto (logo, franja naranja, autoTable).
   Exporta los movimientos que recibe (respeta el filtro aplicado).
   ============================================================ */
import { dateTime, money, num } from '@/shared/lib/format';
import { loadLogoPdfDataUrl, anchoLogoPdf, dibujarLogoPdf } from '@/shared/lib/pdfLogo';
import type { MovimientoTanque, TanqueCombustible } from '@/shared/lib/types';
import { previewPdf } from '@/shared/lib/reportePreview';

const litrosDe = (m: MovimientoTanque, tipo: MovimientoTanque['tipo']) => (m.tipo === tipo ? num(m.litros) : '');

export interface TanqueReporteMeta {
  /** Texto con el filtro aplicado (para el subtítulo). */
  filtro?: string;
}

const nombreArchivo = (tanque: TanqueCombustible) =>
  `combustible-${tanque.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}.pdf`;

async function construirDoc(
  tanque: TanqueCombustible, movs: MovimientoTanque[], meta: TanqueReporteMeta = {},
) {
  const [logo, { jsPDF }, { default: autoTable }] = await Promise.all([
    loadLogoPdfDataUrl().catch(() => null),
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const MARGIN = 56.69; // 2 cm por lado
  let y = MARGIN;

  if (logo) { dibujarLogoPdf(doc, logo, MARGIN, y, 50); }
  const tx = logo ? MARGIN + anchoLogoPdf(50) + 12 : MARGIN;
  // Bloque derecho (empresa/fecha y conteo): se mide primero para que el título no se
  // le monte encima (03/11/2026: «Tanque #3 (Camión de Lubricación)» lo pisaba).
  const derecha1 = `GOLDEN TOUCH 1127 C.A. · ${dateTime(new Date().toISOString())}`;
  const derecha2 = `${movs.length} movimiento(s)${meta.filtro ? ` · ${meta.filtro}` : ''}`;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  const anchoDerecha = Math.max(doc.getTextWidth(derecha1), doc.getTextWidth(derecha2));
  const anchoTitulo = PAGE_W - MARGIN - anchoDerecha - 16 - tx;
  // El título baja de 16 a 11 pt hasta caber; si aun así no cabe, pasa a dos renglones.
  const titulo = `Combustible · ${tanque.nombre}`;
  doc.setFont('helvetica', 'bold');
  let tam = 16;
  doc.setFontSize(tam);
  while (tam > 11 && doc.getTextWidth(titulo) > anchoTitulo) { tam -= 0.5; doc.setFontSize(tam); }
  const renglones = (doc.splitTextToSize(titulo, anchoTitulo) as string[]).slice(0, 2);
  doc.text(renglones, tx, y + 18);
  const extra = (renglones.length - 1) * tam * 1.15;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`Saldo: ${num(tanque.saldo_litros)} L · ${money(tanque.saldo_usd)} · Tasa ${money(tanque.tasa_usd_litro)}/L`, tx, y + 33 + extra);
  doc.text(derecha1, PAGE_W - MARGIN, y + 18, { align: 'right' });
  doc.text(derecha2, PAGE_W - MARGIN, y + 33, { align: 'right' });
  y += 58 + extra;

  doc.setDrawColor(255, 138, 0); doc.setLineWidth(1.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y); y += 8;

  const body = movs.map((m) => [
    `${m.fecha}${m.hora ? `\n${m.hora}` : ''}`,
    m.equipo || '—',
    m.autorizado_por || '—',
    m.ubicacion || '—',
    m.observacion || '—',
    m.horometro_ini != null ? num(m.horometro_ini) : '',
    m.horometro_fin != null ? num(m.horometro_fin) : '',
    m.horas_utilizadas ? num(m.horas_utilizadas) : '',
    litrosDe(m, 'entrada'),
    litrosDe(m, 'uso'),
    litrosDe(m, 'traslado'),
    litrosDe(m, 'retorno'),
    num(m.saldo_litros),
    money(m.tasa_usd_litro),
    money(m.monto_usd),
    money(m.saldo_usd),
  ]);

  autoTable(doc, {
    startY: y + 4,
    head: [['Fecha', 'Equipo', 'Autorizado', 'Ubicación', 'Observación', 'HI', 'HF', 'Hrs', 'Entrada', 'Uso', 'Traslado', 'Retorno', 'Saldo L', 'Tasa', '$ Mov.', 'Saldo $']],
    body,
    margin: MARGIN,
    styles: { fontSize: 6.5, cellPadding: 2.5, overflow: 'linebreak' },
    headStyles: { fillColor: [255, 138, 0], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 58 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 56 }, 3: { cellWidth: 56 }, 4: { cellWidth: 'auto' },
      5: { cellWidth: 26, halign: 'right' }, 6: { cellWidth: 26, halign: 'right' }, 7: { cellWidth: 26, halign: 'right' },
      8: { cellWidth: 42, halign: 'right' }, 9: { cellWidth: 38, halign: 'right' }, 10: { cellWidth: 44, halign: 'right' }, 11: { cellWidth: 44, halign: 'right' },
      12: { cellWidth: 44, halign: 'right', fontStyle: 'bold' }, 13: { cellWidth: 38, halign: 'right' }, 14: { cellWidth: 48, halign: 'right' }, 15: { cellWidth: 52, halign: 'right', fontStyle: 'bold' },
    },
  });

  return doc;
}

export async function descargarMovimientosTanquePdf(
  tanque: TanqueCombustible, movs: MovimientoTanque[], meta: TanqueReporteMeta = {},
): Promise<void> {
  const doc = await construirDoc(tanque, movs, meta);
  previewPdf(doc, nombreArchivo(tanque));
}

export async function obtenerMovimientosTanquePdfBase64(
  tanque: TanqueCombustible, movs: MovimientoTanque[], meta: TanqueReporteMeta = {},
): Promise<{ base64: string; nombre: string }> {
  const doc = await construirDoc(tanque, movs, meta);
  const base64 = doc.output('datauristring').split(',')[1] ?? '';
  return { base64, nombre: nombreArchivo(tanque) };
}
