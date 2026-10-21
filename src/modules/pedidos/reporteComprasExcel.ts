/* ============================================================
   Golden Touch · Compras · Excel "Compras por estado"
   Mismo reporte del PDF, en Excel con los estilos del sistema en
   tonos PASTEL: título terracota, encabezado durazno con letra café,
   franjas cebra, un bloque por estado (Pendiente por aprobar · Cuentas
   a crédito · Por indicar método de pago · Por pagar) con subtotal,
   y total general. Vista previa antes de descargar.
   ============================================================ */
import { previewExcelArchivo } from '@/shared/lib/reportePreview';
import type { Orden } from '@/shared/lib/types';
import { agruparReporteCompras, aDolaresYBolivares } from './reporteCompras';

/* Paleta PASTEL (los mismos tonos del PDF). El naranja fuerte de la marca
   queda para los botones de la pantalla: esto se imprime y se manda, así que
   va suave para que no canse la vista. */
const PASTEL = {
  titulo: 'FFC07E46',        // terracota suave (títulos)
  cabecera: 'FFF6D9B8',      // durazno claro (encabezado de la tabla)
  cabeceraTexto: 'FF5C3A1C', // café oscuro: legible sobre el durazno
  grupo: 'FFFBEBD8',         // arena (cabecera de cada estado y subtotales)
  grupoTexto: 'FF8A5A2B',    // terracota oscura (texto de los bloques)
  cebra: 'FFFDF8F2',         // crema casi blanco (filas alternas)
  total: 'FFF4D2AE',         // durazno algo más cargado (fila del total)
  borde: 'FFE0D3C2',         // café muy claro (bordes)
};

export interface OpcionesReporteComprasExcel {
  ordenes: Orden[];
  /** Bs por 1 USD (BCV). 0 = no se completan las columnas de la otra moneda. */
  tasa?: number;
  /** ISO del momento en que se genera. Hoy, si no se pasa. */
  generadoEn?: string;
}

/* Dos columnas de monto ($ y Bs): una tercera «en su moneda» repetía el mismo
   número de alguna de las dos. */
const COLS = 5;

export async function construirReporteComprasExcel(
  op: OpcionesReporteComprasExcel,
): Promise<ArrayBuffer> {
  const [{ default: ExcelJS }, { identidadEmpresa }] = await Promise.all([
    import('exceljs'),
    import('@/shared/lib/empresa'),
  ]);
  const emp = identidadEmpresa('GT');
  const tasa = Number(op.tasa) || 0;
  const grupos = agruparReporteCompras(op.ordenes);
  const total = grupos.reduce((a, g) => a + g.filas.length, 0);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Compras por estado', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: 'frozen', ySplit: 4 }],
  });
  ws.columns = [
    { width: 28 }, { width: 16 }, { width: 72 }, { width: 18 }, { width: 22 },
  ];
  const borde = { style: 'thin' as const, color: { argb: PASTEL.borde } };
  const bordes = { top: borde, left: borde, bottom: borde, right: borde };

  // ── Encabezado del documento ──
  ws.mergeCells(1, 1, 1, COLS);
  ws.mergeCells(2, 1, 2, COLS);
  ws.mergeCells(3, 1, 3, COLS);
  ws.getRow(1).height = 26;
  ws.getRow(2).height = 18;

  const titulo = ws.getCell(1, 1);
  titulo.value = `COMPRAS POR ESTADO · ${emp.nombre}`;
  titulo.font = { name: 'Arial', size: 14, bold: true, color: { argb: PASTEL.titulo } };
  titulo.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  const subtitulo = ws.getCell(2, 1);
  subtitulo.value = 'Pendiente por aprobar · Cuentas a crédito · Por indicar método de pago · Por pagar';
  subtitulo.font = { name: 'Arial', size: 10, color: { argb: 'FF5C6673' } };
  subtitulo.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  const info = ws.getCell(3, 1);
  const fecha = new Date(op.generadoEn ?? new Date().toISOString());
  info.value = `${total} orden(es) · Generado ${fecha.toLocaleString('es-VE')}` +
    (tasa > 0 ? ` · Tasa BCV: Bs ${tasa.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / $` : '');
  info.font = { name: 'Arial', size: 9, color: { argb: 'FF5C6673' } };
  info.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  // ── Encabezado de la tabla ──
  const cab = ws.getRow(4);
  cab.values = ['TIPO', 'CÓDIGO', 'MOTIVO', 'MONTO $', 'MONTO Bs'];
  cab.height = 24;
  cab.eachCell((c) => {
    c.font = { name: 'Arial', size: 11, bold: true, color: { argb: PASTEL.cabeceraTexto } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PASTEL.cabecera } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = bordes;
  });

  const fmtMoneda = (moneda: 'USD' | 'Bs') => (moneda === 'Bs' ? '"Bs" #,##0.00' : '"$" #,##0.00');
  let zebra = 0;
  let totUsd: number | null = null;
  let totBs: number | null = null;

  const filaBanda = (row: import('exceljs').Row, fondo: string) => {
    for (let c = 1; c <= COLS; c++) {
      const cell = ws.getCell(row.number, c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fondo } };
      cell.border = bordes;
    }
  };

  // ── Un bloque por estado, en orden, con subtotal ──
  for (const grupo of grupos) {
    if (!grupo.filas.length) continue;

    const cabGrupo = ws.addRow([]);
    cabGrupo.height = 20;
    ws.mergeCells(cabGrupo.number, 1, cabGrupo.number, COLS);
    const gc = ws.getCell(cabGrupo.number, 1);
    gc.value = `${grupo.titulo} (${grupo.filas.length})`;
    gc.font = { name: 'Arial', size: 11, bold: true, color: { argb: PASTEL.grupoTexto } };
    gc.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    filaBanda(cabGrupo, PASTEL.grupo);

    let subUsd: number | null = null;
    let subBs: number | null = null;
    for (const f of grupo.filas) {
      const eq = aDolaresYBolivares(f.monto, f.moneda, tasa);
      const usd = f.moneda === 'USD' ? f.monto : (tasa > 0 ? eq.usd : null);
      const bs = f.moneda === 'Bs' ? f.monto : (tasa > 0 ? eq.bs : null);
      if (usd != null) subUsd = (subUsd ?? 0) + usd;
      if (bs != null) subBs = (subBs ?? 0) + bs;
      if (usd != null) totUsd = (totUsd ?? 0) + usd;
      if (bs != null) totBs = (totBs ?? 0) + bs;

      const r = ws.addRow([grupo.titulo, f.codigo, f.motivo, usd ?? '', bs ?? '']);
      r.eachCell({ includeEmpty: true }, (c, col) => {
        c.font = { name: 'Arial', size: 10 };
        c.border = bordes;
        c.alignment = {
          vertical: 'middle', wrapText: col === 3, indent: col === 2 || col === 3 ? 1 : 0,
          horizontal: col >= 4 ? 'right' : 'left',
        };
        if (col >= 4) c.numFmt = col === 4 ? fmtMoneda('USD') : fmtMoneda('Bs');
      });
      if (zebra % 2 === 1) filaBanda(r, PASTEL.cebra);
      zebra += 1;
    }

    const st = ws.addRow(['SUBTOTAL', '', '', subUsd ?? '', subBs ?? '']);
    st.eachCell({ includeEmpty: true }, (c, col) => {
      c.font = { name: 'Arial', size: 10, bold: true, color: { argb: PASTEL.grupoTexto } };
      c.alignment = { vertical: 'middle', horizontal: col >= 4 ? 'right' : 'left', indent: col === 1 ? 1 : 0 };
      if (col === 4) c.numFmt = fmtMoneda('USD');
      if (col === 5) c.numFmt = fmtMoneda('Bs');
    });
    filaBanda(st, PASTEL.grupo);
  }

  // ── Total general (el mismo número que el subtotal del PDF) ──
  if (total > 0) {
    const tr = ws.addRow(['TOTAL GENERAL', `${total} orden(es)`, '', totUsd ?? '', totBs ?? '']);
    tr.height = 24;
    tr.eachCell({ includeEmpty: true }, (c, col) => {
      c.font = { name: 'Arial', size: 11, bold: true, color: { argb: PASTEL.cabeceraTexto } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PASTEL.total } };
      c.alignment = { vertical: 'middle', horizontal: col >= 4 ? 'right' : 'left', indent: col === 1 ? 1 : 0 };
      c.border = bordes;
      if (col === 4) c.numFmt = fmtMoneda('USD');
      if (col === 5) c.numFmt = fmtMoneda('Bs');
    });
  }

  const bytes = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return bytes;
}

/** Genera el Excel del reporte y abre la vista previa (descarga solo si el usuario lo pide). */
export async function descargarReporteComprasExcel(
  ordenes: Orden[],
  tasa: number,
): Promise<void> {
  const bytes = await construirReporteComprasExcel({ ordenes, tasa });
  await previewExcelArchivo(bytes, `compras-por-estado-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
