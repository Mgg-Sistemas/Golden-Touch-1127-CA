/* ============================================================
   Golden Touch · RRHH · Descargar los datos del personal (Excel / PDF)

   Se eligen con casillas QUÉ datos salen (05/10/2026, pedido del usuario):
   p. ej. solo nombre y cédula para imprimir una lista. Salen las personas
   que se están viendo en la pestaña Personal, con los filtros aplicados.

   Todo el texto del PDF pasa por `pdfSafe` (la helvetica de jsPDF solo
   escribe Windows-1252).
   ============================================================ */
import type { Personal } from '@/shared/lib/types';
import { previewExcel, previewPdf } from '@/shared/lib/reportePreview';
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

export async function descargarPersonalExcel(personas: Personal[], claves: string[], titulo = 'Personal'): Promise<void> {
  validar(personas, claves);
  const { encabezados, filas } = tablaPersonal(personas, claves);
  const campos = camposElegidos(claves);
  const XLSX = (await import('xlsx-js-style')) as unknown as {
    utils: { aoa_to_sheet: (d: unknown[][]) => Record<string, unknown>; encode_cell: (c: { r: number; c: number }) => string; book_new: () => unknown; book_append_sheet: (wb: unknown, ws: unknown, name: string) => void };
  };
  const HEADER = { font: { name: 'Arial', sz: 11, bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: 'FF8A00' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
  const TITLE = { font: { name: 'Arial', sz: 14, bold: true }, alignment: { horizontal: 'left' } };
  const aoa: unknown[][] = [
    [`${titulo.toUpperCase()} · GOLDEN TOUCH 1127 C.A.`],
    [`${filas.length} persona(s) · ${new Date().toLocaleString('es-VE')}`],
    [],
    encabezados,
    ...filas,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = campos.map((c) => ({ wch: Math.max(c.ancho, c.etiqueta.length + 2) }));
  const ultima = Math.max(0, campos.length - 1);
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: ultima } }, { s: { r: 1, c: 0 }, e: { r: 1, c: ultima } }];
  const cellAt = (r: number, c: number) => (ws as Record<string, { s?: unknown }>)[XLSX.utils.encode_cell({ r, c })];
  const t = cellAt(0, 0); if (t) t.s = TITLE;
  encabezados.forEach((_, c) => { const cell = cellAt(3, c); if (cell) cell.s = HEADER; });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Personal');
  await previewExcel(wb, `personal-${hoy()}.xlsx`);
}

export async function descargarPersonalPdf(personas: Personal[], claves: string[], titulo = 'Personal'): Promise<void> {
  validar(personas, claves);
  const { encabezados, filas } = tablaPersonal(personas, claves);
  const campos = camposElegidos(claves);
  const [{ jsPDF }, { default: autoTable }, { loadLogoDataUrl }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/pdfLogo'),
  ]);
  const logo = await loadLogoDataUrl().catch(() => null);
  // Pocas columnas caben en vertical; muchas, en horizontal.
  const anchoTotal = campos.reduce((a, c) => a + c.ancho, 0);
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: anchoTotal > 90 ? 'landscape' : 'portrait' });
  const W = doc.internal.pageSize.getWidth();
  const MARGIN = 56.69; // 2 cm por lado
  let y = MARGIN;
  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 40, 40); } catch { /* el logo es opcional */ } }
  doc.setTextColor(255, 138, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(pdfSafe(titulo.toUpperCase()), W / 2, y + 16, { align: 'center' });
  doc.setTextColor(80, 80, 80); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(pdfSafe(`GOLDEN TOUCH 1127 C.A. · ${filas.length} persona(s) · ${new Date().toLocaleString('es-VE')}`), W / 2, y + 31, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 52;

  // Columna «N°» para contar al imprimir; el resto reparte el ancho útil según su peso.
  const util = W - MARGIN * 2 - 24;
  const columnStyles: Record<number, { cellWidth: number; halign?: 'right' | 'center' }> = { 0: { cellWidth: 24, halign: 'center' } };
  campos.forEach((c, i) => {
    columnStyles[i + 1] = { cellWidth: (util * c.ancho) / anchoTotal, ...(c.clave === 'sueldo_base' || c.clave === 'edad' ? { halign: 'right' as const } : {}) };
  });
  autoTable(doc, {
    startY: y,
    head: [['N°', ...encabezados.map((e) => pdfSafe(e.toUpperCase()))]],
    body: filas.map((f, i) => [String(i + 1), ...f.map((v, k) =>
      campos[k].clave === 'sueldo_base' ? `$ ${Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : pdfSafe(String(v)))]),
    styles: { fontSize: campos.length > 8 ? 7 : 9, cellPadding: 3.5, overflow: 'linebreak' },
    headStyles: { fillColor: [255, 138, 0], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: campos.length > 8 ? 7 : 8 },
    alternateRowStyles: { fillColor: [250, 246, 240] },
    columnStyles,
    margin: MARGIN,
  });
  previewPdf(doc, `personal-${hoy()}.pdf`);
}
