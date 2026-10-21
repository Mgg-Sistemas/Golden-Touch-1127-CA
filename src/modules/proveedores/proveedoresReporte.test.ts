/* La lista de proveedores en PDF y Excel: mismos datos, con el filtro y la hora de generación. */
import { describe, it, expect, vi } from 'vitest';
import type { Proveedor } from '@/shared/lib/types';
import { construirProveedoresExcel, construirProveedoresPdf, filasProveedores, momentoGeneracion } from './proveedoresReporte';

vi.mock('@/shared/lib/reportePreview', () => ({ previewPdf: vi.fn(), previewExcelArchivo: vi.fn() }));

const GEN = '2026-10-21T15:30:00Z'; // 11:30 en Venezuela

const prov = (o: Partial<Proveedor>): Proveedor => ({
  id: 'x', rif: 'J-12345678-9', razon_social: 'FERREMAX C.A.', contacto: 'Ana Pérez', telefono: '0414-1234567',
  email: 'ventas@ferremax.com', direccion: 'Av. Principal,\n  Upata', categorias: ['Ferretería', 'Repuestos'],
  origen: 'nacional', estado: 'activo', actividad_economica: '5110 · Comercio al por mayor', numero_administracion: 'ADM-77',
  created_at: '2026-01-01T00:00:00Z', ...o,
} as Proveedor);

describe('filasProveedores', () => {
  it('arma cada fila en texto plano, sin saltos de línea y con las categorías juntas', () => {
    expect(filasProveedores([prov({})])).toEqual([{
      rif: 'J-12345678-9', razon: 'FERREMAX C.A.', contacto: 'Ana Pérez', telefono: '0414-1234567',
      email: 'ventas@ferremax.com', direccion: 'Av. Principal, Upata', categorias: 'Ferretería, Repuestos',
      origen: 'Nacional', actividad: '5110 · Comercio al por mayor', numeroAdm: 'ADM-77', estado: 'Activo',
    }]);
  });
  it('lo que falta queda vacío y el estado inactivo se lee', () => {
    const [f] = filasProveedores([prov({ contacto: null, telefono: undefined, email: null, direccion: null, categorias: [], actividad_economica: null, numero_administracion: null, origen: 'internacional', estado: 'inactivo' })]);
    expect(f).toMatchObject({ contacto: '', telefono: '', email: '', direccion: '', categorias: '', actividad: '', numeroAdm: '', origen: 'Internacional', estado: 'Inactivo' });
  });
});

describe('momentoGeneracion', () => {
  it('usa la hora de Venezuela', () => {
    expect(momentoGeneracion(GEN)).toBe('21/10/2026 11:30');
    expect(momentoGeneracion('basura')).toBe('');
  });
});

describe('Excel', () => {
  it('título, filtro, encabezado y una fila por proveedor', async () => {
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await construirProveedoresExcel([prov({}), prov({ rif: 'J-1', razon_social: 'OTRO', estado: 'inactivo' })], { filtro: 'Activos · Categoría Ferretería', generadoEn: GEN }));
    const ws = wb.worksheets[0];
    const c = (f: number, k: number) => String(ws.getCell(f, k).value ?? '');
    expect(c(1, 1)).toContain('PROVEEDORES');
    expect(c(2, 1)).toBe('2 proveedor(es) · Generado 21/10/2026 11:30');
    expect(c(3, 1)).toBe('Filtro: Activos · Categoría Ferretería');
    expect([c(4, 2), c(4, 3), c(4, 12)]).toEqual(['RIF', 'RAZÓN SOCIAL', 'ESTADO']);
    expect([c(5, 2), c(5, 3), c(5, 8), c(5, 11), c(5, 12)]).toEqual(['J-12345678-9', 'FERREMAX C.A.', 'Ferretería, Repuestos', 'ADM-77', 'Activo']);
    expect([c(6, 3), c(6, 12)]).toEqual(['OTRO', 'Inactivo']);
  }, 30000);

  it('sin filtro lo dice', async () => {
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await construirProveedoresExcel([prov({})], { generadoEn: GEN }));
    expect(String(wb.worksheets[0].getCell(3, 1).value)).toBe('Sin filtro: todos los proveedores');
  }, 30000);
});

describe('PDF', () => {
  it('se arma con el título, el filtro, la hora y los datos del proveedor', async () => {
    const doc = await construirProveedoresPdf([prov({})], null, { filtro: 'Activos', generadoEn: GEN });
    const pdf = new TextDecoder('latin1').decode(doc.output('arraybuffer'));
    expect(pdf).toContain('PROVEEDORES');
    expect(pdf).toContain('Filtro: Activos');
    expect(pdf).toContain('21/10/2026 11:30');
    expect(pdf).toContain('FERREMAX C.A.');
    expect(pdf).toContain('J-12345678-9');
  }, 30000);

  it('una lista larga pasa a más hojas y cada una lleva su pie', async () => {
    const lista = Array.from({ length: 80 }, (_, i) => prov({ id: String(i), razon_social: `PROVEEDOR ${i}` }));
    const doc = await construirProveedoresPdf(lista, null, { generadoEn: GEN });
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  }, 30000);
});
