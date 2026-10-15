/* ============================================================
   Golden Touch · Libro fiscal · Comprobante de retención (Venezuela)

   v8: hoja en carta HORIZONTAL, fiel al ejemplar de cada impuesto. Sin logo
   arriba: lo que se imprime es lo que manda la Providencia (IVA), el Decreto
   1.808 (ISLR), la ordenanza del municipio (ISAE) o la ley del estado
   (ESTADAL). La firma queda en blanco para firmar a mano (R3-1c: la imagen
   de firma es después, cuando la base la tenga).

   «ANULADO» como marca de agua diagonal solo en pantalla (R3-10b, 1.8).
   Quién registró NO va en lo impreso (R3-12c): solo en la lista.

   Solo vista previa, por botón: aquí nunca se descarga nada solo.
   ============================================================ */
import { previewPdf } from '@/shared/lib/reportePreview';
import { EMPRESA_NOMBRE, EMPRESA_RIF } from '@/shared/lib/empresa';
import { labelPeriodo, labelSujeto, type ConfigRetencion } from './retencionesCalculo';
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

const TEXTOS_LEGAL: Record<string, { titulo: string; subtitulo: string }> = {
  iva: {
    titulo: 'COMPROBANTE DE RETENCION DE IVA',
    subtitulo: 'Providencia Administrativa SNAT/2015/0049',
  },
  islr: {
    titulo: 'COMPROBANTE DE RETENCION DE IMPUESTO SOBRE LA RENTA',
    subtitulo: 'Decreto 1.808 · Reglamento Parcial de la Ley de ISLR en materia de retenciones',
  },
  municipal: {
    titulo: 'COMPROBANTE DE RETENCION DEL IMPUESTO DE ACTIVIDAD ECONOMICA',
    subtitulo: 'Ordenanza sobre Agente de Retencion de Impuesto de Actividades Economicas',
  },
  regional: {
    titulo: 'COMPROBANTE DE RETENCION DE TIMBRE FISCAL ESTADAL',
    subtitulo: '',
  },
  igtf: {
    titulo: 'COMPROBANTE DE PERCEPCION DE IGTF',
    subtitulo: 'Ley de Impuesto a las Grandes Transacciones Financieras',
  },
};

export async function verComprobanteRetencionPdf(r: RetencionPracticada, config: ConfigRetencion): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'), import('jspdf-autotable'),
  ]);
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = MARGEN_PDF;
  const UTIL = W - M * 2;
  const LIMITE = limiteInferiorPdf(H);
  let y = M;

  const legal = TEXTOS_LEGAL[r.tipo] ?? TEXTOS_LEGAL.iva;

  // ── Encabezado: título y fundamento legal ──
  doc.setTextColor(255, 138, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text(textoPdf(legal.titulo), W / 2, y + 16, { align: 'center' });
  doc.setTextColor(40, 40, 40); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  if (legal.subtitulo) {
    doc.text(textoPdf(legal.subtitulo), W / 2, y + 32, { align: 'center' });
  }
  y += 46;

  // ── N° de comprobante, fecha y período: lo primero que mira el SENIAT ──
  doc.setDrawColor(255, 138, 0); doc.setLineWidth(1.2);
  const tercio = (UTIL - 20) / 3;
  const boxH = 36;
  const boxesX = [M, M + tercio + 10, M + 2 * tercio + 20];

  boxesX.forEach((bx) => doc.rect(bx, y, tercio, boxH));
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(100, 100, 100);
  doc.text(textoPdf('N° DE COMPROBANTE'), boxesX[0] + 8, y + 12);
  doc.text(textoPdf('PERIODO FISCAL'), boxesX[1] + 8, y + 12);
  doc.text(textoPdf('FECHA DE EMISION'), boxesX[2] + 8, y + 12);

  doc.setFontSize(12); doc.setTextColor(20, 20, 20);
  doc.text(textoPdf(r.numeroComprobante ?? '—'), boxesX[0] + 8, y + 28);
  doc.setFontSize(10);
  const per = r.quincena ? `${labelPeriodo(r.periodo)} · ${r.quincena}.ª quincena` : labelPeriodo(r.periodo);
  doc.text(textoPdf(per), boxesX[1] + 8, y + 28);
  doc.text(textoPdf(fechaPdf(r.createdAt)), boxesX[2] + 8, y + 28);
  y += boxH + 14;

  // ── Agente y sujeto retenido ──
  doc.setTextColor(0, 0, 0);
  const partes = partesComprobante(r, config);
  autoTable(doc, {
    startY: y,
    head: [[textoPdf('AGENTE DE RETENCION'), textoPdf('SUJETO RETENIDO')]],
    body: [[partes.agente.map(textoPdf).join('\n'), partes.sujeto.map(textoPdf).join('\n')]],
    styles: { fontSize: 8.5, cellPadding: 6, overflow: 'linebreak', valign: 'top' },
    headStyles: { fillColor: [235, 235, 235], textColor: [20, 20, 20], fontStyle: 'bold', fontSize: 8 },
    columnStyles: { 0: { cellWidth: UTIL / 2 }, 1: { cellWidth: UTIL / 2 } },
    margin: MARGENES_TABLA_PDF,
  });
  y = (doc as any).lastAutoTable.finalY + 12;

  // ── La operación: varía según el tipo ──
  const esIva = r.tipo === 'iva';
  const esIslr = r.tipo === 'islr';
  const esMun = r.tipo === 'municipal' || r.tipo === 'regional';
  const cabecera = esIva
    ? ['FACTURA', 'FECHA', 'N° CONTROL', 'BASE IMPONIBLE', 'ALICUOTA', 'IVA FACTURA', '% RET.', 'IVA RETENIDO']
    : esIslr
      ? ['DOCUMENTO', 'FECHA', 'N° CONTROL', 'CONCEPTO', 'BASE IMPONIBLE', 'SUSTRAENDO', '% RET.', 'MONTO RETENIDO']
      : ['DOCUMENTO', 'FECHA', 'N° CONTROL', 'BASE IMPONIBLE', '% RET.', 'MONTO RETENIDO'];
  const fila = esIva
    ? [
      r.facturaNumero || r.docCodigo || '—', fechaPdf(r.facturaFecha), r.facturaControl || '—',
      montoPdf(r.baseImponible, r.moneda), r.alicuota ? `${r.alicuota}%` : '—',
      montoPdf(r.impuesto, r.moneda), `${r.porcentaje}%`, montoPdf(r.montoRetenido, r.moneda),
    ]
    : esIslr
      ? [
        r.facturaNumero || r.docCodigo || '—', fechaPdf(r.facturaFecha), r.facturaControl || '—',
        r.conceptoNombre || '—', montoPdf(r.baseImponible, r.moneda),
        r.sustraendo ? montoPdf(r.sustraendo, r.moneda) : '—',
        `${r.porcentaje}%`, montoPdf(r.montoRetenido, r.moneda),
      ]
      : [
        r.facturaNumero || r.docCodigo || '—', fechaPdf(r.facturaFecha), r.facturaControl || '—',
        montoPdf(r.baseImponible, r.moneda), `${r.porcentaje}%`, montoPdf(r.montoRetenido, r.moneda),
      ];

  const nCols = cabecera.length;
  const estilosCols: Record<number, { halign?: 'right' | 'left' }> = {};
  for (let i = 0; i < nCols; i++) {
    if (esIva && i >= 3) estilosCols[i] = { halign: 'right' };
    else if (esIslr && i >= 4) estilosCols[i] = { halign: 'right' };
    else if (esMun && i >= 3) estilosCols[i] = { halign: 'right' };
  }

  autoTable(doc, {
    startY: y,
    head: [cabecera.map((h) => textoPdf(h))],
    body: [fila.map((c) => textoPdf(c))],
    styles: { fontSize: 8, cellPadding: 5, overflow: 'linebreak' },
    headStyles: { fillColor: [210, 210, 210], textColor: [20, 20, 20], fontStyle: 'bold', fontSize: 7.5 },
    columnStyles: estilosCols,
    margin: MARGENES_TABLA_PDF,
  });
  y = (doc as any).lastAutoTable.finalY + 14;

  // ── Total retenido ──
  const rectW = 260;
  doc.setFillColor(255, 138, 0);
  doc.rect(W - M - rectW, y, rectW, 32, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text(textoPdf('TOTAL RETENIDO'), W - M - rectW + 10, y + 12);
  doc.setFontSize(14);
  doc.text(textoPdf(montoPdf(r.montoRetenido, r.moneda)), W - M - 10, y + 26, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  y += 42;

  const enBs = lineaEquivalenteBs(r);
  if (enBs) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(60, 60, 60);
    doc.text(textoPdf(enBs), W - M, y - 6, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    y += 12;
  }

  // ── ANULADO: marca de agua diagonal ──
  if (r.anulada) {
    doc.saveGraphicsState();
    doc.setGState(new (doc as any).GState({ opacity: 0.15 }));
    doc.setTextColor(200, 0, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(72);
    const cx = W / 2;
    const cy = H / 2;
    const ang = Math.atan2(H, W) * (180 / Math.PI);
    doc.text(textoPdf('ANULADO'), cx, cy, { align: 'center', angle: ang });
    doc.restoreGraphicsState();
    doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
    if (r.anuladaMotivo) {
      doc.setFontSize(9); doc.setTextColor(180, 40, 40);
      doc.text(textoPdf(`Motivo de anulacion: ${r.anuladaMotivo}`), M, y);
      doc.setTextColor(0, 0, 0);
      y += 14;
    }
  }

  // ── Firmas: dos recuadros en blanco ──
  const firmaY = Math.max(y + 10, LIMITE - 80);
  const anchoFirma = (UTIL - 60) / 2;
  doc.setDrawColor(160, 160, 160); doc.setLineWidth(0.5);
  doc.rect(M, firmaY, anchoFirma, 50);
  doc.rect(M + anchoFirma + 60, firmaY, anchoFirma, 50);
  doc.setFontSize(7.5); doc.setTextColor(80, 80, 80);
  doc.text(textoPdf('Firma y sello del agente de retencion'), M + anchoFirma / 2, firmaY + 62, { align: 'center' });
  doc.text(textoPdf('Recibido por el sujeto retenido'), M + anchoFirma + 60 + anchoFirma / 2, firmaY + 62, { align: 'center' });

  // ── Pie ──
  doc.setFontSize(7); doc.setTextColor(120, 120, 120); doc.setFont('helvetica', 'normal');
  const pie = esIva
    ? 'Este comprobante se emite segun lo establecido en la Providencia Administrativa SNAT/2015/0049. El numero no se reusa: una retencion anulada conserva el suyo.'
    : 'Comprobante de retencion. El numero no se reusa: una retencion anulada conserva el suyo.';
  doc.text(textoPdf(pie), M, LIMITE - 6, { maxWidth: anchoUtilPdf(W) });
  doc.text(textoPdf(razonSocialAgente(config)), M, LIMITE + 6);

  previewPdf(doc, `retencion-${r.tipo}-${r.numeroComprobante ?? r.id.slice(0, 8)}.pdf`);
}
