/* ============================================================
   Golden Touch · RRHH · Descargar los datos del personal (Excel / PDF)

   Se eligen con casillas QUÉ datos salen (05/10/2026, pedido del usuario):
   p. ej. solo nombre y cédula para imprimir una lista. Salen las personas
   que se están viendo en la pestaña Personal, con los filtros aplicados.

   Todo el texto del PDF pasa por `pdfSafe` (la helvetica de jsPDF solo
   escribe Windows-1252).
   ============================================================ */
import type { Personal } from '@/shared/lib/types';
import { previewExcelArchivo, previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import { EMPRESAS, ESTADOS_CIVILES, GENEROS, PARENTESCOS, edad } from './fichaPersonal';
import { GRADOS } from './instruccionYTrabajo';

export interface CampoPersonal {
  clave: string;
  etiqueta: string;
  /** Ancho relativo de la columna (Excel en caracteres; el PDF lo reparte). */
  ancho: number;
  valor: (p: Personal) => string | number;
}

const dia = (f: string | null | undefined) => {
  const d = String(f ?? '').slice(0, 10);
  return d.length === 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '';
};
const de = (lista: { valor: string; label: string }[], v: string | null | undefined) =>
  lista.find((x) => x.valor === v)?.label ?? '';
const txt = (v: string | null | undefined) => (v ?? '').trim();

/** Todos los datos que se pueden descargar, en el orden en que salen. */
export const CAMPOS_PERSONAL: CampoPersonal[] = [
  { clave: 'ficha', etiqueta: 'Ficha', ancho: 8, valor: (p) => txt(p.ficha_nro) },
  { clave: 'nombre', etiqueta: 'Nombres', ancho: 20, valor: (p) => txt(p.nombre) },
  { clave: 'apellido', etiqueta: 'Apellidos', ancho: 20, valor: (p) => txt(p.apellido) },
  { clave: 'cedula', etiqueta: 'Cédula', ancho: 13, valor: (p) => txt(p.cedula) },
  { clave: 'rif', etiqueta: 'RIF', ancho: 14, valor: (p) => txt(p.rif) },
  { clave: 'empresa', etiqueta: 'Nómina', ancho: 11, valor: (p) => EMPRESAS.find((e) => e.valor === p.empresa)?.label ?? p.empresa },
  { clave: 'cargo', etiqueta: 'Cargo', ancho: 22, valor: (p) => txt(p.cargo) },
  { clave: 'departamento', etiqueta: 'Departamento', ancho: 20, valor: (p) => txt(p.departamento) },
  { clave: 'estado', etiqueta: 'Estado', ancho: 9, valor: (p) => (p.activo ? 'Activo' : 'Inactivo') },
  { clave: 'fecha_ingreso', etiqueta: 'Fecha de ingreso', ancho: 12, valor: (p) => dia(p.fecha_ingreso) },
  { clave: 'carnet_vence', etiqueta: 'Carnet vence', ancho: 12, valor: (p) => dia(p.carnet_vence) },
  { clave: 'fecha_nacimiento', etiqueta: 'Fecha de nacimiento', ancho: 12, valor: (p) => dia(p.fecha_nacimiento) },
  { clave: 'edad', etiqueta: 'Edad', ancho: 6, valor: (p) => edad(p.fecha_nacimiento) ?? '' },
  { clave: 'genero', etiqueta: 'Género', ancho: 10, valor: (p) => de(GENEROS, p.genero) },
  { clave: 'estado_civil', etiqueta: 'Estado civil', ancho: 12, valor: (p) => de(ESTADOS_CIVILES, p.estado_civil) },
  { clave: 'nacionalidad', etiqueta: 'Nacionalidad', ancho: 13, valor: (p) => txt(p.nacionalidad) },
  { clave: 'grupo_sanguineo', etiqueta: 'Grupo sanguíneo', ancho: 9, valor: (p) => txt(p.grupo_sanguineo) },
  { clave: 'telefono', etiqueta: 'Teléfono', ancho: 14, valor: (p) => txt(p.telefono) },
  { clave: 'correo', etiqueta: 'Correo', ancho: 24, valor: (p) => txt(p.correo) },
  { clave: 'direccion', etiqueta: 'Dirección', ancho: 30, valor: (p) => txt(p.direccion) },
  { clave: 'grado_instruccion', etiqueta: 'Grado de instrucción', ancho: 13, valor: (p) => GRADOS.find((g) => g.value === p.grado_instruccion)?.label ?? '' },
  { clave: 'titulo', etiqueta: 'Título', ancho: 20, valor: (p) => txt(p.titulo_obtenido) },
  { clave: 'contacto_emergencia', etiqueta: 'Contacto de emergencia', ancho: 20, valor: (p) => txt(p.contacto_emergencia) },
  { clave: 'parentesco_emergencia', etiqueta: 'Parentesco', ancho: 10, valor: (p) => de(PARENTESCOS, p.contacto_emergencia_parentesco) },
  { clave: 'telefono_emergencia', etiqueta: 'Teléfono de emergencia', ancho: 14, valor: (p) => txt(p.telefono_emergencia) },
  { clave: 'sueldo_base', etiqueta: 'Sueldo base (USD)', ancho: 12, valor: (p) => Number(p.sueldo_base) || 0 },
];

/** Lo que viene marcado al abrir: lo del ejemplo del pedido. */
export const CAMPOS_POR_DEFECTO = ['nombre', 'apellido', 'cedula'];

/** Los campos elegidos, en el orden del catálogo (no en el orden en que se marcaron). */
export function camposElegidos(claves: string[]): CampoPersonal[] {
  const set = new Set(claves);
  return CAMPOS_PERSONAL.filter((c) => set.has(c.clave));
}

/** Tabla lista para Excel/PDF: encabezados + una fila por persona (orden: apellido, nombre). */
export function tablaPersonal(personas: Personal[], claves: string[]): { encabezados: string[]; filas: (string | number)[][] } {
  const campos = camposElegidos(claves);
  const orden = [...personas].sort((a, b) =>
    `${a.apellido ?? ''} ${a.nombre ?? ''}`.localeCompare(`${b.apellido ?? ''} ${b.nombre ?? ''}`, 'es', { sensitivity: 'base' }));
  return {
    encabezados: campos.map((c) => c.etiqueta),
    filas: orden.map((p) => campos.map((c) => c.valor(p))),
  };
}

function validar(personas: Personal[], claves: string[]) {
  if (!camposElegidos(claves).length) throw new Error('Marca al menos un dato para descargar.');
  if (!personas.length) throw new Error('No hay personas en la lista (revisa los filtros).');
}

const hoy = () => new Date().toISOString().slice(0, 10);

/**
 * Excel con el LOGO arriba a la izquierda, columna «N°» para contar y filas
 * con aire y bordes (05/10/2026). Se arma con ExcelJS porque SheetJS no
 * escribe imágenes.
 */
export async function descargarPersonalExcel(personas: Personal[], claves: string[], titulo = 'Personal'): Promise<void> {
  validar(personas, claves);
  const { encabezados, filas } = tablaPersonal(personas, claves);
  const campos = camposElegidos(claves);
  const [{ default: ExcelJS }, { loadLogoDataUrl }] = await Promise.all([
    import('exceljs'),
    import('@/shared/lib/pdfLogo'),
  ]);
  const logo = await loadLogoDataUrl().catch(() => null);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Personal', {
    pageSetup: { orientation: campos.length > 5 ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: 'frozen', ySplit: 5 }],
  });
  ws.columns = [{ width: 7 }, ...campos.map((c) => ({ width: Math.max(c.ancho, c.etiqueta.length) + 6 }))];
  const ultima = campos.length + 1;
  const borde = { style: 'thin' as const, color: { argb: 'FFBFC5CC' } };
  const bordes = { top: borde, left: borde, bottom: borde, right: borde };

  // Encabezado: logo en la columna A (filas 1-3) y el título a su derecha.
  ws.getRow(1).height = 26; ws.getRow(2).height = 20; ws.getRow(3).height = 14;
  if (logo) {
    const id = wb.addImage({ base64: logo, extension: 'jpeg' });
    ws.addImage(id, { tl: { col: 0.1, row: 0.1 }, ext: { width: 54, height: 54 } });
  }
  const desde = Math.min(2, ultima);
  ws.mergeCells(1, desde, 1, Math.max(desde, ultima));
  ws.mergeCells(2, desde, 2, Math.max(desde, ultima));
  const t = ws.getCell(1, desde);
  t.value = `${titulo.toUpperCase()} · GOLDEN TOUCH 1127 C.A.`;
  t.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFF8A00' } };
  t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  const sub = ws.getCell(2, desde);
  sub.value = `${filas.length} persona(s) · ${new Date().toLocaleString('es-VE')}`;
  sub.font = { name: 'Arial', size: 10, color: { argb: 'FF5C6673' } };
  sub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  const cab = ws.getRow(5);
  cab.values = ['N°', ...encabezados];
  cab.height = 26;
  cab.eachCell((c) => {
    c.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF8A00' } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = bordes;
  });

  filas.forEach((f, i) => {
    const r = ws.getRow(6 + i);
    r.values = [i + 1, ...f];
    r.height = 22;
    r.eachCell({ includeEmpty: true }, (c, col) => {
      c.font = { name: 'Arial', size: 10 };
      c.border = bordes;
      c.alignment = { vertical: 'middle', horizontal: col === 1 ? 'center' : 'left', indent: col === 1 ? 0 : 1, wrapText: true };
      if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAF6F0' } };
      if (campos[col - 2]?.clave === 'sueldo_base') { c.numFmt = '#,##0.00'; c.alignment = { ...c.alignment, horizontal: 'right' }; }
    });
  });

  const bytes = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  await previewExcelArchivo(bytes, `personal-${hoy()}.xlsx`);
}

export async function descargarPersonalPdf(personas: Personal[], claves: string[], titulo = 'Personal'): Promise<void> {
  validar(personas, claves);
  const { encabezados, filas } = tablaPersonal(personas, claves);
  const campos = camposElegidos(claves);
  const [{ jsPDF }, { default: autoTable }, { loadLogoPdfDataUrl, dibujarLogoPdf }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/pdfLogo'),
  ]);
  const logo = await loadLogoPdfDataUrl().catch(() => null);
  // Pocas columnas caben en vertical; muchas, en horizontal.
  const anchoTotal = campos.reduce((a, c) => a + c.ancho, 0);
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: anchoTotal > 90 ? 'landscape' : 'portrait' });
  const W = doc.internal.pageSize.getWidth();
  const MARGIN = 56.69; // 2 cm por lado
  let y = MARGIN;
  if (logo) dibujarLogoPdf(doc, logo, MARGIN, y, 52);
  doc.setTextColor(255, 138, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(pdfSafe(titulo.toUpperCase()), W / 2, y + 20, { align: 'center' });
  doc.setTextColor(80, 80, 80); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(pdfSafe(`GOLDEN TOUCH 1127 C.A. · ${filas.length} persona(s) · ${new Date().toLocaleString('es-VE')}`), W / 2, y + 36, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 70; // aire entre el encabezado y la tabla

  // Columna «N°» para contar al imprimir; el resto reparte el ancho útil según su peso.
  const util = W - MARGIN * 2 - 30;
  const columnStyles: Record<number, { cellWidth: number; halign?: 'right' | 'center' }> = { 0: { cellWidth: 30, halign: 'center' } };
  campos.forEach((c, i) => {
    columnStyles[i + 1] = { cellWidth: (util * c.ancho) / anchoTotal, ...(c.clave === 'sueldo_base' || c.clave === 'edad' ? { halign: 'right' as const } : {}) };
  });
  // Tabla con todas sus líneas (theme «grid»): se lee como planilla al imprimirla.
  autoTable(doc, {
    theme: 'grid',
    startY: y,
    head: [['N°', ...encabezados.map((e) => pdfSafe(e.toUpperCase()))]],
    body: filas.map((f, i) => [String(i + 1), ...f.map((v, k) =>
      campos[k].clave === 'sueldo_base' ? `$ ${Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : pdfSafe(String(v)))]),
    styles: { fontSize: campos.length > 8 ? 7 : 10, cellPadding: campos.length > 8 ? 4 : 6, overflow: 'linebreak', valign: 'middle', lineColor: [150, 156, 164], lineWidth: 0.6, textColor: [20, 24, 30] },
    headStyles: { fillColor: [255, 138, 0], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', valign: 'middle', fontSize: campos.length > 8 ? 7 : 9, lineColor: [150, 156, 164], lineWidth: 0.6 },
    alternateRowStyles: { fillColor: [250, 246, 240] },
    columnStyles,
    margin: MARGIN,
  });
  previewPdf(doc, `personal-${hoy()}.pdf`);
}
