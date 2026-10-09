/* ============================================================
   Golden Touch · RRHH · Históricos salariales (PDF y Excel)

   · GENERAL: todos los cambios de sueldo de una nómina (o de las dos), con
     filtro de fechas sobre el día desde el que rige cada cambio.
   · INDIVIDUAL en Excel (el PDF individual es `historialSueldoPdf.ts`).

   Mismo estilo que el resto de los papeles del sistema: logo de la empresa,
   márgenes de 2 cm, cabecera de tabla naranja y vista previa antes de bajar.
   Todo el texto del PDF pasa por `pdfSafe` (la helvetica de jsPDF solo
   escribe Windows-1252).
   ============================================================ */
import type { EmpresaRrhh, Personal, PersonalSueldo } from '@/shared/lib/types';
import { previewExcelArchivo, previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import { etiquetaVariacion, variacionSueldo } from './sueldos';
import { etiquetaRango, nombreCompleto, type FilaHistorialSalarial } from './tabulador';

const MARGIN = 56.69; // 2 cm por lado

const usd = (v: number | null | undefined) =>
  `$ ${Number(v ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dia = (f: string | null | undefined) => {
  const d = String(f ?? '').slice(0, 10);
  return d.length === 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '';
};
const cuando = (f: string | null | undefined) => {
  const d = f ? new Date(f) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }) : '';
};
const hoy = () => new Date().toISOString().slice(0, 10);
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export interface FiltroReporte {
  empresa: EmpresaRrhh | 'todas';
  desde?: string | null;
  hasta?: string | null;
}

/** Con «todas» el papel lleva la identidad de GT (la empresa principal). */
const empresaDelPapel = (e: EmpresaRrhh | 'todas'): EmpresaRrhh => (e === 'MTO' ? 'MTO' : 'GT');
const nominaTexto = (e: EmpresaRrhh | 'todas') => (e === 'todas' ? 'Nóminas GT y MTO' : `Nómina ${e}`);

function variacionTexto(r: Pick<PersonalSueldo, 'sueldo_anterior' | 'sueldo_nuevo'>): string {
  if (r.sueldo_anterior == null) return 'Sueldo inicial';
  return etiquetaVariacion(variacionSueldo(r.sueldo_anterior, r.sueldo_nuevo));
}

/* ---------------- PDF general ---------------- */

export async function descargarHistorialSalarialGeneralPdf(filas: FilaHistorialSalarial[], filtro: FiltroReporte): Promise<void> {
  if (!filas.length) throw new Error('No hay cambios de sueldo en ese rango.');
  const [{ jsPDF }, { default: autoTable }, { loadLogoPdfEmpresa, dibujarLogoPdf, anchoLogoPdf }, { identidadEmpresa }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/pdfLogo'),
    import('@/shared/lib/empresa'),
  ]);
  const empresa = empresaDelPapel(filtro.empresa);
  const emp = identidadEmpresa(empresa);
  const logo = await loadLogoPdfEmpresa(empresa).catch(() => null);
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  let y = MARGIN;
  const caja = 44;
  if (logo) dibujarLogoPdf(doc, logo, MARGIN, y, caja);
  const xTexto = logo ? MARGIN + anchoLogoPdf(caja) + 14 : MARGIN;

  doc.setTextColor(255, 138, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(pdfSafe('HISTÓRICO SALARIAL GENERAL'), xTexto, y + 16);
  doc.setTextColor(80, 80, 80); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(pdfSafe(`${emp.nombre}  ·  RIF ${emp.rif}`), xTexto, y + 30);
  const personas = new Set(filas.map((r) => r.personal_id)).size;
  doc.text(pdfSafe(
    `${nominaTexto(filtro.empresa)}  ·  ${etiquetaRango(filtro.desde, filtro.hasta)}  ·  ${filas.length} cambio(s) de ${personas} persona(s)`,
  ), xTexto, y + 42);
  doc.setTextColor(0, 0, 0);
  y += caja + 18;

  const conNomina = filtro.empresa === 'todas';
  const head = ['FICHA', 'TRABAJADOR', 'C.I.', 'CARGO', ...(conNomina ? ['NÓMINA'] : []),
    'DESDE', 'ANTES', 'DESPUÉS', 'VARIACIÓN', 'MOTIVO', 'NOTA', 'REGISTRADO'];
  let anterior = '';
  const body = filas.map((r) => {
    const mismo = r.personal_id === anterior;
    anterior = r.personal_id;
    return [
      mismo ? '' : (r.persona.ficha_nro ?? ''),
      mismo ? '' : pdfSafe(nombreCompleto(r.persona) + (r.persona.activo === false ? ' (inactivo)' : '')),
      mismo ? '' : (r.persona.cedula ?? ''),
      mismo ? '' : pdfSafe(r.persona.cargo ?? ''),
      ...(conNomina ? [mismo ? '' : (r.persona.empresa ?? 'GT')] : []),
      dia(r.fecha),
      r.sueldo_anterior == null ? '-' : usd(r.sueldo_anterior),
      usd(r.sueldo_nuevo),
      pdfSafe(variacionTexto(r)),
      pdfSafe(r.motivo),
      pdfSafe(r.nota?.trim() || '-'),
      pdfSafe(`${dia(r.created_at)}${r.created_by ? `\n${r.created_by}` : ''}`),
    ];
  });
  const o = conNomina ? 1 : 0;
  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    styles: { fontSize: 7.5, cellPadding: 3, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: [255, 138, 0], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 7.5 },
    alternateRowStyles: { fillColor: [250, 246, 240] },
    columnStyles: {
      0: { cellWidth: 36, halign: 'center' },
      1: { cellWidth: 96 },
      2: { cellWidth: 52 },
      3: { cellWidth: 72 },
      ...(conNomina ? { 4: { cellWidth: 36, halign: 'center' as const } } : {}),
      [4 + o]: { cellWidth: 48, halign: 'center' },
      [5 + o]: { cellWidth: 52, halign: 'right' },
      [6 + o]: { cellWidth: 52, halign: 'right' },
      [7 + o]: { cellWidth: 64, halign: 'right' },
      [8 + o]: { cellWidth: 'auto' },
      [9 + o]: { cellWidth: 'auto' },
      [10 + o]: { cellWidth: 72, fontSize: 6.5 },
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
  const fin = (doc.lastAutoTable?.finalY ?? y) as number;
  if (fin + 30 < H - MARGIN) {
    doc.setFontSize(7); doc.setTextColor(110, 110, 110);
    doc.text(pdfSafe(
      'Sueldo base MENSUAL en dolares. "Desde" es la fecha en que empezo a regir cada sueldo; "Registrado" es cuando se cargo y quien lo cargo. '
      + 'Los cambios hechos con "Aplicar tabulador" llevan el motivo "Tabulador por cargo".',
    ), MARGIN, fin + 16, { maxWidth: W - MARGIN * 2 });
  }

  previewPdf(doc, `historico-salarial-${filtro.empresa === 'todas' ? 'gt-y-mto' : filtro.empresa.toLowerCase()}-${hoy()}.pdf`);
}

/* ---------------- Excel (general e individual) ---------------- */

interface HojaExcel {
  titulo: string;
  empresa: EmpresaRrhh;
  subtitulo: string;
  encabezados: string[];
  anchos: number[];
  filas: (string | number | null)[][];
  /** Índices (0-based) de columnas con montos. */
  montos: number[];
  archivo: string;
}

async function bajarExcel(h: HojaExcel): Promise<void> {
  const [{ default: ExcelJS }, { loadLogoDataUrl, loadLogoPdfEmpresa, LOGO_PDF_PROPORCION }, { identidadEmpresa }] = await Promise.all([
    import('exceljs'),
    import('@/shared/lib/pdfLogo'),
    import('@/shared/lib/empresa'),
  ]);
  const emp = identidadEmpresa(h.empresa);
  // GT: el logo cuadrado de siempre. MTO: su logo horizontal (no tiene versión cuadrada).
  const logo = await (h.empresa === 'MTO' ? loadLogoPdfEmpresa('MTO') : loadLogoDataUrl()).catch(() => null);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Histórico salarial', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: 'frozen', ySplit: 5 }],
  });
  ws.columns = h.anchos.map((w) => ({ width: w }));
  const ultima = h.encabezados.length;
  const borde = { style: 'thin' as const, color: { argb: 'FFBFC5CC' } };
  const bordes = { top: borde, left: borde, bottom: borde, right: borde };

  ws.getRow(1).height = 26; ws.getRow(2).height = 20; ws.getRow(3).height = 14;
  const logoAlto = 54;
  const logoAncho = h.empresa === 'MTO' ? Math.round(logoAlto * LOGO_PDF_PROPORCION) : logoAlto;
  if (logo) {
    const id = wb.addImage({ base64: logo, extension: 'jpeg' });
    ws.addImage(id, { tl: { col: 0.1, row: 0.1 }, ext: { width: logoAncho, height: logoAlto } });
  }
  let desde = 1, ocupado = 0;
  while (desde < ultima && ocupado < logoAncho + 8) { ocupado += (Number(ws.getColumn(desde).width) || 10) * 7; desde += 1; }
  desde = Math.min(Math.max(desde, 2), ultima);
  ws.mergeCells(1, desde, 1, Math.max(desde, ultima));
  ws.mergeCells(2, desde, 2, Math.max(desde, ultima));
  const t = ws.getCell(1, desde);
  t.value = `${h.titulo} · ${emp.nombre}`;
  t.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFF8A00' } };
  t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  const sub = ws.getCell(2, desde);
  sub.value = `RIF ${emp.rif} · ${h.subtitulo} · ${new Date().toLocaleString('es-VE')}`;
  sub.font = { name: 'Arial', size: 10, color: { argb: 'FF5C6673' } };
  sub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  const cab = ws.getRow(5);
  cab.values = h.encabezados;
  cab.height = 26;
  cab.eachCell((c) => {
    c.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF8A00' } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = bordes;
  });

  h.filas.forEach((f, i) => {
    const r = ws.getRow(6 + i);
    r.values = f;
    r.eachCell({ includeEmpty: true }, (c, col) => {
      c.font = { name: 'Arial', size: 10 };
      c.border = bordes;
      c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
      if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAF6F0' } };
      if (h.montos.includes(col - 1)) { c.numFmt = '#,##0.00'; c.alignment = { ...c.alignment, horizontal: 'right' }; }
    });
  });

  const bytes = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  await previewExcelArchivo(bytes, h.archivo);
}

export async function descargarHistorialSalarialGeneralExcel(filas: FilaHistorialSalarial[], filtro: FiltroReporte): Promise<void> {
  if (!filas.length) throw new Error('No hay cambios de sueldo en ese rango.');
  const conNomina = filtro.empresa === 'todas';
  const encabezados = ['Ficha', 'Trabajador', 'Cédula', 'Cargo', ...(conNomina ? ['Nómina'] : []), 'Estado',
    'Desde', 'Sueldo anterior (USD)', 'Sueldo nuevo (USD)', 'Variación (USD)', 'Variación (%)', 'Motivo', 'Nota', 'Registrado', 'Registrado por'];
  const anchos = [8, 28, 13, 24, ...(conNomina ? [9] : []), 10, 12, 14, 14, 13, 11, 28, 30, 18, 26];
  const o = conNomina ? 1 : 0;
  const personas = new Set(filas.map((r) => r.personal_id)).size;
  await bajarExcel({
    titulo: 'HISTÓRICO SALARIAL GENERAL',
    empresa: empresaDelPapel(filtro.empresa),
    subtitulo: `${nominaTexto(filtro.empresa)} · ${etiquetaRango(filtro.desde, filtro.hasta)} · ${filas.length} cambio(s) de ${personas} persona(s)`,
    encabezados,
    anchos,
    filas: filas.map((r) => {
      const v = variacionSueldo(r.sueldo_anterior, r.sueldo_nuevo);
      return [
        r.persona.ficha_nro ?? '', nombreCompleto(r.persona), r.persona.cedula ?? '', r.persona.cargo ?? '',
        ...(conNomina ? [r.persona.empresa ?? 'GT'] : []),
        r.persona.activo === false ? 'Inactivo' : 'Activo',
        dia(r.fecha),
        r.sueldo_anterior == null ? null : Number(r.sueldo_anterior),
        Number(r.sueldo_nuevo),
        r.sueldo_anterior == null ? null : v.monto,
        v.porcentaje == null ? '' : `${v.porcentaje.toLocaleString('es-VE')}%`,
        r.motivo, r.nota ?? '', cuando(r.created_at), r.created_by ?? '',
      ];
    }),
    montos: [7 + o, 8 + o, 9 + o],
    archivo: `historico-salarial-${conNomina ? 'gt-y-mto' : filtro.empresa.toLowerCase()}-${hoy()}.xlsx`,
  });
}

export async function descargarHistorialSueldoExcel(persona: Personal, filas: PersonalSueldo[]): Promise<void> {
  if (!filas.length) throw new Error('Esta persona no tiene cambios de sueldo registrados.');
  const orden = [...filas].sort((a, b) =>
    String(a.fecha).localeCompare(String(b.fecha)) || String(a.created_at).localeCompare(String(b.created_at)));
  const nombre = nombreCompleto(persona);
  const datos = [nombre, persona.cedula ? `C.I. ${persona.cedula}` : '', persona.cargo ?? '',
    `Sueldo vigente ${usd(persona.sueldo_base)}`].filter(Boolean).join(' · ');
  await bajarExcel({
    titulo: 'HISTORIAL DE SUELDO',
    empresa: persona.empresa === 'MTO' ? 'MTO' : 'GT',
    subtitulo: datos,
    encabezados: ['Desde', 'Sueldo anterior (USD)', 'Sueldo nuevo (USD)', 'Variación (USD)', 'Variación (%)', 'Motivo', 'Nota', 'Registrado', 'Registrado por'],
    anchos: [12, 16, 16, 14, 12, 30, 34, 18, 28],
    filas: orden.map((r) => {
      const v = variacionSueldo(r.sueldo_anterior, r.sueldo_nuevo);
      return [
        dia(r.fecha),
        r.sueldo_anterior == null ? null : Number(r.sueldo_anterior),
        Number(r.sueldo_nuevo),
        r.sueldo_anterior == null ? null : v.monto,
        v.porcentaje == null ? '' : `${v.porcentaje.toLocaleString('es-VE')}%`,
        r.motivo, r.nota ?? '', cuando(r.created_at), r.created_by ?? '',
      ];
    }),
    montos: [1, 2, 3],
    archivo: `historial-sueldo-${slug(nombre) || 'persona'}.xlsx`,
  });
}
