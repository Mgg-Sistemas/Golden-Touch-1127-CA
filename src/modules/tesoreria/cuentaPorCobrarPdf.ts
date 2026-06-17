/* ============================================================
   Golden Touch · Tesorería · Reporte PDF de una Cuenta por Cobrar
   Muestra el resumen (total/cobrado/saldo a favor), el historial de CARGOS
   (cada fecha en que se le cargó al cliente + total adeudado acumulado) y el
   historial de COBROS recibidos. Misma estética que los demás reportes.
   ============================================================ */
import { dateTime } from '@/shared/lib/format';
import { loadLogoDataUrl } from '@/shared/lib/pdfLogo';
import type { CuentaPorCobrar, CargoCxC, CobroCxC } from './cuentasPorCobrar.repository';
import { previewPdf } from '@/shared/lib/reportePreview';

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

function montoStr(n: number | null | undefined, moneda: string): string {
  const v = Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return moneda === 'USD' ? `$ ${v}` : `${moneda} ${v}`;
}

async function construirDoc(cuenta: CuentaPorCobrar, cargos: CargoCxC[], cobros: CobroCxC[]) {
  const [logoDataUrl, { jsPDF }, { default: autoTable }] = await Promise.all([
    loadLogoDataUrl().catch(() => null),
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const MARGIN = 42.52; // 1.5 cm
  let y = MARGIN;

  const moneda = cuenta.moneda;
  const tipoLabel = cuenta.tipo === 'proveedor' ? 'Proveedor' : 'Cliente';
  const saldo = round2(Number(cuenta.monto) - (Number(cuenta.cobrado) || 0));

  const LOGO_SIZE = 60;
  const TEXT_X = logoDataUrl ? MARGIN + LOGO_SIZE + 14 : MARGIN;
  if (logoDataUrl) { try { doc.addImage(logoDataUrl, 'JPEG', MARGIN, y, LOGO_SIZE, LOGO_SIZE); } catch { /* logo opcional */ } }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('REPORTE DE CUENTA POR COBRAR', TEXT_X, y + 18);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${tipoLabel}: ${cuenta.contraparte}`, TEXT_X, y + 36);
  doc.text(`Generado: ${dateTime(new Date().toISOString())}`, PAGE_W - MARGIN, y + 36, { align: 'right' });
  y += Math.max(LOGO_SIZE, 42) + 8;

  doc.setDrawColor(255, 138, 0);
  doc.setLineWidth(1.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('GOLDEN TOUCH 1127 C.A. · Sistema de Gestión de Inventarios', MARGIN, y);
  doc.text(`Estado: ${cuenta.estado === 'saldada' ? 'Saldada' : 'Abierta'}`, PAGE_W - MARGIN, y, { align: 'right' });
  y += 14;

  // Resumen (Total que deben / Cobrado / Saldo a favor).
  autoTable(doc, {
    startY: y,
    head: [['Total a cobrar', 'Cobrado', 'Saldo pendiente']],
    body: [[montoStr(cuenta.monto, moneda), montoStr(cuenta.cobrado, moneda), montoStr(saldo, moneda)]],
    margin: MARGIN,
    styles: { fontSize: 10, cellPadding: 6, halign: 'center', fontStyle: 'bold' },
    headStyles: { fillColor: [255, 138, 0], textColor: 255, fontStyle: 'bold', halign: 'center' },
  });
  // @ts-expect-error lastAutoTable lo añade el plugin autoTable en runtime.
  y = (doc.lastAutoTable?.finalY ?? y) + 14;

  if (cuenta.nota) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text(`Nota: ${cuenta.nota}`, MARGIN, y);
    y += 14;
  }

  // Historial de CARGOS (cada fecha en que aumentó lo que deben + acumulado).
  const cgOrden = [...cargos].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const sumCg = round2(cgOrden.reduce((s, i) => s + Number(i.monto || 0), 0));
  const gap = round2(Number(cuenta.monto) - sumCg);
  type FilaCg = { at: string; monto: number; nota: string };
  const filasBase: FilaCg[] = cgOrden.map((i) => ({ at: i.at, monto: Number(i.monto || 0), nota: i.nota || '—' }));
  if (gap > 0.01) filasBase.unshift({ at: cuenta.created_at, monto: gap, nota: 'Saldo inicial' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Historial de cargos (lo que se le debe)', MARGIN, y);
  y += 6;

  let acum = 0;
  const filasCg = filasBase.map((f) => {
    acum = round2(acum + f.monto);
    return [dateTime(f.at), montoStr(f.monto, moneda), montoStr(acum, moneda), f.nota];
  });

  autoTable(doc, {
    startY: y + 4,
    head: [['Fecha', 'Monto cargado', 'Total adeudado (acum.)', 'Nota']],
    body: filasCg.length ? filasCg : [['—', 'Sin cargos registrados', '—', '—']],
    margin: MARGIN,
    styles: { fontSize: 8.5, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: [255, 138, 0], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 130 }, 1: { cellWidth: 100, halign: 'right' },
      2: { cellWidth: 110, halign: 'right' }, 3: { cellWidth: 'auto' },
    },
    foot: [[
      { content: `${filasCg.length} cargo(s) · Total a cobrar`, styles: { halign: 'right', fontStyle: 'bold' } },
      { content: montoStr(cuenta.monto, moneda), styles: { halign: 'right', fontStyle: 'bold' } },
      { content: '', styles: {} }, { content: '', styles: {} },
    ]],
  });
  // @ts-expect-error lastAutoTable lo añade el plugin autoTable en runtime.
  y = (doc.lastAutoTable?.finalY ?? y) + 16;

  // Historial de COBROS recibidos.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Historial de cobros', MARGIN, y);
  y += 6;

  const filasCo = cobros.map((ab) => [
    dateTime(ab.at),
    montoStr(ab.monto, ab.moneda),
    ab.saldo_restante != null ? montoStr(ab.saldo_restante, ab.moneda) : '—',
    ab.nota || '—',
  ]);

  autoTable(doc, {
    startY: y + 4,
    head: [['Fecha', 'Cobro', 'Saldo restante', 'Nota']],
    body: filasCo.length ? filasCo : [['—', 'Sin cobros registrados', '—', '—']],
    margin: MARGIN,
    styles: { fontSize: 8.5, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: [255, 138, 0], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 130 }, 1: { cellWidth: 90, halign: 'right' },
      2: { cellWidth: 100, halign: 'right' }, 3: { cellWidth: 'auto' },
    },
    foot: [[
      { content: `${cobros.length} cobro(s) · Total cobrado`, styles: { halign: 'right', fontStyle: 'bold' } },
      { content: montoStr(cuenta.cobrado, moneda), styles: { halign: 'right', fontStyle: 'bold' } },
      { content: '', styles: {} }, { content: '', styles: {} },
    ]],
  });

  return doc;
}

function nombreArchivo(cuenta: CuentaPorCobrar): string {
  const base = `cuenta-por-cobrar-${cuenta.contraparte}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `${base || 'cuenta-por-cobrar'}.pdf`;
}

/** Descarga la cuenta por cobrar (con sus cargos y cobros) como PDF. */
export async function descargarCuentaPorCobrarPdf(cuenta: CuentaPorCobrar, cargos: CargoCxC[], cobros: CobroCxC[]): Promise<void> {
  const doc = await construirDoc(cuenta, cargos, cobros);
  previewPdf(doc, nombreArchivo(cuenta));
}
