/* ============================================================
   Golden Touch · Comprobante de Pago de una OC (vista previa)
   Documento que deja constancia del PAGO de una Orden de Compra /
   Servicio ya finalizada: caja de la que salió, método(s), monto,
   impuestos, quién y cuándo pagó, y los abonos (si fue a crédito).
   Se abre en vista previa; se descarga solo al pulsar Descargar.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { dateTime, money, montoMoneda } from '@/shared/lib/format';
import { loadLogoDataUrl, loadFirmaDataUrl } from '@/shared/lib/pdfLogo';
import type { AbonoCredito, Orden, PagoMetodo, Proveedor } from '@/shared/lib/types';
import { previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import { labelMetodoPago, listAbonos } from './pedidos.repository';

/** Nombre legible de un correo; si no se resolvió, devuelve el correo tal cual. */
function nombrePersona(email: string | null | undefined, map: Map<string, string>): string {
  if (!email) return '—';
  return map.get(email.toLowerCase()) ?? email;
}

export async function descargarComprobantePagoPdf(ordenId: string): Promise<void> {
  const { data: ordenRow, error: oe } = await supabase.from('ordenes').select('*').eq('id', ordenId).single();
  if (oe || !ordenRow) throw oe ?? new Error('Orden no encontrada');
  const orden = ordenRow as Orden;

  // Carga en paralelo: proveedor, caja, abonos, personas, logo/firma y libs de PDF.
  const [proveedor, cajaNombre, abonos, personasMap, logoDataUrl, firmaGerente, { jsPDF }, { default: autoTable }] = await Promise.all([
    orden.proveedor_id
      ? supabase.from('proveedores').select('*').eq('id', orden.proveedor_id).maybeSingle().then((r) => (r.data ?? null) as Proveedor | null)
      : Promise.resolve(null),
    orden.caja_id
      ? supabase.from('cajas').select('nombre').eq('id', orden.caja_id).maybeSingle().then((r) => (r.data?.nombre as string | undefined) ?? null)
      : Promise.resolve(null),
    listAbonos(orden.id).catch(() => [] as AbonoCredito[]),
    (async () => {
      const emails = new Set<string>();
      const add = (e?: string | null) => { if (e && e.includes('@')) emails.add(e.toLowerCase()); };
      add(orden.pagada_por); add(orden.finalizada_por); add(orden.solicitante_email);
      const map = new Map<string, string>();
      if (emails.size) {
        const { data } = await supabase.from('usuarios').select('email, nombre, apellido').in('email', Array.from(emails));
        (data ?? []).forEach((u: { email: string; nombre?: string | null; apellido?: string | null }) => {
          const nombre = `${u.nombre ?? ''} ${u.apellido ?? ''}`.trim();
          if (u.email && nombre) map.set(u.email.toLowerCase(), nombre);
        });
      }
      return map;
    })(),
    loadLogoDataUrl().catch(() => null),
    loadFirmaDataUrl().catch(() => null),
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const esServicio =
    /^CS/i.test(orden.oc_codigo ?? '') ||
    /^SS/i.test(orden.codigo ?? '') ||
    (orden.clasificacion ?? []).some((c) => /servicio/i.test(String(c)));
  const ocLabel = orden.oc_codigo ?? orden.codigo;

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const MARGIN = 42.52; // 1.5 cm
  let y = MARGIN;

  // ─── Cabecera ───
  const LOGO_SIZE = 56;
  const TEXT_X = logoDataUrl ? MARGIN + LOGO_SIZE + 14 : MARGIN;
  if (logoDataUrl) { try { doc.addImage(logoDataUrl, 'JPEG', MARGIN, y, LOGO_SIZE, LOGO_SIZE); } catch { /* opcional */ } }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(19);
  doc.text('COMPROBANTE DE PAGO', TEXT_X, y + 20);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(`${esServicio ? 'Orden de Servicio' : 'Orden de Compra'} N° ${ocLabel}  ·  Ref. ${orden.codigo}`, TEXT_X, y + 37);
  doc.text(`Generado: ${dateTime(new Date().toISOString())}`, PAGE_W - MARGIN, y + 37, { align: 'right' });
  y += Math.max(LOGO_SIZE, 42) + 8;

  doc.setDrawColor(255, 138, 0); doc.setLineWidth(1.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 18;
  doc.setLineWidth(0.5); doc.setDrawColor(180);

  // ─── Estado del pago (compra normal vs. a crédito con abonos) ───
  const moneda = orden.total_moneda ?? 'USD';
  const totalOrden = Math.round(Number(orden.total || 0) * 100) / 100;
  const pagada = Boolean(orden.pagada_en || orden.finalizada_en);
  // Es a crédito si tiene abonos o la orden quedó como "cuenta abierta".
  const esCredito = abonos.length > 0 || orden.estado === 'cuenta_abierta';
  const totalAbonado = Math.round(abonos.reduce((s, a) => s + Number(a.monto || 0), 0) * 100) / 100;
  // Lo realmente pagado: en crédito = suma de abonos; en compra normal pagada = total.
  const pagadoReal = esCredito ? totalAbonado : (pagada ? totalOrden : 0);
  const saldoPend = Math.round(Math.max(0, totalOrden - pagadoReal) * 100) / 100;
  const saldada = pagadoReal > 0 && saldoPend <= 0.01;
  const estadoTxt = esCredito
    ? (saldada ? 'Crédito · saldada' : 'Crédito · cuenta abierta')
    : (pagada ? 'Pagada / Finalizada' : 'Pendiente de pago');
  const ultimoAbono = abonos.length ? abonos[abonos.length - 1].at : null;
  const fechaPagoTxt = orden.pagada_en ? dateTime(orden.pagada_en)
    : orden.finalizada_en ? dateTime(orden.finalizada_en)
      : ultimoAbono ? dateTime(ultimoAbono) : '—';

  // Aviso si todavía no se pagó nada (comprobante provisional).
  if (pagadoReal <= 0.01) {
    doc.setFillColor(253, 246, 227); doc.setDrawColor(210, 150, 0); doc.setLineWidth(1);
    doc.roundedRect(MARGIN, y, PAGE_W - MARGIN * 2, 26, 4, 4, 'FD');
    doc.setTextColor(150, 100, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(esCredito ? 'Cuenta a crédito sin abonos registrados aún. El comprobante es provisional.' : 'Esta orden aún no registra pago finalizado. El comprobante es provisional.', MARGIN + 12, y + 17);
    doc.setTextColor(0); doc.setDrawColor(180); doc.setLineWidth(0.5);
    y += 26 + 14;
  }

  // ─── Datos del pago ───
  const iva = orden.iva_aplicado ? Number(orden.iva_monto ?? 0) : 0;
  const igtf = orden.igtf_aplicado ? Number(orden.igtf_monto ?? 0) : 0;
  const descPago = orden.descuento_pago_aplicado ? Math.max(0, Number(orden.descuento_pago_monto ?? 0)) : 0;

  const ficha: Array<[string, string]> = [
    ['Proveedor', pdfSafe(proveedor?.razon_social) || '—'],
    ...(proveedor?.rif ? [['RIF', proveedor.rif] as [string, string]] : []),
    ['Estado', estadoTxt],
    [esCredito ? 'Último abono' : 'Fecha de pago', fechaPagoTxt],
    ['Pagada por', pdfSafe(nombrePersona(orden.pagada_por ?? orden.finalizada_por, personasMap))],
    ['Caja', pdfSafe(cajaNombre) || (esCredito ? 'Ver detalle de abonos' : '—')],
    ['Moneda', moneda === 'Bs' ? 'Bs' : '$ (USD)'],
  ];
  if (orden.pago_en_divisa && orden.total_divisa != null) {
    ficha.push(['Pago en divisa / efectivo', money(Number(orden.total_divisa))]);
  }
  if (iva > 0) ficha.push([`IVA (${Number(orden.iva_pct ?? 16).toLocaleString('es-VE', { maximumFractionDigits: 2 })}%)`, money(iva)]);
  if (igtf > 0) ficha.push([`IGTF (${Number(orden.igtf_pct ?? 3).toLocaleString('es-VE', { maximumFractionDigits: 2 })}%)`, money(igtf)]);
  if (descPago > 0) ficha.push(['Descuento (pronto pago)', `- ${money(descPago)}`]);
  // En crédito se distingue el total de la orden, lo pagado y el saldo pendiente.
  if (esCredito) {
    ficha.push(['Total de la orden', montoMoneda(totalOrden, moneda)]);
    ficha.push(['TOTAL PAGADO', montoMoneda(pagadoReal, moneda)]);
    if (saldoPend > 0.01) ficha.push(['Saldo pendiente', montoMoneda(saldoPend, moneda)]);
  } else {
    ficha.push(['TOTAL PAGADO', montoMoneda(pagadoReal, moneda)]);
  }
  if (orden.factura_path) ficha.push(['Factura del proveedor', pdfSafe(orden.factura_nombre) || 'Adjunta']);
  if (orden.seriales_billetes?.length) ficha.push(['Seriales de billetes (USD)', pdfSafe(orden.seriales_billetes.join(' · '))]);

  autoTable(doc, {
    startY: y, body: ficha, theme: 'plain',
    styles: { fontSize: 10, cellPadding: 3.5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 190 }, 1: { cellWidth: 'auto' } },
    // Resalta el TOTAL PAGADO (última fila salvo factura/seriales al final).
    didParseCell: (data) => {
      const label = String((data.row.raw as string[])?.[0] ?? '');
      if (label === 'TOTAL PAGADO') { data.cell.styles.fontStyle = 'bold'; data.cell.styles.fontSize = 11.5; if (data.column.index === 1) data.cell.styles.textColor = [255, 138, 0]; }
      if (label === 'Saldo pendiente') { data.cell.styles.fontStyle = 'bold'; if (data.column.index === 1) data.cell.styles.textColor = [200, 50, 50]; }
    },
    margin: MARGIN,
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;

  // ─── Método(s) de pago ───
  const metodos = (orden.metodo_pago ?? []) as PagoMetodo[];
  if (metodos.length) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('MÉTODO(S) DE PAGO', MARGIN, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Método', 'Moneda', 'Monto', 'Datos']],
      body: metodos.map((m) => [
        labelMetodoPago(m.metodo),
        m.moneda || '—',
        montoMoneda(Number(m.monto), m.moneda === 'Bs' ? 'Bs' : 'USD'),
        pdfSafe(m.datos ? Object.values(m.datos).filter(Boolean).join(' · ') : '') || '—',
      ]),
      theme: 'grid',
      headStyles: { fillColor: [210, 210, 210], textColor: [20, 20, 20], fontStyle: 'bold' },
      styles: { fontSize: 8.5, cellPadding: 3.5, overflow: 'linebreak' },
      columnStyles: { 2: { halign: 'right' } },
      margin: MARGIN,
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
  }

  // ─── Abonos (compra a crédito) ───
  if (abonos.length) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('ABONOS (pago a crédito)', MARGIN, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Fecha', 'Abono', 'Saldo restante', 'Comisión', 'Registró', 'Nota']],
      body: abonos.map((a) => [
        dateTime(a.at),
        montoMoneda(Number(a.monto), a.moneda === 'Bs' ? 'Bs' : 'USD'),
        a.saldo_restante != null ? montoMoneda(Number(a.saldo_restante), a.moneda === 'Bs' ? 'Bs' : 'USD') : '—',
        a.comision_monto ? montoMoneda(Number(a.comision_monto), a.comision_moneda === 'Bs' ? 'Bs' : 'USD') : '—',
        pdfSafe(a.actor_name || a.actor) || '—',
        pdfSafe(a.nota) || '—',
      ]),
      foot: [[
        { content: 'Total abonado', colSpan: 1, styles: { halign: 'right', fontStyle: 'bold' } },
        montoMoneda(abonos.reduce((s, a) => s + Number(a.monto || 0), 0), moneda),
        '', '', '', '',
      ]],
      theme: 'grid',
      headStyles: { fillColor: [255, 138, 0], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [240, 240, 240], textColor: 20 },
      styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      margin: MARGIN,
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
  }

  // ─── Firma (Tesorería) + pie ───
  if (y > pageH - 110) { doc.addPage(); y = MARGIN; }
  try {
    if (firmaGerente) {
      const SIG_W = 150, SIG_H = 67;
      doc.addImage(firmaGerente, 'PNG', MARGIN + 6, pageH - 80 - SIG_H + 8, SIG_W, SIG_H);
    }
  } catch { /* firma opcional */ }
  doc.setDrawColor(180);
  doc.line(MARGIN, pageH - 80, MARGIN + 200, pageH - 80);
  doc.line(PAGE_W - MARGIN - 200, pageH - 80, PAGE_W - MARGIN, pageH - 80);
  doc.setFontSize(9); doc.setTextColor(0);
  doc.text('Firma autorizada · Tesorería', MARGIN, pageH - 66);
  doc.text('Recibí conforme', PAGE_W - MARGIN, pageH - 66, { align: 'right' });
  doc.setFontSize(8); doc.setTextColor(120);
  doc.text(`Documento auto-generado · GOLDEN TOUCH 1127 C.A. · ${ocLabel} · ${dateTime(new Date().toISOString())}`, MARGIN, pageH - 24);

  previewPdf(doc, `comprobante-pago-${ocLabel}.pdf`);
}
