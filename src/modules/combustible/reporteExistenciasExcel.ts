/* ============================================================
   Golden Touch · Combustible · Export Excel de Existencias y Movimientos
   (Actualizado 04/11/2026: Arqueo histórico por rango de fechas,
    saldos de apertura y cierre por tanque, y valuación USD)
   ============================================================ */
import type { MovimientoTanque, TanqueCombustible } from '@/shared/lib/types';
import type { ReporteTanque } from './tanques.repository';
import type { TotalesCorteCombustible } from './reporteExistenciasCorte';
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

export interface DetalleTanqueReporteExcel {
  tanque: TanqueCombustible;
  disponible: number;
  movimientos: MovimientoTanque[];
  surtidosLitros: number;
  surtidosCount?: number;
  trasladosLitros?: number;
  trasladosCount?: number;
  entradasLitros?: number;
  saldoInicialLitros?: number;
  saldoCierreLitros?: number;
  saldoCierreUsd?: number;
  tasaCierre?: number;
  porcentajeLleno?: number;
}

export interface ReporteExistenciasExcelArgs {
  reportes?: ReporteTanque[];
  detallePorTanque: DetalleTanqueReporteExcel[];
  periodoLabel: string;
  totalesCorte?: TotalesCorteCombustible;
  incluirMovimientos?: boolean;
}

export async function descargarReporteExistenciasExcel({
  reportes: _reportes,
  detallePorTanque,
  periodoLabel,
  totalesCorte,
  incluirMovimientos = true,
}: ReporteExistenciasExcelArgs): Promise<void> {
  void _reportes;
  void totalesCorte;
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

  // ================= HOJA 1: EXISTENCIAS Y ARQUEO =================
  const headExistencias = [
    '#',
    'Tanque',
    'Tipo',
    'Saldo Apertura (L)',
    'Entradas (+) (L)',
    'Surtidos (-) (L)',
    'Traslados (-) (L)',
    'Saldo Cierre (L)',
    'Capacidad Nominal (L)',
    '% Capacidad',
    'Tasa ($/L)',
    'Valor al Cierre ($)',
    'Estado',
  ];

  let sumApertura = 0;
  let sumEntradas = 0;
  let sumSurtidos = 0;
  let sumTraslados = 0;
  let sumCierre = 0;
  let sumValor = 0;

  const filasExistencias = detallePorTanque.map((d, i) => {
    const cap = n(d.tanque.capacidad_litros);
    const inicial = d.saldoInicialLitros != null ? n(d.saldoInicialLitros) : 0;
    const entradas = d.entradasLitros != null ? n(d.entradasLitros) : 0;
    const surtidos = d.surtidosLitros != null ? n(d.surtidosLitros) : 0;
    const traslados = d.trasladosLitros != null ? n(d.trasladosLitros) : 0;
    const cierre = d.saldoCierreLitros != null ? n(d.saldoCierreLitros) : n(d.disponible);
    const tasa = d.tasaCierre != null ? n(d.tasaCierre) : n(d.tanque.tasa_usd_litro);
    const valor = d.saldoCierreUsd != null ? n(d.saldoCierreUsd) : cierre * tasa;
    const pct = cap > 0 ? Math.min(100, Math.max(0, (cierre / cap) * 100)) : 0;

    sumApertura += inicial;
    sumEntradas += entradas;
    sumSurtidos += surtidos;
    sumTraslados += traslados;
    sumCierre += cierre;
    sumValor += valor;

    const tipoLabel = esBidon(d.tanque.nombre)
      ? 'Bidón'
      : d.tanque.es_movil
        ? 'Móvil'
        : 'Estacionario';

    return [
      i + 1,
      d.tanque.nombre,
      tipoLabel,
      inicial,
      entradas,
      surtidos,
      traslados,
      cierre,
      cap,
      `${pct.toFixed(0)}%`,
      tasa,
      valor,
      d.tanque.estado === 'activo' ? 'Activo' : 'Inactivo',
    ];
  });

  const tasaProm = sumCierre > 0 ? sumValor / sumCierre : 0;
  const filaTotales = [
    'TOTAL',
    `${detallePorTanque.length} tanque(s)`,
    '',
    sumApertura,
    sumEntradas,
    sumSurtidos,
    sumTraslados,
    sumCierre,
    '',
    '',
    tasaProm,
    sumValor,
    '',
  ];

  const aoaExistencias: unknown[][] = [
    ['GOLDEN TOUCH 1127 C.A. · EXISTENCIAS Y SALDOS AL CORTE DE COMBUSTIBLE'],
    [`Periodo / Corte: ${periodoLabel} · Emitido: ${dateTime(new Date().toISOString())}`],
    [],
    headExistencias,
    ...filasExistencias,
    filaTotales,
  ];

  const wsExistencias = XLSX.utils.aoa_to_sheet(aoaExistencias);
  (wsExistencias as Record<string, unknown>)['!cols'] = [
    { wch: 5 },
    { wch: 28 },
    { wch: 14 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
    { wch: 20 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
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

  XLSX.utils.book_append_sheet(wb, wsExistencias, 'Existencias al Cierre');

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
    ['GOLDEN TOUCH 1127 C.A. · MOVIMIENTOS EN EL PERIODO'],
    [`Periodo: ${periodoLabel} · ${filasMovs.length} movimiento(s) registrados · Emitido: ${dateTime(new Date().toISOString())}`],
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

  if (incluirMovimientos) {
    XLSX.utils.book_append_sheet(wb, wsMovs, 'Movimientos');
  }

  previewExcel(wb, `reporte-combustible-corte-${dateTime(new Date().toISOString()).slice(0, 10)}.xlsx`);
}
