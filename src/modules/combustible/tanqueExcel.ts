/* ============================================================
   Golden Touch · Combustible · Export Excel del libro mayor de un tanque
   Exporta los movimientos recibidos (respeta el filtro aplicado).
   ============================================================ */
import type { MovimientoTanque, TanqueCombustible } from '@/shared/lib/types';

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const litrosDe = (m: MovimientoTanque, tipo: MovimientoTanque['tipo']) => (m.tipo === tipo ? n(m.litros) : '');

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

export async function descargarMovimientosTanqueExcel(tanque: TanqueCombustible, movs: MovimientoTanque[]): Promise<void> {
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

  const head = ['Fecha', 'Hora', 'Tipo', 'Equipo', 'Autorizado', 'Ubicación', 'Observación', 'HI', 'HF', 'Hrs', 'Entrada', 'Uso', 'Traslado', 'Retorno', 'Saldo L', 'Tasa $/L', '$ Mov.', 'Saldo $'];
  const TIPO_LABEL: Record<string, string> = { entrada: 'Entrada', uso: 'Uso', traslado: 'Traslado', retorno: 'Retorno' };

  const filas = movs.map((m) => [
    m.fecha, m.hora || '', TIPO_LABEL[m.tipo] ?? m.tipo, m.equipo || '', m.autorizado_por || '', m.ubicacion || '', m.observacion || '',
    m.horometro_ini != null ? n(m.horometro_ini) : '', m.horometro_fin != null ? n(m.horometro_fin) : '', m.horas_utilizadas ? n(m.horas_utilizadas) : '',
    litrosDe(m, 'entrada'), litrosDe(m, 'uso'), litrosDe(m, 'traslado'), litrosDe(m, 'retorno'),
    n(m.saldo_litros), n(m.tasa_usd_litro), n(m.monto_usd), n(m.saldo_usd),
  ]);

  const aoa: unknown[][] = [
    [`COMBUSTIBLE · ${tanque.nombre.toUpperCase()} · Golden Touch`],
    [`Saldo ${n(tanque.saldo_litros)} L · ${n(tanque.saldo_usd)} USD · ${movs.length} movimiento(s) · ${dateTime(new Date().toISOString())}`],
    [],
    head,
    ...filas,
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  (ws as Record<string, unknown>)['!cols'] = [
    { wch: 12 }, { wch: 11 }, { wch: 10 }, { wch: 20 }, { wch: 16 }, { wch: 18 }, { wch: 24 },
    { wch: 8 }, { wch: 8 }, { wch: 7 }, { wch: 10 }, { wch: 9 }, { wch: 10 }, { wch: 10 }, { wch: 11 }, { wch: 9 }, { wch: 11 }, { wch: 12 },
  ];
  (ws as Record<string, unknown>)['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: head.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: head.length - 1 } },
  ];
  const cellAt = (r: number, c: number) => (ws as Record<string, { s?: unknown }>)[XLSX.utils.encode_cell({ r, c })];
  const tituloCell = cellAt(0, 0); if (tituloCell) tituloCell.s = TITLE_STYLE;
  head.forEach((_, c) => { const cell = cellAt(3, c); if (cell) cell.s = HEADER_STYLE; });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Libro mayor');
  XLSX.writeFile(wb, `combustible-${tanque.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}.xlsx`);
}
