/* ============================================================
   Golden Touch · Inventario · TRAZABILIDAD DE PRODUCTO
   Historia completa de un producto: existencias actuales por
   almacén + todos los movimientos (creación, entradas, salidas,
   consumos, traslados, ajustes, fundición) en orden cronológico,
   con actor, destino, solicitante, referencia (OC/recepción/
   salida) y stock antes/después. Se abre desde el Resumen de
   inventario al tocar cualquier fila (producto o movimiento).
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { Existencia, Movimiento, Producto, TipoMovimiento } from '@/shared/lib/types';
import { previewPdf } from '@/shared/lib/reportePreview';

export interface TrazaMovRow {
  id: string;
  at: string;
  tipo: TipoMovimiento;
  almacen: string;
  delta: number;          // con signo (+ entra / − sale)
  stockAntes: number;
  stockDespues: number;
  costo: number;          // costo_promedio del movimiento
  valor: number;          // |delta| × costo
  actor: string;
  destino: string;
  solicitante: string;
  ref: string;            // ref_codigo (OC-…, REC-…, SS-…) o ref_tipo
  detalle: string;
}

export interface TrazaExistencia {
  almacen: string;
  stock: number;
  costoPromedio: number;
  valor: number;
}

export interface TrazabilidadProducto {
  producto: {
    id: string;
    sku: string;
    nombre: string;
    categoria: string;
    unidad: string;
    stock: number;
    precio: number;
  };
  existencias: TrazaExistencia[];
  stockTotal: number;
  valorActual: number;
  totalEntradas: number;   // Σ |delta| que entró (delta > 0)
  totalSalidas: number;    // Σ |delta| que salió (delta < 0)
  movimientos: TrazaMovRow[];  // más reciente primero
}

const abs = (n: unknown) => Math.abs(Number(n) || 0);
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function refMov(m: Movimiento): string {
  if (m.ref_codigo) return m.ref_codigo;
  if (m.ref_tipo) return m.ref_tipo;
  return '';
}

/** Carga la trazabilidad completa de un producto por su id. */
export async function cargarTrazabilidadProducto(productoId: string): Promise<TrazabilidadProducto> {
  const [{ data: prodData, error: prodErr }, { data: exData }, { data: movData, error: movErr }] = await Promise.all([
    supabase.from('productos').select('id, sku, nombre, categoria, unidad, stock, precio').eq('id', productoId).single(),
    supabase.from('existencias').select('almacen, stock, costo_promedio').eq('producto_id', productoId),
    supabase
      .from('movimientos')
      .select('*')
      .eq('producto_id', productoId)
      .order('at', { ascending: false }),
  ]);
  if (prodErr) throw prodErr;
  if (movErr) throw movErr;
  const p = prodData as Pick<Producto, 'id' | 'sku' | 'nombre' | 'categoria' | 'unidad' | 'stock' | 'precio'>;

  const existencias: TrazaExistencia[] = ((exData ?? []) as Existencia[])
    .map((e) => {
      const stock = Number(e.stock) || 0;
      const costo = Number(e.costo_promedio) || 0;
      return { almacen: e.almacen, stock, costoPromedio: costo, valor: r2(stock * costo) };
    })
    .sort((a, b) => b.valor - a.valor || a.almacen.localeCompare(b.almacen, 'es'));

  const stockTotal = r3(existencias.reduce((a, e) => a + e.stock, 0));
  const valorActual = r2(existencias.reduce((a, e) => a + e.valor, 0));

  const movs = (movData ?? []) as Movimiento[];
  let totalEntradas = 0;
  let totalSalidas = 0;
  const movimientos: TrazaMovRow[] = movs.map((m) => {
    const delta = Number(m.delta) || 0;
    if (delta > 0) totalEntradas += delta;
    else if (delta < 0) totalSalidas += Math.abs(delta);
    const costo = Number(m.costo_promedio) || 0;
    return {
      id: m.id,
      at: m.at,
      tipo: m.tipo,
      almacen: m.almacen ?? '—',
      delta,
      stockAntes: Number(m.stock_antes) || 0,
      stockDespues: Number(m.stock_despues) || 0,
      costo,
      valor: r2(abs(delta) * costo),
      actor: m.actor_name || m.actor || '',
      destino: m.destino ?? '',
      solicitante: m.solicitante ?? '',
      ref: refMov(m),
      detalle: m.detalle ?? '',
    };
  });

  return {
    producto: {
      id: p.id,
      sku: p.sku,
      nombre: p.nombre,
      categoria: p.categoria,
      unidad: p.unidad,
      stock: Number(p.stock) || 0,
      precio: Number(p.precio) || 0,
    },
    existencias,
    stockTotal,
    valorActual,
    totalEntradas: r3(totalEntradas),
    totalSalidas: r3(totalSalidas),
    movimientos,
  };
}

/* ──────────── Etiqueta legible de cada tipo de movimiento ──────────── */
export const TIPO_MOV_LABEL: Record<TipoMovimiento, string> = {
  creacion: 'Alta / creación',
  entrada: 'Entrada',
  salida: 'Salida',
  consumo: 'Consumo',
  transferencia: 'Traslado',
  ajuste: 'Ajuste',
  fundicion: 'A fundición',
  fin_fundicion: 'Fin fundición',
};

export const TIPO_MOV_COLOR: Record<TipoMovimiento, string> = {
  creacion: '#8b5cf6',
  entrada: '#10b981',
  salida: '#ef4444',
  consumo: '#f97316',
  transferencia: '#3b82f6',
  ajuste: '#64748b',
  fundicion: '#eab308',
  fin_fundicion: '#14b8a6',
};

/* ──────────── PDF de trazabilidad (vista previa) ──────────── */
export async function descargarTrazabilidadPdf(t: TrazabilidadProducto): Promise<void> {
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
  doc.text('Trazabilidad de producto', tx, y + 18);
  doc.setTextColor(80, 80, 80); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`GOLDEN TOUCH 1127 C.A. · ${fmt.dateTime(new Date().toISOString())}`, tx, y + 33);
  doc.setTextColor(0, 0, 0);
  y += 60;

  // Ficha
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(`${t.producto.sku} · ${t.producto.nombre}`, MARGIN, y, { maxWidth: W - MARGIN * 2 });
  y += 15;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(80, 80, 80);
  doc.text(
    `${t.producto.categoria || 'Sin categoría'} · Unidad: ${t.producto.unidad || '—'} · Stock actual ${fmt.num(t.stockTotal)} · Valor ${money(t.valorActual)} · Entró ${fmt.num(t.totalEntradas)} · Salió ${fmt.num(t.totalSalidas)}`,
    MARGIN, y, { maxWidth: W - MARGIN * 2 },
  );
  doc.setTextColor(0, 0, 0);
  y += 16;

  // Existencia por almacén
  autoTable(doc, {
    startY: y,
    head: [['Almacén', 'Stock', 'Costo prom.', 'Valor (USD)']],
    body: t.existencias.map((e) => [e.almacen, fmt.num(e.stock), money(e.costoPromedio), money(e.valor)]),
    foot: [['TOTAL', fmt.num(t.stockTotal), '', money(t.valorActual)]],
    theme: 'grid',
    headStyles: { fillColor: [255, 138, 0], textColor: 255, fontSize: 8 },
    footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    margin: MARGIN,
  });
  // @ts-expect-error plugin
  y = (doc.lastAutoTable?.finalY ?? y) + 16;

  // Historia de movimientos
  if (y > doc.internal.pageSize.getHeight() - 120) { doc.addPage(); y = MARGIN; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(`Historia de movimientos · ${t.movimientos.length}`, MARGIN, y);
  autoTable(doc, {
    startY: y + 6,
    head: [['Fecha', 'Movimiento', 'Almacén', 'Cant.', 'Stock antes→después', 'Responsable', 'Destino/solic.', 'Ref.', 'Detalle']],
    body: t.movimientos.map((m) => [
      fmt.dateTime(m.at),
      TIPO_MOV_LABEL[m.tipo] ?? m.tipo,
      m.almacen,
      `${m.delta > 0 ? '+' : ''}${fmt.num(m.delta)}`,
      `${fmt.num(m.stockAntes)} → ${fmt.num(m.stockDespues)}`,
      m.actor || '—',
      m.destino || m.solicitante || '—',
      m.ref || '—',
      m.detalle || '—',
    ]),
    theme: 'striped',
    headStyles: { fillColor: [255, 138, 0], textColor: 255, fontSize: 7 },
    styles: { fontSize: 7, cellPadding: 2.5, overflow: 'linebreak' },
    columnStyles: { 3: { halign: 'right' } },
    margin: MARGIN,
  });

  previewPdf(doc, `trazabilidad-${t.producto.sku}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
