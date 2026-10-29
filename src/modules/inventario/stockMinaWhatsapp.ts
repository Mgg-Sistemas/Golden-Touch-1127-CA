/* ============================================================
   Golden Touch · Depósito Mina · Reporte de stock por WhatsApp (29/10/2026)

   Desde la vista de teléfono se elige un período (desde / hasta) y sale un
   mensaje con lo que hay en el depósito AL CIERRE del período, por categoría,
   con lo que entró y salió en esas fechas.

   El stock a una fecha se reconstruye con los movimientos: el stock de hoy
   menos lo que se movió DESPUÉS del «hasta». Las fechas se comparan en hora de
   Venezuela (un movimiento de las 22:00 del 31 es del 31, aunque en UTC ya
   sea del 1). Todos los emojis son «emoji por defecto» (sin U+FE0F).
   ============================================================ */
import { num } from '@/shared/lib/format';
import { fechaHoraVE } from './salidasMina';

export interface ProductoStock {
  id: string;
  nombre: string;
  sku?: string | null;
  categoria?: string | null;
  unidad?: string | null;
  stock: number | string | null;
}

export interface MovimientoStock {
  producto_id: string;
  delta: number | string;
  at: string;
}

export interface FilaStockPeriodo {
  id: string;
  nombre: string;
  categoria: string;
  unidad: string;
  /** Lo que había al empezar el «desde». */
  inicio: number;
  entradas: number;
  salidas: number;
  /** Lo que había al terminar el «hasta». */
  cierre: number;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

const diaFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Día (AAAA-MM-DD) en hora de Venezuela de un instante ISO. */
export function diaVE(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : diaFmt.format(d);
}

/** «2026-10-01» → «01/10/2026». */
export function fechaCortaVE(dia: string): string {
  const [y, m, d] = dia.split('-');
  return y && m && d ? `${d}/${m}/${y}` : dia;
}

/**
 * Stock de cada producto en el período. Quedan los que cierran con existencia
 * o tuvieron movimiento en esas fechas (los que están en cero y quietos no
 * aportan nada al mensaje). Orden: categoría y nombre.
 */
export function stockPorPeriodo(
  productos: ProductoStock[], movimientos: MovimientoStock[], desde: string, hasta: string,
): FilaStockPeriodo[] {
  const acc = new Map<string, { despues: number; entradas: number; salidas: number; movio: boolean }>();
  for (const m of movimientos) {
    const dia = diaVE(m.at);
    if (!dia || dia < desde) continue;
    const delta = Number(m.delta) || 0;
    const a = acc.get(m.producto_id) ?? { despues: 0, entradas: 0, salidas: 0, movio: false };
    if (dia > hasta) a.despues += delta;
    else {
      a.movio = true;
      if (delta > 0) a.entradas += delta; else a.salidas += -delta;
    }
    acc.set(m.producto_id, a);
  }
  const filas: FilaStockPeriodo[] = [];
  for (const p of productos) {
    const a = acc.get(p.id);
    const cierre = r3((Number(p.stock) || 0) - (a?.despues ?? 0));
    const entradas = r3(a?.entradas ?? 0);
    const salidas = r3(a?.salidas ?? 0);
    if (cierre === 0 && !a?.movio) continue;
    filas.push({
      id: p.id,
      nombre: p.nombre,
      categoria: (p.categoria ?? '').trim() || 'SIN CATEGORÍA',
      unidad: (p.unidad ?? '').trim(),
      inicio: r3(cierre - entradas + salidas),
      entradas, salidas, cierre,
    });
  }
  return filas.sort((x, y) => x.categoria.localeCompare(y.categoria, 'es') || x.nombre.localeCompare(y.nombre, 'es'));
}

/** El reporte de stock listo para WhatsApp. */
export function mensajeStockMina(
  filas: FilaStockPeriodo[], desde: string, hasta: string,
  opts: { quien?: string | null; cuando?: string | null } = {},
): string {
  const lineas = [
    '📦 *STOCK · DEPÓSITO MINA*',
    desde === hasta
      ? `📅 *Fecha:* ${fechaCortaVE(hasta)}`
      : `📅 *Período:* ${fechaCortaVE(desde)} al ${fechaCortaVE(hasta)}`,
    `📊 *Existencia al cierre del ${fechaCortaVE(hasta)}*`,
  ];
  if (!filas.length) {
    lineas.push('', 'Sin existencias ni movimientos en esas fechas.');
  } else {
    let cat = '';
    for (const f of filas) {
      if (f.categoria !== cat) {
        cat = f.categoria;
        lineas.push('', `🏷 *${cat}*`);
      }
      const u = f.unidad ? ` ${f.unidad}` : '';
      const mov: string[] = [];
      if (f.entradas > 0) mov.push(`📥 +${num(f.entradas)}`);
      if (f.salidas > 0) mov.push(`📤 −${num(f.salidas)}`);
      lineas.push(`• ${f.nombre}: *${num(f.cierre)}${u}*${mov.length ? ` (${mov.join(' · ')})` : ''}`);
    }
    const conStock = filas.filter((f) => f.cierre > 0).length;
    const movidos = filas.filter((f) => f.entradas > 0 || f.salidas > 0).length;
    lineas.push('', `🔢 *Productos con existencia:* ${conStock}`);
    if (movidos) lineas.push(`🔄 *Con movimiento en el período:* ${movidos}`);
  }
  lineas.push('');
  if (opts.quien) lineas.push(`👷 *Generado por:* ${opts.quien}`);
  const f = fechaHoraVE(opts.cuando ?? new Date().toISOString());
  if (f) lineas.push(`🕒 ${f}`);
  lineas.push('', '🏢 GOLDEN TOUCH 1127 C.A. · Depósito Mina');
  return lineas.join('\n');
}
