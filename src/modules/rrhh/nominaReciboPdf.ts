/* ============================================================
   Golden Touch · RRHH · Recibo de pago de personal

   Una página por trabajador, con la misma estructura que el recibo que se
   viene firmando (la planilla del Drive): ITEM · CONCEPTO · DEVENGADO ·
   DEDUCCIÓN · SALDO, los días trabajados y los de descanso como renglones
   aparte, y el texto de conformidad al pie.

   El recibo declara el SUELDO en BOLÍVARES, a la tasa de CIERRE de la
   quincena. Al lado de cada monto va su equivalente en dólares a esa misma
   tasa, y abajo, aparte, lo que se paga en divisas: la parte sueldo más el
   BONO, que no entra en el recibo pero sí es plata que la persona recibe.
   Un papel que muestre solo una de las dos monedas obliga a sacar la cuenta
   a mano, y ahí es donde aparecen los reclamos.
   ============================================================ */
import { loadLogoDataUrl } from '@/shared/lib/pdfLogo';
import { date as fmtDate } from '@/shared/lib/format';
import type { NominaPeriodo, NominaRenglon } from '@/shared/lib/types';
import { previewPdf } from '@/shared/lib/reportePreview';

function usd(n: number | null | undefined): string {
  return '$ ' + Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function bsStr(n: number | null | undefined): string {
  return 'Bs ' + Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function labelMotivo(tipo?: string | null): string {
  switch (tipo) {
    case 'vacaciones': return 'Vacaciones';
    case 'liquidacion': return 'Liquidación';
    case 'quincena': return 'Sueldo (quincena)';
    default: return 'Sueldo';
  }
}

export interface ReciboMeta {
  periodo: Pick<NominaPeriodo, 'codigo' | 'tipo' | 'periodo_desde' | 'periodo_hasta' | 'tasa_bcv' | 'nombre'>;
  cedulas?: Record<string, string | null | undefined>;   // personal_id -> cédula
}

/** Dos decimales: así se paga y así se imprime. */
const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

async function construir(renglones: NominaRenglon[], meta: ReciboMeta) {
  const [logoDataUrl, { jsPDF }, { default: autoTable }] = await Promise.all([
    loadLogoDataUrl().catch(() => null),
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const MARGIN = 42.52; // 1.5 cm

  renglones.forEach((r, idx) => {
    if (idx > 0) doc.addPage();
    let y = MARGIN;

    // Encabezado: logo + empresa + título.
    const LOGO = 56;
    if (logoDataUrl) { try { doc.addImage(logoDataUrl, 'JPEG', MARGIN, y, LOGO, LOGO); } catch { /* logo opcional */ } }
    const tx = logoDataUrl ? MARGIN + LOGO + 14 : MARGIN;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text('GOLDEN TOUCH 1127 C.A.', tx, y + 16);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text('Recibo de Pago de Personal', tx, y + 32);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text(meta.periodo.codigo ?? '', PAGE_W - MARGIN, y + 16, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    // Fecha de EMISIÓN del recibo (hoy). El período y la fecha de pago van en el detalle.
    const fechaEmision = fmtDate(new Date().toISOString());
    doc.text(`Emitido: ${fechaEmision}`, PAGE_W - MARGIN, y + 32, { align: 'right' });
    y += Math.max(LOGO, 40) + 6;

    doc.setDrawColor(255, 138, 0); doc.setLineWidth(1.5);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 18;

    // Título grande.
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text('RECIBO DE PAGO', MARGIN, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(`Motivo: ${labelMotivo(meta.periodo.tipo)}`, PAGE_W - MARGIN, y, { align: 'right' });
    y += 18;

    // Datos del trabajador.
    // La tasa del renglón manda sobre la del período: es la que se congeló al
    // cargar la quincena, y es con la que se firmó el recibo.
    const tasa = Number(r.tasa_bs) || Number(r.tasa_pago) || Number(meta.periodo.tasa_bcv) || 0;
    const tasaTexto = tasa > 0
      ? `Bs ${tasa.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / $`
      : '— (sin tasa)';
    const cedula = meta.cedulas?.[r.personal_id ?? ''] || '';
    const periodoStr = meta.periodo.periodo_desde
      ? `${fmtDate(meta.periodo.periodo_desde)}${meta.periodo.periodo_hasta ? ' — ' + fmtDate(meta.periodo.periodo_hasta) : ''}`
      : '—';
    autoTable(doc, {
      startY: y,
      body: [
        ['Trabajador', r.nombre, 'Cédula', cedula || '—'],
        ['Cargo', r.cargo || '—', 'Departamento', r.departamento || '—'],
        ['Período', periodoStr, 'Fecha de pago', r.pagada_en ? fmtDate(r.pagada_en) : '—'],
        ['Estado', r.estado === 'pagada' ? 'Pagado' : 'Por pagar', 'Días', `${r.dias_trabajados ?? 0} trab. + ${r.dias_descanso ?? 0} desc.`],
        ['Tasa de cierre', tasaTexto, 'Total acordado / mes', usd(r.sueldo_base_mensual)],
      ],
      margin: MARGIN,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 5 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 90 }, 2: { fontStyle: 'bold', cellWidth: 90 } },
    });
    // @ts-expect-error lastAutoTable lo agrega el plugin en runtime
    y = (doc.lastAutoTable?.finalY ?? y) + 16;

    // ── El desglose, como en la planilla: devengado, deducción y saldo ──
    const enUsd = (bs: number) => (tasa > 0 ? r2(bs / tasa) : 0);

    const diasT = Number(r.dias_trabajados) || 0;
    const diasD = Number(r.dias_descanso) || 0;
    const sueldoBs = Number(r.sueldo_quincena_bs) || 0;
    const diarioBs = diasT + diasD > 0 ? sueldoBs / (diasT + diasD) : 0;
    const trabajadosBs = r2(diarioBs * diasT);
    // El descanso es el RESTO y no otro producto: así los dos renglones suman
    // exactamente el sueldo, sin un céntimo de diferencia por redondeo.
    const descansoBs = r2(sueldoBs - trabajadosBs);

    const bonosBs = r2((Number(r.asignaciones) || 0) * tasa);
    const prestamosBs = r2((Number(r.deduc_prestamos) || 0) * tasa);
    const anticiposBs = r2((Number(r.deduc_anticipos) || 0) * tasa);

    const devengadoBs = r2(trabajadosBs + descansoBs + bonosBs);
    const deduccionBs = r2(prestamosBs + anticiposBs);
    const netoBs = r2(devengadoBs - deduccionBs);

    /** Un renglón del desglose: monto en Bs y, al lado, en $ a la misma tasa. */
    const linea = (item: number, concepto: string, bs: number, columna: 'devengado' | 'deduccion'): string[] => {
      const dev = columna === 'devengado' ? bsStr(bs) : '';
      const devU = columna === 'devengado' ? usd(enUsd(bs)) : '';
      const ded = columna === 'deduccion' ? bsStr(bs) : '';
      const dedU = columna === 'deduccion' ? usd(enUsd(bs)) : '';
      return [String(item), concepto, dev, devU, ded, dedU];
    };

    autoTable(doc, {
      startY: y,
      head: [['#', 'CONCEPTO', 'DEVENGADO Bs', 'en $', 'DEDUCCIÓN Bs', 'en $']],
      body: [
        linea(1, `Días trabajados (${diasT})`, trabajadosBs, 'devengado'),
        linea(2, `Días de descanso (${diasD})`, descansoBs, 'devengado'),
        linea(3, 'Bonos', bonosBs, 'devengado'),
        linea(4, 'Viáticos', 0, 'devengado'),
        linea(5, 'Seguro Social Obligatorio', 0, 'deduccion'),
        linea(6, 'Rég. Prestacional de Empleo', 0, 'deduccion'),
        linea(7, 'Rég. Prest. de Vivienda y Hábitat', 0, 'deduccion'),
        linea(8, 'Sindicato', 0, 'deduccion'),
        linea(9, 'Préstamos', prestamosBs, 'deduccion'),
        linea(10, 'Anticipos', anticiposBs, 'deduccion'),
        linea(11, 'Otros', 0, 'deduccion'),
      ],
      foot: [
        ['', 'TOTALES', bsStr(devengadoBs), usd(enUsd(devengadoBs)), bsStr(deduccionBs), usd(enUsd(deduccionBs))],
        ['', 'NETO DEL RECIBO', bsStr(netoBs), usd(enUsd(netoBs)), '', ''],
      ],
      margin: MARGIN,
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 4 },
      headStyles: { fillColor: [255, 138, 0], textColor: 255, fontStyle: 'bold', halign: 'center' },
      footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 18, halign: 'center' },
        2: { halign: 'right', cellWidth: 78 },
        3: { halign: 'right', cellWidth: 62, textColor: 110 },
        4: { halign: 'right', cellWidth: 78 },
        5: { halign: 'right', cellWidth: 62, textColor: 110 },
      },
    });
    // @ts-expect-error lastAutoTable lo agrega el plugin en runtime
    y = (doc.lastAutoTable?.finalY ?? y) + 12;

    // ── Lo que se paga en divisas ──
    // El recibo de arriba declara el sueldo. El BONO no va ahí, pero es plata
    // que la persona cobra: si no aparece en ningún lado, el papel dice menos
    // de lo que se entrega y nadie puede cuadrar lo que recibió.
    const sueldoUsd = Number(r.sueldo_quincena_usd) || 0;
    const bonoUsd = Number(r.bono_quincena_usd) || 0;
    if (sueldoUsd > 0 || bonoUsd > 0) {
      autoTable(doc, {
        startY: y,
        head: [['PAGO DE LA QUINCENA EN DIVISAS', 'Monto $', 'en Bs']],
        body: [
          ['Sueldo de la quincena', usd(sueldoUsd), bsStr(r2(sueldoUsd * tasa))],
          ['Bono de la quincena', usd(bonoUsd), bsStr(r2(bonoUsd * tasa))],
          ...(Number(r.asignaciones) > 0 ? [['Asignaciones', usd(r.asignaciones), bsStr(bonosBs)]] : []),
          ...(Number(r.deduc_anticipos) > 0 ? [['(−) Anticipos', '- ' + usd(r.deduc_anticipos), '- ' + bsStr(anticiposBs)]] : []),
          ...(Number(r.deduc_prestamos) > 0 ? [['(−) Préstamos', '- ' + usd(r.deduc_prestamos), '- ' + bsStr(prestamosBs)]] : []),
        ],
        foot: [['NETO A PAGAR', usd(r.neto_usd), bsStr(r2((Number(r.neto_usd) || 0) * tasa))]],
        margin: MARGIN,
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 4 },
        headStyles: { fillColor: [60, 60, 60], textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
        columnStyles: { 1: { halign: 'right', cellWidth: 92 }, 2: { halign: 'right', cellWidth: 92 } },
      });
      // @ts-expect-error lastAutoTable lo agrega el plugin en runtime
      y = (doc.lastAutoTable?.finalY ?? y) + 10;
    }

    // Texto de conformidad, el mismo que se viene firmando.
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    const conformidad = doc.splitTextToSize(
      `Certifico haber recibido la cantidad de ${bsStr(netoBs)} que comprende la totalidad de mi salario `
      + 'al período que se indica en el mismo, y firmo en señal de conformidad.',
      PAGE_W - MARGIN * 2,
    );
    doc.text(conformidad, MARGIN, y + 10);
    y += 10 + conformidad.length * 11;

    if (r.seriales_billetes && r.seriales_billetes.length) {
      doc.setFontSize(8);
      doc.text(`Seriales de billetes: ${r.seriales_billetes.join(', ')}`, MARGIN, y + 8);
    }

    // Firmas (al pie de la página) — se firman A MANO al imprimir.
    const fy = PAGE_H - MARGIN - 54;
    const colW = (PAGE_W - MARGIN * 2 - 40) / 2;
    // "Recibí conforme" sobre la firma del trabajador.
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(90);
    doc.text('Recibí conforme el pago aquí detallado.', MARGIN, fy - 12);
    doc.setTextColor(0);
    doc.setDrawColor(120); doc.setLineWidth(0.7);
    doc.line(MARGIN, fy, MARGIN + colW, fy);
    doc.line(MARGIN + colW + 40, fy, MARGIN + colW * 2 + 40, fy);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('Firma de la persona', MARGIN + colW / 2, fy + 14, { align: 'center' });
    doc.text('Firma de la Jefa de RRHH', MARGIN + colW + 40 + colW / 2, fy + 14, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90);
    doc.text(`${r.nombre}${cedula ? ' · C.I. ' + cedula : ''}`, MARGIN + colW / 2, fy + 26, { align: 'center' });
    doc.text('Jefatura de Recursos Humanos', MARGIN + colW + 40 + colW / 2, fy + 26, { align: 'center' });
    doc.setTextColor(0);
  });

  return doc;
}

function nombreArchivo(renglones: NominaRenglon[], meta: ReciboMeta): string {
  const base = renglones.length === 1
    ? `recibo-${renglones[0].nombre}`
    : `comprobantes-${meta.periodo.codigo ?? 'nomina'}`;
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '.pdf';
}

/** Descarga el/los comprobante(s) de pago (uno por trabajador). */
export async function descargarNominaReciboPdf(renglones: NominaRenglon[], meta: ReciboMeta): Promise<void> {
  if (!renglones.length) throw new Error('No hay renglones para el comprobante.');
  const doc = await construir(renglones, meta);
  previewPdf(doc, nombreArchivo(renglones, meta));
}
