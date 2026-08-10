/* ============================================================
   Golden Touch · Tesorería · PDF resumen de pendientes por pagar
   Relación de TODO lo pendiente por pagar, POR SEGMENTOS:
     · 🛒 Compras Directas
     · 📄 Órdenes de Compra (OC)
     · 🔧 Servicios (Control de Servicio · CS)
     · 🧰 Servicios Directos
   Cada renglón en $ y su equivalente en Bs a la TASA DEL DÍA (BCV).
   Subtotal por segmento (en grande) y TOTAL GENERAL (en grande),
   ambos en $ y en Bs. Vista previa.
   ============================================================ */
import type { OrdenPorPagar } from '@/modules/pedidos/pedidos.repository';
import { listComprasDirectas, type CompraDirecta } from '@/modules/pedidos/compras.repository';
import { listServiciosDirectos, type ServicioDirecto } from '@/modules/pedidos/serviciosDirectos.repository';
import { previewPdf } from '@/shared/lib/reportePreview';
import { getTasaHoy } from './tasas.repository';

/** Bs con separador de miles VE y 2 decimales (sin prefijo). */
function bsNum(n: number): string {
  return Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Fila común del reporte + sus montos normalizados ($ y Bs). */
interface FilaRep {
  codigo: string;
  proveedor: string;
  detalle: string;
  notas: string;
  estado: string;
  usd: number;
  bs: number;
}

interface Segmento {
  titulo: string;
  filas: FilaRep[];
  subUsd: number;
  subBs: number;
}

/** Normaliza el monto de un directo (Bs o USD) a { usd, bs } con la tasa del día. */
function normMonto(gasto: number | null | undefined, moneda: string | null | undefined, tasa: number): { usd: number; bs: number } {
  const g = Number(gasto) || 0;
  if (moneda === 'Bs') return { usd: tasa > 0 ? Math.round((g / tasa) * 100) / 100 : 0, bs: g };
  return { usd: g, bs: tasa > 0 ? Math.round(g * tasa * 100) / 100 : 0 };
}

export async function descargarOrdenesPorPagarPdf(
  rows: OrdenPorPagar[],
  opts?: { creditos?: OrdenPorPagar[] },
): Promise<void> {
  const creditos = opts?.creditos ?? [];
  const [{ jsPDF }, { default: autoTable }, fmt, { loadLogoDataUrl }, tasaHoy, comprasDir, serviciosDir] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/format'),
    import('@/shared/lib/pdfLogo'),
    getTasaHoy().catch(() => ({ usd: null, eur: null, fecha: null })),
    listComprasDirectas().catch(() => [] as CompraDirecta[]),
    listServiciosDirectos().catch(() => [] as ServicioDirecto[]),
  ]);
  const tasa = Number(tasaHoy?.usd) || 0; // Bs por 1 USD (BCV)

  // La finalidad de una OC puede estar a nivel orden o cargada POR ÍTEM.
  const finalidadDe = (r: OrdenPorPagar): string => {
    const oc = r.orden.finalidad?.trim();
    if (oc) return oc;
    const items = Array.isArray(r.orden.items) ? r.orden.items : [];
    const fs = Array.from(new Set(items.map((it) => (it.finalidad ?? '').trim()).filter(Boolean)));
    if (fs.length) return fs.join(' · ');
    return r.orden.motivo?.trim() || '—';
  };

  // ── Armado de segmentos ──
  const ocRows = rows.filter((r) => r.orden.tipo !== 'servicio');
  const csRows = rows.filter((r) => r.orden.tipo === 'servicio');
  const comprasPP = comprasDir.filter((c) => c.estado === 'por_pagar');
  const serviciosPP = serviciosDir.filter((s) => s.estado === 'por_pagar');

  const filaOc = (r: OrdenPorPagar): FilaRep => {
    const usd = Number(r.montoAPagar || 0);
    return {
      codigo: r.orden.oc_codigo ?? '—',
      proveedor: r.proveedorNombre,
      detalle: finalidadDe(r),
      notas: r.orden.notas?.trim() || '—',
      estado: r.esperandoMetodo ? 'Esperando método' : 'Lista para pagar',
      usd,
      bs: tasa > 0 ? Math.round(usd * tasa * 100) / 100 : 0,
    };
  };
  const filaCompra = (c: CompraDirecta): FilaRep => {
    const { usd, bs } = normMonto(c.gasto, c.moneda, tasa);
    return {
      codigo: c.codigo ?? '—',
      proveedor: c.proveedor_nombre || '—',
      detalle: c.producto_nombre + (c.items.length > 1 ? ` · ${c.items.length} ítems` : ''),
      notas: c.nota?.trim() || '—',
      estado: 'Por pagar',
      usd,
      bs,
    };
  };
  const filaServicio = (s: ServicioDirecto): FilaRep => {
    // Con abonos: lo pendiente es el saldo (total − abonado).
    const total = Number(s.gasto) || 0;
    const pend = s.con_abonos ? Math.max(0, total - (Number(s.abonado_total) || 0)) : total;
    const { usd, bs } = normMonto(pend, s.moneda, tasa);
    return {
      codigo: s.codigo ?? '—',
      proveedor: s.proveedor_nombre || '—',
      detalle: s.descripcion + (s.items.length > 1 ? ` · ${s.items.length} ítems` : ''),
      notas: (s.nota?.trim() || '—') + (s.con_abonos ? ' · (saldo con abonos)' : ''),
      estado: 'Por pagar',
      usd,
      bs,
    };
  };

  const mkSeg = (titulo: string, filas: FilaRep[]): Segmento => ({
    titulo,
    filas,
    subUsd: filas.reduce((a, f) => a + f.usd, 0),
    subBs: filas.reduce((a, f) => a + f.bs, 0),
  });

  const segmentos: Segmento[] = [
    mkSeg('COMPRAS DIRECTAS', comprasPP.map(filaCompra)),
    mkSeg('ÓRDENES DE COMPRA (OC)', ocRows.map(filaOc)),
    mkSeg('SERVICIOS (CONTROL DE SERVICIO · CS)', csRows.map(filaOc)),
    mkSeg('SERVICIOS DIRECTOS', serviciosPP.map(filaServicio)),
  ].filter((s) => s.filas.length > 0);

  const totUsd = segmentos.reduce((a, s) => a + s.subUsd, 0);
  const totBs = segmentos.reduce((a, s) => a + s.subBs, 0);
  const totCant = segmentos.reduce((a, s) => a + s.filas.length, 0);

  // Cuentas a CRÉDITO (cuenta abierta): NO entran al total "por pagar" (se saldan
  // por abonos en Tesorería), pero se muestran como indicativo aparte.
  const filaCredito = (r: OrdenPorPagar): FilaRep => {
    const usd = Number(r.orden.total || 0);
    return {
      codigo: r.orden.oc_codigo ?? '—',
      proveedor: r.proveedorNombre,
      detalle: finalidadDe(r),
      notas: (r.orden.notas?.trim() || '—') + ' · (se salda por abonos)',
      estado: 'Crédito · cuenta abierta',
      usd,
      bs: tasa > 0 ? Math.round(usd * tasa * 100) / 100 : 0,
    };
  };
  const segCredito = creditos.length ? mkSeg('CUENTAS A CRÉDITO (CUENTA ABIERTA)', creditos.map(filaCredito)) : null;

  // ── Documento ──
  const logo = await loadLogoDataUrl().catch(() => null);
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const MARGIN = 42.52; // 1.5 cm
  let y = MARGIN;
  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 44, 44); } catch { /* opcional */ } }

  doc.setTextColor(255, 138, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text('PENDIENTES POR PAGAR', W / 2 + 28, y + 20, { align: 'center' });
  doc.setTextColor(120, 120, 120); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`GOLDEN TOUCH 1127 C.A. · Generado ${fmt.dateTime(new Date().toISOString())}`, W / 2 + 28, y + 35, { align: 'center' });
  if (tasa > 0) {
    doc.text(`Tasa BCV: Bs ${bsNum(tasa)} / $${tasaHoy?.fecha ? ' · ' + fmt.date(tasaHoy.fecha) : ''}`, W / 2 + 28, y + 48, { align: 'center' });
  }
  if (segCredito) {
    doc.setTextColor(180, 90, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    doc.text(`⚠ Incluye ${segCredito.filas.length} cuenta(s) a crédito abierta(s) · ${fmt.money(segCredito.subUsd)} (se saldan por abonos)`, W / 2 + 28, y + (tasa > 0 ? 60 : 48), { align: 'center' });
  }
  doc.setTextColor(0, 0, 0);
  y += segCredito ? 78 : 66;

  if (!segmentos.length && !segCredito) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(90, 90, 90);
    doc.text('No hay pendientes por pagar.', MARGIN, y + 10);
    previewPdf(doc, `pendientes-por-pagar-${new Date().toISOString().slice(0, 10)}.pdf`);
    return;
  }
  if (!segmentos.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(90, 90, 90);
    doc.text('No hay pendientes por pagar inmediatos. Solo quedan cuentas a crédito abiertas (abajo).', MARGIN, y + 10);
    y += 24;
  }

  const drawTable = (seg: Segmento) => {
    // Título de segmento (salta de página si no cabe con al menos una fila).
    if (y > H - 120) { doc.addPage(); y = MARGIN; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(255, 138, 0);
    doc.text(seg.titulo, MARGIN, y);
    doc.setTextColor(120, 120, 120); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    doc.text(`${seg.filas.length} ítem(s)`, MARGIN + 260, y);
    doc.setTextColor(0, 0, 0);
    y += 6;

    const body = seg.filas.map((f, i) => [
      String(i + 1), f.codigo, f.proveedor, f.detalle, f.notas, f.estado,
      fmt.money(f.usd), tasa > 0 ? bsNum(f.bs) : '—',
    ]);
    autoTable(doc, {
      startY: y,
      head: [['ITEM', 'CÓDIGO', 'PROVEEDOR', 'FINALIDAD / DETALLE', 'NOTAS', 'ESTADO', 'MONTO $', 'MONTO Bs']],
      body,
      foot: [['', '', '', '', '', 'SUBTOTAL', fmt.money(seg.subUsd), tasa > 0 ? bsNum(seg.subBs) : '—']],
      styles: { fontSize: 8, cellPadding: 3, valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: [210, 210, 210], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'center' },
      footStyles: { fillColor: [255, 244, 232], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'right', fontSize: 9 },
      tableWidth: 'auto',
      columnStyles: {
        0: { halign: 'center', cellWidth: 24 },
        1: { halign: 'center', cellWidth: 58 },
        2: { cellWidth: 82 },
        5: { halign: 'center', cellWidth: 62 },
        6: { halign: 'right', cellWidth: 52 },
        7: { halign: 'right', cellWidth: 62 },
      },
      margin: MARGIN,
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 16;
  };

  for (const seg of segmentos) drawTable(seg);

  // ── TOTAL GENERAL en grande ($ y su equivalente en Bs) ── (solo lo por pagar; el crédito va aparte)
  if (segmentos.length) {
    const boxH = tasa > 0 ? 76 : 48;
    if (y > H - (boxH + MARGIN)) { doc.addPage(); y = MARGIN; }
    const boxW = 340;
    const boxX = W - MARGIN - boxW;
    doc.setDrawColor(255, 138, 0); doc.setLineWidth(1.4);
    doc.setFillColor(255, 244, 232);
    doc.roundedRect(boxX, y, boxW, boxH, 6, 6, 'FD');

    doc.setTextColor(60, 60, 60); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text(`TOTAL GENERAL · ${totCant} ítem(s)`, boxX + 14, y + 22);
    doc.setTextColor(20, 20, 20); doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
    doc.text(fmt.money(totUsd), boxX + boxW - 14, y + 26, { align: 'right' });

    if (tasa > 0) {
      doc.setTextColor(255, 138, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(19);
      doc.text(`Bs ${bsNum(totBs)}`, boxX + boxW - 14, y + 56, { align: 'right' });
      doc.setTextColor(120, 120, 120); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.text(`Convertido a la tasa BCV del día: Bs ${bsNum(tasa)} / $`, boxX + 14, y + 56);
    }
    doc.setTextColor(0, 0, 0);
    y += boxH + 20;
  }

  // ── Anexo: CUENTAS A CRÉDITO (no forman parte del total por pagar) ──
  if (segCredito) {
    if (y > H - 130) { doc.addPage(); y = MARGIN; }
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(120, 120, 120);
    doc.text('Estas compras se hicieron a crédito (cuenta abierta): NO entran en el total de arriba; se saldan por abonos en Tesorería.', MARGIN, y);
    y += 12;
    drawTable(segCredito);
  }

  previewPdf(doc, `pendientes-por-pagar-${new Date().toISOString().slice(0, 10)}.pdf`);
}
