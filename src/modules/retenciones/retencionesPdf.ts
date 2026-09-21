/* ============================================================
   Golden Touch · Retenciones · papeles

   Dos documentos:
   · EL COMPROBANTE de una retención, con los datos que exige la providencia:
     quién retiene y a quién, número de comprobante y período, factura y número
     de control, base imponible, IVA de la factura, porcentaje y monto retenido.
     Cuando la retención nos la practicaron a nosotros, el comprobante bueno es
     el del cliente: este sale marcado como COPIA DE CONTROL INTERNO, porque
     emitir uno propio sería inventar un papel fiscal que no nos toca emitir.
   · EL LIBRO del período, para declarar y para archivar.

   Todo pasa por `pdfSafe`: la helvetica de jsPDF solo escribe Windows-1252 y un
   glifo que no existe ahí rompe el renglón entero.
   ============================================================ */
import { previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import {
  etiquetaQuincena, formatearRif, limiteEntregaComprobante, ROL_LABEL, TIPO_RETENCION_LABEL,
} from './calculosRetenciones';
import type { ParametrosFiscales, RetencionLibro } from './libroRetenciones.repository';

const num = (v: number | null | undefined, dec = 2) =>
  Number(v ?? 0).toLocaleString('es-VE', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const monto = (v: number | null | undefined, moneda: string) =>
  `${moneda === 'Bs' ? 'Bs' : '$'} ${num(v)}`;

const dia = (f: string | null | undefined) => {
  const d = String(f ?? '').slice(0, 10);
  return d.length === 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—';
};

/* ───────── Comprobante de una retención ───────── */

export async function descargarComprobanteRetencionPdf(
  r: RetencionLibro,
  params: ParametrosFiscales | null,
): Promise<void> {
  const [{ jsPDF }, { default: autoTable }, { loadLogoDataUrl }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/pdfLogo'),
  ]);
  const logo = await loadLogoDataUrl().catch(() => null);
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const MARGIN = 42.52;
  let y = MARGIN;
  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 44, 44); } catch { /* opcional */ } }

  doc.setTextColor(255, 138, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(pdfSafe(`COMPROBANTE DE ${TIPO_RETENCION_LABEL[r.tipo].toUpperCase()}`), W / 2, y + 16, { align: 'center' });
  doc.setTextColor(80, 80, 80); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(pdfSafe(etiquetaQuincena(r.fecha)), W / 2, y + 31, { align: 'center' });

  // El papel con valor fiscal de una retención sufrida es el del cliente.
  if (r.rol === 'sufrida') {
    doc.setTextColor(180, 60, 60); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    doc.text(pdfSafe('COPIA DE CONTROL INTERNO · el comprobante fiscal es el que emitio el agente de retencion'),
      W / 2, y + 44, { align: 'center' });
  }
  doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
  y += r.rol === 'sufrida' ? 58 : 46;

  const empresa = params?.empresa_nombre ?? 'GOLDEN TOUCH 1127 C.A.';
  const empresaRif = formatearRif(params?.empresa_rif ?? 'J-50129993-5');
  const agenteNombre = r.rol === 'sufrida' ? (r.razon_social ?? '—') : empresa;
  const agenteRif = r.rol === 'sufrida' ? formatearRif(r.rif) : empresaRif;
  const sujetoNombre = r.rol === 'sufrida' ? empresa : (r.razon_social ?? '—');
  const sujetoRif = r.rol === 'sufrida' ? empresaRif : formatearRif(r.rif);

  autoTable(doc, {
    startY: y,
    head: [['AGENTE DE RETENCION (quien retiene)', 'SUJETO RETENIDO (a quien le retienen)']],
    body: [[
      pdfSafe(`${agenteNombre}\nRIF: ${agenteRif}`),
      pdfSafe(`${sujetoNombre}\nRIF: ${sujetoRif}`),
    ]],
    styles: { fontSize: 9, cellPadding: 6, valign: 'top' },
    headStyles: { fillColor: [255, 138, 0], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
    margin: MARGIN,
  });

  const finalY = () => {
    // @ts-expect-error lastAutoTable lo agrega el plugin
    return (doc.lastAutoTable?.finalY ?? y) as number;
  };

  const datos: string[][] = [
    ['N° de comprobante', r.comprobante_nro ?? '—', 'Periodo fiscal', r.comprobante_periodo ?? '—'],
    ['Fecha de la retencion', dia(r.fecha), 'Entrega hasta', dia(limiteEntregaComprobante(r.fecha))],
    ['N° de factura', r.factura_nro ?? '—', 'N° de control', r.factura_control ?? '—'],
    ['Fecha de la factura', dia(r.factura_fecha), 'Total factura', r.factura_total != null ? monto(r.factura_total, r.moneda) : '—'],
  ];
  if (r.tipo === 'ISLR') {
    datos.push(['Concepto', pdfSafe(`${r.concepto_codigo ?? ''} ${r.concepto ?? '—'}`.trim()), 'Sustraendo', r.sustraendo ? monto(r.sustraendo, r.moneda) : '—']);
  }
  if (r.tipo === 'MUNICIPAL' || r.tipo === 'ESTADAL') {
    datos.push(['Jurisdiccion', pdfSafe(r.municipio ?? '—'), 'Alicuota', `${num(r.porcentaje)} %`]);
  }
  if (r.motivo) datos.push(['Motivo del 100%', pdfSafe(r.motivo), '', '']);

  autoTable(doc, {
    startY: finalY() + 12,
    body: datos,
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: {
      0: { cellWidth: 120, fontStyle: 'bold' }, 1: { cellWidth: 'auto' },
      2: { cellWidth: 110, fontStyle: 'bold' }, 3: { cellWidth: 'auto' },
    },
    margin: MARGIN,
  });

  const cuerpo: string[][] = r.tipo === 'IVA'
    ? [[
      monto(r.base, r.moneda),
      r.exento != null ? monto(r.exento, r.moneda) : '—',
      `${num(r.iva_alicuota, 0)} %`,
      monto(r.iva_monto, r.moneda),
      `${num(r.porcentaje, 0)} %`,
      monto(r.monto, r.moneda),
    ]]
    : [[
      monto(r.base, r.moneda),
      '—', '—', '—',
      `${num(r.porcentaje)} %`,
      monto(r.monto, r.moneda),
    ]];

  autoTable(doc, {
    startY: finalY() + 12,
    head: [['BASE IMPONIBLE', 'EXENTO', 'ALIC. IVA', 'IVA FACTURA', '% RETENIDO', 'IMPUESTO RETENIDO']],
    body: cuerpo,
    styles: { fontSize: 9, cellPadding: 5, halign: 'right' },
    headStyles: { fillColor: [210, 210, 210], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'center', fontSize: 8 },
    columnStyles: { 5: { fontStyle: 'bold' } },
    margin: MARGIN,
  });

  let yy = finalY() + 16;
  if (r.moneda !== 'Bs') {
    doc.setFontSize(9);
    doc.text(
      pdfSafe(`Equivalente en bolivares: Bs ${num(r.monto_bs)} (tasa ${num(r.tasa)} Bs/$). La declaracion se hace en bolivares.`),
      MARGIN, yy,
    );
    yy += 14;
  }
  if (r.descripcion) {
    doc.setFontSize(9);
    doc.text(pdfSafe(`Detalle: ${r.descripcion}`), MARGIN, yy, { maxWidth: W - MARGIN * 2 });
    yy += 16;
  }

  doc.setFontSize(8); doc.setTextColor(110, 110, 110);
  doc.text(pdfSafe(
    `${ROL_LABEL[r.rol]} · Estado: ${r.estado}${r.anulada_motivo ? ` (${r.anulada_motivo})` : ''} · `
    + `Registro: ${r.actor_name || r.actor || '—'}`,
  ), MARGIN, yy + 6, { maxWidth: W - MARGIN * 2 });

  // Firmas: el comprobante se entrega firmado por las dos partes.
  const yFirma = yy + 70;
  doc.setDrawColor(150, 150, 150);
  doc.line(MARGIN, yFirma, MARGIN + 200, yFirma);
  doc.line(W - MARGIN - 200, yFirma, W - MARGIN, yFirma);
  doc.setFontSize(8); doc.setTextColor(80, 80, 80);
  doc.text(pdfSafe('Agente de retencion'), MARGIN, yFirma + 12);
  doc.text(pdfSafe('Sujeto retenido'), W - MARGIN - 200, yFirma + 12);

  previewPdf(doc, `retencion-${r.tipo.toLowerCase()}-${r.comprobante_nro || r.fecha}.pdf`);
}

/* ───────── Libro del período ───────── */

export async function descargarLibroRetencionesPdf(
  filas: RetencionLibro[],
  opciones: { desde: string; hasta: string; params: ParametrosFiscales | null },
): Promise<void> {
  const [{ jsPDF }, { default: autoTable }, { loadLogoDataUrl }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/pdfLogo'),
  ]);
  const logo = await loadLogoDataUrl().catch(() => null);
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const W = doc.internal.pageSize.getWidth();
  const MARGIN = 36;
  let y = MARGIN;
  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 40, 40); } catch { /* opcional */ } }

  doc.setTextColor(255, 138, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(pdfSafe('LIBRO DE RETENCIONES E IMPUESTOS'), W / 2, y + 16, { align: 'center' });
  doc.setTextColor(80, 80, 80); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(pdfSafe(`${opciones.params?.empresa_nombre ?? 'GOLDEN TOUCH 1127 C.A.'} · RIF ${formatearRif(opciones.params?.empresa_rif ?? '')}`),
    W / 2, y + 31, { align: 'center' });
  doc.text(pdfSafe(`Del ${dia(opciones.desde)} al ${dia(opciones.hasta)}`), W / 2, y + 44, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 58;

  // Totales en bolívares, que es como se declara.
  let aFavor = 0; let porEnterar = 0; let igtf = 0;
  for (const r of filas) {
    if (r.estado === 'anulada') continue;
    const bsv = Number(r.monto_bs) || (r.moneda === 'Bs' ? Number(r.monto) || 0 : 0);
    if (r.tipo === 'IGTF') igtf += bsv;
    else if (r.rol === 'sufrida') aFavor += bsv;
    else if (r.estado === 'registrada') porEnterar += bsv;
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text(pdfSafe(
    `A favor (nos retuvieron): Bs ${num(aFavor)}   ·   IGTF pagado: Bs ${num(igtf)}   ·   Por enterar: Bs ${num(porEnterar)}`,
  ), MARGIN, y);
  doc.setFont('helvetica', 'normal');

  autoTable(doc, {
    startY: y + 10,
    head: [['FECHA', 'IMP.', 'ROL', 'COMPROBANTE', 'CONTRAPARTE', 'RIF', 'FACTURA', 'BASE', 'IVA FACT.', '%', 'RETENIDO', 'EN Bs', 'ESTADO']],
    body: filas.map((r) => [
      dia(r.fecha),
      r.tipo,
      r.rol === 'sufrida' ? 'Nos retuvieron' : 'Retuvimos',
      r.comprobante_nro ?? '—',
      pdfSafe(r.razon_social ?? '—'),
      formatearRif(r.rif) || '—',
      r.factura_nro ?? '—',
      monto(r.base, r.moneda),
      r.iva_monto != null ? monto(r.iva_monto, r.moneda) : '—',
      `${num(r.porcentaje, 0)}%`,
      monto(r.monto, r.moneda),
      r.monto_bs ? num(r.monto_bs) : '—',
      r.estado,
    ]),
    styles: { fontSize: 7, cellPadding: 2.5, overflow: 'linebreak' },
    headStyles: { fillColor: [255, 138, 0], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 48 }, 1: { cellWidth: 42 }, 2: { cellWidth: 58 }, 3: { cellWidth: 78 },
      4: { cellWidth: 'auto' }, 5: { cellWidth: 74 }, 6: { cellWidth: 56 },
      7: { cellWidth: 60, halign: 'right' }, 8: { cellWidth: 56, halign: 'right' },
      9: { cellWidth: 28, halign: 'right' }, 10: { cellWidth: 62, halign: 'right' },
      11: { cellWidth: 62, halign: 'right' }, 12: { cellWidth: 52 },
    },
    margin: MARGIN,
  });

  // @ts-expect-error lastAutoTable lo agrega el plugin
  const fin = (doc.lastAutoTable?.finalY ?? y) as number;
  doc.setFontSize(7); doc.setTextColor(110, 110, 110);
  doc.text(pdfSafe(
    'Las retenciones que nos practican son anticipos de impuesto: se descuentan en la declaracion. '
    + 'El IGTF no se recupera. Los montos en Bs son los que se declaran; las filas anuladas no suman.',
  ), MARGIN, fin + 14, { maxWidth: W - MARGIN * 2 });

  previewPdf(doc, `libro-retenciones-${opciones.desde}-${opciones.hasta}.pdf`);
}
