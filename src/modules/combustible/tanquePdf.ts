/* ============================================================
   Golden Touch · Combustible · Reporte PDF del libro mayor de un tanque
   Misma estética que el resto (logo, franja naranja, autoTable).
   Exporta los movimientos que recibe (respeta el filtro aplicado).
   ============================================================ */
import { dateTime, money, num } from '@/shared/lib/format';
import { loadLogoDataUrl } from '@/shared/lib/pdfLogo';
import type { MovimientoTanque, TanqueCombustible } from '@/shared/lib/types';

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
    loadLogoDataUrl().catch(() => null),
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const MARGIN = 42.52; // 1.5 cm
  let y = MARGIN;

  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 50, 50); } catch { /* opcional */ } }
  const tx = logo ? MARGIN + 62 : MARGIN;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text(`Combustible · ${tanque.nombre}`, tx, y + 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`Saldo: ${num(tanque.saldo_litros)} L · ${money(tanque.saldo_usd)} · Tasa ${money(tanque.tasa_usd_litro)}/L`, tx, y + 33);
  doc.text(`GOLDEN TOUCH 1127 C.A. · ${dateTime(new Date().toISOString())}`, PAGE_W - MARGIN, y + 18, { align: 'right' });
  doc.text(`${movs.length} movimiento(s)${meta.filtro ? ` · ${meta.filtro}` : ''}`, PAGE_W - MARGIN, y + 33, { align: 'right' });
  y += 58;

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
  doc.save(nombreArchivo(tanque));
}

export async function obtenerMovimientosTanquePdfBase64(
  tanque: TanqueCombustible, movs: MovimientoTanque[], meta: TanqueReporteMeta = {},
): Promise<{ base64: string; nombre: string }> {
  const doc = await construirDoc(tanque, movs, meta);
  const base64 = doc.output('datauristring').split(',')[1] ?? '';
  return { base64, nombre: nombreArchivo(tanque) };
}
