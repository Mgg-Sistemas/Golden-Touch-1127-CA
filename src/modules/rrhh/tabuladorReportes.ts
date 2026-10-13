/* ============================================================
   Golden Touch · RRHH · Tabulador de sueldos por cargo (PDF y Excel)

   Cada cargo con su sueldo ANTERIOR y el NUEVO, la variación, cuántos
   activos lo tienen y el costo mensual de los activos antes y después.
   Sirve para la propuesta (lo que se está escribiendo en «Tabulador desde
   los cargos», antes de guardar) y para el tabulador vigente.

   Mismo estilo que los históricos salariales: logo de la empresa, márgenes
   de 2 cm, cabecera naranja y vista previa antes de bajar. Todo el texto del
   PDF pasa por `pdfSafe`.
   ============================================================ */
import type { EmpresaRrhh } from '@/shared/lib/types';
import { previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import { etiquetaVariacion, variacionSueldo } from './sueldos';
import { totalesReporteTabulador, type FilaReporteTabulador } from './tabulador';
import { bajarExcel } from './historialSalarialReportes';

const MARGIN = 56.69; // 2 cm por lado

const usd = (v: number | null | undefined) =>
  `$ ${Number(v ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hoy = () => new Date().toISOString().slice(0, 10);

export interface OpcionesReporteTabulador {
  empresa: EmpresaRrhh;
  /** «propuesta» = lo que se está armando (sin guardar); «vigente» = lo guardado. */
  tipo: 'propuesta' | 'vigente';
  motivo?: string | null;
}

const titulo = (o: OpcionesReporteTabulador) =>
  o.tipo === 'propuesta' ? 'TABULADOR DE SUELDOS POR CARGO · PROPUESTA' : 'TABULADOR DE SUELDOS POR CARGO';

function variacionTexto(f: FilaReporteTabulador): string {
  if (f.anterior == null) return 'Sin anterior';
  return etiquetaVariacion(variacionSueldo(f.anterior, f.nuevo));
}

/** «hoy ganan $ 280,00 – $ 300,00» cuando los activos del cargo no ganan lo mismo. */
function rangoHoy(f: FilaReporteTabulador): string {
  if (f.minHoy == null || f.maxHoy == null || f.minHoy === f.maxHoy) return '';
  return `hoy: ${usd(f.minHoy)} – ${usd(f.maxHoy)}`;
}

function subtitulo(filas: FilaReporteTabulador[], o: OpcionesReporteTabulador): string {
  const cambian = filas.filter((f) => f.anterior != null && f.anterior !== f.nuevo).length;
  return [`Nómina ${o.empresa}`, `${filas.length} cargo(s)`, `${cambian} con sueldo nuevo`, o.motivo?.trim() ? `Motivo: ${o.motivo.trim()}` : '']
    .filter(Boolean).join('  ·  ');
}

/* ---------------- PDF ---------------- */

export async function descargarTabuladorPdf(filas: FilaReporteTabulador[], o: OpcionesReporteTabulador): Promise<void> {
  if (!filas.length) throw new Error('No hay cargos para imprimir.');
  const [{ jsPDF }, { default: autoTable }, { loadLogoPdfEmpresa, dibujarLogoPdf, anchoLogoPdf }, { identidadEmpresa }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/pdfLogo'),
    import('@/shared/lib/empresa'),
  ]);
  const emp = identidadEmpresa(o.empresa);
  const logo = await loadLogoPdfEmpresa(o.empresa).catch(() => null);
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  let y = MARGIN;
  const caja = 44;
  if (logo) dibujarLogoPdf(doc, logo, MARGIN, y, caja);
  const xTexto = logo ? MARGIN + anchoLogoPdf(caja) + 14 : MARGIN;

  doc.setTextColor(255, 138, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text(pdfSafe(titulo(o)), xTexto, y + 16, { maxWidth: W - MARGIN - xTexto });
  doc.setTextColor(80, 80, 80); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.text(pdfSafe(`${emp.nombre}  ·  RIF ${emp.rif}`), xTexto, y + 30);
  doc.text(pdfSafe(subtitulo(filas, o)), xTexto, y + 42, { maxWidth: W - MARGIN - xTexto });
  doc.setTextColor(0, 0, 0);
  y += caja + 20;

  const tot = totalesReporteTabulador(filas);
  const vTot = variacionSueldo(tot.antes, tot.despues);
  autoTable(doc, {
    startY: y,
    head: [['N°', 'CARGO', 'ACTIVOS', 'SUELDO ANTERIOR', 'SUELDO NUEVO', 'VARIACIÓN', 'NOTA'].map(pdfSafe)],
    body: filas.map((f, i) => {
      const rango = rangoHoy(f);
      return [
        String(i + 1),
        pdfSafe(f.cargo),
        String(f.activos),
        pdfSafe(`${f.anterior == null ? '-' : usd(f.anterior)}${rango ? `\n${rango}` : ''}`),
        usd(f.nuevo),
        pdfSafe(variacionTexto(f)),
        pdfSafe(f.nota?.trim() || ''),
      ];
    }),
    foot: [[
      '', pdfSafe('COSTO MENSUAL DE LOS ACTIVOS'), String(tot.activos), usd(tot.antes), usd(tot.despues),
      pdfSafe(etiquetaVariacion(vTot)), '',
    ]],
    showFoot: 'lastPage',
    styles: { fontSize: 8, cellPadding: 3.5, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: [255, 138, 0], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 7.5 },
    footStyles: { fillColor: [245, 238, 228], textColor: [40, 40, 40], fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: [250, 246, 240] },
    columnStyles: {
      0: { cellWidth: 24, halign: 'center' },
      1: { cellWidth: 'auto', fontStyle: 'bold' },
      2: { cellWidth: 42, halign: 'center' },
      3: { cellWidth: 82, halign: 'right' },
      4: { cellWidth: 70, halign: 'right' },
      5: { cellWidth: 88, halign: 'right' },
      6: { cellWidth: 80, fontSize: 7 },
    },
    didParseCell: (d) => {
      // El sueldo nuevo resalta; la variación en verde si sube y en ámbar si baja.
      if (d.section === 'body' && d.column.index === 4) d.cell.styles.fontStyle = 'bold';
      if (d.section === 'body' && d.column.index === 5) {
        const f = filas[d.row.index];
        if (f && f.anterior != null && f.nuevo !== f.anterior) d.cell.styles.textColor = f.nuevo > f.anterior ? [22, 128, 61] : [180, 83, 9];
      }
      if (d.section === 'foot' && (d.column.index === 3 || d.column.index === 4 || d.column.index === 5)) d.cell.styles.halign = 'right';
    },
    margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: MARGIN },
    didDrawPage: () => {
      doc.setFontSize(7); doc.setTextColor(120, 120, 120);
      doc.text(pdfSafe(`Página ${doc.getNumberOfPages()}  ·  Generado ${new Date().toLocaleString('es-VE')}`),
        W - MARGIN, H - MARGIN / 2, { align: 'right' });
      doc.setTextColor(0, 0, 0);
    },
  });

  // @ts-expect-error lastAutoTable lo agrega el plugin
  let fin = (doc.lastAutoTable?.finalY ?? y) as number;
  const nota = o.tipo === 'propuesta'
    ? 'Sueldo mensual total acordado por cargo, en dolares. "Sueldo anterior" es el del tabulador o, si el cargo no estaba, el que mas se repite entre sus activos ("hoy" indica cuando no todos ganan lo mismo). Es una propuesta: no cambia el sueldo de nadie hasta guardarla y usar "Aplicar tabulador".'
    : 'Sueldo mensual total acordado por cargo, en dolares. "Sueldo anterior" es el monto que tenia el cargo antes de su ultimo cambio en el tabulador. El costo mensual es activos x sueldo.';
  doc.setFontSize(7); doc.setTextColor(110, 110, 110);
  const lineas = doc.splitTextToSize(pdfSafe(nota), W - MARGIN * 2) as string[];
  if (fin + 16 + lineas.length * 9 > H - MARGIN) { doc.addPage(); fin = MARGIN; }
  doc.text(lineas, MARGIN, fin + 16);
  fin += 16 + lineas.length * 9;
  doc.setTextColor(0, 0, 0);

  // Firmas: quien lo elabora, quien lo revisa y quien lo aprueba.
  if (fin + 80 > H - MARGIN) { doc.addPage(); fin = MARGIN; }
  const yFirma = fin + 60;
  const ancho = (W - MARGIN * 2 - 40) / 3;
  ['Elaborado por', 'Revisado por', 'Aprobado por'].forEach((t, i) => {
    const x = MARGIN + i * (ancho + 20);
    doc.setDrawColor(120, 120, 120); doc.line(x, yFirma, x + ancho, yFirma);
    doc.setFontSize(8); doc.text(pdfSafe(t), x + ancho / 2, yFirma + 11, { align: 'center' });
  });

  previewPdf(doc, `tabulador-${o.tipo}-${o.empresa.toLowerCase()}-${hoy()}.pdf`);
}

/* ---------------- Excel ---------------- */

export async function descargarTabuladorExcel(filas: FilaReporteTabulador[], o: OpcionesReporteTabulador): Promise<void> {
  if (!filas.length) throw new Error('No hay cargos para exportar.');
  const tot = totalesReporteTabulador(filas);
  const vTot = variacionSueldo(tot.antes, tot.despues);
  const pct = (p: number | null) => (p == null ? '' : `${p.toLocaleString('es-VE')}%`);
  await bajarExcel({
    titulo: titulo(o),
    empresa: o.empresa,
    subtitulo: subtitulo(filas, o).replace(/ {2}·/g, ' ·').replace(/· {2}/g, '· '),
    hoja: 'Tabulador',
    encabezados: ['N°', 'Cargo', 'Activos', 'Sueldo anterior (USD)', 'Sueldo nuevo (USD)', 'Variación (USD)', 'Variación (%)',
      'Sueldo hoy mínimo (USD)', 'Sueldo hoy máximo (USD)', 'Nota'],
    anchos: [6, 32, 10, 16, 16, 14, 12, 16, 16, 34],
    filas: [
      ...filas.map((f, i) => {
        const v = variacionSueldo(f.anterior, f.nuevo);
        return [
          i + 1, f.cargo, f.activos,
          f.anterior == null ? null : f.anterior,
          f.nuevo,
          f.anterior == null ? null : v.monto,
          f.anterior == null ? '' : pct(v.porcentaje),
          f.minHoy ?? null, f.maxHoy ?? null,
          f.nota ?? '',
        ];
      }),
      [null, 'COSTO MENSUAL DE LOS ACTIVOS', tot.activos, tot.antes, tot.despues, vTot.monto, pct(vTot.porcentaje), null, null, 'Activos × sueldo'],
    ],
    montos: [3, 4, 5, 7, 8],
    negritas: [filas.length],
    archivo: `tabulador-${o.tipo}-${o.empresa.toLowerCase()}-${hoy()}.xlsx`,
  });
}
