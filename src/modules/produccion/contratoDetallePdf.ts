/* ============================================================
   Golden Touch · Producción · Reporte PDF de UN contrato (detalle)
   Vista previa imprimible con TODOS los datos del contrato: encabezado,
   producción medida, resultados automáticos y —en contratos mineros—
   sacos/precio/tasa, el pago al minero y las PERSONAS (nombre + cédula).
   ============================================================ */
import { dateTime, date, num } from '@/shared/lib/format';
import { loadLogoDataUrl } from '@/shared/lib/pdfLogo';
import type { ContratoAcopio } from '@/shared/lib/types';
import { previewPdf } from '@/shared/lib/reportePreview';

const pct = (v: number | null | undefined) =>
  v == null || !Number.isFinite(Number(v)) ? '—' : `${(Number(v) * 100).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
const money = (v: number | null | undefined) => `$ ${num(Number(v) || 0)}`;

const nombreArchivo = (c: ContratoAcopio) => `contrato-${c.numero.replace(/[^\w-]+/g, '-')}.pdf`;

async function construirDoc(c: ContratoAcopio) {
  const [logo, { jsPDF }, { default: autoTable }] = await Promise.all([
    loadLogoDataUrl().catch(() => null),
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const esMinero = c.tipo === 'minero';
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const MARGIN = 42.52; // 1.5 cm
  let y = MARGIN;

  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 50, 50); } catch { /* opcional */ } }
  const tx = logo ? MARGIN + 62 : MARGIN;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text(`Contrato ${esMinero ? 'minero' : 'de producción'} · ${c.numero}`, tx, y + 16);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`${date(c.fecha)}${c.hora ? ` · ${c.hora}` : ''} · ${c.estado === 'activo' ? 'Activo' : 'Cerrado'}`, tx, y + 31);
  doc.text('GOLDEN TOUCH 1127 C.A.', PAGE_W - MARGIN, y + 16, { align: 'right' });
  doc.text(`Generado ${dateTime(new Date().toISOString())}`, PAGE_W - MARGIN, y + 31, { align: 'right' });
  y += 56;
  doc.setDrawColor(255, 138, 0); doc.setLineWidth(1.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y); y += 6;

  // Bloque clave/valor reutilizable con autoTable.
  const bloque = (titulo: string, filas: Array<[string, string]>) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    autoTable(doc, {
      startY: y + 10,
      head: [[{ content: titulo, colSpan: 2 }]],
      body: filas.map(([k, v]) => [k, v]),
      margin: MARGIN,
      styles: { fontSize: 9, cellPadding: 3.5, overflow: 'linebreak' },
      headStyles: { fillColor: [255, 138, 0], textColor: 20, fontStyle: 'bold', fontSize: 10 },
      columnStyles: { 0: { cellWidth: 200, textColor: 90 }, 1: { fontStyle: 'bold' } },
    });
    // @ts-expect-error lastAutoTable lo agrega jspdf-autotable
    y = doc.lastAutoTable.finalY;
  };

  bloque('Datos generales', [
    ['Tipo de contrato', esMinero ? 'Minero (compra a minero)' : 'Producción (molienda)'],
    ['Supervisor de producción', c.supervisor || '—'],
    ['Lugar de extracción', c.lugar_extraccion || '—'],
    ['Molino utilizado', c.molino || '—'],
  ]);

  bloque('Producción (datos medidos)', [
    ['Ton procesadas', num(c.ton_procesadas)],
    ['Tolva (Ton ÷ 1,2)', num(c.tolva)],
    ['Kg peso húmedo', num(c.kg_humedo)],
    ['Kg secos', num(c.kg_secos)],
    ['Kg seco, limpio (Casiterita)', num(c.kg_seco_limpio)],
  ]);

  bloque('Resultados automáticos', [
    ['% recup. por ton c/ impurezas', pct(c.pct_recuperado_impurezas)],
    ['% de humedad', pct(c.pct_humedad)],
    ['% Recuperación Final Casiterita', pct(c.pct_recuperacion_casiterita)],
    ['Kg hierro (seco limpio − secos)', num(c.kg_hierro)],
    ['% de hierro', pct(c.pct_hierro)],
  ]);

  if (esMinero) {
    bloque('⛏ Contrato minero', [
      ['Cantidad de sacos (UND)', num(c.cantidad_sacos)],
      ['Precio Casiterita ($/Kg)', money(c.precio_casiterita)],
      ['Tasa establecida ($/Kg al acopio)', money(c.tasa)],
      ['Utilidad del minero (Kg × 70%)', `${num(c.utilidad_minero)} Kg`],
      ['Golden Touch (Kg × 30%)', `${num(c.utilidad_gt)} Kg`],
      ['Monto a pagar al minero', money(c.monto_pagar_minero)],
    ]);

    // Personas del contrato (nombre + cédula).
    const personas = Array.isArray(c.personas) ? c.personas : [];
    doc.setFont('helvetica', 'bold');
    autoTable(doc, {
      startY: y + 10,
      head: [[{ content: '👤 Personas del contrato', colSpan: 3 }], ['#', 'Nombre y apellido', 'Cédula']],
      body: personas.length
        ? personas.map((p, i) => [String(i + 1), p.nombre || '—', p.cedula || '—'])
        : [[{ content: 'Sin personas registradas.', colSpan: 3, styles: { textColor: 130, halign: 'center' } }]],
      margin: MARGIN,
      styles: { fontSize: 9, cellPadding: 3.5, overflow: 'linebreak' },
      headStyles: { fillColor: [255, 138, 0], textColor: 20, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 30, halign: 'right' }, 2: { cellWidth: 160 } },
    });
    // @ts-expect-error lastAutoTable lo agrega jspdf-autotable
    y = doc.lastAutoTable.finalY;
  }

  if (c.observaciones?.trim()) {
    bloque('Observación', [['', c.observaciones.trim()]]);
  }

  return doc;
}

/** Vista previa (con botón Descargar) del reporte de UN contrato. */
export async function descargarContratoDetallePdf(c: ContratoAcopio): Promise<void> {
  const doc = await construirDoc(c);
  previewPdf(doc, nombreArchivo(c));
}
