/* ============================================================
   Golden Touch · Control de Maquinaria · Descargar datos de Equipos (Excel / PDF)
   (26/10/2026)

   Permite al usuario elegir qué columnas salen (igual que en RRHH):
   - Equipo, Tipo, Empresa/Propietario, Encargado, Estatus, Marca, Modelo,
     Horómetro, Kilometraje, Serial, Placa, Ubicación, Combustible, Mantt.
   - Agrupación por empresa / propietario (secciones separadas con conteos).
   - Generación de PDF institucional (logo, naranja, membrete, orientación) y
     Excel profesional con bordes y estilos (ExcelJS).
   ============================================================ */
import type { MaquinariaEquipo } from './maquinariaEquipos.repository';
import { extraerEncargado } from './maquinariaEquipos.repository';
import { previewExcelArchivo, previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';

export interface ContextoEquipoExportar {
  horometro?: number | null;
  kilometraje?: number | null;
  horasFaltantes?: number | null;
  encargado?: string | null;
}

export interface CampoEquipo {
  clave: string;
  etiqueta: string;
  ancho: number;
  valor: (e: MaquinariaEquipo, ctx?: ContextoEquipoExportar) => string | number;
}

const txt = (v: string | null | undefined) => (v ?? '').trim();
const fmtNum = (v: number | null | undefined) => (v == null ? '' : Number(v).toLocaleString('es-VE', { maximumFractionDigits: 2 }));

export const CAMPOS_EQUIPO: CampoEquipo[] = [
  { clave: 'equipo', etiqueta: 'Equipo / Máquina', ancho: 22, valor: (e) => txt(e.equipo) },
  { clave: 'tipo', etiqueta: 'Tipo de equipo', ancho: 16, valor: (e) => txt(e.tipo) || '—' },
  { clave: 'propietario', etiqueta: 'Empresa / Propietario', ancho: 20, valor: (e) => txt(e.propietario) || 'Sin propietario' },
  { clave: 'encargado', etiqueta: 'Encargado responsable', ancho: 20, valor: (e, ctx) => txt(ctx?.encargado ?? extraerEncargado(e)) || '—' },
  { clave: 'status', etiqueta: 'Estatus / Condición', ancho: 14, valor: (e) => txt(e.status).toUpperCase() },
  { clave: 'marca', etiqueta: 'Marca', ancho: 14, valor: (e) => txt(e.marca) || '—' },
  { clave: 'modelo', etiqueta: 'Modelo', ancho: 14, valor: (e) => txt(e.modelo) || '—' },
  { clave: 'anio', etiqueta: 'Año', ancho: 8, valor: (e) => (e.anio ? String(e.anio) : '—') },
  { clave: 'serial', etiqueta: 'Serial / Chasis', ancho: 16, valor: (e) => txt(e.serial) || '—' },
  { clave: 'placa', etiqueta: 'Placa', ancho: 10, valor: (e) => txt(e.placa) || '—' },
  { clave: 'color', etiqueta: 'Color', ancho: 10, valor: (e) => txt(e.color) || '—' },
  { clave: 'ubicacion', etiqueta: 'Ubicación / Garaje', ancho: 16, valor: (e) => txt(e.ubicacion) || '—' },
  { clave: 'combustible', etiqueta: 'Combustible', ancho: 12, valor: (e) => txt(e.combustible) || '—' },
  { clave: 'litros_consume', etiqueta: 'Consumo (L)', ancho: 11, valor: (e) => fmtNum(e.litros_consume) },
  { clave: 'horometro', etiqueta: 'Horómetro actual (h)', ancho: 14, valor: (_e, ctx) => (ctx?.horometro != null ? fmtNum(ctx.horometro) : '—') },
  { clave: 'kilometraje', etiqueta: 'Kilometraje actual (km)', ancho: 14, valor: (_e, ctx) => (ctx?.kilometraje != null ? fmtNum(ctx.kilometraje) : '—') },
  { clave: 'mantenimiento_cada_hrs', etiqueta: 'Mantt. cada (h)', ancho: 12, valor: (e) => fmtNum(e.mantenimiento_cada_hrs) },
  { clave: 'mantenimiento_cada_km', etiqueta: 'Mantt. cada (km)', ancho: 12, valor: (e) => fmtNum(e.mantenimiento_cada_km) },
  { clave: 'combustible_equipo', etiqueta: 'Vinculado a Combustible', ancho: 20, valor: (e) => txt(e.combustible_equipo) || '—' },
];

/** Lo que viene marcado por defecto al abrir el diálogo */
export const CAMPOS_POR_DEFECTO_EQUIPOS = [
  'equipo', 'tipo', 'propietario', 'encargado', 'status', 'marca', 'modelo', 'horometro', 'mantenimiento_cada_hrs',
];

export type OrientacionHoja = 'auto' | 'vertical' | 'horizontal';

export function camposElegidos(claves: string[]): CampoEquipo[] {
  const set = new Set(claves);
  return CAMPOS_EQUIPO.filter((c) => set.has(c.clave));
}

export function orientacionFinal(claves: string[], elegida: OrientacionHoja = 'auto'): 'portrait' | 'landscape' {
  if (elegida === 'vertical') return 'portrait';
  if (elegida === 'horizontal') return 'landscape';
  const anchoTotal = camposElegidos(claves).reduce((a, c) => a + c.ancho, 0);
  return anchoTotal > 85 ? 'landscape' : 'portrait';
}

export function agruparEquiposPorEmpresa(equipos: MaquinariaEquipo[]): Map<string, MaquinariaEquipo[]> {
  const map = new Map<string, MaquinariaEquipo[]>();
  for (const e of equipos) {
    const emp = txt(e.propietario) || 'SIN EMPRESA ASIGNADA';
    const arr = map.get(emp) ?? [];
    arr.push(e);
    map.set(emp, arr);
  }
  return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es')));
}

const hoyStr = () => new Date().toISOString().slice(0, 10);

/* ─────────────────────────────────────────────────────────────
   EXCEL: Descargar datos de equipos (ExcelJS con estilos)
   ───────────────────────────────────────────────────────────── */
export async function descargarEquiposExcelPersonalizado(
  equipos: MaquinariaEquipo[],
  claves: string[],
  agruparPorEmpresa: boolean,
  contextoMap?: Map<string, ContextoEquipoExportar>,
  orientacion: OrientacionHoja = 'auto',
): Promise<void> {
  const campos = camposElegidos(claves);
  if (!campos.length) throw new Error('Marca al menos un dato para descargar.');
  if (!equipos.length) throw new Error('No hay equipos en la lista.');

  const [{ default: ExcelJS }] = await Promise.all([import('exceljs')]);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Equipos', {
    pageSetup: { orientation: orientacionFinal(claves, orientacion), fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: 'frozen', ySplit: 5 }],
  });

  ws.columns = [{ width: 7 }, ...campos.map((c) => ({ width: Math.max(c.ancho, c.etiqueta.length) + 5 }))];
  const ultimaCol = campos.length + 1;
  const borde = { style: 'thin' as const, color: { argb: 'FFBFC5CC' } };
  const bordes = { top: borde, left: borde, bottom: borde, right: borde };

  // Encabezado institucional
  ws.getRow(1).height = 26; ws.getRow(2).height = 20; ws.getRow(3).height = 12;
  ws.mergeCells(1, 1, 1, Math.max(1, ultimaCol));
  ws.mergeCells(2, 1, 2, Math.max(1, ultimaCol));

  const t = ws.getCell(1, 1);
  t.value = 'CONTROL DE MAQUINARIA Y VEHÍCULOS · GOLDEN TOUCH 1127 C.A.';
  t.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFF8A00' } };
  t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  const sub = ws.getCell(2, 1);
  sub.value = `${equipos.length} equipo(s) · ${agruparPorEmpresa ? 'Agrupados por empresa' : 'Listado general'} · ${new Date().toLocaleString('es-VE')}`;
  sub.font = { name: 'Arial', size: 10, color: { argb: 'FF5C6673' } };
  sub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  let filaActual = 5;

  if (!agruparPorEmpresa) {
    // Encabezados de tabla
    const cab = ws.getRow(filaActual);
    cab.values = ['N°', ...campos.map((c) => c.etiqueta)];
    cab.height = 25;
    cab.eachCell((c) => {
      c.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF8A00' } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = bordes;
    });
    filaActual++;

    equipos.forEach((eq, idx) => {
      const r = ws.getRow(filaActual);
      const ctx = contextoMap?.get(eq.id);
      r.values = [idx + 1, ...campos.map((c) => c.valor(eq, ctx))];
      r.height = 20;
      r.eachCell({ includeEmpty: true }, (c, col) => {
        c.font = { name: 'Arial', size: 9.5 };
        c.border = bordes;
        c.alignment = { vertical: 'middle', horizontal: col === 1 ? 'center' : 'left', indent: col === 1 ? 0 : 1, wrapText: true };
        if (idx % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAF6F0' } };
      });
      filaActual++;
    });
  } else {
    // Agrupado por empresa / propietario
    const grupos = agruparEquiposPorEmpresa(equipos);
    let contadorGeneral = 1;

    for (const [empresa, listaEmpresa] of grupos.entries()) {
      // Fila de encabezado de grupo
      const filaGrupo = ws.getRow(filaActual);
      ws.mergeCells(filaActual, 1, filaActual, Math.max(1, ultimaCol));
      filaGrupo.height = 24;
      const cGrupo = ws.getCell(filaActual, 1);
      cGrupo.value = `🏢 EMPRESA: ${empresa.toUpperCase()} (${listaEmpresa.length} equipos)`;
      cGrupo.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cGrupo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      cGrupo.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      filaActual++;

      // Encabezados de columnas
      const cab = ws.getRow(filaActual);
      cab.values = ['N°', ...campos.map((c) => c.etiqueta)];
      cab.height = 22;
      cab.eachCell((c) => {
        c.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF8A00' } };
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        c.border = bordes;
      });
      filaActual++;

      // Filas de los equipos de esta empresa
      listaEmpresa.forEach((eq, idx) => {
        const r = ws.getRow(filaActual);
        const ctx = contextoMap?.get(eq.id);
        r.values = [contadorGeneral++, ...campos.map((c) => c.valor(eq, ctx))];
        r.height = 20;
        r.eachCell({ includeEmpty: true }, (c, col) => {
          c.font = { name: 'Arial', size: 9.5 };
          c.border = bordes;
          c.alignment = { vertical: 'middle', horizontal: col === 1 ? 'center' : 'left', indent: col === 1 ? 0 : 1, wrapText: true };
          if (idx % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAF6F0' } };
        });
        filaActual++;
      });

      // Espacio entre empresas
      filaActual++;
    }
  }

  const bytes = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  await previewExcelArchivo(bytes, `control-maquinaria-${hoyStr()}.xlsx`);
}

/* ─────────────────────────────────────────────────────────────
   PDF: Descargar datos de equipos (jsPDF + autoTable)
   ───────────────────────────────────────────────────────────── */
export async function descargarEquiposPdfPersonalizado(
  equipos: MaquinariaEquipo[],
  claves: string[],
  agruparPorEmpresa: boolean,
  contextoMap?: Map<string, ContextoEquipoExportar>,
  orientacion: OrientacionHoja = 'auto',
): Promise<void> {
  const campos = camposElegidos(claves);
  if (!campos.length) throw new Error('Marca al menos un dato para descargar.');
  if (!equipos.length) throw new Error('No hay equipos en la lista.');

  const [{ jsPDF }, { default: autoTable }, { loadLogoPdfDataUrl, dibujarLogoPdf, anchoLogoPdf }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/pdfLogo'),
  ]);

  const logo = await loadLogoPdfDataUrl().catch(() => null);
  const orient = orientacionFinal(claves, orientacion);
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: orient });
  const W = doc.internal.pageSize.getWidth();
  const MARGIN = 40; // ~1.4 cm
  let y = MARGIN;

  // Encabezado con logo institucional
  if (logo) {
    dibujarLogoPdf(doc, logo, MARGIN, y, 42);
  }
  const tx = logo ? MARGIN + anchoLogoPdf(42) + 10 : MARGIN;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 138, 0);
  doc.text('CONTROL DE MAQUINARIA Y VEHÍCULOS', tx, y + 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  doc.text(
    `GOLDEN TOUCH 1127 C.A. · ${equipos.length} equipo(s) · ${agruparPorEmpresa ? 'Agrupados por Empresa' : 'Listado General'} · ${new Date().toLocaleString('es-VE')}`,
    tx,
    y + 28,
  );

  y += 50;
  doc.setDrawColor(255, 138, 0);
  doc.setLineWidth(1.5);
  doc.line(MARGIN, y, W - MARGIN, y);
  y += 12;

  const anchoTotal = campos.reduce((a, c) => a + c.ancho, 0);
  const util = W - MARGIN * 2 - 26;
  const columnStyles: Record<number, { cellWidth: number; halign?: 'right' | 'center' | 'left' }> = {
    0: { cellWidth: 26, halign: 'center' },
  };

  campos.forEach((c, i) => {
    columnStyles[i + 1] = {
      cellWidth: (util * c.ancho) / anchoTotal,
      halign: c.clave === 'litros_consume' || c.clave === 'anio' ? 'center' : 'left',
    };
  });

  const letra = Math.max(6.5, Math.min(8.5, Math.floor((util / anchoTotal) * 2 * 2) / 2));

  if (!agruparPorEmpresa) {
    // Tabla única corrida
    autoTable(doc, {
      theme: 'grid',
      startY: y,
      head: [['N°', ...campos.map((c) => pdfSafe(c.etiqueta.toUpperCase()))]],
      body: equipos.map((eq, i) => {
        const ctx = contextoMap?.get(eq.id);
        return [String(i + 1), ...campos.map((c) => pdfSafe(String(c.valor(eq, ctx))))];
      }),
      styles: { fontSize: letra, cellPadding: 3.5, overflow: 'linebreak', valign: 'middle', lineColor: [160, 166, 175], lineWidth: 0.5 },
      headStyles: { fillColor: [255, 138, 0], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: letra },
      alternateRowStyles: { fillColor: [250, 246, 240] },
      columnStyles,
      margin: MARGIN,
    });
  } else {
    // Por empresa / propietario
    const grupos = agruparEquiposPorEmpresa(equipos);
    let contadorGeneral = 1;

    for (const [empresa, listaEmpresa] of grupos.entries()) {
      // Subtítulo de empresa
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);

      // Comprobar espacio antes de dibujar encabezado
      if (y > doc.internal.pageSize.getHeight() - 80) {
        doc.addPage();
        y = MARGIN;
      }

      doc.text(pdfSafe(`🏢 EMPRESA: ${empresa.toUpperCase()} (${listaEmpresa.length} equipos)`), MARGIN, y + 10);
      y += 16;

      autoTable(doc, {
        theme: 'grid',
        startY: y,
        head: [['N°', ...campos.map((c) => pdfSafe(c.etiqueta.toUpperCase()))]],
        body: listaEmpresa.map((eq) => {
          const ctx = contextoMap?.get(eq.id);
          return [String(contadorGeneral++), ...campos.map((c) => pdfSafe(String(c.valor(eq, ctx))))];
        }),
        styles: { fontSize: letra, cellPadding: 3.5, overflow: 'linebreak', valign: 'middle', lineColor: [160, 166, 175], lineWidth: 0.5 },
        headStyles: { fillColor: [255, 138, 0], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: letra },
        alternateRowStyles: { fillColor: [250, 246, 240] },
        columnStyles,
        margin: MARGIN,
      });

      // Actualizar `y` a la posición final de la tabla
      const lastTable = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
      y = (lastTable?.finalY ?? y) + 18;
    }
  }

  previewPdf(doc, `control-maquinaria-${hoyStr()}.pdf`);
}
