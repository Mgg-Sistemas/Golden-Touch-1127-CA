import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Workbook } from 'exceljs';
import {
  normalizarUbicacion,
  UBICACION_UNIFICADA_GT,
  agruparEquipos,
  CAMPOS_EQUIPO,
  AGRUPACIONES_RESUMEN,
  descargarEquiposExcelPersonalizado,
  descargarEquiposPdfPersonalizado,
  type ContextoEquipoExportar,
  type ModoAgrupacionEquipos,
  type OpcionesResumenFlota,
  type OrientacionHoja,
} from './exportarEquipos';
import type { MaquinariaEquipo } from './maquinariaEquipos.repository';

describe('exportarEquipos · normalizarUbicacion y unificación Peramanal/Golden Touch', () => {
  it('unifica "GT Peramanal", "GT PERAMANAL" y "MINA GOLDEN TOUCH" en la misma denominación', () => {
    expect(normalizarUbicacion('GT Peramanal')).toBe(UBICACION_UNIFICADA_GT);
    expect(normalizarUbicacion('GT PERAMANAL')).toBe(UBICACION_UNIFICADA_GT);
    expect(normalizarUbicacion('MINA GOLDEN TOUCH')).toBe(UBICACION_UNIFICADA_GT);
    expect(normalizarUbicacion('Peramanal')).toBe(UBICACION_UNIFICADA_GT);
    expect(normalizarUbicacion('Mina Peramanal')).toBe(UBICACION_UNIFICADA_GT);
    expect(normalizarUbicacion('Golden Touch')).toBe(UBICACION_UNIFICADA_GT);
  });

  it('mantiene y normaliza en mayúsculas otras ubicaciones sin duplicados por casing', () => {
    expect(normalizarUbicacion('La Guaira')).toBe('LA GUAIRA');
    expect(normalizarUbicacion('la guaira')).toBe('LA GUAIRA');
    expect(normalizarUbicacion('METAL FÉNIX')).toBe('METAL FÉNIX');
    expect(normalizarUbicacion('c.a. la esperanza')).toBe('C.A. LA ESPERANZA');
    expect(normalizarUbicacion('GLOBAL MINERAL TIN')).toBe('GLOBAL MINERAL TIN');
    expect(normalizarUbicacion(null)).toBe('');
    expect(normalizarUbicacion('')).toBe('');
  });

  it('agrupa por ubicación reuniendo todos los equipos de Peramanal y Golden Touch en una sola sección', () => {
    const eq1 = { id: '1', equipo: 'Excavadora 1', ubicacion: 'GT Peramanal' } as MaquinariaEquipo;
    const eq2 = { id: '2', equipo: 'Camión 1', ubicacion: 'MINA GOLDEN TOUCH' } as MaquinariaEquipo;
    const eq3 = { id: '3', equipo: 'Planta 1', ubicacion: 'GT PERAMANAL' } as MaquinariaEquipo;
    const eq4 = { id: '4', equipo: 'Tractor 1', ubicacion: 'LA GUAIRA' } as MaquinariaEquipo;
    const eq5 = { id: '5', equipo: 'Moto 1', ubicacion: null } as MaquinariaEquipo;

    const grupos = agruparEquipos([eq1, eq2, eq3, eq4, eq5], 'ubicacion');

    expect(grupos.has(UBICACION_UNIFICADA_GT)).toBe(true);
    expect(grupos.get(UBICACION_UNIFICADA_GT)?.length).toBe(3);
    expect(grupos.get(UBICACION_UNIFICADA_GT)?.map((x) => x.id)).toEqual(['1', '2', '3']);

    expect(grupos.has('LA GUAIRA')).toBe(true);
    expect(grupos.get('LA GUAIRA')?.length).toBe(1);

    expect(grupos.has('SIN UBICACIÓN ASIGNADA')).toBe(true);
    expect(grupos.get('SIN UBICACIÓN ASIGNADA')?.length).toBe(1);
  });

  it('el campo Ubicación/Garaje en la tabla exportada devuelve la ubicación unificada', () => {
    const campoUbicacion = CAMPOS_EQUIPO.find((c) => c.clave === 'ubicacion');
    expect(campoUbicacion).toBeDefined();

    const eq = { id: '1', equipo: 'D6', ubicacion: 'GT Peramanal' } as MaquinariaEquipo;
    expect(campoUbicacion?.valor(eq)).toBe(UBICACION_UNIFICADA_GT);
  });
});

/* ───────── Resumen de flota en tarjetas (27/10/2026): humo del PDF y del Excel ─────────
   jsPDF, el logo, la vista previa y las fotos se simulan. Lo que se verifica: el resumen
   sale primero (página 1), las fichas siguen debajo sin salto forzado, los nombres de
   archivo, y que la hoja «Resumen» del Excel va primera (o sola con soloResumen). */

const pdfMock = vi.hoisted(() => {
  const textos: { texto: string; pagina: number }[] = [];
  const llamadas: string[] = [];
  class JsPDFMock {
    ancho: number;
    fontSize = 10;
    paginas = 1;
    paginaActual = 1;
    internal = { pageSize: { getWidth: () => this.ancho, getHeight: () => 792 } };
    constructor(opts?: { orientation?: string }) {
      this.ancho = opts?.orientation === 'landscape' ? 792 : 612;
    }
    setFont() { return this; }
    setFontSize(n: number) { this.fontSize = n; return this; }
    setTextColor() { return this; }
    setFillColor() { return this; }
    setDrawColor() { return this; }
    setLineWidth() { return this; }
    rect() { llamadas.push('rect'); return this; }
    roundedRect() { llamadas.push('roundedRect'); return this; }
    circle() { llamadas.push('circle'); return this; }
    line() { return this; }
    text(t: string | string[]) {
      for (const s of Array.isArray(t) ? t : [t]) textos.push({ texto: s, pagina: this.paginaActual });
      return this;
    }
    getTextWidth(t: string) { return t.length * this.fontSize * 0.55; }
    splitTextToSize(t: string, max: number): string[] {
      const lineas: string[] = [];
      let actual = '';
      for (const palabra of String(t).split(' ')) {
        const prueba = actual ? `${actual} ${palabra}` : palabra;
        if (!actual || this.getTextWidth(prueba) <= max) actual = prueba;
        else { lineas.push(actual); actual = palabra; }
      }
      lineas.push(actual);
      return lineas;
    }
    addPage() { this.paginas++; this.paginaActual = this.paginas; llamadas.push('addPage'); return this; }
    setPage(n: number) { this.paginaActual = n; return this; }
    getNumberOfPages() { return this.paginas; }
    getImageProperties() { return { width: 100, height: 100 }; }
    addImage() { return this; }
  }
  return { JsPDFMock, textos, llamadas, limpiar() { textos.length = 0; llamadas.length = 0; } };
});

const previewMock = vi.hoisted(() => ({
  previewPdf: vi.fn(),
  previewExcelArchivo: vi.fn(),
}));

vi.mock('jspdf', () => ({ jsPDF: pdfMock.JsPDFMock }));
vi.mock('@/shared/lib/pdfLogo', () => ({
  loadLogoPdfDataUrl: async () => null,
  dibujarLogoPdf: () => undefined,
  anchoLogoPdf: () => 0,
}));
vi.mock('@/shared/lib/reportePreview', () => previewMock);
vi.mock('./flota.repository', () => ({ fotosDeEquipos: async () => [] }));

let nResumen = 0;
const equipoResumen = (p: Partial<MaquinariaEquipo>): MaquinariaEquipo =>
  ({ id: `r${++nResumen}`, equipo: `Equipo ${nResumen}`, status: 'ACTIVO', activo: true, ...p } as MaquinariaEquipo);

/** 5 retroexcavadoras (CAT 3 · Volvo 2) + 1 SUV por confirmar = 6 equipos. */
const flotaResumen = (): MaquinariaEquipo[] => [
  equipoResumen({ tipo: 'Retroexcavadora', marca: 'CAT', propietario: 'Golden Touch' }),
  equipoResumen({ tipo: 'Retroexcavadora', marca: 'CAT', propietario: 'Golden Touch' }),
  equipoResumen({ tipo: 'Retroexcavadora', marca: 'CAT' }),
  equipoResumen({ tipo: 'Retroexcavadora', marca: 'Volvo' }),
  equipoResumen({ tipo: 'Retroexcavadora', marca: 'Volvo' }),
  equipoResumen({ tipo: 'SUV', marca: 'Toyota', status: 'POR CONFIRMAR' }),
];

describe('exportarEquipos · resumen de flota en tarjetas (PDF)', () => {
  beforeEach(() => {
    pdfMock.limpiar();
    previewMock.previewPdf.mockClear();
    previewMock.previewExcelArchivo.mockClear();
  });

  const textos = () => pdfMock.textos.map((t) => t.texto);
  const paginaDe = (buscado: string) => pdfMock.textos.find((t) => t.texto.includes(buscado))?.pagina;

  it('contrato: `resumen` es el último parámetro opcional del PDF y del Excel; los demás no cambian de orden', () => {
    const opciones: OpcionesResumenFlota = { activo: true, agruparPor: 'tipo', soloResumen: true };
    const pdf: (
      equipos: MaquinariaEquipo[], claves: string[], agrupacion?: ModoAgrupacionEquipos | boolean,
      contextoMap?: Map<string, ContextoEquipoExportar>, orientacion?: OrientacionHoja, fotosMap?: Map<string, string>,
      categoria?: string | null, resumen?: OpcionesResumenFlota,
    ) => Promise<void> = descargarEquiposPdfPersonalizado;
    const xlsx: (
      equipos: MaquinariaEquipo[], claves: string[], agrupacion?: ModoAgrupacionEquipos | boolean,
      contextoMap?: Map<string, ContextoEquipoExportar>, orientacion?: OrientacionHoja,
      categoria?: string | null, resumen?: OpcionesResumenFlota,
    ) => Promise<void> = descargarEquiposExcelPersonalizado;
    expect(typeof pdf).toBe('function');
    expect(typeof xlsx).toBe('function');
    expect(opciones.soloResumen).toBe(true);
    expect(AGRUPACIONES_RESUMEN.map((a) => a.id)).toEqual(['tipo', 'marca', 'apartado', 'estado', 'propietario']);
  });

  it('sin `resumen` el PDF sigue exactamente como hoy (sin resumen, mismo nombre de archivo)', async () => {
    await descargarEquiposPdfPersonalizado(flotaResumen(), ['equipo', 'tipo', 'marca'], 'empresa', undefined, 'vertical');
    const t = textos();
    expect(t.some((s) => s.startsWith('RESUMEN DE FLOTA'))).toBe(false);
    expect(t.some((s) => s.includes('CATÁLOGO Y FICHAS TÉCNICAS'))).toBe(true);
    expect(previewMock.previewPdf).toHaveBeenCalledTimes(1);
    expect(previewMock.previewPdf.mock.calls[0][1]).toMatch(/^fichas-tecnicas-maquinaria-\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it('soloResumen: franja de totales + tarjetas, sin fichas, y nombre resumen-flota-<agrupación>', async () => {
    await descargarEquiposPdfPersonalizado(flotaResumen(), [], 'empresa', undefined, 'vertical', undefined, null, {
      activo: true, agruparPor: 'tipo', soloResumen: true,
    });
    const t = textos();
    expect(t).toContain('RESUMEN DE FLOTA · TIPO DE EQUIPO');
    expect(t).toContain('TOTAL DE EQUIPOS');
    expect(t).toContain('6');
    expect(t).toContain('RETROEXCAVADORA');
    expect(t).toContain('5');
    expect(t).toContain('83 % del total');
    expect(t).toContain('CAT 3 · VOLVO 2');
    expect(t).toContain('Vehículos');
    expect(t).toContain('Por confirmar');
    expect(pdfMock.llamadas).toContain('circle');
    expect(t.some((s) => s.includes('CATÁLOGO Y FICHAS TÉCNICAS'))).toBe(false);
    expect(t.some((s) => /^1\. /.test(s))).toBe(false);
    expect(previewMock.previewPdf.mock.calls[0][1]).toMatch(/^resumen-flota-tipo-\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it('resumen + fichas: el resumen va primero en la página 1 y las fichas siguen debajo sin salto forzado', async () => {
    await descargarEquiposPdfPersonalizado(flotaResumen().slice(0, 3), ['equipo', 'tipo', 'marca'], 'ninguno', undefined, 'vertical', undefined, null, {
      activo: true, agruparPor: 'marca',
    });
    const t = textos();
    const iResumen = t.indexOf('RESUMEN DE FLOTA · MARCA');
    const iCatalogo = t.findIndex((s) => s.includes('CATÁLOGO Y FICHAS TÉCNICAS'));
    const iFicha = t.findIndex((s) => /^1\. /.test(s));
    expect(iResumen).toBeGreaterThanOrEqual(0);
    expect(iCatalogo).toBeGreaterThan(iResumen);
    expect(iFicha).toBeGreaterThan(iCatalogo);
    expect(t).toContain('CAT');
    expect(t).toContain('100 % del total');
    expect(paginaDe('RESUMEN DE FLOTA')).toBe(1);
    expect(paginaDe('CATÁLOGO Y FICHAS TÉCNICAS')).toBe(1);
    expect(paginaDe('1. ')).toBe(1);
    expect(previewMock.previewPdf.mock.calls[0][1]).toMatch(/^fichas-tecnicas-maquinaria-/);
  });

  it('en horizontal y en vertical salen las mismas tarjetas (4 o 3 por fila; nunca se pierde una)', async () => {
    const muchos = [...flotaResumen(), equipoResumen({ tipo: 'Camión', marca: 'Mack' }), equipoResumen({ tipo: 'Lancha', marca: 'Yamaha' })];
    await descargarEquiposPdfPersonalizado(muchos, [], 'ninguno', undefined, 'horizontal', undefined, null, { activo: true, agruparPor: 'tipo', soloResumen: true });
    const tarjetasH = pdfMock.llamadas.filter((l) => l === 'roundedRect').length;
    pdfMock.limpiar();
    await descargarEquiposPdfPersonalizado(muchos, [], 'ninguno', undefined, 'vertical', undefined, null, { activo: true, agruparPor: 'tipo', soloResumen: true });
    const tarjetasV = pdfMock.llamadas.filter((l) => l === 'roundedRect').length;
    expect(tarjetasH).toBe(tarjetasV);
    expect(pdfMock.textos.map((t) => t.texto)).toEqual(expect.arrayContaining(['RETROEXCAVADORA', 'SUV', 'CAMIÓN', 'LANCHA']));
  });
});

describe('exportarEquipos · hoja «Resumen» del Excel', () => {
  beforeEach(() => previewMock.previewExcelArchivo.mockClear());

  async function leerLibro(): Promise<Workbook> {
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(previewMock.previewExcelArchivo.mock.calls[0][0] as ArrayBuffer);
    return wb;
  }

  it('soloResumen: el libro trae únicamente la hoja «Resumen» con la tabla por grupo y los totales', async () => {
    await descargarEquiposExcelPersonalizado(flotaResumen(), [], 'empresa', undefined, 'auto', null, {
      activo: true, agruparPor: 'tipo', soloResumen: true,
    });
    expect(previewMock.previewExcelArchivo.mock.calls[0][1]).toMatch(/^resumen-flota-tipo-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const wb = await leerLibro();
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Resumen']);
    const ws = wb.worksheets[0];
    expect((ws.getRow(4).values as unknown[]).slice(1)).toEqual(['Tipo de equipo', 'Cantidad', '%', 'Desglose']);
    expect(ws.getRow(5).getCell(1).value).toBe('🚜 RETROEXCAVADORA');
    expect(ws.getRow(5).getCell(2).value).toBe(5);
    expect(ws.getRow(5).getCell(3).value).toBeCloseTo(0.83);
    expect(ws.getRow(5).getCell(4).value).toBe('CAT 3 · VOLVO 2');
    expect(ws.getRow(6).getCell(1).value).toBe('🚚 SUV');
    expect(ws.getRow(7).getCell(1).value).toBe('TOTAL');
    expect(ws.getRow(7).getCell(2).value).toBe(6);
    const col1: unknown[] = [];
    ws.eachRow((row) => col1.push(row.getCell(1).value));
    expect(col1).toEqual(expect.arrayContaining(['Apartado', '🚜 Maquinaria y Equipos', '🚚 Vehículos', 'Estado', '✅ Operativa', '❔ Por confirmar']));
  });

  it('resumen + datos: «Resumen» es la primera hoja, «Equipos» sigue y el nombre de archivo es el de siempre', async () => {
    await descargarEquiposExcelPersonalizado(flotaResumen(), ['equipo', 'tipo'], 'empresa', undefined, 'auto', null, {
      activo: true, agruparPor: 'estado',
    });
    expect(previewMock.previewExcelArchivo.mock.calls[0][1]).toMatch(/^control-maquinaria-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const wb = await leerLibro();
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Resumen', 'Equipos']);
    expect((wb.worksheets[0].getRow(4).values as unknown[]).slice(1)).toEqual(['Estado', 'Cantidad', '%', 'Desglose']);
    expect(wb.worksheets[0].getRow(5).getCell(1).value).toBe('✅ Operativa');
  });

  it('sin `resumen` el Excel trae solo la hoja «Equipos», como hoy', async () => {
    await descargarEquiposExcelPersonalizado(flotaResumen(), ['equipo', 'tipo'], 'empresa');
    const wb = await leerLibro();
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Equipos']);
  });
});
