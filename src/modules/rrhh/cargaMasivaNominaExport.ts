/* ============================================================
   Golden Touch · RRHH · Exportador Carga Masiva - Nómina
   (19/11/2026)

   Genera los 4 formatos oficiales para «CARGA MASIVA - NOMINA»
   (Banco del Tesoro 0163 · Moneda Nacional · 44 columnas A..AR):
     1. Excel (.xlsx): Hoja "MODELO" fiel a la plantilla oficial (encabezado
        combinado + datos desde fila 14 en formato texto '@'), hoja
        "TABLA_PLANA" (fila 1 encabezados + fila 2 datos) y hoja
        "AUDITORIA_RRHH" con descripciones legibles de cada código.
     2. CSV (.csv): Delimitado con punto y coma (;), UTF-8 BOM, ceros a la
        izquierda preservados.
     3. TXT (.txt): Archivo plano bancario con separador configurable
        (;, |, TAB o ancho fijo continuo) y saltos CRLF (\r\n).
     4. PDF (.pdf): Reporte institucional horizontal con membrete, KPIs del
        lote y tabla completa de correlativos, códigos y tramas de 15 dígitos.
   ============================================================ */

import { previewExcelArchivo, previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import { identidadEmpresa } from '@/shared/lib/empresa';
import { loadLogoPdfEmpresa, dibujarLogoPdf, anchoLogoPdf } from '@/shared/lib/pdfLogo';
import { formatearBs } from './personalMoldeable';
import {
  CATALOGO_OFICINAS_TESORO,
  CATALOGO_TIPO_CUENTA,
  CATALOGO_TIPO_NOMINA,
  CATALOGO_TIPO_SOLICITUD,
  COLUMNAS_CARGA_MASIVA_NOMINA,
  serializarCargaMasivaCsv,
  serializarCargaMasivaTxt,
  type ConfigCargaMasivaNomina,
  type FilaCargaMasivaNomina,
} from './cargaMasivaNomina';

const NARANJA: [number, number, number] = [255, 138, 0];
const TINTA: [number, number, number] = [30, 41, 59];
const BORDE: [number, number, number] = [203, 213, 225];
const FONDO_ALT: [number, number, number] = [250, 246, 240];

const hoyStr = () => new Date().toISOString().slice(0, 10);

export interface MetadatosCargaMasivaExport {
  empresaPrincipal?: string | null;
  tasaBsFecha?: string | null;
  subtituloFiltros?: string;
}

function sufijoEmpresa(empresaPrincipal?: string | null): string {
  return empresaPrincipal && empresaPrincipal !== 'TODAS'
    ? `${empresaPrincipal.toLowerCase()}-`
    : '';
}

function dispararDescargaBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ============================================================
   1. EXCEL (.xlsx) — Plantilla Oficial MODELO + Tabla Plana + Auditoría
   ============================================================ */

export async function descargarCargaMasivaExcel(
  filas: FilaCargaMasivaNomina[],
  config: ConfigCargaMasivaNomina,
  meta?: MetadatosCargaMasivaExport,
): Promise<void> {
  if (!filas.length) throw new Error('No hay trabajadores seleccionados para exportar.');

  const [{ default: ExcelJS }] = await Promise.all([import('exceljs')]);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Golden Touch 1127 C.A.';
  wb.created = new Date();

  const emp = identidadEmpresa(meta?.empresaPrincipal || 'GT');
  const esMulti = !meta?.empresaPrincipal || meta.empresaPrincipal === 'TODAS';

  /* ───── Hoja 1: MODELO (fiel al .xls bancario: encabezados 1..10, datos fila 14+) ───── */
  const wsModelo = wb.addWorksheet('MODELO', {
    views: [{ showGridLines: true, state: 'frozen', ySplit: 13 }],
  });

  COLUMNAS_CARGA_MASIVA_NOMINA.forEach((col, i) => {
    const c = wsModelo.getColumn(i + 1);
    c.width = Math.max(12, Math.min(34, Math.max(col.anchoFijo + 4, Math.ceil(col.tituloPlanilla.length * 0.55))));
    c.numFmt = '@';
  });

  // Combinar filas 1..10 por cada una de las 44 columnas como la plantilla original
  COLUMNAS_CARGA_MASIVA_NOMINA.forEach((col, i) => {
    const colIdx = i + 1;
    wsModelo.mergeCells(1, colIdx, 10, colIdx);
    const cell = wsModelo.getCell(1, colIdx);
    cell.value = col.tituloPlanilla;
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'medium', color: { argb: 'FFFF8A00' } },
      left: { style: 'thin', color: { argb: 'FF94A3B8' } },
      right: { style: 'thin', color: { argb: 'FF94A3B8' } },
    };
  });

  // Fila 11: ejemplo referencial de la plantilla bancaria (primer registro guía)
  const filaGuia = wsModelo.getRow(11);
  filaGuia.height = 18;
  const guiaValores = filas[0].celdas;
  guiaValores.forEach((val, idx) => {
    const c = filaGuia.getCell(idx + 1);
    c.value = String(val ?? '');
    c.numFmt = '@';
    c.font = { name: 'Consolas', size: 9, italic: true, color: { argb: 'FF64748B' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    c.alignment = { horizontal: COLUMNAS_CARGA_MASIVA_NOMINA[idx].alineacion, vertical: 'middle' };
  });

  // Fila 13: banda de instrucción oficial de la plantilla
  wsModelo.mergeCells(13, 1, 13, COLUMNAS_CARGA_MASIVA_NOMINA.length);
  const celdaNota = wsModelo.getCell(13, 1);
  celdaNota.value =
    'FAVOR COMPLETAR SU TABLA EN LA SIGUIENTE FILA (14) - NO MODIFICAR EL FORMATO DE ORIGEN (ESPACIOS - LETRAS)';
  celdaNota.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF1E293B' } };
  celdaNota.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
  celdaNota.alignment = { horizontal: 'left', vertical: 'middle' };
  wsModelo.getRow(13).height = 20;

  // Filas 14+: registros reales del lote con formato texto estricto '@'
  filas.forEach((f, idxFila) => {
    const r = wsModelo.getRow(14 + idxFila);
    r.height = 19;
    f.celdas.forEach((val, idxCol) => {
      const cell = r.getCell(idxCol + 1);
      cell.value = String(val ?? '');
      cell.numFmt = '@';
      cell.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF0F172A' } };
      if (idxFila % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
      cell.alignment = {
        horizontal: COLUMNAS_CARGA_MASIVA_NOMINA[idxCol].alineacion,
        vertical: 'middle',
      };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });
  });

  /* ───── Hoja 2: TABLA_PLANA (Encabezado fila 1 + Datos fila 2 para carga directa) ───── */
  const wsPlana = wb.addWorksheet('TABLA_PLANA', {
    views: [{ showGridLines: true, state: 'frozen', ySplit: 1 }],
  });

  const headPlana = wsPlana.getRow(1);
  headPlana.height = 24;
  COLUMNAS_CARGA_MASIVA_NOMINA.forEach((col, i) => {
    const colExcel = wsPlana.getColumn(i + 1);
    colExcel.width = Math.max(12, Math.min(32, col.anchoFijo + 4));
    colExcel.numFmt = '@';

    const c = headPlana.getCell(i + 1);
    c.value = col.tituloPlanilla;
    c.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  filas.forEach((f, idxFila) => {
    const r = wsPlana.getRow(2 + idxFila);
    r.height = 18;
    f.celdas.forEach((val, idxCol) => {
      const c = r.getCell(idxCol + 1);
      c.value = String(val ?? '');
      c.numFmt = '@';
      c.alignment = { horizontal: COLUMNAS_CARGA_MASIVA_NOMINA[idxCol].alineacion, vertical: 'middle' };
    });
  });

  /* ───── Hoja 3: AUDITORIA_RRHH (Resumen legible de códigos y alertas) ───── */
  const wsAud = wb.addWorksheet('AUDITORIA_RRHH', {
    views: [{ showGridLines: true, state: 'frozen', ySplit: 4 }],
  });

  wsAud.mergeCells('A1:L1');
  const titAud = wsAud.getCell('A1');
  titAud.value = esMulti
    ? 'AUDITORÍA DE LOTE · CARGA MASIVA - NÓMINA · GRUPO GOLDEN TOUCH'
    : `AUDITORÍA DE LOTE · CARGA MASIVA - NÓMINA · ${emp.nombre}`;
  titAud.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFF8A00' } };

  wsAud.mergeCells('A2:L2');
  const subAud = wsAud.getCell('A2');
  const totalBs = filas.reduce((acc, f) => acc + f.montoBs, 0);
  subAud.value = `Fecha: ${hoyStr()}  |  Banco: ${config.numeroBanco}  |  Oficina: ${config.oficinaPrincipal}  |  Cuenta: ${config.tipoCuenta}  |  Nómina: ${config.tipoNomina}  |  Registros: ${filas.length}  |  Masa Bs: ${formatearBs(totalBs)}`;
  subAud.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF64748B' } };

  const colsAud = [
    { h: 'Correlativo', w: 13 },
    { h: 'Empresa', w: 10 },
    { h: 'Doc / Cédula 15 díg.', w: 21 },
    { h: 'Trabajador', w: 30 },
    { h: 'Cargo Real -> Cód. Banco', w: 32 },
    { h: 'Profesión -> Cód. Banco', w: 30 },
    { h: 'Ubicación (Reg·Edo·Ciu·Mun·Parr)', w: 28 },
    { h: 'Celular', w: 15 },
    { h: 'Sueldo Base ($)', w: 15 },
    { h: 'Sueldo Básico (Bs)', w: 18 },
    { h: 'Trama Sueldo (15 díg.)', w: 20 },
    { h: 'Validación / Alertas', w: 28 },
  ];

  const rHeadAud = wsAud.getRow(4);
  rHeadAud.height = 22;
  colsAud.forEach((col, i) => {
    wsAud.getColumn(i + 1).width = col.w;
    const c = rHeadAud.getCell(i + 1);
    c.value = col.h;
    c.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF8A00' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  filas.forEach((f, idx) => {
    const r = wsAud.getRow(5 + idx);
    r.height = 19;
    r.getCell(1).value = f.campos.correlativo_cliente;
    r.getCell(1).numFmt = '@';
    r.getCell(2).value = f.empresa;
    r.getCell(3).value = `${f.campos.tipo_documento}-${f.campos.numero_cedula}`;
    r.getCell(4).value = f.nombreCompleto;
    r.getCell(5).value = `${f.cargoOriginal} -> ${f.campos.tipo_cargo} (${f.cargoCatalogoDesc})`;
    r.getCell(6).value = `${f.campos.profesion} (${f.profesionCatalogoDesc})`;
    r.getCell(7).value = `${f.campos.region}·${f.campos.estado}·${f.campos.ciudad}·${f.campos.municipio}·${f.campos.parroquia}`;
    r.getCell(8).value = f.campos.telefono_celular;
    r.getCell(8).numFmt = '@';
    r.getCell(9).value = f.sueldoUsd;
    r.getCell(9).numFmt = '"$"#,##0.00';
    r.getCell(10).value = f.montoBs;
    r.getCell(10).numFmt = '"Bs "#,##0.00';
    r.getCell(11).value = f.campos.sueldo_basico;
    r.getCell(11).numFmt = '@';
    r.getCell(12).value = f.alertas.length ? f.alertas.join(', ') : 'OK';
    r.getCell(12).font = {
      name: 'Calibri',
      size: 9,
      bold: f.alertas.length > 0,
      color: { argb: f.alertas.length > 0 ? 'FFB45309' : 'FF15803D' },
    };
  });

  /* ───── Hoja 4: Hoja1 (Formato Resumen TXT: Ref 10 · Cédula V+9 · Cuenta 20 · Monto 15) ───── */
  const wsHoja1 = wb.addWorksheet('Hoja1', {
    views: [{ showGridLines: true, state: 'frozen', ySplit: 1 }],
  });

  const colsH1 = [
    { h: 'REFERENCIA (10 DÍG.)', w: 18 },
    { h: 'CÉDULA (V+9 DÍG.)', w: 18 },
    { h: 'CUENTA BANCARIA NÓMINA (20 DÍG.)', w: 26 },
    { h: 'MONTO BS (15 DÍG.)', w: 22 },
  ];
  const headH1 = wsHoja1.getRow(1);
  headH1.height = 22;
  colsH1.forEach((col, i) => {
    const colExcel = wsHoja1.getColumn(i + 1);
    colExcel.width = col.w;
    colExcel.numFmt = '@';
    const c = headH1.getCell(i + 1);
    c.value = col.h;
    c.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  filas.forEach((f, idx) => {
    const r = wsHoja1.getRow(2 + idx);
    r.height = 18;
    const vals = [f.resumenTxt.referencia10, f.resumenTxt.cedula10, f.resumenTxt.cuenta20, f.resumenTxt.monto15];
    vals.forEach((v, ci) => {
      const cell = r.getCell(ci + 1);
      cell.value = v || null;
      cell.numFmt = '@';
      cell.font = { name: 'Consolas', size: 9.5 };
      cell.alignment = { horizontal: ci === 3 ? 'right' : 'center', vertical: 'middle' };
    });
  });

  const bytes = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  await previewExcelArchivo(
    bytes,
    `rrhh-${sufijoEmpresa(meta?.empresaPrincipal)}carga-masiva-nomina-${hoyStr()}.xlsx`,
  );
}

/* ============================================================
   2. CSV (.csv) — Punto y coma + UTF-8 BOM + ceros preservados
   ============================================================ */

export function descargarCargaMasivaCsv(
  filas: FilaCargaMasivaNomina[],
  config: ConfigCargaMasivaNomina,
  meta?: MetadatosCargaMasivaExport,
): void {
  if (!filas.length) throw new Error('No hay trabajadores seleccionados para exportar.');
  const contenido = serializarCargaMasivaCsv(filas, config.incluirEncabezadoPlano);
  const blob = new Blob(['\uFEFF' + contenido], { type: 'text/csv;charset=utf-8' });
  dispararDescargaBlob(
    blob,
    `rrhh-${sufijoEmpresa(meta?.empresaPrincipal)}carga-masiva-nomina-${hoyStr()}.csv`,
  );
}

/* ============================================================
   3. TXT (.txt) — Archivo plano bancario (;, |, TAB o ancho fijo)
   ============================================================ */

export function descargarCargaMasivaTxt(
  filas: FilaCargaMasivaNomina[],
  config: ConfigCargaMasivaNomina,
  meta?: MetadatosCargaMasivaExport,
): void {
  if (!filas.length) throw new Error('No hay trabajadores seleccionados para exportar.');
  const contenido = serializarCargaMasivaTxt(filas, {
    modo: config.modoContenidoTxt ?? 'resumen_hoja1',
    separador: config.separadorTxt,
    incluirEncabezado: config.incluirEncabezadoPlano,
  });
  const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
  dispararDescargaBlob(
    blob,
    `rrhh-${sufijoEmpresa(meta?.empresaPrincipal)}carga-masiva-nomina-${hoyStr()}.txt`,
  );
}

/* ============================================================
   4. PDF (.pdf) — Reporte Institucional Apaisado de Carga Masiva
   ============================================================ */

export async function descargarCargaMasivaPdf(
  filas: FilaCargaMasivaNomina[],
  config: ConfigCargaMasivaNomina,
  meta?: MetadatosCargaMasivaExport,
): Promise<void> {
  if (!filas.length) throw new Error('No hay trabajadores seleccionados para exportar.');

  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 28;
  const UW = W - M * 2;
  let y = M;

  const emp = identidadEmpresa(meta?.empresaPrincipal || 'GT');
  const esMulti = !meta?.empresaPrincipal || meta.empresaPrincipal === 'TODAS';
  const logo = await loadLogoPdfEmpresa(esMulti ? 'GT' : meta?.empresaPrincipal).catch(() => null);

  if (logo) {
    dibujarLogoPdf(doc, logo, M, y, 36);
  }
  const logoW = logo ? anchoLogoPdf(36) + 10 : 0;
  const tx = M + logoW;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...NARANJA);
  const titulo = esMulti
    ? 'CARGA MASIVA - NOMINA · GRUPO GOLDEN TOUCH'
    : `CARGA MASIVA - NOMINA · ${emp.nombre}`;
  doc.text(pdfSafe(titulo), tx, y + 13);

  const oficNombre =
    CATALOGO_OFICINAS_TESORO.find((o) => o.codigo === config.oficinaPrincipal)?.descripcion ||
    config.oficinaPrincipal;
  const ctaNombre =
    CATALOGO_TIPO_CUENTA.find((c) => c.codigo === config.tipoCuenta)?.descripcion || config.tipoCuenta;
  const nomNombre =
    CATALOGO_TIPO_NOMINA.find((n) => n.codigo === config.tipoNomina)?.descripcion || config.tipoNomina;
  const solNombre =
    CATALOGO_TIPO_SOLICITUD.find((s) => s.codigo === config.tipoSolicitud)?.descripcion ||
    config.tipoSolicitud;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.3);
  doc.setTextColor(100, 116, 139);
  const lineaSub = `${esMulti ? 'CONSOLIDADO MULTI-EMPRESA' : `RIF ${emp.rif}`} · Banco ${config.numeroBanco} · Oficina ${config.oficinaPrincipal} (${oficNombre}) · ${config.tipoCuenta} (${ctaNombre}) · Nómina ${config.tipoNomina} (${nomNombre}) · Solicitud ${config.tipoSolicitud} (${solNombre}) · Emitido: ${hoyStr()}`;
  doc.text(pdfSafe(lineaSub), tx, y + 25);

  if (meta?.subtituloFiltros) {
    doc.setFontSize(6.8);
    doc.text(pdfSafe(`Filtros: ${meta.subtituloFiltros}`), tx, y + 35);
    y += 42;
  } else {
    y += 34;
  }

  doc.setDrawColor(...NARANJA);
  doc.setLineWidth(1.2);
  doc.line(M, y, W - M, y);
  y += 10;

  // Banner de 4 KPIs ejecutivos del lote
  const totalBs = filas.reduce((acc, f) => acc + f.montoBs, 0);
  const totalUsd = filas.reduce((acc, f) => acc + f.sueldoUsd, 0);
  const conAlertas = filas.filter((f) => f.alertas.length > 0).length;
  const primerCorr = filas[0]?.campos.correlativo_cliente ?? '0000001';
  const ultimoCorr = filas[filas.length - 1]?.campos.correlativo_cliente ?? primerCorr;

  const kpis = [
    {
      t: 'TRABAJADORES EN LOTE',
      v: `${filas.length}`,
      s: conAlertas > 0 ? `${filas.length - conAlertas} completos · ${conAlertas} con alertas` : '100% registros completos',
    },
    {
      t: 'CORRELATIVOS CLIENTE',
      v: `${primerCorr} - ${ultimoCorr}`,
      s: `Industria ${filas[0]?.campos.codigo_industria ?? '0902'} · Solicitud ${config.tipoSolicitud}`,
    },
    {
      t: 'DESTINO BANCARIO',
      v: `${config.numeroBanco} · Ofic. ${config.oficinaPrincipal}`,
      s: `${oficNombre} · Cta ${config.tipoCuenta} · Nóm ${config.tipoNomina}`,
    },
    {
      t: 'MASA SALARIAL LOTE (BS)',
      v: formatearBs(totalBs),
      s:
        config.porcionSueldo === 'monto_fijo_bs'
          ? `Monto fijo por trabajador`
          : `Base $${totalUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · Tasa ${config.tasaBs > 0 ? formatearBs(config.tasaBs) : '—'}`,
    },
  ];

  const gap = 8;
  const cardW = (UW - gap * 3) / 4;
  const cardH = 38;
  kpis.forEach((k, idx) => {
    const cx = M + idx * (cardW + gap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...BORDE);
    doc.setLineWidth(0.5);
    doc.roundedRect(cx, y, cardW, cardH, 3, 3, 'FD');
    doc.setFillColor(...NARANJA);
    doc.rect(cx, y, cardW, 2.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(100, 116, 139);
    doc.text(pdfSafe(k.t), cx + 6, y + 11);

    doc.setFontSize(9.5);
    doc.setTextColor(...TINTA);
    doc.text(pdfSafe(k.v), cx + 6, y + 23);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(100, 116, 139);
    doc.text(pdfSafe(k.s), cx + 6, y + 33);
  });

  y += cardH + 10;

  // Tabla integral con los correlativos y códigos oficiales
  const head = [
    [
      'CORREL.',
      'DOC / CÉDULA (15 DÍG.)',
      'APELLIDOS Y NOMBRES',
      'F. NAC · PAÍS · SEXO · EDO · DEP',
      'UBICACIÓN (REG·EDO·CIU·MUN·PARR·ZP)',
      'CELULAR / CORREO',
      'EDUC · PROF · CARGO',
      'INGRESO',
      'CTA · NÓM · OFIC · SOL',
      'SUELDO BS / TRAMA 15 DÍG.',
    ],
  ];

  const body = filas.map((f) => {
    const c = f.campos;
    const apellidosNombres = `${c.primer_apellido}${c.segundo_apellido ? ' ' + c.segundo_apellido : ''}, ${c.primer_nombre}${c.segundo_nombre ? ' ' + c.segundo_nombre : ''}`;
    return [
      pdfSafe(c.correlativo_cliente),
      pdfSafe(`${c.tipo_documento} · ${c.numero_cedula}`),
      pdfSafe(apellidosNombres),
      pdfSafe(`${c.fecha_nacimiento || '--------'} · ${c.nacionalidad} · ${c.sexo} · EC:${c.estado_civil} · D:${c.dependientes}`),
      pdfSafe(`${c.region}·${c.estado}·${c.ciudad}·${c.municipio}·${c.parroquia}\nZP ${c.zona_postal}`),
      pdfSafe(`${c.telefono_celular}\n${c.correo_electronico || '—'}`),
      pdfSafe(`Ed:${c.nivel_educacion} · Pr:${c.profesion}\nCg:${c.tipo_cargo} (${f.cargoCatalogoDesc})`),
      pdfSafe(c.fecha_ingreso || '--------'),
      pdfSafe(`${c.tipo_cuenta} · ${c.tipo_nomina} · Cto:${c.tipo_contrato}\nOf:${c.oficina_principal}/${c.oficina_secundaria} · ${c.tipo_solicitud}`),
      pdfSafe(`${formatearBs(f.montoBs)}\n${c.sueldo_basico}`),
    ];
  });

  autoTable(doc, {
    startY: y,
    head,
    body,
    margin: { left: M, right: M, top: 28, bottom: 28 },
    theme: 'plain',
    styles: {
      fontSize: 6.1,
      cellPadding: 2.6,
      textColor: TINTA,
      lineColor: BORDE,
      lineWidth: 0.35,
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: NARANJA,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 6.2,
      halign: 'center',
    },
    alternateRowStyles: {
      fillColor: FONDO_ALT,
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 42 },
      1: { halign: 'center', cellWidth: 78 },
      2: { halign: 'left', cellWidth: 105 },
      3: { halign: 'center', cellWidth: 82 },
      4: { halign: 'center', cellWidth: 86 },
      5: { halign: 'left', cellWidth: 92 },
      6: { halign: 'left', cellWidth: 84 },
      7: { halign: 'center', cellWidth: 44 },
      8: { halign: 'center', cellWidth: 66 },
      9: { halign: 'right', cellWidth: 77 },
    },
  });

  const totalPaginas = doc.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    const pie = `Página ${p} de ${totalPaginas}  ·  Sistema de Gestión Golden Touch  ·  RRHH · Carga Masiva - Nómina (Banco ${config.numeroBanco})`;
    doc.text(pdfSafe(pie), W / 2, H - 14, { align: 'center' });
  }

  await previewPdf(
    doc,
    `rrhh-${sufijoEmpresa(meta?.empresaPrincipal)}carga-masiva-nomina-${hoyStr()}.pdf`,
  );
}
