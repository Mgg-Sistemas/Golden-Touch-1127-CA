/* ============================================================
   Golden Touch · Libro fiscal · Comprobante de retención (Venezuela)

   El comprobante de retención de IVA que manda la Providencia SNAT/2015/0049:
   número de comprobante AAAAMM + 8 dígitos, período fiscal, datos del agente y
   del sujeto retenido, la factura que lo origina, la base, el impuesto, el
   porcentaje y el monto retenido.

   El mismo formato sirve para ISLR, municipal y timbre: cambia el encabezado y
   la columna del impuesto, no la estructura. La estructura no se toca; de GT
   son el logo (horizontal, a su proporción) y los datos del agente.

   Solo vista previa, por botón: aquí nunca se descarga nada solo.
   ============================================================ */
import { previewPdf } from '@/shared/lib/reportePreview';
import { EMPRESA_NOMBRE, EMPRESA_RIF } from '@/shared/lib/empresa';
import { labelImpuesto, labelPeriodo, labelSujeto, type ConfigRetencion } from './retencionesCalculo';
import type { RetencionPracticada } from './retencionesFiscal.repository';
import {
  MARGEN_PDF, MARGENES_TABLA_PDF, anchoUtilPdf, fechaPdf, limiteInferiorPdf, montoPdf, textoPdf,
} from './pdfComun';

/** La razón social del agente: la de Parámetros o, si falta, la de la empresa. */
export const razonSocialAgente = (config: ConfigRetencion) => config.razonSocial || EMPRESA_NOMBRE;

/** Las dos partes del comprobante, renglón por renglón: el agente que retiene y el sujeto retenido. */
export function partesComprobante(r: RetencionPracticada, config: ConfigRetencion): { agente: string[]; sujeto: string[] } {
  const empresa = [
    razonSocialAgente(config),
    `RIF: ${config.rif || EMPRESA_RIF}`,
    config.direccionFiscal || '',
    [config.municipio, config.estado].filter(Boolean).join(' · '),
  ].filter(Boolean);
  const contraparte = [r.contraparteNombre || '—', `RIF: ${r.contraparteRif || '—'}`];
  // Nos la practicaron: el agente es quien nos retuvo y el sujeto retenido es la empresa.
  if (r.direccion === 'recibida') return { agente: contraparte, sujeto: empresa };
  const sujeto = r.contraparteSujeto ? [...contraparte, labelSujeto(r.contraparteSujeto)] : contraparte;
  return { agente: empresa, sujeto };
}

/** El equivalente en bolívares, cuando la retención está en otra moneda (así se declara). */
export function lineaEquivalenteBs(r: Pick<RetencionPracticada, 'moneda' | 'montoBs' | 'tasa'>): string | null {
  if (r.moneda === 'Bs' || !r.montoBs) return null;
  const tasa = r.tasa ? ` (tasa ${r.tasa.toLocaleString('es-VE', { maximumFractionDigits: 4 })})` : '';
  return `Equivalente en bolívares: ${montoPdf(r.montoBs, 'Bs')}${tasa}`;
}

export async function verComprobanteRetencionPdf(r: RetencionPracticada, config: ConfigRetencion): Promise<void> {
  const [{ jsPDF }, { default: autoTable }, { loadLogoPdfDataUrl, dibujarLogoPdf }] = await Promise.all([
    import('jspdf'), import('jspdf-autotable'), import('@/shared/lib/pdfLogo'),
  ]);
  const logo = await loadLogoPdfDataUrl().catch(() => null);
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
  const W = doc.internal.pageSize.getWidth();
  const MARGIN = MARGEN_PDF;
  const LIMITE = limiteInferiorPdf(doc.internal.pageSize.getHeight());
  let y = MARGIN;
  // El logo de los PDF de GT es horizontal: se dibuja a su proporción, nunca en un cuadrado.
  if (logo) dibujarLogoPdf(doc, logo, MARGIN, y - 6, 56);

  // ── Encabezado ──
  doc.setTextColor(255, 138, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(textoPdf(`COMPROBANTE DE ${labelImpuesto(r.tipo).toUpperCase()}`), W / 2, y + 16, { align: 'center' });
  doc.setTextColor(40, 40, 40); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  if (r.tipo === 'iva') {
    doc.text(textoPdf('Providencia Administrativa SNAT/2015/0049'), W / 2, y + 30, { align: 'center' });
  } else if (r.tipo === 'islr') {
    doc.text(textoPdf('Decreto 1.808 · Reglamento Parcial de la Ley de ISLR en materia de retenciones'), W / 2, y + 30, { align: 'center' });
  }
  y += 48;

  // ── El número y el período: lo primero que mira el SENIAT ──
  doc.setDrawColor(255, 138, 0); doc.setLineWidth(1.2);
  doc.rect(MARGIN, y, W - MARGIN * 2, 34);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(90, 90, 90);
  doc.text(textoPdf('N° DE COMPROBANTE'), MARGIN + 10, y + 13);
  doc.text(textoPdf('PERÍODO FISCAL'), MARGIN + 250, y + 13);
  doc.text(textoPdf('FECHA DE EMISIÓN'), MARGIN + 400, y + 13);
  doc.setFontSize(12); doc.setTextColor(20, 20, 20);
  doc.text(textoPdf(r.numeroComprobante ?? '—'), MARGIN + 10, y + 28);
  doc.setFontSize(10);
  const per = r.quincena ? `${labelPeriodo(r.periodo)} · ${r.quincena}.ª quincena` : labelPeriodo(r.periodo);
  doc.text(textoPdf(per), MARGIN + 250, y + 28);
  doc.text(textoPdf(fechaPdf(r.createdAt)), MARGIN + 400, y + 28);
  y += 48;

  // ── Agente y sujeto retenido ──
  doc.setTextColor(0, 0, 0);
  const partes = partesComprobante(r, config);
  autoTable(doc, {
    startY: y,
    head: [[textoPdf('AGENTE DE RETENCIÓN'), textoPdf('SUJETO RETENIDO')]],
    body: [[partes.agente.map(textoPdf).join('\n'), partes.sujeto.map(textoPdf).join('\n')]],
    styles: { fontSize: 8.5, cellPadding: 6, overflow: 'linebreak', valign: 'top' },
    headStyles: { fillColor: [235, 235, 235], textColor: [20, 20, 20], fontStyle: 'bold', fontSize: 8 },
    columnStyles: { 0: { cellWidth: (W - MARGIN * 2) / 2 }, 1: { cellWidth: (W - MARGIN * 2) / 2 } },
    margin: MARGENES_TABLA_PDF,
  });
  y = (doc as any).lastAutoTable.finalY + 14;

  // ── La operación ──
  const esIva = r.tipo === 'iva';
  const cabecera = esIva
    ? ['FACTURA', 'FECHA', 'N° CONTROL', 'BASE IMPONIBLE', 'ALÍCUOTA', 'IVA FACTURA', '% RET.', 'IVA RETENIDO']
    : ['DOCUMENTO', 'FECHA', 'CONCEPTO', 'BASE IMPONIBLE', 'SUSTRAENDO', '% RET.', 'MONTO RETENIDO'];
  const fila = esIva
    ? [
      r.facturaNumero || r.docCodigo || '—', fechaPdf(r.facturaFecha), r.facturaControl || '—',
      montoPdf(r.baseImponible, r.moneda), r.alicuota ? `${r.alicuota}%` : '—',
      montoPdf(r.impuesto, r.moneda), `${r.porcentaje}%`, montoPdf(r.montoRetenido, r.moneda),
    ]
    : [
      r.facturaNumero || r.docCodigo || '—', fechaPdf(r.facturaFecha), r.conceptoNombre || '—',
      montoPdf(r.baseImponible, r.moneda), r.sustraendo ? montoPdf(r.sustraendo, r.moneda) : '—',
      `${r.porcentaje}%`, montoPdf(r.montoRetenido, r.moneda),
    ];
  autoTable(doc, {
    startY: y,
    head: [cabecera.map((h) => textoPdf(h))],
    body: [fila.map((c) => textoPdf(c))],
    styles: { fontSize: 7.5, cellPadding: 5, overflow: 'linebreak' },
    headStyles: { fillColor: [210, 210, 210], textColor: [20, 20, 20], fontStyle: 'bold', fontSize: 7 },
    columnStyles: Object.fromEntries(cabecera.map((_, i) => [i, { halign: i >= 3 ? 'right' as const : 'left' as const }])),
    margin: MARGENES_TABLA_PDF,
  });
  y = (doc as any).lastAutoTable.finalY + 14;

  // ── El total, grande: es el número que importa ──
  doc.setFillColor(255, 138, 0);
  doc.rect(W - MARGIN - 230, y, 230, 30, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text(textoPdf('TOTAL RETENIDO'), W - MARGIN - 220, y + 12);
  doc.setFontSize(13);
  doc.text(textoPdf(montoPdf(r.montoRetenido, r.moneda)), W - MARGIN - 10, y + 25, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  y += 46;
  const enBs = lineaEquivalenteBs(r);
  if (enBs) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(60, 60, 60);
    doc.text(textoPdf(enBs), W - MARGIN, y - 6, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    y += 10;
  }

  if (r.anulada) {
    doc.setTextColor(200, 40, 40); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text(textoPdf(`ANULADO · ${r.anuladaMotivo ?? ''}`), MARGIN, y);
    doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
    y += 20;
  }

  // ── Firmas ──
  doc.setFontSize(8); doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.5);
  const anchoFirma = (W - MARGIN * 2 - 40) / 2;
  doc.line(MARGIN, y + 40, MARGIN + anchoFirma, y + 40);
  doc.line(MARGIN + anchoFirma + 40, y + 40, W - MARGIN, y + 40);
  doc.text(textoPdf('Por el agente de retención'), MARGIN, y + 52);
  doc.text(textoPdf('Recibido por el sujeto retenido'), MARGIN + anchoFirma + 40, y + 52);

  // ── Pie ──
  doc.setFontSize(7); doc.setTextColor(120, 120, 120);
  const pie = esIva
    ? 'El comprobante se entrega al proveedor dentro de los plazos de la Providencia. El número no se reusa: una retención anulada conserva el suyo.'
    : 'Comprobante de retención. El número no se reusa: una retención anulada conserva el suyo.';
  doc.text(textoPdf(pie), MARGIN, LIMITE - 22, { maxWidth: anchoUtilPdf(W) });
  doc.text(textoPdf(`Emitido por ${r.actorName ?? '—'} · ${razonSocialAgente(config)}`), MARGIN, LIMITE);

  previewPdf(doc, `retencion-${r.tipo}-${r.numeroComprobante ?? r.id.slice(0, 8)}.pdf`);
}
