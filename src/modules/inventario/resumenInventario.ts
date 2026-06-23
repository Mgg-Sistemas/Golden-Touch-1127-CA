/* ============================================================
   Golden Touch · Inventario · RESUMEN (desglose tipo Acopio)
   Desglosa, para un rango de fechas:
     · Valor total del inventario por almacén y sub-almacén (snapshot a hoy).
     · Productos nuevos que entraron al inventario.
     · Entradas, Salidas y Traslados ejecutados (cantidad y $).
   Cada bloque trae el DETALLE (qué productos) y se exporta a PDF
   (vista previa) y por correo (Edge Function `enviar-reporte`).
   El $ de cada movimiento = |delta| × costo_promedio del movimiento.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { Almacen, Existencia, Movimiento, Producto } from '@/shared/lib/types';
import { previewPdf } from '@/shared/lib/reportePreview';

export interface MovResumenRow {
  id: string;
  at: string;
  tipo: string;
  sku: string;
  nombre: string;
  almacen: string;
  cantidad: number;     // |delta|
  valor: number;        // |delta| × costo
  destino: string;      // destinatario / almacén destino
  solicitante: string;
  actor: string;
  detalle: string;
}

export interface NuevoProductoRow {
  sku: string;
  nombre: string;
  categoria: string;
  almacen: string;
  at: string;           // created_at
  stock: number;
  valor: number;        // stock × precio
}

export interface AlmacenResumenRow {
  almacen: string;
  sede: string;
  esSub: boolean;
  productos: number;    // productos con existencia > 0
  stock: number;        // unidades totales
  valor: number;        // Σ stock × costo
}

export interface BloqueMov {
  count: number;
  cantidad: number;
  valor: number;
  filas: MovResumenRow[];
}

export interface ResumenInventario {
  desde: string | null;
  hasta: string | null;
  valorTotal: number;                 // valor actual de todo el inventario
  stockTotal: number;
  porAlmacen: AlmacenResumenRow[];
  nuevos: { count: number; valor: number; filas: NuevoProductoRow[] };
  entradas: BloqueMov;
  salidas: BloqueMov;
  traslados: BloqueMov;
}

function boundsISO(desde: string | null, hasta: string | null): { gte?: string; lte?: string } {
  const out: { gte?: string; lte?: string } = {};
  if (desde) out.gte = `${desde}T00:00:00`;
  if (hasta) out.lte = `${hasta}T23:59:59.999`;
  return out;
}

const abs = (n: unknown) => Math.abs(Number(n) || 0);

function filaDeMov(m: Movimiento): MovResumenRow {
  const cant = abs(m.delta);
  const costo = Number(m.costo_promedio) || 0;
  return {
    id: m.id,
    at: m.at,
    tipo: m.tipo,
    sku: m.producto?.sku ?? '—',
    nombre: m.producto?.nombre ?? '—',
    almacen: m.almacen ?? '—',
    cantidad: cant,
    valor: Math.round(cant * costo * 100) / 100,
    destino: m.destino ?? '',
    solicitante: m.solicitante ?? '',
    actor: m.actor_name || m.actor || '',
    detalle: m.detalle ?? '',
  };
}

function bloque(filas: MovResumenRow[]): BloqueMov {
  return {
    count: filas.length,
    cantidad: Math.round(filas.reduce((a, f) => a + f.cantidad, 0) * 1000) / 1000,
    valor: Math.round(filas.reduce((a, f) => a + f.valor, 0) * 100) / 100,
    filas,
  };
}

/** Carga el resumen completo del inventario para el rango (fechas YYYY-MM-DD o null). */
export async function cargarResumenInventario(desde: string | null, hasta: string | null): Promise<ResumenInventario> {
  const { gte, lte } = boundsISO(desde, hasta);

  // 1) Snapshot actual por almacén (existencias) + estructura de almacenes (sede/sub).
  const [{ data: exData }, { data: almData }] = await Promise.all([
    supabase.from('existencias').select('producto_id, almacen, stock, costo_promedio'),
    supabase.from('almacenes').select('*'),
  ]);
  const existencias = (exData ?? []) as Existencia[];
  const almacenes = (almData ?? []) as Almacen[];
  const almPorNombre = new Map<string, Almacen>(almacenes.map((a) => [a.nombre, a]));

  const porAlmacenMap = new Map<string, AlmacenResumenRow>();
  let valorTotal = 0;
  let stockTotal = 0;
  for (const e of existencias) {
    const stock = Number(e.stock) || 0;
    const valor = stock * (Number(e.costo_promedio) || 0);
    valorTotal += valor;
    stockTotal += stock;
    const rec = almPorNombre.get(e.almacen);
    const cur = porAlmacenMap.get(e.almacen) ?? {
      almacen: e.almacen,
      sede: rec?.sede ?? '—',
      esSub: !!rec?.parent_id,
      productos: 0,
      stock: 0,
      valor: 0,
    };
    cur.stock += stock;
    cur.valor += valor;
    if (stock > 0) cur.productos += 1;
    porAlmacenMap.set(e.almacen, cur);
  }
  const porAlmacen = Array.from(porAlmacenMap.values())
    .map((r) => ({ ...r, valor: Math.round(r.valor * 100) / 100 }))
    .sort((a, b) => (a.sede.localeCompare(b.sede, 'es') || a.almacen.localeCompare(b.almacen, 'es')));

  // 2) Movimientos del rango (con join al producto para sku/nombre).
  let q = supabase
    .from('movimientos')
    .select('*, producto:productos(sku, nombre, unidad)')
    .in('tipo', ['entrada', 'salida', 'transferencia'])
    .order('at', { ascending: false });
  if (gte) q = q.gte('at', gte);
  if (lte) q = q.lte('at', lte);
  const { data: movData, error: movErr } = await q;
  if (movErr) throw movErr;
  const movs = (movData ?? []) as Movimiento[];

  const entradasFilas: MovResumenRow[] = [];
  const salidasFilas: MovResumenRow[] = [];
  const trasladosFilas: MovResumenRow[] = [];
  for (const m of movs) {
    if (m.tipo === 'entrada') entradasFilas.push(filaDeMov(m));
    else if (m.tipo === 'salida') salidasFilas.push(filaDeMov(m));
    // El traslado son DOS movimientos (salida origen + entrada destino): contamos
    // solo el lado que sale (delta < 0) para no duplicar el traslado.
    else if (m.tipo === 'transferencia' && Number(m.delta) < 0) trasladosFilas.push(filaDeMov(m));
  }

  // 3) Productos nuevos (alta) en el rango.
  let qp = supabase
    .from('productos')
    .select('sku, nombre, categoria, almacen, stock, precio, created_at')
    .order('created_at', { ascending: false });
  if (gte) qp = qp.gte('created_at', gte);
  if (lte) qp = qp.lte('created_at', lte);
  const { data: nuevosData } = await qp;
  const nuevosFilas: NuevoProductoRow[] = ((nuevosData ?? []) as Array<Pick<Producto, 'sku' | 'nombre' | 'categoria' | 'almacen' | 'stock' | 'precio' | 'created_at'>>).map((p) => {
    const stock = Number(p.stock) || 0;
    return {
      sku: p.sku,
      nombre: p.nombre,
      categoria: p.categoria,
      almacen: p.almacen,
      at: p.created_at,
      stock,
      valor: Math.round(stock * (Number(p.precio) || 0) * 100) / 100,
    };
  });

  return {
    desde,
    hasta,
    valorTotal: Math.round(valorTotal * 100) / 100,
    stockTotal: Math.round(stockTotal * 1000) / 1000,
    porAlmacen,
    nuevos: {
      count: nuevosFilas.length,
      valor: Math.round(nuevosFilas.reduce((a, f) => a + f.valor, 0) * 100) / 100,
      filas: nuevosFilas,
    },
    entradas: bloque(entradasFilas),
    salidas: bloque(salidasFilas),
    traslados: bloque(trasladosFilas),
  };
}

/* ──────────── Etiqueta de rango ──────────── */
export function rangoLabel(r: Pick<ResumenInventario, 'desde' | 'hasta'>): string {
  if (r.desde && r.hasta) return `Del ${r.desde} al ${r.hasta}`;
  if (r.desde) return `Desde ${r.desde}`;
  if (r.hasta) return `Hasta ${r.hasta}`;
  return 'Todo el período';
}

/* ──────────── PDF (vista previa) ──────────── */
async function construirPdf(r: ResumenInventario) {
  const [{ jsPDF }, { default: autoTable }, fmt, { loadLogoDataUrl }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/format'),
    import('@/shared/lib/pdfLogo'),
  ]);
  const logo = await loadLogoDataUrl().catch(() => null);
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const MARGIN = 42.52;
  const money = (n: number) => fmt.money(n);
  let y = MARGIN;
  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 46, 46); } catch { /* opcional */ } }
  const tx = logo ? MARGIN + 60 : MARGIN;
  doc.setTextColor(255, 138, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text('Resumen de inventario', tx, y + 18);
  doc.setTextColor(80, 80, 80); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`GOLDEN TOUCH 1127 C.A. · ${fmt.dateTime(new Date().toISOString())} · ${rangoLabel(r)}`, tx, y + 33);
  doc.setTextColor(0, 0, 0);
  y += 60;

  // KPIs
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text(
    `Valor inventario ${money(r.valorTotal)}   ·   Nuevos ${r.nuevos.count}   ·   Entradas ${r.entradas.count} (${money(r.entradas.valor)})   ·   Salidas ${r.salidas.count} (${money(r.salidas.valor)})   ·   Traslados ${r.traslados.count} (${money(r.traslados.valor)})`,
    MARGIN, y, { maxWidth: W - MARGIN * 2 },
  );
  y += 16;

  // Tabla por almacén / subalmacén
  autoTable(doc, {
    startY: y,
    head: [['Sede', 'Almacén / sub-almacén', 'Productos', 'Stock', 'Valor (USD)']],
    body: r.porAlmacen.map((a) => [a.sede, (a.esSub ? '   ↳ ' : '') + a.almacen, fmt.num(a.productos), fmt.num(a.stock), money(a.valor)]),
    foot: [['', 'TOTAL', '', fmt.num(r.stockTotal), money(r.valorTotal)]],
    theme: 'grid',
    headStyles: { fillColor: [255, 138, 0], textColor: 255, fontSize: 9 },
    footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    margin: MARGIN,
  });
  // @ts-expect-error plugin
  y = (doc.lastAutoTable?.finalY ?? y) + 16;

  const lastY = () => {
    // @ts-expect-error plugin
    return (doc.lastAutoTable?.finalY ?? y);
  };

  const tablaMov = (titulo: string, b: BloqueMov) => {
    if (y > doc.internal.pageSize.getHeight() - 120) { doc.addPage(); y = MARGIN; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text(`${titulo} · ${b.count} · ${money(b.valor)}`, MARGIN, y);
    autoTable(doc, {
      startY: y + 6,
      head: [['Fecha', 'SKU', 'Producto', 'Almacén', 'Destino', 'Cant.', 'Valor (USD)']],
      body: b.filas.map((f) => [fmt.dateTime(f.at), f.sku, f.nombre, f.almacen, f.destino || f.detalle || '—', fmt.num(f.cantidad), money(f.valor)]),
      foot: [['', '', '', '', 'TOTAL', fmt.num(b.cantidad), money(b.valor)]],
      theme: 'striped',
      headStyles: { fillColor: [255, 138, 0], textColor: 255, fontSize: 7 },
      footStyles: { fillColor: [245, 245, 245], textColor: 20, fontStyle: 'bold', fontSize: 7 },
      styles: { fontSize: 7, cellPadding: 2.5, overflow: 'linebreak' },
      columnStyles: { 5: { halign: 'right' }, 6: { halign: 'right' } },
      margin: MARGIN,
    });
    y = lastY() + 16;
  };

  // Productos nuevos
  if (y > doc.internal.pageSize.getHeight() - 120) { doc.addPage(); y = MARGIN; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(`Productos nuevos · ${r.nuevos.count}`, MARGIN, y);
  autoTable(doc, {
    startY: y + 6,
    head: [['Fecha', 'SKU', 'Producto', 'Categoría', 'Almacén', 'Stock', 'Valor (USD)']],
    body: r.nuevos.filas.map((f) => [fmt.dateTime(f.at), f.sku, f.nombre, f.categoria, f.almacen, fmt.num(f.stock), money(f.valor)]),
    theme: 'striped',
    headStyles: { fillColor: [255, 138, 0], textColor: 255, fontSize: 7 },
    styles: { fontSize: 7, cellPadding: 2.5, overflow: 'linebreak' },
    columnStyles: { 5: { halign: 'right' }, 6: { halign: 'right' } },
    margin: MARGIN,
  });
  y = lastY() + 16;

  tablaMov('Entradas', r.entradas);
  tablaMov('Salidas', r.salidas);
  tablaMov('Traslados', r.traslados);

  return doc;
}

export async function descargarResumenInventarioPdf(r: ResumenInventario): Promise<void> {
  const doc = await construirPdf(r);
  previewPdf(doc, `resumen-inventario-${new Date().toISOString().slice(0, 10)}.pdf`);
}

/** Envía el resumen (PDF) por correo vía la Edge Function genérica `enviar-reporte`. */
export async function enviarResumenInventarioCorreo(emails: string[], r: ResumenInventario): Promise<{ destinatarios: string[] }> {
  const lista = Array.from(new Set(
    emails.map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
  ));
  if (!lista.length) throw new Error('Indicá al menos un correo válido');
  const doc = await construirPdf(r);
  const base64 = (doc.output('datauristring').split(',')[1]) ?? '';
  const { data, error } = await supabase.functions.invoke<
    { ok: true; destinatarios: string[] } | { error: string }
  >('enviar-reporte', {
    body: {
      pdf_base64: base64,
      nombre_archivo: `resumen-inventario-${new Date().toISOString().slice(0, 10)}.pdf`,
      asunto: 'Resumen de inventario',
      mensaje: `Resumen de inventario · ${rangoLabel(r)}.`,
      to_emails: lista,
    },
  });
  if (error) throw new Error(error.message ?? 'No se pudo enviar el correo');
  if (!data || 'error' in data) throw new Error((data as { error?: string })?.error || 'Respuesta inválida');
  return { destinatarios: data.destinatarios };
}
