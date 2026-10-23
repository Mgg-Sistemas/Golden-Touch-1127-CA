/* ============================================================
   Golden Touch · RRHH · Recibos de pago de personal

   DOS recibos por trabajador (09/10/2026), cada uno en su hoja y con la
   firma de la persona (la de RRHH se quitó el 15/10/2026):

   1. RECIBO DE PAGO EN BOLÍVARES — el sueldo que se declara: días
      trabajados y de descanso como renglones aparte, las deducciones de ley y
      el neto. SOLO EN Bs (15/10/2026): no lleva nada en $ (ni tasa, ni
      equivalentes, ni el total en divisas), como la planilla en papel. Es el
      recibo de siempre, sin el bono.
   2. RECIBO DE BONIFICACIÓN Y DESCUENTOS — lo que se paga en divisas: el
      bono de la quincena y las asignaciones adicionales, menos los préstamos
      y anticipos (que se descuentan del bono en $, no del sueldo en Bs), y
      el neto a recibir. Los seriales de billetes van aquí.

   Cada uno SOLO en su moneda (15/10/2026): el 1 sin nada en $, el 2 sin nada en
   Bs (sin tasa ni el cuadro del total de la quincena, que mezclaba las dos).

   EMPRESAS CON MONEDA DE PAGO REAL BRASILEÑO (23/10/2026): si la nómina se cargó
   con la tasa del Real (`tasa_brl`), el recibo 2 sale en $ Y en R$, con las dos
   columnas, el neto en las dos monedas y la tasa de cambio usada (1 $ = R$ x).
   El recibo 1 (Bs) no cambia.
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
/** R$ con coma decimal: «R$ 100,86». */
export function reales(n: number | null | undefined): string {
  return 'R$ ' + Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/** La tasa con sus 4 decimales: «5,0428». */
export function tasaRealTexto(t: number): string {
  return Number(t).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
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
  periodo: Pick<NominaPeriodo, 'codigo' | 'tipo' | 'periodo_desde' | 'periodo_hasta' | 'tasa_bcv' | 'nombre'> & Partial<Pick<NominaPeriodo, 'tasa_brl' | 'tasa_brl_fecha'>> & { empresa?: string | null };
  cedulas?: Record<string, string | null | undefined>;   // personal_id -> cédula
  /** Cuáles recibos imprimir de cada persona (por defecto, los dos). */
  tipos?: TipoRecibo[];
  /** Moneda forzada para imprimir el lote (si no se especifica, toma la de cada renglón `r.moneda_pago`). */
  moneda?: string | null;
}

/** Dos decimales: así se paga y así se imprime. */
const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

function fmtMontoMoneda(n: number | null | undefined, simb: string): string {
  const num = Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (simb === '$') return '$ ' + num;
  if (simb === 'Bs') return 'Bs ' + num;
  if (simb === 'USDT') return num + ' USDT';
  if (simb === '€') return '€ ' + num;
  return simb + ' ' + num;
}

export interface MontosRecibo {
  tasa: number;
  diasT: number;
  diasD: number;
  /** Recibo 1 (Bs). */
  sueldoBs: number;
  diarioBs: number;
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
  /** Moneda del pago y del recibo. */
  moneda: string;
  simbolo: string;
  esOtraMoneda: boolean;
  bonoMonto: number;
  asignacionesMonto: number;
  prestamosMonto: number;
  anticiposMonto: number;
  bonoBrutoMonto: number;
  bonoNetoMonto: number;
  equivalenteUsd: number;
  /** Real brasileño: R$ por 1 USD (0 = el recibo no lleva R$). */
  tasaBrl: number;
  /** ¿El recibo de bonificación sale también en R$? (pago en $ y la nómina trae tasa del Real) */
  esReal: boolean;
  bonoBrl: number;
  asignacionesBrl: number;
  prestamosBrl: number;
  anticiposBrl: number;
  bonoBrutoBrl: number;
  bonoNetoBrl: number;
}

/**
 * Los montos de los dos recibos de un renglón. Lógica pura (se prueba sin PDF).
 * La tasa del renglón manda sobre la del período: es la que se congeló al cargar
 * la quincena, y es con la que se firma el recibo.
 * Si se paga en otra moneda (Bs, USDT, EUR), calcula los importes en esa moneda y
 * la conversión en $ al cambio.
 */
export function montosRecibo(r: NominaRenglon, tasaPeriodo?: number | null, monedaOverride?: string | null, tasaBrlPeriodo?: number | null): MontosRecibo {
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

  const rawMoneda = (monedaOverride || r.moneda_pago || 'USD').trim() || 'USD';
  const esOtraMoneda = rawMoneda.toUpperCase() !== 'USD';
  let moneda = 'USD';
  let simbolo = '$';
  let bonoMonto = bonoUsd;
  let asignacionesMonto = asignacionesUsd;
  let prestamosMonto = prestamosUsd;
  let anticiposMonto = anticiposUsd;
  let bonoBrutoMonto = bonoBrutoUsd;
  let bonoNetoMonto = bonoNetoUsd;
  const equivalenteUsd = bonoNetoUsd;

  if (rawMoneda.toUpperCase() === 'BS') {
    moneda = 'Bs';
    simbolo = 'Bs';
    if (tasa > 0) {
      bonoMonto = r2(bonoUsd * tasa);
      asignacionesMonto = r2(asignacionesUsd * tasa);
      prestamosMonto = r2(prestamosUsd * tasa);
      anticiposMonto = r2(anticiposUsd * tasa);
      bonoBrutoMonto = r2(bonoMonto + asignacionesMonto);
      bonoNetoMonto = r2(Math.max(0, bonoBrutoMonto - prestamosMonto - anticiposMonto));
    }
  } else if (rawMoneda.toUpperCase() === 'USDT') {
    moneda = 'USDT';
    simbolo = 'USDT';
  } else if (rawMoneda.toUpperCase() === 'EUR') {
    moneda = 'EUR';
    simbolo = '€';
  }

  // Real brasileño: los mismos montos en $ pasados a R$ a la tasa de la nómina. Solo cuando el
  // pago es en $ (las otras monedas — Bs, USDT, €— no se mezclan con el Real).
  const tasaBrl = Number(tasaBrlPeriodo) > 0 ? Number(tasaBrlPeriodo) : 0;
  const esReal = tasaBrl > 0 && !esOtraMoneda;
  const aBrl = (usdMonto: number) => (esReal ? r2(usdMonto * tasaBrl) : 0);
  const bonoBrl = aBrl(bonoUsd);
  const asignacionesBrl = aBrl(asignacionesUsd);
  const prestamosBrl = aBrl(prestamosUsd);
  const anticiposBrl = aBrl(anticiposUsd);
  const bonoBrutoBrl = r2(bonoBrl + asignacionesBrl);
  const bonoNetoBrl = esReal ? r2(Math.max(0, bonoBrutoBrl - prestamosBrl - anticiposBrl)) : 0;

  return {
    tasa, diasT, diasD, sueldoBs, diarioBs: r2(diarioBs), trabajadosBs, descansoBs, netoBs, netoBsEnUsd,
    bonoUsd, asignacionesUsd, prestamosUsd, anticiposUsd, bonoBrutoUsd, bonoNetoUsd,
    totalUsd: r2(netoBsEnUsd + bonoNetoUsd),
    moneda,
    simbolo,
    esOtraMoneda,
    bonoMonto,
    asignacionesMonto,
    prestamosMonto,
    anticiposMonto,
    bonoBrutoMonto,
    bonoNetoMonto,
    equivalenteUsd,
    tasaBrl, esReal, bonoBrl, asignacionesBrl, prestamosBrl, anticiposBrl, bonoBrutoBrl, bonoNetoBrl,
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
    const m = montosRecibo(r, meta.periodo.tasa_bcv, meta.moneda, meta.periodo.tasa_brl);
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
    doc.text(esBono ? 'RECIBO DE BONIFICACIÓN Y DESCUENTOS' : 'RECIBO DE PAGO', MARGIN, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    const labelPago = esBono
      ? (m.moneda === 'Bs'
          ? 'Pago en Bolívares (Bs) al cambio'
          : m.moneda === 'USDT'
            ? 'Pago en USDT'
            : m.moneda === 'EUR'
              ? 'Pago en Euros (€)'
              : m.esReal ? 'Pago en divisas ($) y Real brasileño (R$)' : 'Pago en divisas ($)')
      : `Motivo: ${labelMotivo(meta.periodo.tipo)}`;
    doc.text(labelPago, PAGE_W - MARGIN, y, { align: 'right' });
    y += compacto ? 9 : 18;

    // Datos del trabajador.
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
          ? [
              'Total acordado / mes',
              usd(r.sueldo_base_mensual),
              'Forma de pago',
              m.moneda === 'Bs'
                ? `Bolívares (Bs)${m.tasa > 0 ? ` · Tasa: ${m.tasa.toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : ''}`
                : m.moneda === 'USDT'
                  ? 'Criptoactivo (USDT)'
                  : m.moneda === 'EUR'
                    ? 'Euros (€)'
                    : m.esReal ? `Divisas ($) · Real brasileño (R$) · 1 $ = R$ ${tasaRealTexto(m.tasaBrl)}` : 'Divisas ($)',
            ]
          : ['Sueldo quincenal', bsStr(m.sueldoBs), 'Sueldo diario', bsStr(m.diarioBs)],
      ],
      margin: { left: MARGIN, right: MARGIN, top: MT, bottom: MB },
      theme: 'grid',
      styles: { fontSize: fs(9), cellPadding: pad(3.5) },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 90 }, 2: { fontStyle: 'bold', cellWidth: 90 } },
    });
    // @ts-expect-error lastAutoTable lo agrega el plugin en runtime
    y = (doc.lastAutoTable?.finalY ?? y) + gap(10);

    // Los montos del pie (totales y neto) alineados a la derecha como los del cuerpo.
    const der = (texto: string) => ({ content: texto, styles: { halign: 'right' as const } });
    const pctSueldo = Number(r.sueldo_pct);
    const pctBono = Number.isFinite(pctSueldo) && pctSueldo > 0 ? Math.round(100 - pctSueldo) : null;
    type FootCell = string | { content: string; colSpan?: number; styles: { halign: 'right' } };
    let conformidad: string;

    if (!esBono) {
      // ── Recibo 1: el sueldo en bolívares, como en la planilla (solo Bs) ──
      const linea = (item: number, concepto: string, bs: number, columna: 'devengado' | 'deduccion'): string[] =>
        [String(item), concepto, columna === 'devengado' ? bsStr(bs) : '', columna === 'deduccion' ? bsStr(bs) : ''];
      const footSueldo: FootCell[][] = [
        ['', 'TOTALES', der(bsStr(m.netoBs)), der(bsStr(0))],
        ['', 'NETO A RECIBIR EN BOLÍVARES', der(bsStr(m.netoBs)), ''],
      ];
      if (m.esOtraMoneda && m.moneda !== 'Bs' && m.tasa > 0) {
        footSueldo.push(['', 'CONVERSIÓN EN $ AL CAMBIO', der(usd(m.netoBsEnUsd)), '']);
      }
      autoTable(doc, {
        startY: y,
        head: [['#', 'CONCEPTO', 'DEVENGADO Bs', 'DEDUCCIÓN Bs']],
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
        foot: footSueldo,
        margin: { left: MARGIN, right: MARGIN, top: MT, bottom: MB },
        theme: 'grid',
        styles: { fontSize: fs(8.5), cellPadding: pad(2.5) },
        headStyles: { fillColor: [255, 138, 0], textColor: 255, fontStyle: 'bold', halign: 'center' },
        footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 18, halign: 'center' },
          2: { halign: 'right', cellWidth: 110 },
          3: { halign: 'right', cellWidth: 110 },
        },
      });
      // @ts-expect-error lastAutoTable lo agrega el plugin en runtime
      y = (doc.lastAutoTable?.finalY ?? y) + gap(8);
      // Texto dictado por RRHH (15/10/2026): monto en Bs, que es la totalidad del
      // salario del período, sin porcentajes del total acordado (eso es en $).
      const desde = meta.periodo.periodo_desde ? fmtDate(meta.periodo.periodo_desde) : '';
      const hasta = meta.periodo.periodo_hasta ? fmtDate(meta.periodo.periodo_hasta) : '';
      const periodoTexto = desde && hasta ? `al período del ${desde} al ${hasta}` : desde ? `al período del ${desde}` : 'al período indicado';
      conformidad = `Certifico haber recibido la cantidad de ${bsStr(m.netoBs)}, que conforma la totalidad de mi salario correspondiente ${periodoTexto}, y firmo en señal de conformidad.`;
    } else {
      // ── Recibo 2: bonificación, menos préstamos y anticipos ──
      const simb = m.simbolo;
      const nPrest = (r.deducciones ?? []).filter((d) => d.tipo === 'prestamo').length;
      const nAnt = (r.deducciones ?? []).filter((d) => d.tipo === 'anticipo').length;
      const real = m.esReal;
      const fila = (item: number, concepto: string, monto: number, columna: 'asignacion' | 'deduccion', montoBrl = 0): string[] => {
        const base = [String(item), concepto, columna === 'asignacion' ? fmtMontoMoneda(monto, simb) : '', columna === 'deduccion' ? (monto > 0 ? `− ${fmtMontoMoneda(monto, simb)}` : fmtMontoMoneda(0, simb)) : ''];
        if (!real) return base;
        return [...base, columna === 'asignacion' ? reales(montoBrl) : '', columna === 'deduccion' ? (montoBrl > 0 ? `− ${reales(montoBrl)}` : reales(0)) : ''];
      };
      const descTotalBrl = m.prestamosBrl + m.anticiposBrl;
      const footBono: FootCell[][] = [
        ['', 'TOTALES', der(fmtMontoMoneda(m.bonoBrutoMonto, simb)), der(m.prestamosMonto + m.anticiposMonto > 0 ? `− ${fmtMontoMoneda(m.prestamosMonto + m.anticiposMonto, simb)}` : fmtMontoMoneda(0, simb))],
        ['', `NETO A RECIBIR EN ${m.moneda === 'Bs' ? 'BOLÍVARES' : m.moneda === 'USD' ? 'DIVISAS' : m.moneda}`, der(fmtMontoMoneda(m.bonoNetoMonto, simb)), ''],
      ];
      if (m.esOtraMoneda) {
        footBono.push(['', 'CONVERSIÓN EN $ AL CAMBIO', der(usd(m.equivalenteUsd)), '']);
      }
      if (real) {
        // Las dos monedas en el pie: totales y neto en $ y en R$, y la tasa que los une.
        footBono[0].push(der(reales(m.bonoBrutoBrl)), der(descTotalBrl > 0 ? `− ${reales(descTotalBrl)}` : reales(0)));
        footBono[1] = ['', 'NETO A RECIBIR EN DIVISAS ($ y R$)', der(fmtMontoMoneda(m.bonoNetoMonto, simb)), '', der(reales(m.bonoNetoBrl)), ''];
        const fechaTasa = meta.periodo.tasa_brl_fecha ? ` (${fmtDate(meta.periodo.tasa_brl_fecha)})` : '';
        footBono.push(['', 'TASA DE CAMBIO', { content: `1 $ = R$ ${tasaRealTexto(m.tasaBrl)}${fechaTasa}`, colSpan: 4, styles: { halign: 'right' } }]);
      }
      autoTable(doc, {
        startY: y,
        head: [real
          ? ['#', 'CONCEPTO', `ASIGNACIÓN ${simb}`, `DESCUENTO ${simb}`, 'ASIGNACIÓN R$', 'DESCUENTO R$']
          : ['#', 'CONCEPTO', `ASIGNACIÓN ${simb}`, `DESCUENTO ${simb}`]],
        body: [
          fila(1, pctBono != null ? `Bono de la quincena (${pctBono} % del total acordado)` : 'Bono de la quincena', m.bonoMonto, 'asignacion', m.bonoBrl),
          fila(2, 'Asignaciones adicionales', m.asignacionesMonto, 'asignacion', m.asignacionesBrl),
          fila(3, nPrest > 1 ? `Préstamos (${nPrest})` : 'Préstamos', m.prestamosMonto, 'deduccion', m.prestamosBrl),
          fila(4, nAnt > 1 ? `Anticipos (${nAnt})` : 'Anticipos', m.anticiposMonto, 'deduccion', m.anticiposBrl),
          fila(5, 'Otros descuentos', 0, 'deduccion', 0),
        ],
        foot: footBono,
        margin: { left: MARGIN, right: MARGIN, top: MT, bottom: MB },
        theme: 'grid',
        styles: { fontSize: fs(real ? 8 : 8.5), cellPadding: pad(3) },
        headStyles: { fillColor: [60, 60, 60], textColor: 255, fontStyle: 'bold', halign: 'center' },
        footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
        columnStyles: real
          ? {
              0: { cellWidth: 16, halign: 'center' },
              2: { halign: 'right', cellWidth: 68 },
              3: { halign: 'right', cellWidth: 68 },
              4: { halign: 'right', cellWidth: 74 },
              5: { halign: 'right', cellWidth: 74 },
            }
          : {
              0: { cellWidth: 18, halign: 'center' },
              2: { halign: 'right', cellWidth: 104 },
              3: { halign: 'right', cellWidth: 104 },
            },
      });
      // @ts-expect-error lastAutoTable lo agrega el plugin en runtime
      y = (doc.lastAutoTable?.finalY ?? y) + gap(6);
      if (m.prestamosMonto + m.anticiposMonto > 0) {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(fs(7.5)); doc.setTextColor(100);
        doc.text(`Los préstamos y anticipos se descuentan de la bonificación en ${m.moneda}, no del pago en bolívares.`, MARGIN, y + 4);
        doc.setTextColor(0);
        y += 10;
      }
      if (m.esOtraMoneda) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(fs(8)); doc.setTextColor(30, 41, 59);
        const notaCambio = `Conversión en $ al cambio: Monto equivalente = ${usd(m.equivalenteUsd)}${m.moneda === 'Bs' && m.tasa > 0 ? ` · Tasa de cambio BCV: ${m.tasa.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs/$` : ''}`;
        doc.text(notaCambio, MARGIN, y + 4);
        doc.setTextColor(0);
        y += 10;
      }
      const descuentos = [
        m.prestamosMonto > 0 ? `${fmtMontoMoneda(m.prestamosMonto, simb)} de préstamos` : null,
        m.anticiposMonto > 0 ? `${fmtMontoMoneda(m.anticiposMonto, simb)} de anticipos` : null,
      ].filter(Boolean).join(' y ');
      const descMoneda = m.esReal
        ? ` en divisas (equivalente a ${reales(m.bonoNetoBrl)} en Real brasileño, a la tasa de cambio de 1 $ = R$ ${tasaRealTexto(m.tasaBrl)})`
        : m.esOtraMoneda
        ? ` en ${m.moneda === 'Bs' ? 'bolívares' : m.moneda} (conversión al cambio: ${usd(m.equivalenteUsd)}${m.moneda === 'Bs' && m.tasa > 0 ? ` a tasa Bs ${m.tasa.toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : ''})`
        : ' en divisas';
      conformidad = `Certifico haber recibido la cantidad de ${fmtMontoMoneda(m.bonoNetoMonto, simb)}${descMoneda} por concepto de bonificación`
        + (m.asignacionesMonto > 0 ? ' y asignaciones' : '')
        + ' correspondiente al período que se indica en el mismo'
        + (descuentos ? `, una vez descontados ${descuentos}` : '')
        + ', y firmo en señal de conformidad.';
    }

    // (15/10/2026) Ya no va el cuadro «Total de la quincena (los dos recibos)»: mezclaba
    // Bs y $, y cada recibo sale solo en su moneda.

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
    // Una sola firma, la de la persona, centrada (15/10/2026: se quitó la de RRHH).
    const colW = (PAGE_W - MARGIN * 2 - 40) / 2;
    const cx = PAGE_W / 2;
    doc.setDrawColor(120); doc.setLineWidth(0.7);
    doc.line(cx - colW / 2, fy, cx + colW / 2, fy);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('Firma de la persona', cx, fy + 13, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90);
    doc.text(`${r.nombre}${cedula ? ' · C.I. ' + cedula : ''}`, cx, fy + BAJO_LA_RAYA, { align: 'center' });
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
