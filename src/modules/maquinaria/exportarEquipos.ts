/* ============================================================
   Golden Touch · Control de Maquinaria · Descargar datos de Equipos (Excel / PDF)
   (26/10/2026)

   Permite al usuario elegir qué columnas salen (igual que en RRHH):
   - Equipo, Tipo, Empresa/Propietario, Encargado, Estatus, Marca, Modelo,
     Horómetro, Kilometraje, Serial, Placa, Ubicación, Combustible, Mantt.
   - Agrupación por empresa / propietario (secciones separadas con conteos).
   - Filtro por categoría (maquinaria / vehículos / motos / lanchas): el título
     del PDF y del Excel la nombran cuando no es «Todas».
   - Generación de PDF institucional en fichas con foto (logo, naranja, membrete,
     orientación; la foto solo si está marcada «Foto del equipo») y Excel
     profesional con bordes y estilos (ExcelJS).
   - Resumen de flota en tarjetas (27/10/2026, opción `resumen`): va arriba del
     PDF (franja de totales por apartado y estado + tarjetas «RETROEXCAVADORA 5 ·
     CAT 3 · VOLVO 2») y como primera hoja «Resumen» del Excel; `soloResumen`
     deja únicamente el resumen. Los conteos salen de resumenFlota.ts.
   ============================================================ */
import type { MaquinariaEquipo } from './maquinariaEquipos.repository';
import { extraerEncargado } from './maquinariaEquipos.repository';
import { previewExcelArchivo, previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import { fotosDeEquipos } from './flota.repository';
import { ESTADOS_EQUIPO, estadoEfectivo } from './flota';
import { identidadEmpresa } from '@/shared/lib/empresa';
import { resumenFlota, textoDesglose, type AgrupacionResumen, type GrupoResumen, type ResumenFlota } from './resumenFlota';
import type { Workbook } from 'exceljs';

export type { AgrupacionResumen } from './resumenFlota';
export { AGRUPACIONES_RESUMEN } from './resumenFlota';

/** Resumen de flota en tarjetas (27/10/2026): opción extra del PDF y del Excel de equipos. */
export interface OpcionesResumenFlota {
  /** Incluir la página de resumen en tarjetas. */
  activo: boolean;
  /** Por qué se agrupan las tarjetas (default 'tipo'). */
  agruparPor: AgrupacionResumen;
  /** true = solo el resumen, sin las fichas/tabla de equipos. */
  soloResumen?: boolean;
}

/** Color del circulito de cada estado en el PDF (mismos tonos que flotaPdf.ts). */
const TONO_RGB_ESTADO: Record<string, [number, number, number]> = {
  success: [22, 163, 74], danger: [220, 38, 38], warning: [217, 119, 6], primary: [234, 88, 12],
  info: [37, 99, 235], wait: [124, 58, 237], retired: [100, 116, 139],
};

export interface ContextoEquipoExportar {
  horometro?: number | null;
  kilometraje?: number | null;
  horasFaltantes?: number | null;
  encargado?: string | null;
  avisoServicio?: string | null;
}

export interface CampoEquipo {
  clave: string;
  etiqueta: string;
  ancho: number;
  valor: (e: MaquinariaEquipo, ctx?: ContextoEquipoExportar) => string | number;
}

const txt = (v: string | null | undefined) => (v ?? '').trim();
const fmtNum = (v: number | null | undefined) => (v == null ? '' : Number(v).toLocaleString('es-VE', { maximumFractionDigits: 2 }));

export const UBICACION_UNIFICADA_GT = 'MINA GOLDEN TOUCH / PERAMANAL';

/**
 * Normaliza y unifica ubicaciones/garajes:
 * - Unifica Peramanal y Mina Golden Touch («GT Peramanal», «GT PERAMANAL», «MINA GOLDEN TOUCH»)
 *   bajo la denominación única 'MINA GOLDEN TOUCH / PERAMANAL'.
 * - Limpia y pone en mayúsculas el resto para evitar duplicados por mayúsculas/minúsculas.
 */
export function normalizarUbicacion(ubicacion: string | null | undefined): string {
  const u = (ubicacion ?? '').trim();
  if (!u) return '';
  const up = u.toUpperCase();
  if (up.includes('PERAMANAL') || up.includes('GOLDEN TOUCH')) {
    return UBICACION_UNIFICADA_GT;
  }
  return up;
}

export const CAMPOS_EQUIPO: CampoEquipo[] = [
  { clave: 'foto', etiqueta: 'Foto del equipo', ancho: 14, valor: () => ' ' },
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
  { clave: 'ubicacion', etiqueta: 'Ubicación / Garaje', ancho: 16, valor: (e) => normalizarUbicacion(e.ubicacion) || txt(e.ubicacion) || '—' },
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
  'foto', 'equipo', 'tipo', 'propietario', 'encargado', 'status', 'marca', 'modelo', 'horometro', 'mantenimiento_cada_hrs',
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

export type ModoAgrupacionEquipos = 'empresa' | 'ubicacion' | 'ninguno';

export function agruparEquipos(
  equipos: MaquinariaEquipo[],
  modo: ModoAgrupacionEquipos = 'empresa',
): Map<string, MaquinariaEquipo[]> {
  if (modo === 'ninguno') {
    return new Map([['TODOS LOS EQUIPOS', equipos]]);
  }
  const map = new Map<string, MaquinariaEquipo[]>();
  for (const e of equipos) {
    let clave = '';
    if (modo === 'empresa') {
      clave = txt(e.propietario) || 'SIN EMPRESA ASIGNADA';
    } else if (modo === 'ubicacion') {
      clave = normalizarUbicacion(e.ubicacion) || 'SIN UBICACIÓN ASIGNADA';
    }
    const arr = map.get(clave) ?? [];
    arr.push(e);
    map.set(clave, arr);
  }
  return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es')));
}

export function agruparEquiposPorEmpresa(equipos: MaquinariaEquipo[]): Map<string, MaquinariaEquipo[]> {
  return agruparEquipos(equipos, 'empresa');
}

const hoyStr = () => new Date().toISOString().slice(0, 10);

function normalizarModoAgrupacion(agrupacion: ModoAgrupacionEquipos | boolean | undefined): ModoAgrupacionEquipos {
  if (typeof agrupacion === 'string') return agrupacion;
  return agrupacion ? 'empresa' : 'ninguno';
}

/* ─────────────────────────────────────────────────────────────
   EXCEL: Descargar datos de equipos (ExcelJS con estilos)
   ───────────────────────────────────────────────────────────── */
export async function descargarEquiposExcelPersonalizado(
  equipos: MaquinariaEquipo[],
  claves: string[],
  agrupacion: ModoAgrupacionEquipos | boolean = 'empresa',
  contextoMap?: Map<string, ContextoEquipoExportar>,
  orientacion: OrientacionHoja = 'auto',
  categoria?: string | null,
  resumen?: OpcionesResumenFlota,
): Promise<void> {
  const campos = camposElegidos(claves);
  // Resumen de flota (27/10/2026): si viene activo se arma la hoja «Resumen»; con soloResumen no hacen falta columnas.
  const datosResumen = resumen?.activo ? resumenFlota(equipos, resumen.agruparPor || 'tipo') : null;
  const soloResumen = !!datosResumen && !!resumen?.soloResumen;
  if (!campos.length && !soloResumen) throw new Error('Marca al menos un dato para descargar.');
  if (!equipos.length) throw new Error('No hay equipos en la lista.');

  const modoAgrupar = normalizarModoAgrupacion(agrupacion);
  const [{ default: ExcelJS }] = await Promise.all([import('exceljs')]);
  const cat = txt(categoria);

  const wb = new ExcelJS.Workbook();
  if (datosResumen) {
    // La hoja «Resumen» va PRIMERA, antes de los datos; con soloResumen es la única.
    agregarHojaResumenExcel(wb, datosResumen, cat);
    if (soloResumen) {
      const bytes = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
      await previewExcelArchivo(bytes, `resumen-flota-${datosResumen.agruparPor}-${hoyStr()}.xlsx`);
      return;
    }
  }
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
  t.value = cat ? `${cat.toUpperCase()} · GOLDEN TOUCH 1127 C.A.` : 'CONTROL DE MAQUINARIA Y VEHÍCULOS · GOLDEN TOUCH 1127 C.A.';
  t.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFF8A00' } };
  t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  const textoAgrup = modoAgrupar === 'empresa'
    ? 'Agrupados por empresa'
    : modoAgrupar === 'ubicacion'
    ? 'Agrupados por ubicación'
    : 'Listado general';

  const sub = ws.getCell(2, 1);
  sub.value = `${equipos.length} equipo(s)${cat ? ` · Categoría: ${cat}` : ''} · ${textoAgrup} · ${new Date().toLocaleString('es-VE')}`;
  sub.font = { name: 'Arial', size: 10, color: { argb: 'FF5C6673' } };
  sub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  let filaActual = 5;

  if (modoAgrupar === 'ninguno') {
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
    // Agrupado por empresa o por ubicación
    const grupos = agruparEquipos(equipos, modoAgrupar);
    let contadorGeneral = 1;

    for (const [claveGrupo, listaGrupo] of grupos.entries()) {
      // Fila de encabezado de grupo
      const filaGrupo = ws.getRow(filaActual);
      ws.mergeCells(filaActual, 1, filaActual, Math.max(1, ultimaCol));
      filaGrupo.height = 24;
      const cGrupo = ws.getCell(filaActual, 1);
      const prefijo = modoAgrupar === 'empresa' ? '🏢 EMPRESA' : '📍 UBICACIÓN';
      cGrupo.value = `${prefijo}: ${claveGrupo.toUpperCase()} (${listaGrupo.length} equipos)`;
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

      // Filas de los equipos de este grupo
      listaGrupo.forEach((eq, idx) => {
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

      // Espacio entre grupos
      filaActual++;
    }
  }

  const bytes = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  await previewExcelArchivo(bytes, `control-maquinaria-${hoyStr()}.xlsx`);
}

/* ─────────────────────────────────────────────────────────────
   EXCEL · hoja «Resumen» (27/10/2026): una fila por grupo con su desglose
   («CAT 3 · VOLVO 2») y, debajo, los totales por apartado y por estado.
   ───────────────────────────────────────────────────────────── */
function agregarHojaResumenExcel(wb: Workbook, r: ResumenFlota, cat: string): void {
  const ws = wb.addWorksheet('Resumen', {
    pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [{ width: 36 }, { width: 12 }, { width: 10 }, { width: 70 }];
  const borde = { style: 'thin' as const, color: { argb: 'FFBFC5CC' } };
  const bordes = { top: borde, left: borde, bottom: borde, right: borde };

  // Encabezado institucional (mismo estilo que la hoja de datos)
  ws.getRow(1).height = 26; ws.getRow(2).height = 20; ws.getRow(3).height = 12;
  ws.mergeCells(1, 1, 1, 4);
  ws.mergeCells(2, 1, 2, 4);
  const t = ws.getCell(1, 1);
  t.value = `RESUMEN DE FLOTA · ${r.etiquetaAgrupacion.toUpperCase()} · GOLDEN TOUCH 1127 C.A.`;
  t.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFF8A00' } };
  t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  const sub = ws.getCell(2, 1);
  sub.value = `${r.total} equipo(s)${cat ? ` · Categoría: ${cat}` : ''} · ${r.grupos.length} grupo(s) por ${r.etiquetaAgrupacion.toLowerCase()} · ${new Date().toLocaleString('es-VE')}`;
  sub.font = { name: 'Arial', size: 10, color: { argb: 'FF5C6673' } };
  sub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  let fila = 4;
  const cabecera = (titulos: string[]) => {
    const cab = ws.getRow(fila);
    cab.values = titulos;
    cab.height = 22;
    cab.eachCell((c) => {
      c.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF8A00' } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = bordes;
    });
    fila++;
  };
  const filaDatos = (valores: (string | number)[], opts?: { negrita?: boolean; sombreada?: boolean }) => {
    const row = ws.getRow(fila);
    row.values = valores;
    row.height = 20;
    row.eachCell({ includeEmpty: true }, (c, col) => {
      const texto = col === 1 || col === 4;
      c.font = { name: 'Arial', size: 9.5, bold: !!opts?.negrita };
      c.border = bordes;
      c.alignment = { vertical: 'middle', horizontal: texto ? 'left' : 'center', indent: texto ? 1 : 0, wrapText: true };
      if (col === 3 && typeof c.value === 'number') c.numFmt = '0%';
      if (opts?.sombreada) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAF6F0' } };
    });
    fila++;
  };

  cabecera([r.etiquetaAgrupacion, 'Cantidad', '%', 'Desglose']);
  r.grupos.forEach((g, idx) => {
    filaDatos([`${g.icono} ${g.etiqueta}`, g.cantidad, g.porcentaje / 100, textoDesglose(g.desglose)], { sombreada: idx % 2 === 1 });
  });
  filaDatos(['TOTAL', r.total, r.total ? 1 : 0, ''], { negrita: true });
  fila++;

  cabecera(['Apartado', 'Cantidad']);
  r.porApartado.forEach((a, idx) => filaDatos([`${a.icono} ${a.etiqueta}`, a.cantidad], { sombreada: idx % 2 === 1 }));
  fila++;

  cabecera(['Estado', 'Cantidad']);
  r.porEstado.forEach((s, idx) => filaDatos([`${s.icono} ${s.etiqueta}`, s.cantidad], { sombreada: idx % 2 === 1 }));
}

async function cargarImagenDataUrl(url: string): Promise<{ data: string; tipo: 'JPEG' | 'PNG' } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const objUrl = URL.createObjectURL(blob);
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const maxDim = 320;
          const w = img.naturalWidth || img.width || 200;
          const h = img.naturalHeight || img.height || 200;
          const scale = Math.min(maxDim / w, maxDim / h, 1);
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          const data = canvas.toDataURL('image/jpeg', 0.85);
          URL.revokeObjectURL(objUrl);
          resolve({ data, tipo: 'JPEG' });
        } catch {
          URL.revokeObjectURL(objUrl);
          resolve(null);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objUrl);
        resolve(null);
      };
      img.src = objUrl;
    });
  } catch {
    return null;
  }
}

/* ─────────────────────────────────────────────────────────────
   PDF: Descargar datos de equipos (Fichas Técnicas con Foto)
   ───────────────────────────────────────────────────────────── */
export async function descargarEquiposPdfPersonalizado(
  equipos: MaquinariaEquipo[],
  claves: string[],
  agrupacion: ModoAgrupacionEquipos | boolean = 'empresa',
  contextoMap?: Map<string, ContextoEquipoExportar>,
  orientacion: OrientacionHoja = 'auto',
  fotosMap?: Map<string, string>,
  categoria?: string | null,
  resumen?: OpcionesResumenFlota,
): Promise<void> {
  const campos = camposElegidos(claves);
  // Resumen de flota en tarjetas (27/10/2026): va arriba, en la página 1; con soloResumen no hay fichas.
  const datosResumen = resumen?.activo ? resumenFlota(equipos, resumen.agruparPor || 'tipo') : null;
  const soloResumen = !!datosResumen && !!resumen?.soloResumen;
  if (!campos.length && !soloResumen) throw new Error('Marca al menos un dato para descargar.');
  if (!equipos.length) throw new Error('No hay equipos en la lista.');

  const modoAgrupar = normalizarModoAgrupacion(agrupacion);
  const clavesSet = new Set(claves);

  const [{ jsPDF }, { loadLogoPdfDataUrl, dibujarLogoPdf, anchoLogoPdf }] = await Promise.all([
    import('jspdf'),
    import('@/shared/lib/pdfLogo'),
  ]);

  // La ficha lleva foto solo si el usuario marcó «Foto del equipo» (y no se cargan si solo va el resumen)
  const conFoto = clavesSet.has('foto') && !soloResumen;
  const cat = txt(categoria);

  // Precarga de fotos de los equipos en DataURLs (solo si van a salir)
  let fm = fotosMap;
  if (!fm && conFoto) {
    try {
      const fts = await fotosDeEquipos();
      fm = new Map<string, string>();
      for (const f of fts) {
        if (!fm.has(f.equipo_id)) fm.set(f.equipo_id, f.url);
      }
    } catch {
      fm = new Map();
    }
  }

  const fotosDataUrlMap = new Map<string, { data: string; tipo: 'JPEG' | 'PNG' }>();
  if (conFoto) {
    await Promise.allSettled(
      equipos.map(async (eq) => {
        const url = fm?.get(eq.id);
        if (!url) return;
        const r = await cargarImagenDataUrl(url);
        if (r) fotosDataUrlMap.set(eq.id, r);
      })
    );
  }

  const logo = await loadLogoPdfDataUrl().catch(() => null);
  const orient = orientacionFinal(claves, orientacion);
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: orient });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const MARGIN = 36; // 0.5 pulgada
  const UW = W - MARGIN * 2;
  let y = MARGIN;

  const idEmp = identidadEmpresa('GT');

  function pies(ref: string) {
    const numPages = doc.getNumberOfPages();
    for (let i = 1; i <= numPages; i++) {
      doc.setPage(i);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.4);
      doc.line(MARGIN, H - 18, W - MARGIN, H - 18);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`${idEmp.nombre} · RIF ${idEmp.rif} · ${ref}`, MARGIN, H - 9);
      doc.text(`Página ${i} de ${numPages}`, W - MARGIN, H - 9, { align: 'right' });
    }
  }

  const textoAgrupPdf = modoAgrupar === 'empresa'
    ? 'Agrupados por Empresa'
    : modoAgrupar === 'ubicacion'
    ? 'Agrupados por Ubicación'
    : 'Listado General';

  function dibujarEncabezadoGeneral(titulo: string, modo: string = textoAgrupPdf) {
    if (logo) {
      dibujarLogoPdf(doc, logo, MARGIN, y, 38);
    }
    const tx = logo ? MARGIN + anchoLogoPdf(38) + 12 : MARGIN;

    // Ancho útil a la derecha del logo: el título y el subtítulo se parten en líneas
    // (27/10/2026: el subtítulo se salía del borde derecho y la fecha quedaba cortada).
    const anchoTexto = W - MARGIN - tx;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(255, 138, 0);
    const lineasTitulo = doc.splitTextToSize(titulo, anchoTexto) as string[];
    doc.text(lineasTitulo, tx, y + 14);
    let yy = y + 14 + (lineasTitulo.length - 1) * 15;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(80, 80, 80);
    const lineasSub = doc.splitTextToSize(
      `GOLDEN TOUCH 1127 C.A. · RIF ${idEmp.rif} · ${equipos.length} equipo(s)${cat ? ` · ${cat}` : ''} · ${modo} · ${new Date().toLocaleString('es-VE')}`,
      anchoTexto,
    ) as string[];
    doc.text(lineasSub, tx, yy + 13);
    yy += 13 + (lineasSub.length - 1) * 11;

    y = Math.max(y + 44, yy + 17);
    doc.setDrawColor(255, 138, 0);
    doc.setLineWidth(1.4);
    doc.line(MARGIN, y, W - MARGIN, y);
    y += 12;
  }

  /* ──────────────────────────────────────────────────────────
     RESUMEN DE FLOTA EN TARJETAS (27/10/2026)
     a) Franja de totales: TOTAL de equipos + chips por apartado y por estado.
     b) Grilla de tarjetas por grupo (3 por fila en vertical, 4 en horizontal):
        etiqueta, cantidad grande con «N % del total» y el desglose
        («CAT 3 · VOLVO 2», máximo 4 renglones).
     Sin emojis: helvetica no los dibuja; cada chip lleva un circulito de color.
     ────────────────────────────────────────────────────────── */
  function dibujarResumenFlota(r: ResumenFlota) {
    const NARANJA: [number, number, number] = [255, 138, 0];
    const TINTA: [number, number, number] = [30, 41, 59];
    const GRIS_TEXTO: [number, number, number] = [80, 80, 80];
    const GRIS_SUAVE: [number, number, number] = [100, 116, 139];
    const BORDE: [number, number, number] = [203, 213, 225];
    const CHIP_H = 14;
    const CHIP_GAP = 4;

    interface Chip { etiqueta: string; cantidad: number; color: [number, number, number] }

    /** Pinta (o solo mide, con pintar=false) una fila de chips con su rótulo; devuelve la Y de abajo. */
    function filaChips(rotulo: string, chips: Chip[], x0: number, yTop: number, xMax: number, pintar: boolean): number {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      const xIni = x0 + doc.getTextWidth(rotulo) + 6;
      if (pintar) {
        doc.setTextColor(...GRIS_SUAVE);
        doc.text(rotulo, x0, yTop + 9.5);
      }
      let x = xIni;
      let yy = yTop;
      for (const ch of chips) {
        const label = pdfSafe(ch.etiqueta);
        const num = String(ch.cantidad);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        const lw = doc.getTextWidth(label);
        doc.setFont('helvetica', 'bold');
        const nw = doc.getTextWidth(num);
        const w = 15 + lw + 3 + nw + 7;
        if (x + w > xMax && x > xIni) {
          x = xIni;
          yy += CHIP_H + CHIP_GAP;
        }
        if (pintar) {
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(...BORDE);
          doc.setLineWidth(0.5);
          doc.roundedRect(x, yy, w, CHIP_H, 7, 7, 'FD');
          doc.setFillColor(...ch.color);
          doc.circle(x + 8.5, yy + CHIP_H / 2, 2.6, 'F');
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(...TINTA);
          doc.text(label, x + 15, yy + 9.5);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...ch.color);
          doc.text(num, x + 15 + lw + 3, yy + 9.5);
        }
        x += w + CHIP_GAP;
      }
      return yy + CHIP_H;
    }

    /** Renglones del desglose («CAT 3 · VOLVO 2»), máximo `maxLineas`; si no caben, «… y X más». */
    function lineasDesglose(desglose: GrupoResumen['desglose'], ancho: number, maxLineas: number): string[] {
      const partes = desglose.map((d) => pdfSafe(`${d.etiqueta} ${d.cantidad}`));
      if (!partes.length) return [];
      const partir = (texto: string) => doc.splitTextToSize(texto, ancho) as string[];
      let lineas = partir(partes.join(' · '));
      if (lineas.length <= maxLineas) return lineas;
      for (let n = partes.length - 1; n >= 1; n--) {
        lineas = partir(`${partes.slice(0, n).join(' · ')} … y ${partes.length - n} más`);
        if (lineas.length <= maxLineas) return lineas;
      }
      return partir(`… y ${partes.length} más`).slice(0, maxLineas);
    }

    // a) Franja de totales
    const chipsApartado: Chip[] = r.porApartado.map((a) => ({ etiqueta: a.etiqueta, cantidad: a.cantidad, color: NARANJA }));
    const chipsEstado: Chip[] = r.porEstado.map((s) => ({
      etiqueta: s.etiqueta,
      cantidad: s.cantidad,
      color: TONO_RGB_ESTADO[ESTADOS_EQUIPO[s.clave].tono] ?? TONO_RGB_ESTADO.info,
    }));
    const xChips = MARGIN + 118;
    const xMax = W - MARGIN - 8;

    // Primero se mide (sin pintar) para saber la altura de la franja
    let yMed = y + 8;
    yMed = filaChips('POR APARTADO', chipsApartado, xChips, yMed, xMax, false) + 5;
    yMed = filaChips('POR ESTADO', chipsEstado, xChips, yMed, xMax, false);
    const franjaH = Math.max(52, yMed + 8 - y);
    if (y + franjaH > H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }

    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.roundedRect(MARGIN, y, UW, franjaH, 4, 4, 'FD');
    doc.setFillColor(...NARANJA);
    doc.rect(MARGIN, y, 3.5, franjaH, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...GRIS_SUAVE);
    doc.text('TOTAL DE EQUIPOS', MARGIN + 12, y + 14);
    doc.setFontSize(22);
    doc.setTextColor(...NARANJA);
    const totalTxt = String(r.total);
    doc.text(totalTxt, MARGIN + 12, y + 38);
    const totalW = doc.getTextWidth(totalTxt);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(r.total === 1 ? 'equipo' : 'equipos', MARGIN + 12 + totalW + 4, y + 38);

    let yc = y + 8;
    yc = filaChips('POR APARTADO', chipsApartado, xChips, yc, xMax, true) + 5;
    filaChips('POR ESTADO', chipsEstado, xChips, yc, xMax, true);
    y += franjaH + 12;

    // b) Grilla de tarjetas
    const cols = orient === 'landscape' ? 4 : 3;
    const GAP = 8;
    const cardW = (UW - GAP * (cols - 1)) / cols;
    const sangria = 10;
    const anchoTexto = cardW - sangria - 8;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...GRIS_SUAVE);
    doc.text(pdfSafe(`EQUIPOS POR ${r.etiquetaAgrupacion.toUpperCase()} · ${r.grupos.length} grupo(s)`), MARGIN, y + 8);
    y += 16;

    interface Tarjeta { titulo: string[]; cantidad: string; pct: string; desglose: string[]; alto: number }
    const medir = (g: GrupoResumen): Tarjeta => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      let titulo = doc.splitTextToSize(pdfSafe(g.etiqueta.toUpperCase()), anchoTexto) as string[];
      if (titulo.length > 2) {
        titulo = titulo.slice(0, 2);
        titulo[1] = `${titulo[1].slice(0, -2)}…`;
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const desglose = lineasDesglose(g.desglose, anchoTexto, 4);
      const alto = 8 + titulo.length * 11 + 20 + (desglose.length ? 4 + desglose.length * 10 : 0) + 8;
      return { titulo, cantidad: String(g.cantidad), pct: `${g.porcentaje} % del total`, desglose, alto };
    };

    for (let i = 0; i < r.grupos.length; i += cols) {
      const fila = r.grupos.slice(i, i + cols).map(medir);
      const altoFila = Math.max(...fila.map((tj) => tj.alto));
      if (y + altoFila > H - MARGIN) {
        doc.addPage();
        y = MARGIN;
      }
      fila.forEach((tj, j) => {
        const x = MARGIN + j * (cardW + GAP);
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(...BORDE);
        doc.setLineWidth(0.6);
        doc.roundedRect(x, y, cardW, altoFila, 4, 4, 'FD');
        doc.setFillColor(...NARANJA);
        doc.rect(x, y + 1, 3, altoFila - 2, 'F');

        // Etiqueta del grupo (máximo 2 líneas)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(...TINTA);
        let ty = y + 17;
        for (const l of tj.titulo) {
          doc.text(l, x + sangria, ty);
          ty += 11;
        }

        // Cantidad grande + «N % del total»
        const ny = y + 8 + tj.titulo.length * 11 + 20;
        doc.setFontSize(20);
        doc.setTextColor(...NARANJA);
        doc.text(tj.cantidad, x + sangria, ny);
        const nw = doc.getTextWidth(tj.cantidad);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...GRIS_SUAVE);
        doc.text(tj.pct, x + sangria + nw + 6, ny);

        // Desglose («CAT 3 · VOLVO 2»)
        doc.setFontSize(8);
        doc.setTextColor(...GRIS_TEXTO);
        let dy = ny + 14;
        for (const l of tj.desglose) {
          doc.text(l, x + sangria, dy);
          dy += 10;
        }
      });
      y += altoFila + GAP;
    }
    y += 4;
  }

  /* ──────────────────────────────────────────────────────────
     FICHAS TÉCNICAS CON FOTO (Estilo Ficha Técnica elegante)
     ────────────────────────────────────────────────────────── */
  {
    const tituloFichas = cat ? `CATÁLOGO Y FICHAS TÉCNICAS · ${cat.toUpperCase()}` : 'CATÁLOGO Y FICHAS TÉCNICAS DE MAQUINARIA Y EQUIPOS';

    if (datosResumen) {
      // El resumen es lo primero (27/10/2026): página 1, debajo del encabezado general.
      dibujarEncabezadoGeneral(
        `RESUMEN DE FLOTA · ${datosResumen.etiquetaAgrupacion.toUpperCase()}`,
        soloResumen ? `Resumen por ${datosResumen.etiquetaAgrupacion.toLowerCase()}` : textoAgrupPdf,
      );
      dibujarResumenFlota(datosResumen);

      if (soloResumen) {
        pies('Resumen de Flota');
        previewPdf(doc, `resumen-flota-${datosResumen.agruparPor}-${hoyStr()}.pdf`);
        return;
      }

      // Las fichas siguen debajo en la misma página si caben; solo se salta cuando no entra
      // el título de la sección con al menos una ficha (el bucle de abajo pide y <= H - 120).
      if (y > H - 150) {
        doc.addPage();
        y = MARGIN;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(255, 138, 0);
      doc.text(pdfSafe(tituloFichas), MARGIN, y + 12);
      doc.setDrawColor(255, 138, 0);
      doc.setLineWidth(0.8);
      doc.line(MARGIN, y + 18, W - MARGIN, y + 18);
      y += 28;
    } else {
      dibujarEncabezadoGeneral(tituloFichas);
    }

    const grupos = agruparEquipos(equipos, modoAgrupar);
    let contadorGeneral = 1;

    for (const [claveGrupo, listaGrupo] of grupos.entries()) {
      // Subtítulo con barra naranja corporativa si va agrupado
      if (y > H - 120) {
        doc.addPage();
        y = MARGIN;
      }

      if (modoAgrupar !== 'ninguno') {
        doc.setFillColor(241, 245, 249);
        doc.rect(MARGIN, y, UW, 16, 'F');
        doc.setFillColor(255, 138, 0);
        doc.rect(MARGIN, y, 3.5, 16, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(30, 41, 59);
        const prefijo = modoAgrupar === 'empresa' ? '🏢 EMPRESA / PROPIETARIO' : '📍 UBICACIÓN / GARAJE';
        doc.text(pdfSafe(`${prefijo}: ${claveGrupo.toUpperCase()} (${listaGrupo.length} equipos)`), MARGIN + 8, y + 11.5);
        y += 22;
      }

      for (const eq of listaGrupo) {
        const ctx = contextoMap?.get(eq.id);

        // Armamos dinámicamente los campos a mostrar en el cuerpo según lo que el usuario marcó
        const camposCuerpo: { etiqueta: string; valor: string }[] = [];

        if (clavesSet.has('tipo')) {
          const extra = [clavesSet.has('anio') && eq.anio ? `Año ${eq.anio}` : null, clavesSet.has('color') && eq.color ? eq.color : null].filter(Boolean);
          camposCuerpo.push({ etiqueta: 'Tipo / Clase: ', valor: `${eq.tipo || '—'}${extra.length ? ` · ${extra.join(' · ')}` : ''}` });
        }
        if (clavesSet.has('propietario')) {
          camposCuerpo.push({ etiqueta: 'Empresa / Prop.: ', valor: eq.propietario || 'Sin propietario asignado' });
        }
        if (clavesSet.has('ubicacion')) {
          camposCuerpo.push({ etiqueta: 'Ubicación / Garaje: ', valor: eq.ubicacion || 'Sin ubicación registrada' });
        }
        if (clavesSet.has('encargado')) {
          camposCuerpo.push({ etiqueta: 'Encargado: ', valor: ctx?.encargado ?? extraerEncargado(eq) ?? '—' });
        }
        if (clavesSet.has('serial')) {
          camposCuerpo.push({ etiqueta: 'Serial / PIN: ', valor: eq.serial || '—' });
        }
        if (clavesSet.has('horometro') || clavesSet.has('kilometraje')) {
          const lecs: string[] = [];
          if (clavesSet.has('horometro')) lecs.push(ctx?.horometro != null ? `${fmtNum(ctx.horometro)} h` : '— h');
          if (clavesSet.has('kilometraje')) lecs.push(ctx?.kilometraje != null ? `${fmtNum(ctx.kilometraje)} km` : '— km');
          camposCuerpo.push({ etiqueta: 'Lectura vigente: ', valor: lecs.join(' · ') || 'Sin lectura registrada' });
        }
        if (clavesSet.has('mantenimiento_cada_hrs') || clavesSet.has('mantenimiento_cada_km')) {
          const mArr: string[] = [];
          if (clavesSet.has('mantenimiento_cada_hrs') && eq.mantenimiento_cada_hrs) mArr.push(`Cada ${fmtNum(eq.mantenimiento_cada_hrs)} h`);
          if (clavesSet.has('mantenimiento_cada_km') && eq.mantenimiento_cada_km) mArr.push(`Cada ${fmtNum(eq.mantenimiento_cada_km)} km`);
          if (ctx?.avisoServicio) mArr.push(ctx.avisoServicio);
          camposCuerpo.push({ etiqueta: 'Mantenimiento: ', valor: mArr.join(' · ') || '—' });
        }
        if (clavesSet.has('combustible') || clavesSet.has('litros_consume')) {
          const cParts: string[] = [];
          if (clavesSet.has('combustible') && eq.combustible) cParts.push(eq.combustible);
          if (clavesSet.has('litros_consume') && eq.litros_consume) cParts.push(`${fmtNum(eq.litros_consume)} L`);
          camposCuerpo.push({ etiqueta: 'Combustible: ', valor: cParts.join(' · ') || '—' });
        }
        if (clavesSet.has('combustible_equipo') && eq.combustible_equipo) {
          camposCuerpo.push({ etiqueta: 'Vinc. Combustible: ', valor: eq.combustible_equipo });
        }
        if (clavesSet.has('color') && !clavesSet.has('tipo') && eq.color) {
          camposCuerpo.push({ etiqueta: 'Color: ', valor: eq.color });
        }
        if (clavesSet.has('anio') && !clavesSet.has('tipo') && eq.anio) {
          camposCuerpo.push({ etiqueta: 'Año: ', valor: String(eq.anio) });
        }

        // Si el usuario no marcó campos de cuerpo, dejamos al menos tipo si existe
        if (!camposCuerpo.length && eq.tipo) {
          camposCuerpo.push({ etiqueta: 'Tipo: ', valor: eq.tipo });
        }

        const numLineas = Math.max(1, Math.ceil(camposCuerpo.length / 2));
        const cardH = Math.max(conFoto ? 82 : 46, 24 + numLineas * 13 + 6);

        if (y + cardH > H - 36) {
          doc.addPage();
          y = MARGIN;
        }

        // Caja de la tarjeta (Card)
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.6);
        doc.roundedRect(MARGIN, y, UW, cardH, 4, 4, 'FD');

        // Franja superior de la tarjeta con nombre y modelo
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(MARGIN, y, UW, 18, 4, 4, 'F');
        doc.setFillColor(255, 138, 0);
        doc.rect(MARGIN, y, 2.5, 18, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.2);
        doc.setTextColor(30, 41, 59);
        const subNombre = [clavesSet.has('marca') ? eq.marca : null, clavesSet.has('modelo') ? eq.modelo : null].filter(Boolean).join(' · ');
        const nomEq = pdfSafe(`${contadorGeneral++}. ${eq.equipo.toUpperCase()}${subNombre ? ` ${subNombre}` : ''}`);
        doc.text(nomEq, MARGIN + 6, y + 12);

        let nextBadgeRight = W - MARGIN - 6;

        // Badge de Estado Efectivo (siempre o si status está marcado)
        if (clavesSet.has('status')) {
          const st = estadoEfectivo(eq);
          const stInfo = ESTADOS_EQUIPO[st] ?? { label: eq.status || 'OPERATIVA' };
          const stColor = st === 'operativa' ? [22, 163, 74] : st === 'taller' || st === 'averiada' ? [220, 38, 38] : [217, 119, 6];
          const stLabel = pdfSafe(stInfo.label.toUpperCase());
          doc.setFontSize(7.5);
          doc.setFont('helvetica', 'bold');
          const stW = doc.getTextWidth(stLabel) + 10;
          const stX = nextBadgeRight - stW;
          doc.setFillColor(stColor[0], stColor[1], stColor[2]);
          doc.roundedRect(stX, y + 3.5, stW, 11, 2, 2, 'F');
          doc.setTextColor(255, 255, 255);
          doc.text(stLabel, stX + stW / 2, y + 11.5, { align: 'center' });
          nextBadgeRight = stX - 6;
        }

        // Badge de Placa (si está marcada)
        if (clavesSet.has('placa') && eq.placa) {
          const plLabel = pdfSafe(`PLACA: ${eq.placa}`);
          doc.setFontSize(7.5);
          doc.setFont('helvetica', 'bold');
          const plW = doc.getTextWidth(plLabel) + 8;
          const plX = nextBadgeRight - plW;
          doc.setFillColor(224, 242, 254);
          doc.roundedRect(plX, y + 3.5, plW, 11, 2, 2, 'F');
          doc.setTextColor(2, 132, 199);
          doc.text(plLabel, plX + plW / 2, y + 11.5, { align: 'center' });
        }

        // Recuadro de Foto a la izquierda (solo si está marcada «Foto del equipo»)
        const imgBoxX = MARGIN + 6;
        const imgBoxY = y + 22;
        const imgBoxW = conFoto ? 68 : 0;
        const imgBoxH = Math.min(cardH - 26, 56);
        if (conFoto) {
          doc.setFillColor(241, 245, 249);
          doc.setDrawColor(226, 232, 240);
          doc.setLineWidth(0.4);
          doc.roundedRect(imgBoxX, imgBoxY, imgBoxW, imgBoxH, 3, 3, 'FD');

          const imgData = fotosDataUrlMap.get(eq.id);
          if (imgData) {
            try {
              const prop = doc.getImageProperties(imgData.data);
              const k = Math.min((imgBoxW - 4) / prop.width, (imgBoxH - 4) / prop.height);
              const iw = prop.width * k;
              const ih = prop.height * k;
              const ix = imgBoxX + (imgBoxW - iw) / 2;
              const iy = imgBoxY + (imgBoxH - ih) / 2;
              doc.addImage(imgData.data, imgData.tipo, ix, iy, iw, ih);
            } catch {
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(7.5);
              doc.setTextColor(148, 163, 184);
              doc.text('Foto no disp.', imgBoxX + imgBoxW / 2, imgBoxY + imgBoxH / 2 + 2, { align: 'center' });
            }
          } else {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(148, 163, 184);
            doc.text('Sin foto', imgBoxX + imgBoxW / 2, imgBoxY + imgBoxH / 2 + 2, { align: 'center' });
          }
        }

        // Especificaciones técnicas a la derecha (2 columnas bien proporcionadas)
        const specX1 = conFoto ? imgBoxX + imgBoxW + 10 : imgBoxX;
        const specW1 = (UW - imgBoxW - 24) * 0.50;
        const specX2 = specX1 + specW1 + 8;

        const drawField = (label: string, val: string, x: number, lineY: number) => {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.2);
          doc.setTextColor(100, 116, 139);
          doc.text(label, x, lineY);
          const lw = doc.getTextWidth(label) + 2;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(30, 41, 59);
          doc.text(pdfSafe(val), x + lw, lineY);
        };

        let ly = y + 31;
        for (let li = 0; li < numLineas; li++) {
          const c1 = camposCuerpo[li * 2];
          const c2 = camposCuerpo[li * 2 + 1];
          if (c1) drawField(c1.etiqueta, c1.valor, specX1, ly);
          if (c2) drawField(c2.etiqueta, c2.valor, specX2, ly);
          ly += 13;
        }

        y += cardH + 7;
      }

      y += 8;
    }

    pies('Catálogo y Fichas Técnicas de Equipos');
    previewPdf(doc, `fichas-tecnicas-maquinaria-${hoyStr()}.pdf`);
  }
}

