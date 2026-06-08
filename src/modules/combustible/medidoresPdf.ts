/* ============================================================
   Golden Touch · Combustible · Reporte PDF de Medidores por equipo
   Exporta las lecturas recibidas (respeta el filtro aplicado).
   Devuelve el doc (descarga) o el base64 (envío por correo).
   ============================================================ */
import { dateTime, num } from '@/shared/lib/format';
import { loadLogoDataUrl } from '@/shared/lib/pdfLogo';
import type { MedidorCombustible } from '@/shared/lib/types';

const v = (x: number | null | undefined) => (x == null ? '' : num(x));

export interface MedidoresReporteMeta {
  filtro?: string;
}

async function construirDoc(rows: MedidorCombustible[], meta: MedidoresReporteMeta = {}) {
  const [logo, { jsPDF }, { default: autoTable }] = await Promise.all([
    loadLogoDataUrl().catch(() => null),
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const MARGIN = 36;
  let y = MARGIN;

  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 48, 48); } catch { /* opcional */ } }
  const tx = logo ? MARGIN + 60 : MARGIN;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text('Combustible · Medidores por equipo', tx, y + 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`Golden Touch 1127 C.A. · ${dateTime(new Date().toISOString())}`, tx, y + 33);
  doc.text(`${rows.length} lectura(s)${meta.filtro ? ` · ${meta.filtro}` : ''}`, PAGE_W - MARGIN, y + 33, { align: 'right' });
  y += 58;

  doc.setDrawColor(255, 138, 0); doc.setLineWidth(1.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y); y += 8;

  const body = rows.map((m) => [
    m.fecha, m.equipo,
    v(m.horometro_ini), v(m.horometro_fin), v(m.horas),
    v(m.contador_ini), v(m.contador_fin), v(m.contador_dif),
    m.observacion || '—',
  ]);

  autoTable(doc, {
    startY: y + 4,
    head: [['Fecha', 'Equipo', 'Horóm. ini', 'Horóm. fin', 'Horas', 'Cont. ini', 'Cont. fin', 'Dif', 'Observación']],
    body,
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [255, 138, 0], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 60 }, 1: { cellWidth: 'auto' },
      2: { cellWidth: 52, halign: 'right' }, 3: { cellWidth: 52, halign: 'right' }, 4: { cellWidth: 44, halign: 'right' },
      5: { cellWidth: 52, halign: 'right' }, 6: { cellWidth: 52, halign: 'right' }, 7: { cellWidth: 44, halign: 'right' },
      8: { cellWidth: 'auto' },
    },
  });

  return doc;
}

const NOMBRE = 'combustible-medidores.pdf';

export async function descargarMedidoresPdf(rows: MedidorCombustible[], meta: MedidoresReporteMeta = {}): Promise<void> {
  const doc = await construirDoc(rows, meta);
  doc.save(NOMBRE);
}

export async function obtenerMedidoresPdfBase64(rows: MedidorCombustible[], meta: MedidoresReporteMeta = {}): Promise<{ base64: string; nombre: string }> {
  const doc = await construirDoc(rows, meta);
  const base64 = doc.output('datauristring').split(',')[1] ?? '';
  return { base64, nombre: NOMBRE };
}
