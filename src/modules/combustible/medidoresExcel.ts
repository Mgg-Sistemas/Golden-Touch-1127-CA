/* ============================================================
   Golden Touch · Combustible · Export Excel de Medidores por equipo
   ============================================================ */
import type { MedidorCombustible } from '@/shared/lib/types';

const n = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : '');

const HEADER_STYLE = {
  font: { name: 'Arial', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
  fill: { patternType: 'solid', fgColor: { rgb: 'FF8A00' } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: {
    top: { style: 'thin', color: { rgb: '000000' } }, bottom: { style: 'thin', color: { rgb: '000000' } },
    left: { style: 'thin', color: { rgb: '000000' } }, right: { style: 'thin', color: { rgb: '000000' } },
  },
};
const TITLE_STYLE = { ...HEADER_STYLE, font: { ...HEADER_STYLE.font, sz: 14 }, alignment: { horizontal: 'left', vertical: 'center' } };

export async function descargarMedidoresExcel(rows: MedidorCombustible[]): Promise<void> {
  const [XLSXmod, { dateTime }] = await Promise.all([
    import('xlsx-js-style'),
    import('@/shared/lib/format'),
  ]);
  const XLSX = XLSXmod as unknown as {
    utils: {
      aoa_to_sheet: (d: unknown[][]) => Record<string, unknown>;
      encode_cell: (c: { r: number; c: number }) => string;
      book_new: () => unknown;
      book_append_sheet: (wb: unknown, ws: unknown, name: string) => void;
    };
    writeFile: (wb: unknown, name: string) => void;
  };

  const head = ['Fecha', 'Equipo', 'Horóm. ini', 'Horóm. fin', 'Horas', 'Cont. ini', 'Cont. fin', 'Dif', 'Observación'];
  const filas = rows.map((m) => [
    m.fecha, m.equipo, n(m.horometro_ini), n(m.horometro_fin), n(m.horas), n(m.contador_ini), n(m.contador_fin), n(m.contador_dif), m.observacion || '',
  ]);

  const aoa: unknown[][] = [
    ['COMBUSTIBLE · MEDIDORES POR EQUIPO · Golden Touch'],
    [`${rows.length} lectura(s) · ${dateTime(new Date().toISOString())}`],
    [],
    head,
    ...filas,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  (ws as Record<string, unknown>)['!cols'] = [{ wch: 12 }, { wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 26 }];
  (ws as Record<string, unknown>)['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: head.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: head.length - 1 } },
  ];
  const cellAt = (r: number, c: number) => (ws as Record<string, { s?: unknown }>)[XLSX.utils.encode_cell({ r, c })];
  const tituloCell = cellAt(0, 0); if (tituloCell) tituloCell.s = TITLE_STYLE;
  head.forEach((_, c) => { const cell = cellAt(3, c); if (cell) cell.s = HEADER_STYLE; });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Medidores');
  XLSX.writeFile(wb, 'combustible-medidores.xlsx');
}
