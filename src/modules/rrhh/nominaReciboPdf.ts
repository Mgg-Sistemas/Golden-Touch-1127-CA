/* ============================================================
   Golden Touch · RRHH · Recibos de pago de personal

   DOS recibos por trabajador (09/10/2026), cada uno en su hoja y con sus
   firmas:

   1. RECIBO DE PAGO EN BOLÍVARES — el sueldo que se declara, a la tasa de
      CIERRE de la quincena: días trabajados y de descanso como renglones
      aparte, las deducciones de ley y el neto en Bs (con su equivalente en $
      a la misma tasa). Es el recibo de siempre (la planilla del Drive), sin
      el bono.
   2. RECIBO DE BONIFICACIÓN Y DESCUENTOS — lo que se paga en divisas: el
      bono de la quincena y las asignaciones adicionales, menos los préstamos
      y anticipos (que se descuentan del bono en $, no del sueldo en Bs), y
      el neto a recibir. Los seriales de billetes van aquí.

   Los dos llevan al pie el total de la quincena, para que ninguno de los dos
   papeles diga menos de lo que la persona realmente cobra.
   ============================================================ */
import { loadLogoPdfEmpresa, anchoLogoPdf, dibujarLogoPdf } from '@/shared/lib/pdfLogo';
import { identidadEmpresa } from '@/shared/lib/empresa';
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

/** Qué recibo: el del sueldo en bolívares o el de la bonificación y descuentos. */
export type TipoRecibo = 'sueldo' | 'bono';
export const TIPOS_RECIBO: TipoRecibo[] = ['sueldo', 'bono'];

export interface ReciboMeta {
  /** `empresa`: de qué nómina es (GT o MTO) → con qué logo, nombre y RIF sale el recibo. */
  periodo: Pick<NominaPeriodo, 'codigo' | 'tipo' | 'periodo_desde' | 'periodo_hasta' | 'tasa_bcv' | 'nombre'> & { empresa?: string | null };
  cedulas?: Record<string, string | null | undefined>;   // personal_id -> cédula
  /** Cuáles recibos imprimir de cada persona (por defecto, los dos). */
  tipos?: TipoRecibo[];
}

/** Dos decimales: así se paga y así se imprime. */
const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

export interface MontosRecibo {
  tasa: number;
  diasT: number;
  diasD: number;
  /** Recibo 1 (Bs). */
  trabajadosBs: number;
  descansoBs: number;
  netoBs: number;
  netoBsEnUsd: number;
  /** Recibo 2 ($). */
  bonoUsd: number;
  asignacionesUsd: number;
  prestamosUsd: number;
  anticiposUsd: number;
  bonoBrutoUsd: number;
  bonoNetoUsd: number;
  /** Lo que la persona cobra en la quincena, en $: sueldo (a la tasa) + bono neto. */
  totalUsd: number;
}

/**
 * Los montos de los dos recibos de un renglón. Lógica pura (se prueba sin PDF).
 * La tasa del renglón manda sobre la del período: es la que se congeló al cargar
 * la quincena, y es con la que se firma el recibo.
 */
export function montosRecibo(r: NominaRenglon, tasaPeriodo?: number | null): MontosRecibo {
  const tasa = Number(r.tasa_bs) || Number(r.tasa_pago) || Number(tasaPeriodo) || 0;
  const enUsd = (bs: number) => (tasa > 0 ? r2(bs / tasa) : 0);
  const diasT = Number(r.dias_trabajados) || 0;
  const diasD = Number(r.dias_descanso) || 0;
  const sueldoBs = r2(Number(r.sueldo_quincena_bs) || 0);
  const diarioBs = diasT + diasD > 0 ? sueldoBs / (diasT + diasD) : 0;
  const trabajadosBs = diasT + diasD > 0 ? r2(diarioBs * diasT) : sueldoBs;
  // El descanso es el RESTO y no otro producto: así los dos renglones suman
  // exactamente el sueldo, sin un céntimo de diferencia por redondeo.
  const descansoBs = r2(sueldoBs - trabajadosBs);
  const netoBs = r2(trabajadosBs + descansoBs);

  const bonoUsd = r2(Number(r.bono_quincena_usd) || 0);
  const asignacionesUsd = r2(Number(r.asignaciones) || 0);
  const prestamosUsd = r2(Number(r.deduc_prestamos) || 0);
  const anticiposUsd = r2(Number(r.deduc_anticipos) || 0);
  const bonoBrutoUsd = r2(bonoUsd + asignacionesUsd);
  const bonoNetoUsd = r2(Math.max(0, bonoBrutoUsd - prestamosUsd - anticiposUsd));
  const netoBsEnUsd = enUsd(netoBs);
  return {
    tasa, diasT, diasD, trabajadosBs, descansoBs, netoBs, netoBsEnUsd,
    bonoUsd, asignacionesUsd, prestamosUsd, anticiposUsd, bonoBrutoUsd, bonoNetoUsd,
    totalUsd: r2(netoBsEnUsd + bonoNetoUsd),
  };
}

export async function construir(renglones: NominaRenglon[], meta: ReciboMeta) {
  const [logoDataUrl, { jsPDF }, { default: autoTable }] = await Promise.all([
    loadLogoPdfEmpresa(meta.periodo.empresa).catch(() => null),
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const emp = identidadEmpresa(meta.periodo.empresa);
  const tipos = (meta.tipos?.length ? TIPOS_RECIBO.filter((t) => meta.tipos?.includes(t)) : TIPOS_RECIBO);
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const MARGIN = 56.69; // 2 cm por lado

  // Cada recibo va en UNA hoja, con las firmas abajo. Se dibuja con el tamaño
  // normal; si no cabe (seriales de billetes…) se repite en modo compacto: menos
  // relleno y letra un poco menor. Se prueba primero en un documento borrador.
  let primera = true;
  for (const r of renglones) {
    for (const tipo of tipos) {
      const prueba = new jsPDF({ unit: 'pt', format: 'letter' });
      const compacto = dibujar(prueba, r, tipo, false);
      if (!primera) doc.addPage();
      primera = false;
      dibujar(doc, r, tipo, compacto);
    }
  }

  /** Dibuja un recibo desde la hoja actual de `doc`. Devuelve true si no cupo en una hoja. */
  function dibujar(doc: InstanceType<typeof jsPDF>, r: NominaRenglon, tipo: TipoRecibo, compacto: boolean): boolean {
    const pagina = doc.getNumberOfPages();
    const MT = compacto ? 34 : MARGIN;          // margen de arriba
    const MB = compacto ? 34 : MARGIN;          // margen de abajo
    const pad = (n: number) => (compacto ? Math.max(1.2, n * 0.55) : n);
    const fs = (n: number) => (compacto ? n - 1 : n);
    const gap = (n: number) => (compacto ? Math.round(n * 0.5) : n);
    const esBono = tipo === 'bono';
    const m = montosRecibo(r, meta.periodo.tasa_bcv);
    let y = MT;

    // Encabezado: logo + empresa + título.
    const LOGO = compacto ? 42 : 56;
    if (logoDataUrl) { dibujarLogoPdf(doc, logoDataUrl, MARGIN, y, LOGO); }
    const tx = logoDataUrl ? MARGIN + anchoLogoPdf(LOGO) + 14 : MARGIN;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text(emp.nombre, tx, y + 16);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(`RIF ${emp.rif}  ·  ${esBono ? 'Recibo de Bonificación y Descuentos' : 'Recibo de Pago de Personal'}`, tx, y + 32);
    doc.setFontSize(7.5); doc.setTextColor(110);
    // El domicilio suele ocupar dos renglones: el encabezado crece con él, para que
    // la raya naranja y el título queden DEBAJO y no se monten sobre el texto.
    const domicilio = doc.splitTextToSize(`Domicilio fiscal: ${emp.domicilio}`, PAGE_W - MARGIN - tx - 130) as string[];
    const LINEA_DOM = 9;
    doc.text(domicilio, tx, y + 44, { lineHeightFactor: LINEA_DOM / 7.5 });
    const finDomicilio = 44 + (domicilio.length - 1) * LINEA_DOM + 3;   // base del último renglón + descendentes
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text(meta.periodo.codigo ?? '', PAGE_W - MARGIN, y + 16, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    // Fecha de EMISIÓN del recibo (hoy). El período y la fecha de pago van en el detalle.
    doc.text(`Emitido: ${fmtDate(new Date().toISOString())}`, PAGE_W - MARGIN, y + 32, { align: 'right' });
    if (tipos.length > 1) {
      doc.setFontSize(8); doc.setTextColor(110);
      doc.text(`Recibo ${esBono ? 2 : 1} de 2`, PAGE_W - MARGIN, y + 44, { align: 'right' });
      doc.setTextColor(0);
    }
    y += Math.max(LOGO, finDomicilio) + (compacto ? 4 : 8);

    doc.setDrawColor(255, 138, 0); doc.setLineWidth(1.5);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += compacto ? 13 : 18;

    // Título grande.
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text(esBono ? 'RECIBO DE BONIFICACIÓN Y DESCUENTOS' : 'RECIBO DE PAGO · SUELDO EN BOLÍVARES', MARGIN, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(esBono ? 'Pago en divisas ($)' : `Motivo: ${labelMotivo(meta.periodo.tipo)}`, PAGE_W - MARGIN, y, { align: 'right' });
    y += compacto ? 9 : 18;

    // Datos del trabajador.
    const tasaTexto = m.tasa > 0
      ? `Bs ${m.tasa.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / $`
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
        ['Estado', r.estado === 'pagada' ? 'Pagado' : 'Por pagar', 'Días', `${m.diasT} trab. + ${m.diasD} desc.`],
        esBono
          ? ['Total acordado / mes', usd(r.sueldo_base_mensual), 'Tasa de cierre', tasaTexto]
          : ['Tasa de cierre', tasaTexto, 'Total acordado / mes', usd(r.sueldo_base_mensual)],
      ],
      margin: { left: MARGIN, right: MARGIN, top: MT, bottom: MB },
      theme: 'grid',
      styles: { fontSize: fs(9), cellPadding: pad(3.5) },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 90 }, 2: { fontStyle: 'bold', cellWidth: 90 } },
    });
    // @ts-expect-error lastAutoTable lo agrega el plugin en runtime
    y = (doc.lastAutoTable?.finalY ?? y) + gap(10);

    const pctSueldo = Number(r.sueldo_pct);
    const pctBono = Number.isFinite(pctSueldo) && pctSueldo > 0 ? Math.round(100 - pctSueldo) : null;
    let conformidad: string;

    if (!esBono) {
      // ── Recibo 1: el sueldo en bolívares, como en la planilla ──
      const enUsd = (bs: number) => (m.tasa > 0 ? r2(bs / m.tasa) : 0);
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
          linea(1, `Días trabajados (${m.diasT})`, m.trabajadosBs, 'devengado'),
          linea(2, `Días de descanso (${m.diasD})`, m.descansoBs, 'devengado'),
          linea(3, 'Viáticos', 0, 'devengado'),
          linea(4, 'Seguro Social Obligatorio', 0, 'deduccion'),
          linea(5, 'Rég. Prestacional de Empleo', 0, 'deduccion'),
          linea(6, 'Rég. Prest. de Vivienda y Hábitat', 0, 'deduccion'),
          linea(7, 'Sindicato', 0, 'deduccion'),
          linea(8, 'Otros', 0, 'deduccion'),
        ],
        foot: [
          ['', 'TOTALES', bsStr(m.netoBs), usd(m.netoBsEnUsd), bsStr(0), usd(0)],
          ['', 'NETO A RECIBIR EN BOLÍVARES', bsStr(m.netoBs), usd(m.netoBsEnUsd), '', ''],
        ],
        margin: { left: MARGIN, right: MARGIN, top: MT, bottom: MB },
        theme: 'grid',
        styles: { fontSize: fs(8.5), cellPadding: pad(2.5) },
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
      y = (doc.lastAutoTable?.finalY ?? y) + gap(8);
      conformidad = `Certifico haber recibido la cantidad de ${bsStr(m.netoBs)}`
        + (m.tasa > 0 ? `, equivalente a ${usd(m.netoBsEnUsd)} a la tasa de cierre de ${tasaTexto},` : '')
        + ` por concepto de sueldo${Number.isFinite(pctSueldo) && pctSueldo > 0 ? ` (${Math.round(pctSueldo)} % del total acordado)` : ''}`
        + ' correspondiente al período que se indica en el mismo, y firmo en señal de conformidad.';
    } else {
      // ── Recibo 2: bonificación, menos préstamos y anticipos, en dólares ──
      const nPrest = (r.deducciones ?? []).filter((d) => d.tipo === 'prestamo').length;
      const nAnt = (r.deducciones ?? []).filter((d) => d.tipo === 'anticipo').length;
      const fila = (item: number, concepto: string, monto: number, columna: 'asignacion' | 'deduccion'): string[] =>
        [String(item), concepto, columna === 'asignacion' ? usd(monto) : '', columna === 'deduccion' ? (monto > 0 ? `− ${usd(monto)}` : usd(0)) : ''];
      autoTable(doc, {
        startY: y,
        head: [['#', 'CONCEPTO', 'ASIGNACIÓN $', 'DESCUENTO $']],
        body: [
          fila(1, pctBono != null ? `Bono de la quincena (${pctBono} % del total acordado)` : 'Bono de la quincena', m.bonoUsd, 'asignacion'),
          fila(2, 'Asignaciones adicionales', m.asignacionesUsd, 'asignacion'),
          fila(3, nPrest > 1 ? `Préstamos (${nPrest})` : 'Préstamos', m.prestamosUsd, 'deduccion'),
          fila(4, nAnt > 1 ? `Anticipos (${nAnt})` : 'Anticipos', m.anticiposUsd, 'deduccion'),
          fila(5, 'Otros descuentos', 0, 'deduccion'),
        ],
        foot: [
          ['', 'TOTALES', usd(m.bonoBrutoUsd), m.prestamosUsd + m.anticiposUsd > 0 ? `− ${usd(m.prestamosUsd + m.anticiposUsd)}` : usd(0)],
          ['', 'NETO A RECIBIR EN DIVISAS', usd(m.bonoNetoUsd), ''],
        ],
        margin: { left: MARGIN, right: MARGIN, top: MT, bottom: MB },
        theme: 'grid',
        styles: { fontSize: fs(8.5), cellPadding: pad(3) },
        headStyles: { fillColor: [60, 60, 60], textColor: 255, fontStyle: 'bold', halign: 'center' },
        footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 18, halign: 'center' },
          2: { halign: 'right', cellWidth: 104 },
          3: { halign: 'right', cellWidth: 104 },
        },
      });
      // @ts-expect-error lastAutoTable lo agrega el plugin en runtime
      y = (doc.lastAutoTable?.finalY ?? y) + gap(6);
      if (m.prestamosUsd + m.anticiposUsd > 0) {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(fs(7.5)); doc.setTextColor(100);
        doc.text('Los préstamos y anticipos se descuentan de la bonificación en divisas, no del sueldo en bolívares.', MARGIN, y + 4);
        doc.setTextColor(0);
        y += 10;
      }
      const descuentos = [
        m.prestamosUsd > 0 ? `${usd(m.prestamosUsd)} de préstamos` : null,
        m.anticiposUsd > 0 ? `${usd(m.anticiposUsd)} de anticipos` : null,
      ].filter(Boolean).join(' y ');
      conformidad = `Certifico haber recibido la cantidad de ${usd(m.bonoNetoUsd)} en divisas por concepto de bonificación`
        + (m.asignacionesUsd > 0 ? ' y asignaciones' : '')
        + ' correspondiente al período que se indica en el mismo'
        + (descuentos ? `, una vez descontados ${descuentos}` : '')
        + ', y firmo en señal de conformidad.';
    }

    // ── El total de la quincena: lo que dicen los dos recibos juntos ──
    autoTable(doc, {
      startY: y,
      head: [['TOTAL DE LA QUINCENA (los dos recibos)', 'Bs', 'Equivalente $']],
      body: [
        [`Recibo 1 · sueldo en bolívares${Number.isFinite(pctSueldo) && pctSueldo > 0 ? ` (${Math.round(pctSueldo)} %)` : ''}`, bsStr(m.netoBs), usd(m.netoBsEnUsd)],
        [m.prestamosUsd + m.anticiposUsd > 0 ? 'Recibo 2 · bonificación (neta de préstamos y anticipos)' : 'Recibo 2 · bonificación en divisas', '', usd(m.bonoNetoUsd)],
      ],
      foot: [['TOTAL RECIBIDO', '', usd(m.totalUsd)]],
      margin: { left: MARGIN, right: MARGIN, top: MT, bottom: MB },
      theme: 'grid',
      styles: { fontSize: fs(8.5), cellPadding: pad(2.5) },
      headStyles: { fillColor: esBono ? [60, 60, 60] : [255, 138, 0], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right', cellWidth: 104 }, 2: { halign: 'right', cellWidth: 104 } },
    });
    // @ts-expect-error lastAutoTable lo agrega el plugin en runtime
    y = (doc.lastAutoTable?.finalY ?? y) + gap(8);

    // Texto de conformidad.
    doc.setFont('helvetica', 'normal'); doc.setFontSize(fs(8.5));
    const lineas = doc.splitTextToSize(conformidad, PAGE_W - MARGIN * 2);
    doc.text(lineas, MARGIN, y + 10);
    y += 10 + lineas.length * (compacto ? 9.5 : 11);

    // Los billetes se entregan con la bonificación: los seriales van en ese recibo.
    if (esBono && r.seriales_billetes && r.seriales_billetes.length) {
      doc.setFontSize(8);
      const seriales = doc.splitTextToSize(`Seriales de billetes: ${r.seriales_billetes.join(', ')}`, PAGE_W - MARGIN * 2);
      doc.text(seriales, MARGIN, y + 8);
      y += 8 + seriales.length * 10;
    }

    // Firmas — se firman A MANO al imprimir: «Recibí conforme» queda pegado al
    // texto, la raya baja todo lo que la hoja permite y el blanco que queda entre
    // medio es el lugar para firmar (nunca menos de 1,6 cm).
    const HUECO_FIRMA_MIN = 46;
    const BAJO_LA_RAYA = 24;                // rótulo + nombre debajo de la raya
    const PISO = PAGE_H - MB - (compacto ? 4 : 20);
    const recibiY = y + 12;
    let fy = PISO - BAJO_LA_RAYA;
    // Una tabla que se partió en dos hojas, o sin el hueco mínimo para firmar: no
    // cabe. En modo normal se reintenta compacto; en compacto se firma igual con
    // el hueco que quede (nunca en otra hoja).
    if (doc.getNumberOfPages() > pagina || fy - recibiY < HUECO_FIRMA_MIN) {
      if (!compacto) return true;
      fy = Math.max(fy, recibiY + 30);
    }
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(90);
    doc.text(esBono ? 'Recibí conforme la bonificación aquí detallada.' : 'Recibí conforme el pago aquí detallado.', MARGIN, recibiY);
    doc.setTextColor(0);
    const colW = (PAGE_W - MARGIN * 2 - 40) / 2;
    doc.setDrawColor(120); doc.setLineWidth(0.7);
    doc.line(MARGIN, fy, MARGIN + colW, fy);
    doc.line(MARGIN + colW + 40, fy, MARGIN + colW * 2 + 40, fy);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('Firma de la persona', MARGIN + colW / 2, fy + 13, { align: 'center' });
    doc.text('Firma de la Jefa de RRHH', MARGIN + colW + 40 + colW / 2, fy + 13, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90);
    doc.text(`${r.nombre}${cedula ? ' · C.I. ' + cedula : ''}`, MARGIN + colW / 2, fy + BAJO_LA_RAYA, { align: 'center' });
    doc.text('Jefatura de Recursos Humanos', MARGIN + colW + 40 + colW / 2, fy + BAJO_LA_RAYA, { align: 'center' });
    doc.setTextColor(0);
    return doc.getNumberOfPages() > pagina;
  }

  return doc;
}

function nombreArchivo(renglones: NominaRenglon[], meta: ReciboMeta): string {
  const base = renglones.length === 1
    ? `recibos-${renglones[0].nombre}`
    : `recibos-${meta.periodo.codigo ?? 'nomina'}`;
  const sufijo = meta.tipos?.length === 1 ? (meta.tipos[0] === 'bono' ? '-bonificacion' : '-sueldo-bs') : '';
  return (base + sufijo).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '.pdf';
}

/** Descarga los recibos de pago: dos por trabajador (sueldo en Bs y bonificación), o los elegidos en `meta.tipos`. */
export async function descargarNominaReciboPdf(renglones: NominaRenglon[], meta: ReciboMeta): Promise<void> {
  if (!renglones.length) throw new Error('No hay renglones para el comprobante.');
  const doc = await construir(renglones, meta);
  previewPdf(doc, nombreArchivo(renglones, meta));
}
