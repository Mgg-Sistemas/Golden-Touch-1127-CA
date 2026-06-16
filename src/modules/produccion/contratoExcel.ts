/* ============================================================
   Golden Touch · Producción · Export Excel de contratos de producción
   Exporta los contratos recibidos (respeta el filtro aplicado).
   Incluye los inputs y todas las fórmulas del Excel original.
   ============================================================ */
import type { ContratoAcopio } from '@/shared/lib/types';

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
const TOTAL_STYLE = { font: { name: 'Arial', sz: 11, bold: true }, fill: { patternType: 'solid', fgColor: { rgb: 'F0F0F0' } } };

export async function descargarContratosExcel(rows: ContratoAcopio[]): Promise<void> {
  const [XLSXmod, { dateTime }] = await Promise.all([import('xlsx-js-style'), import('@/shared/lib/format')]);
  const XLSX = XLSXmod as unknown as {
    utils: {
      aoa_to_sheet: (d: unknown[][]) => Record<string, unknown>;
      encode_cell: (c: { r: number; c: number }) => string;
      book_new: () => unknown; book_append_sheet: (wb: unknown, ws: unknown, name: string) => void;
    };
    writeFile: (wb: unknown, name: string) => void;
  };

  const head = ['N° Contrato', 'Fecha', 'Hora', 'Supervisor', 'Lugar', 'Molino', 'Ton procesadas', 'Tolva',
    'Kg húmedo', '% recup. impurezas', 'Kg secos', '% humedad', 'Kg seco limpio', '% Recup. Casiterita',
    'Kg hierro', '% hierro', 'Estado', 'Observación'];

  const filas = rows.map((c) => [
    c.numero, c.fecha, c.hora || '', c.supervisor || '', c.lugar_extraccion || '', c.molino || '',
    n(c.ton_procesadas), n(c.tolva), n(c.kg_humedo), n(c.pct_recuperado_impurezas), n(c.kg_secos), n(c.pct_humedad),
    n(c.kg_seco_limpio), n(c.pct_recuperacion_casiterita), n(c.kg_hierro), n(c.pct_hierro),
    c.estado === 'activo' ? 'Activo' : 'Cerrado', c.observaciones || '',
  ]);
  const totFila = ['', '', '', '', '', 'TOTALES',
    rows.reduce((a, c) => a + n(c.ton_procesadas), 0), '', rows.reduce((a, c) => a + n(c.kg_humedo), 0), '',
    rows.reduce((a, c) => a + n(c.kg_secos), 0), '', rows.reduce((a, c) => a + n(c.kg_seco_limpio), 0), '',
    rows.reduce((a, c) => a + n(c.kg_hierro), 0), '', '', ''];

  const aoa: unknown[][] = [
    ['DATOS DE REPORTE PRODUCCIÓN · GOLDEN TOUCH 1127 C.A.'],
    [`${rows.length} contrato(s) · ${dateTime(new Date().toISOString())}`],
    [],
    head, ...filas, totFila,
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  (ws as Record<string, unknown>)['!cols'] = head.map((_, i) => ({ wch: i === 0 ? 16 : i >= 6 ? 13 : 16 }));
  (ws as Record<string, unknown>)['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: head.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: head.length - 1 } },
  ];
  const cellAt = (r: number, c: number) => (ws as Record<string, { s?: unknown }>)[XLSX.utils.encode_cell({ r, c })];
  const t = cellAt(0, 0); if (t) t.s = TITLE_STYLE;
  head.forEach((_, c) => { const cell = cellAt(3, c); if (cell) cell.s = HEADER_STYLE; });
  const totIdx = 4 + filas.length;
  head.forEach((_, c) => { const cell = cellAt(totIdx, c); if (cell) cell.s = TOTAL_STYLE; });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Contratos');
  XLSX.writeFile(wb, 'datos-reporte-produccion.xlsx');
}
