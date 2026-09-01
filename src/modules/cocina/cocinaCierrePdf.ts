/* ============================================================
   Golden Touch · Cocina · Cierre de mercado (21 días) · PDF
   Reporte del ciclo: por cada víver, saldo inicial (del mercado
   anterior) + entradas (nuevo mercado) = disponible, consumo del
   ciclo y LO QUE QUEDA (pasa al próximo mercado como saldo inicial).
   Devuelve el doc para descargar o el base64 para enviar por correo.
   ============================================================ */
import { previewPdf } from '@/shared/lib/reportePreview';
import type { Mercado, ResumenViver } from './cocinaMercado.repository';

type JsPDFDoc = import('jspdf').jsPDF;

const soloFecha = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

async function construirDocCierre(m: Mercado): Promise<JsPDFDoc> {
  const [{ jsPDF }, { default: autoTable }, fmt, { loadLogoDataUrl }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/format'),
    import('@/shared/lib/pdfLogo'),
  ]);
  const logo = await loadLogoDataUrl().catch(() => null);
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
  const W = doc.internal.pageSize.getWidth();
  const MARGIN = 42.52;
  const money = (n: number) => fmt.money(n);
  const num = (n: number) => fmt.num(Number(n) || 0);
  const resumen: ResumenViver[] = m.resumen ?? [];
  const t = m.totales;
  let y = MARGIN;
  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 44, 44); } catch { /* opcional */ } }

  doc.setTextColor(255, 138, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text('CIERRE DE MERCADO · COCINA', W / 2 + 28, y + 18, { align: 'center' });
  doc.setTextColor(80, 80, 80); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(`${m.numero ?? ''} · ${soloFecha(m.inicio_at)} a ${soloFecha(m.cierre_at)}`, W / 2 + 28, y + 34, { align: 'center' });
  doc.setTextColor(120, 120, 120); doc.setFontSize(8);
  doc.text(`GOLDEN TOUCH 1127 C.A. · Generado ${fmt.dateTime(new Date().toISOString())}`, W / 2 + 28, y + 48, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 64;

  // Totales del ciclo
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(`${t?.viveres ?? resumen.length} víveres   ·   Consumo total ${money(t?.consumo_valor ?? 0)}   ·   ${t?.queda_viveres ?? 0} con saldo que pasa al próximo mercado`, MARGIN, y);
  y += 8;

  // Detalle por víver: saldo inicial + entradas = disponible; consumo; QUEDA
  autoTable(doc, {
    startY: y + 6,
    head: [['VÍVER', 'UND', 'SALDO INICIAL', 'ENTRADAS (NUEVO)', 'DISPONIBLE', 'CONSUMO', 'QUEDA']],
    body: resumen.map((r) => [
      r.nombre, r.unidad ?? '', num(r.saldo_inicial), num(r.entradas),
      num(r.disponible), num(r.consumo), num(r.queda),
    ]),
    styles: { fontSize: 8, cellPadding: 3.2, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: [255, 138, 0], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: 'auto' }, 1: { cellWidth: 34, halign: 'center' },
      2: { cellWidth: 66, halign: 'right' }, 3: { cellWidth: 76, halign: 'right' },
      4: { cellWidth: 62, halign: 'right', fontStyle: 'bold' },
      5: { cellWidth: 58, halign: 'right' },
      6: { cellWidth: 56, halign: 'right', fontStyle: 'bold', textColor: [0, 120, 60] },
    },
    margin: MARGIN,
  });

  return doc;
}

/** Abre el PDF del cierre en vista previa (se descarga al pulsar Descargar). */
export async function descargarCocinaCierrePdf(m: Mercado): Promise<void> {
  const doc = await construirDocCierre(m);
  previewPdf(doc, `cierre-mercado-${(m.numero ?? 'MK')}-${soloFecha(m.cierre_at).replace(/\//g, '-')}.pdf`);
}

/** Genera el PDF del cierre y devuelve el base64 (sin prefijo) + nombre, para el correo. */
export async function obtenerCocinaCierreBase64(m: Mercado): Promise<{ base64: string; nombre: string }> {
  const doc = await construirDocCierre(m);
  const dataUri = doc.output('datauristring');
  return { base64: dataUri.split(',')[1] ?? '', nombre: `cierre-mercado-${m.numero ?? 'MK'}.pdf` };
}
