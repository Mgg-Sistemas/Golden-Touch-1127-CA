/* ============================================================
   Golden Touch · Compras · Excel «Cierre diario»
   Los tres títulos con sus cantidades, con el período y el momento en que se
   imprime. Mismos tonos pastel de «Compras por estado». Vista previa.
   ============================================================ */
import { previewExcelArchivo } from '@/shared/lib/reportePreview';
import { TITULOS_CIERRE, etiquetaPeriodo, fechaCaracas, momentoImpresion, type PeriodoCierre, type ResumenCierre } from './cierreDiario';

const PASTEL = {
  titulo: 'FFC07E46',
  cabecera: 'FFF6D9B8',
  cabeceraTexto: 'FF5C3A1C',
  cebra: 'FFFDF8F2',
  borde: 'FFE0D3C2',
};

export async function construirCierreDiarioExcel(r: ResumenCierre, p: PeriodoCierre, ahora: Date = new Date()): Promise<ArrayBuffer> {
  const [{ default: ExcelJS }, { identidadEmpresa }] = await Promise.all([
    import('exceljs'),
    import('@/shared/lib/empresa'),
  ]);
  const emp = identidadEmpresa('GT');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Cierre diario', { pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = [{ width: 42 }, { width: 24 }, { width: 22 }];
  const borde = { style: 'thin' as const, color: { argb: PASTEL.borde } };
  const bordes = { top: borde, left: borde, bottom: borde, right: borde };

  for (const fila of [1, 2, 3, 4]) ws.mergeCells(fila, 1, fila, 3);
  ws.getRow(1).height = 26;
  const t = ws.getCell(1, 1);
  t.value = 'CIERRE DIARIO · COMPRAS';
  t.font = { name: 'Arial', size: 14, bold: true, color: { argb: PASTEL.titulo } };
  t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  const sub = (fila: number, texto: string) => {
    const c = ws.getCell(fila, 1);
    c.value = texto;
    c.font = { name: 'Arial', size: 10, color: { argb: 'FF5C6673' } };
    c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  };
  sub(2, emp.nombre);
  sub(3, `Período: ${etiquetaPeriodo(p, fechaCaracas(ahora))}`);
  sub(4, `Impreso: ${momentoImpresion(ahora)}`);

  const cab = ws.getRow(6);
  cab.values = ['TÍTULO', 'CANTIDAD'];
  cab.height = 24;
  cab.eachCell((c) => {
    c.font = { name: 'Arial', size: 11, bold: true, color: { argb: PASTEL.cabeceraTexto } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PASTEL.cabecera } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = bordes;
  });

  TITULOS_CIERRE.forEach((tit, i) => {
    const row = ws.addRow([tit.titulo, r[tit.clave]]);
    row.height = 22;
    row.eachCell((c, col) => {
      c.font = { name: 'Arial', size: 11, bold: col === 2 };
      c.border = bordes;
      c.alignment = { vertical: 'middle', horizontal: col === 2 ? 'center' : 'left', indent: col === 1 ? 1 : 0 };
      if (col === 2) c.numFmt = '#,##0';
      if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PASTEL.cebra } };
    });
  });

  // Detalle de las órdenes que quedaron por pagar: proveedor, OC y monto en $, con el total.
  ws.addRow([]); // fila vacía separadora
  const secPagar = ws.addRow([`DETALLE · ÓRDENES POR PAGAR (${r.ocPorPagar.length})`]);
  secPagar.height = 24;
  ws.mergeCells(secPagar.number, 1, secPagar.number, 3);
  secPagar.getCell(1).font = { name: 'Arial', size: 12, bold: true, color: { argb: PASTEL.titulo } };
  secPagar.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  if (r.ocPorPagar.length === 0) {
    const vacia = ws.addRow(['No quedaron órdenes por pagar en este período.']);
    ws.mergeCells(vacia.number, 1, vacia.number, 3);
    vacia.getCell(1).font = { name: 'Arial', size: 10, color: { argb: 'FF5C6673' } };
    vacia.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  } else {
    const cabPagar = ws.addRow(['PROVEEDOR', 'OC', 'MONTO ($)']);
    cabPagar.height = 24;
    cabPagar.eachCell((c) => {
      c.font = { name: 'Arial', size: 11, bold: true, color: { argb: PASTEL.cabeceraTexto } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PASTEL.cabecera } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.border = bordes;
    });
    r.ocPorPagar.forEach((o, i) => {
      const row = ws.addRow([o.proveedor, o.codigo, o.montoUsd]);
      row.height = 22;
      row.eachCell((c, col) => {
        c.font = { name: 'Arial', size: 11, bold: col === 3 };
        c.border = bordes;
        c.alignment = { vertical: 'middle', horizontal: col === 1 ? 'left' : col === 2 ? 'center' : 'right', indent: col === 1 ? 1 : 0 };
        if (col === 3) c.numFmt = '"$" #,##0.00';
        if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PASTEL.cebra } };
      });
    });
    const tot = ws.addRow(['TOTAL PENDIENTE POR PAGAR', '', r.totalPorPagarUsd]);
    tot.height = 24;
    ws.mergeCells(tot.number, 1, tot.number, 2);
    tot.eachCell((c, col) => {
      c.font = { name: 'Arial', size: 11, bold: true, color: { argb: PASTEL.cabeceraTexto } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PASTEL.cabecera } };
      c.border = bordes;
      c.alignment = { vertical: 'middle', horizontal: col === 3 ? 'right' : 'left', indent: col === 1 ? 1 : 0 };
      if (col === 3) c.numFmt = '"$" #,##0.00';
    });
  }

  // 06/11/2026: OC pagadas que esperan que Compras confirme el retiro.
  if (r.ocPorRetirar) {
    ws.addRow([]);
    const secRet = ws.addRow([`PENDIENTES POR RETIRAR (${r.ocPorRetirar.length})`]);
    secRet.height = 24;
    ws.mergeCells(secRet.number, 1, secRet.number, 3);
    secRet.getCell(1).font = { name: 'Arial', size: 12, bold: true, color: { argb: PASTEL.titulo } };
    secRet.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    if (r.ocPorRetirar.length === 0) {
      const vacia = ws.addRow(['No hay órdenes pagadas esperando que se confirme el retiro.']);
      ws.mergeCells(vacia.number, 1, vacia.number, 3);
      vacia.getCell(1).font = { name: 'Arial', size: 10, color: { argb: 'FF5C6673' } };
    } else {
      const cab = ws.addRow(['PROVEEDOR', 'OC', 'ENTREGA · PAGADA']);
      cab.height = 24;
      cab.eachCell((c) => {
        c.font = { name: 'Arial', size: 11, bold: true, color: { argb: PASTEL.cabeceraTexto } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PASTEL.cabecera } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.border = bordes;
      });
      r.ocPorRetirar.forEach((o, i) => {
        const row = ws.addRow([o.proveedor, o.codigo, `${o.entrega} · ${o.pagada}`]);
        row.height = 22;
        row.eachCell((c, col) => {
          c.font = { name: 'Arial', size: 11 };
          c.border = bordes;
          c.alignment = { vertical: 'middle', horizontal: col === 1 ? 'left' : 'center', indent: col === 1 ? 1 : 0 };
          if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PASTEL.cebra } };
        });
      });
    }
  }

  if (r.analistas && r.analistas.length > 0) {
    ws.addRow([]); // fila vacía separadora
    const secRow = ws.addRow(['POR ANALISTA']);
    secRow.height = 24;
    ws.mergeCells(secRow.number, 1, secRow.number, 3);
    const secCell = secRow.getCell(1);
    secCell.font = { name: 'Arial', size: 12, bold: true, color: { argb: PASTEL.titulo } };
    secCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    const cabAnalistas = ws.addRow(['ANALISTA', 'COTIZACIONES REALIZADAS', 'ÓRDENES FINALIZADAS']);
    cabAnalistas.height = 24;
    cabAnalistas.eachCell((c) => {
      c.font = { name: 'Arial', size: 11, bold: true, color: { argb: PASTEL.cabeceraTexto } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PASTEL.cabecera } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.border = bordes;
    });

    r.analistas.forEach((a, i) => {
      const row = ws.addRow([a.nombre, a.cotizaciones, a.finalizadas]);
      row.height = 22;
      row.eachCell((c, col) => {
        c.font = { name: 'Arial', size: 11, bold: col > 1 };
        c.border = bordes;
        c.alignment = { vertical: 'middle', horizontal: col === 1 ? 'left' : 'center', indent: col === 1 ? 1 : 0 };
        if (col > 1) c.numFmt = '#,##0';
        if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PASTEL.cebra } };
      });
    });
  }

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function descargarCierreDiarioExcel(r: ResumenCierre, p: PeriodoCierre, ahora: Date = new Date()): Promise<void> {
  const bytes = await construirCierreDiarioExcel(r, p, ahora);
  const sufijo = p.desde === p.hasta ? p.desde : `${p.desde}_a_${p.hasta}`;
  await previewExcelArchivo(bytes, `cierre-diario-${sufijo}.xlsx`);
}
