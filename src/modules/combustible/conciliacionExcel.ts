/* ============================================================
   Golden Touch · Combustible · Export Excel del historial de conciliaciones
   Exporta las conciliaciones recibidas (respeta el filtro aplicado).
   ============================================================ */
import type { ConciliacionRow } from './conciliacionPdf';

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

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
const TOTAL_STYLE = {
  font: { name: 'Arial', sz: 11, bold: true },
  fill: { patternType: 'solid', fgColor: { rgb: 'F0F0F0' } },
};

export async function descargarConciliacionesExcel(rows: ConciliacionRow[]): Promise<void> {
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

  const head = ['Semana', 'Tanque', 'Registrada', 'Libros (L)', 'Libreta mina (L)', 'Dif. (L)', 'Notas'];
  const filas = rows.map((c) => [
    c.periodo || '', c.tanqueNombre, c.fecha,
    n(c.saldo_libros), n(c.saldo_reportado_mina), n(c.diferencia), c.notas || '',
  ]);
  const totLibros = rows.reduce((a, c) => a + n(c.saldo_libros), 0);
  const totLibreta = rows.reduce((a, c) => a + n(c.saldo_reportado_mina), 0);
  const totalFila = ['', 'TOTALES', '', totLibros, totLibreta, '', ''];

  const aoa: unknown[][] = [
    ['COMBUSTIBLE · CONCILIACIONES · GOLDEN TOUCH 1127 C.A.'],
    [`${rows.length} registro(s) · ${dateTime(new Date().toISOString())}`],
    [],
    head,
    ...filas,
    totalFila,
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  (ws as Record<string, unknown>)['!cols'] = [
    { wch: 22 }, { wch: 26 }, { wch: 13 }, { wch: 12 }, { wch: 16 }, { wch: 11 }, { wch: 30 },
  ];
  (ws as Record<string, unknown>)['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: head.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: head.length - 1 } },
  ];
  const cellAt = (r: number, c: number) => (ws as Record<string, { s?: unknown }>)[XLSX.utils.encode_cell({ r, c })];
  const tituloCell = cellAt(0, 0); if (tituloCell) tituloCell.s = TITLE_STYLE;
  head.forEach((_, c) => { const cell = cellAt(3, c); if (cell) cell.s = HEADER_STYLE; });
  const totalRowIdx = 4 + filas.length;
  head.forEach((_, c) => { const cell = cellAt(totalRowIdx, c); if (cell) cell.s = TOTAL_STYLE; });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Conciliaciones');
  XLSX.writeFile(wb, 'combustible-conciliaciones.xlsx');
}
