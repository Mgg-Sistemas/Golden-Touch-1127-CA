/* ============================================================
   Golden Touch · Combustible · Export Excel de Existencias y Movimientos
   Genera libro con 2 hojas:
     1. Existencias actuales por tanque
     2. Movimientos de surtidos y traslados
   ============================================================ */
import type { MovimientoTanque, TanqueCombustible } from '@/shared/lib/types';
import type { ReporteTanque } from './tanques.repository';
import { previewExcel } from '@/shared/lib/reportePreview';
import { fechaParaExcel } from './horaMovimiento';
import { esBidon } from './bidonCombustible';

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const HEADER_STYLE = {
  font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
  fill: { patternType: 'solid', fgColor: { rgb: 'FF8A00' } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: {
    top: { style: 'thin', color: { rgb: '000000' } },
    bottom: { style: 'thin', color: { rgb: '000000' } },
    left: { style: 'thin', color: { rgb: '000000' } },
    right: { style: 'thin', color: { rgb: '000000' } },
  },
};

const TITLE_STYLE = {
  ...HEADER_STYLE,
  font: { ...HEADER_STYLE.font, sz: 13 },
  alignment: { horizontal: 'left', vertical: 'center' },
};

const TOTAL_STYLE = {
  font: { name: 'Arial', sz: 10, bold: true, color: { rgb: '000000' } },
  fill: { patternType: 'solid', fgColor: { rgb: 'FFF0D6' } },
  border: {
    top: { style: 'thin', color: { rgb: 'FF8A00' } },
    bottom: { style: 'double', color: { rgb: 'FF8A00' } },
  },
};

export interface ReporteExistenciasExcelArgs {
  reportes: ReporteTanque[];
  detallePorTanque: Array<{
    tanque: TanqueCombustible;
    disponible: number;
    movimientos: MovimientoTanque[];
    surtidosLitros: number;
    trasladosLitros: number;
  }>;
  periodoLabel: string;
}

export async function descargarReporteExistenciasExcel({
  reportes,
  detallePorTanque,
  periodoLabel,
}: ReporteExistenciasExcelArgs): Promise<void> {
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

  const wb = XLSX.utils.book_new();

  // ================= HOJA 1: EXISTENCIAS =================
  const headExistencias = [
    '#',
    'Tanque',
    'Tipo',
    'Litros Disponibles',
    'Capacidad (L)',
    '% Lleno',
    'Tasa ($/L)',
    'Valor Total ($)',
    'Estado',
  ];

  let sumLitros = 0;
  let sumValor = 0;

  const filasExistencias = reportes.map((r, i) => {
    const cap = n(r.tanque.capacidad_litros);
    const disp = n(r.disponible);
    const tasa = n(r.tanque.tasa_usd_litro);
    const valor = disp * tasa;
    const pct = cap > 0 ? Math.min(100, Math.max(0, (disp / cap) * 100)) : 0;
    sumLitros += disp;
    sumValor += valor;

    return [
      i + 1,
      r.tanque.nombre,
      esBidon(r.tanque.nombre) ? 'Bidón' : r.tanque.es_movil ? 'Móvil' : 'Estacionario',
      disp,
      cap,
      `${pct.toFixed(0)}%`,
      tasa,
      valor,
      r.tanque.estado === 'activo' ? 'Activo' : 'Inactivo',
    ];
  });

  const tasaProm = sumLitros > 0 ? sumValor / sumLitros : 0;
  const filaTotales = [
    'TOTAL',
    `${reportes.length} tanques`,
    '',
    sumLitros,
    '',
    '',
    tasaProm,
    sumValor,
    '',
  ];

  const aoaExistencias: unknown[][] = [
    ['GOLDEN TOUCH 1127 C.A. · EXISTENCIAS DE COMBUSTIBLE'],
    [`Emitido: ${dateTime(new Date().toISOString())} · Periodo: ${periodoLabel}`],
    [],
    headExistencias,
    ...filasExistencias,
    filaTotales,
  ];

  const wsExistencias = XLSX.utils.aoa_to_sheet(aoaExistencias);
  (wsExistencias as Record<string, unknown>)['!cols'] = [
    { wch: 5 },
    { wch: 30 },
    { wch: 15 },
    { wch: 18 },
    { wch: 16 },
    { wch: 12 },
    { wch: 14 },
    { wch: 16 },
    { wch: 12 },
  ];
  (wsExistencias as Record<string, unknown>)['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: headExistencias.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: headExistencias.length - 1 } },
  ];

  const cellAt1 = (r: number, c: number) =>
    (wsExistencias as Record<string, { s?: unknown }>)[XLSX.utils.encode_cell({ r, c })];
  const tit1 = cellAt1(0, 0);
  if (tit1) tit1.s = TITLE_STYLE;
  headExistencias.forEach((_, c) => {
    const cell = cellAt1(3, c);
    if (cell) cell.s = HEADER_STYLE;
  });
  const rowTotalIdx = 4 + filasExistencias.length;
  headExistencias.forEach((_, c) => {
    const cell = cellAt1(rowTotalIdx, c);
    if (cell) cell.s = TOTAL_STYLE;
  });

  XLSX.utils.book_append_sheet(wb, wsExistencias, 'Existencias Actuales');

  // ================= HOJA 2: MOVIMIENTOS =================
  const headMovs = [
    '#',
    'Fecha',
    'Hora',
    'Tanque',
    'Tipo',
    'Equipo / Destino',
    'Horómetro',
    'Kilometraje',
    'Litros',
    'Saldo Tanque (L)',
    'Autorizado / Desp.',
    'Observaciones',
  ];

  const COL_FECHA_MOVS = 1;
  const TIPO_LABEL: Record<string, string> = {
    uso: 'Surtido',
    traslado: 'Traslado',
    entrada: 'Entrada',
    retorno: 'Retorno',
    merma: 'Merma',
  };

  const filasMovs: unknown[][] = [];
  let contadorFila = 1;

  for (const item of detallePorTanque) {
    for (const m of item.movimientos) {
      const esSalida = m.tipo === 'uso' || m.tipo === 'traslado' || m.tipo === 'merma';
      const destinoTxt =
        m.tipo === 'uso'
          ? m.equipo || 'Equipo'
          : m.ubicacion || 'Traslado';

      filasMovs.push([
        contadorFila++,
        fechaParaExcel(m.fecha) ?? m.fecha,
        m.hora || '',
        item.tanque.nombre,
        TIPO_LABEL[m.tipo] ?? m.tipo,
        destinoTxt,
        m.horometro_fin != null ? n(m.horometro_fin) : '',
        m.kilometraje != null ? n(m.kilometraje) : '',
        esSalida ? -n(m.litros) : n(m.litros),
        m.saldo_litros != null ? n(m.saldo_litros) : '',
        m.autorizado_por || m.actor_name || m.created_by || '',
        m.observacion || '',
      ]);
    }
  }

  const aoaMovs: unknown[][] = [
    ['GOLDEN TOUCH 1127 C.A. · MOVIMIENTOS DE SURTIDOS Y TRASLADOS DE COMBUSTIBLE'],
    [`Periodo: ${periodoLabel} · ${filasMovs.length} movimiento(s) registrados · ${dateTime(new Date().toISOString())}`],
    [],
    headMovs,
    ...filasMovs,
  ];

  const wsMovs = XLSX.utils.aoa_to_sheet(aoaMovs);
  (wsMovs as Record<string, unknown>)['!cols'] = [
    { wch: 6 },
    { wch: 13 },
    { wch: 10 },
    { wch: 25 },
    { wch: 14 },
    { wch: 24 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 22 },
    { wch: 32 },
  ];
  (wsMovs as Record<string, unknown>)['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: headMovs.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: headMovs.length - 1 } },
  ];

  const cellAt2 = (r: number, c: number) =>
    (wsMovs as Record<string, { s?: unknown }>)[XLSX.utils.encode_cell({ r, c })];
  const tit2 = cellAt2(0, 0);
  if (tit2) tit2.s = TITLE_STYLE;
  headMovs.forEach((_, c) => {
    const cell = cellAt2(3, c);
    if (cell) cell.s = HEADER_STYLE;
  });

  // Formato dd/mm/yyyy para la columna fecha
  filasMovs.forEach((_, f) => {
    const cell = cellAt2(4 + f, COL_FECHA_MOVS) as { z?: string } | undefined;
    if (cell) cell.z = 'dd/mm/yyyy';
  });

  XLSX.utils.book_append_sheet(wb, wsMovs, 'Surtidos y Traslados');

  previewExcel(wb, 'reporte-existencias-movimientos-combustible.xlsx');
}
