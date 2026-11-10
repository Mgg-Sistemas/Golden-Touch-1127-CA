/* ============================================================
   Golden Touch · Compras · Motor del Reporte Moldeable
   (10/11/2026)

   Motor de datos PURO y SÍNCRONO para el reporte de compras flexible,
   calcado del de Tesorería/Inventario. Une TRES fuentes de compra en una
   sola fila normalizada:
     · ordenes            → OC con cotización (EstadoOrden, con departamento)
     · compras_directas   → sin departamento; se agrupan por categoría de gasto
     · servicios_directos → con departamento (unidad_solicitante)

   REGLA DE ORO: aquí NO se lee de Supabase. Las funciones reciben los datos
   YA leídos por la capa de datos (`datosReporteCompras.ts`), más el contexto
   de tasa BCV y los mapas de apoyo. Así todo el cálculo es determinista y
   testeable con fixtures.

   REGLA DURA (palabras del usuario): ninguna clave interna, sigla, uuid ni
   `null` llega a pantalla. Los datos faltantes van a buckets con nombre claro.
   ============================================================ */

import type { Orden } from '@/shared/lib/types';
import type { CompraDirecta } from './compras.repository';
import type { ServicioDirecto } from './serviciosDirectos.repository';
import { statusBadge } from '@/shared/lib/format';

/* ───────────── Tipos de configuración ───────────── */

/** Grano del dato que se está reportando. */
export type AmbitoCompras = 'ordenes' | 'items';

/** De qué fuente salió la compra. */
export type TipoCompra = 'orden' | 'directa' | 'servicio';

/** Clase de estado unificada para las tres fuentes. */
export type ClaseEstadoCompra = 'finalizada' | 'pendiente' | 'excluida';

/** Dimensión principal de agrupación de las filas. */
export type ModoAgrupacionCompras =
  | 'departamento'
  | 'proveedor'
  | 'estado'
  | 'clasificacion'
  | 'tipo'
  | 'categoria'
  | 'producto'
  | 'mes'
  | 'dia'
  | 'detallado';

/* ───────────── Buckets con nombre claro (datos faltantes) ───────────── */

export const SIN_DEPARTAMENTO = 'Sin departamento asignado';
export const SIN_CATEGORIA_INV = 'Servicios / sin categoría';
export const SIN_CATEGORIA_GASTO = 'Sin categoría de gasto';

/* ───────────── Contexto (tasa + mapas, ya leídos) ───────────── */

export interface ContextoCompras {
  /** Tasa BCV del día (Bs por $). 0 = no se pudo resolver → no se convierte. */
  tasaBcv: number;
  /** sku → categoría de inventario (cruce con el catálogo de Inventario). */
  categoriasPorSku: Map<string, string>;
  /** proveedor_id → razón social (para mostrar nombre, nunca el id). */
  nombreProveedor: Map<string, string>;
}

/* ───────────── Clasificación de estados ───────────── */

/** Órdenes finalizadas (compra cerrada): pagada/finalizada/recibida/por_recibir. */
const ORDEN_FINALIZADA = new Set(['finalizada', 'pagada', 'recibida', 'por_recibir']);
/** Órdenes pendientes (ciclo de compra abierto). */
const ORDEN_PENDIENTE = new Set(['oc_creada', 'confirmada_metodo', 'oc_aprobada', 'cuenta_abierta', 'oc_emitida']);
// Todo lo demás (cancelada, rechazada, revision_almacen, pendiente, aprobada…) → excluida.

/** Clase de estado de una ORDEN (`EstadoOrden`). */
export function clasificarEstadoOrden(estado: string): ClaseEstadoCompra {
  if (ORDEN_FINALIZADA.has(estado)) return 'finalizada';
  if (ORDEN_PENDIENTE.has(estado)) return 'pendiente';
  return 'excluida';
}

/** Clase de estado de una COMPRA/SERVICIO DIRECTO (en_proceso/por_pagar/finalizada). */
export function clasificarEstadoDirectaServicio(estado: string): ClaseEstadoCompra {
  if (estado === 'finalizada') return 'finalizada';
  if (estado === 'por_pagar') return 'pendiente';
  return 'excluida'; // en_proceso (sin monto aún) queda fuera del reporte
}

/* ───────────── Conversión multimoneda ───────────── */

/** Redondeo a 2 decimales. */
export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Convierte un monto nativo a $ y Bs con la tasa BCV. USD/USDT 1:1 con $; Bs por
 * tasa. Si no hay tasa válida (≤0), NO se divide/multiplica por cero: el lado que
 * requiere la tasa queda en 0 y el nativo se conserva. Nunca devuelve NaN/Infinity.
 */
export function montoUsdBs(montoOriginal: number, moneda: string, tasaBcv: number): { usd: number; bs: number } {
  const monto = Number(montoOriginal) || 0;
  const tasa = Number(tasaBcv) || 0;
  const esBs = (moneda || '').toUpperCase() === 'BS';
  if (esBs) {
    return { usd: tasa > 0 ? round2(monto / tasa) : 0, bs: round2(monto) };
  }
  // USD, USDT o cualquier divisa que se trata 1:1 con el dólar.
  return { usd: round2(monto), bs: tasa > 0 ? round2(monto * tasa) : 0 };
}

/* ───────────── Normalización de texto ───────────── */

/** Recorta y colapsa espacios de un nombre de departamento; vacío → bucket nombrado. */
export function normalizarDepartamento(valor: string | null | undefined): string {
  const limpio = (valor ?? '').replace(/\s+/g, ' ').trim();
  return limpio || SIN_DEPARTAMENTO;
}

/* ───────────── Utilidades de fecha ───────────── */

const MESES_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Día (YYYY-MM-DD) de un instante ISO o de una fecha ya en ese formato. */
export function diaDe(valor: string | null | undefined): string {
  const s = (valor ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** Etiqueta "Mes Año" a partir de un YYYY-MM o YYYY-MM-DD. */
export function mesEtiqueta(fechaIso: string): string {
  const [y, m] = (fechaIso || '').split('-');
  const mesIdx = Number(m) - 1;
  if (mesIdx >= 0 && mesIdx < 12 && y) return `${MESES_ES[mesIdx]} ${y}`;
  return fechaIso || 'Sin fecha';
}

/* ───────────── Fila normalizada ───────────── */

export interface FilaReporteCompras {
  id: string;
  ambito: AmbitoCompras;
  tipo_compra: TipoCompra;

  fecha: string;              // YYYY-MM-DD (ancla: created_at)
  codigo: string;             // OC-/CD-/SD-… (nunca el uuid)
  departamento: string;       // unidad_solicitante normalizada o «Sin departamento asignado»
  proveedor: string;          // razón social o «—»
  estado: string;             // estado crudo (para agrupar)
  estado_rotulo: string;      // rótulo en palabras del usuario
  clase_estado: ClaseEstadoCompra;

  categoria: string;          // categoría de inventario (ámbito ítems) o ''
  categoria_gasto: string | null; // solo compras directas
  nombre_item: string;        // nombre del ítem (ámbito ítems) o ''
  cantidad: number | null;    // cantidad del ítem (ámbito ítems)

  moneda_original: string;
  monto_original: number;
  monto_usd: number;
  monto_bs: number;
  pagado_usd: number;
  pagado_bs: number;

  // Métricas de grupo (cuando la fila representa un grupo agregado)
  total_items?: number;
  pct_del_total?: number;
}

/* ───────────── Normalizadores (ámbito órdenes: una fila = una compra) ───────────── */

/** Nombre del proveedor por id (o «—» si no hay). */
function proveedorDe(id: string | null | undefined, ctx: ContextoCompras): string {
  const nombre = id ? ctx.nombreProveedor.get(id) : null;
  return (nombre || '').trim() || '—';
}

/**
 * Normaliza las ÓRDENES (`ordenes`) a filas del reporte. Descarta las de clase
 * `excluida` (canceladas/rechazadas/solicitudes previas a la OC). El monto sale de
 * `total`/`total_moneda`; lo pagado, de `total` si tiene fecha de pago o de
 * `abonado_total` si está a crédito.
 */
export function normalizarOrdenes(ordenes: Orden[], ctx: ContextoCompras): FilaReporteCompras[] {
  const filas: FilaReporteCompras[] = [];
  for (const o of ordenes) {
    const clase = clasificarEstadoOrden(o.estado);
    if (clase === 'excluida') continue;
    const moneda = (o.total_moneda || 'USD').toUpperCase();
    const monto = Number(o.total) || 0;
    const { usd, bs } = montoUsdBs(monto, moneda, ctx.tasaBcv);
    const pagadoNativo = o.pagada_en
      ? monto
      : (o.estado === 'cuenta_abierta' ? (Number(o.abonado_total) || 0) : 0);
    const pagado = montoUsdBs(pagadoNativo, moneda, ctx.tasaBcv);
    filas.push({
      id: `oc-${o.id}`,
      ambito: 'ordenes',
      tipo_compra: 'orden',
      fecha: diaDe(o.created_at),
      codigo: (o.oc_codigo || o.codigo || '—').trim() || '—',
      departamento: normalizarDepartamento(o.unidad_solicitante),
      proveedor: proveedorDe(o.proveedor_id, ctx),
      estado: o.estado,
      estado_rotulo: statusBadge(o.estado).label,
      clase_estado: clase,
      categoria: '',
      categoria_gasto: null,
      nombre_item: '',
      cantidad: null,
      moneda_original: moneda,
      monto_original: round2(monto),
      monto_usd: usd,
      monto_bs: bs,
      pagado_usd: pagado.usd,
      pagado_bs: pagado.bs,
    });
  }
  return filas;
}

/**
 * Normaliza las ÓRDENES al ámbito ÍTEMS: una fila por ítem de cada orden no
 * excluida. De aquí salen «ítem más comprado» y «por categoría de inventario».
 * La categoría se cruza con el catálogo de Inventario (`categoriasPorSku`); los
 * ítems sin categoría (servicios, sku desconocido) van a «Servicios / sin categoría».
 * Solo aplica a órdenes: las compras/servicios directos no llevan ítems de inventario.
 */
export function normalizarItemsOrdenes(ordenes: Orden[], ctx: ContextoCompras): FilaReporteCompras[] {
  const filas: FilaReporteCompras[] = [];
  for (const o of ordenes) {
    const clase = clasificarEstadoOrden(o.estado);
    if (clase === 'excluida') continue;
    const moneda = (o.total_moneda || 'USD').toUpperCase();
    const codigo = (o.oc_codigo || o.codigo || '—').trim() || '—';
    const depto = normalizarDepartamento(o.unidad_solicitante);
    const prov = proveedorDe(o.proveedor_id, ctx);
    const rotulo = statusBadge(o.estado).label;
    const items = Array.isArray(o.items) ? o.items : [];
    items.forEach((it, idx) => {
      const cantidad = Number(it.cantidad) || 0;
      const precio = Number(it.precio) || 0;
      const monto = round2(cantidad * precio);
      const { usd, bs } = montoUsdBs(monto, moneda, ctx.tasaBcv);
      const categoria = (ctx.categoriasPorSku.get(it.sku) || '').trim() || SIN_CATEGORIA_INV;
      filas.push({
        id: `oci-${o.id}-${idx}`,
        ambito: 'items',
        tipo_compra: 'orden',
        fecha: diaDe(o.created_at),
        codigo,
        departamento: depto,
        proveedor: prov,
        estado: o.estado,
        estado_rotulo: rotulo,
        clase_estado: clase,
        categoria,
        categoria_gasto: null,
        nombre_item: (it.nombre || '').trim() || '—',
        cantidad,
        moneda_original: moneda,
        monto_original: monto,
        monto_usd: usd,
        monto_bs: bs,
        pagado_usd: 0,
        pagado_bs: 0,
      });
    });
  }
  return filas;
}

/**
 * Normaliza las COMPRAS DIRECTAS (`compras_directas`) a filas. Sin departamento
 * (bucket nombrado); se agrupan por categoría de gasto (`gasto_categoria`).
 * `en_proceso` queda fuera (sin monto). Lo pagado sale de `gasto` si tiene
 * `pagada_at`.
 */
export function normalizarDirectas(directas: CompraDirecta[], ctx: ContextoCompras): FilaReporteCompras[] {
  const filas: FilaReporteCompras[] = [];
  for (const c of directas) {
    const clase = clasificarEstadoDirectaServicio(c.estado);
    if (clase === 'excluida') continue;
    const moneda = (c.moneda || 'USD').toUpperCase();
    const monto = Number(c.gasto) || 0;
    const { usd, bs } = montoUsdBs(monto, moneda, ctx.tasaBcv);
    const pagado = montoUsdBs(c.pagada_at ? monto : 0, moneda, ctx.tasaBcv);
    filas.push({
      id: `cd-${c.id}`,
      ambito: 'ordenes',
      tipo_compra: 'directa',
      fecha: diaDe(c.created_at),
      codigo: (c.codigo || '—').trim() || '—',
      departamento: SIN_DEPARTAMENTO,
      proveedor: (c.proveedor_nombre || '').trim() || proveedorDe(c.proveedor_id, ctx),
      estado: c.estado,
      estado_rotulo: statusBadge(c.estado).label,
      clase_estado: clase,
      categoria: '',
      categoria_gasto: (c.gasto_categoria || '').trim() || SIN_CATEGORIA_GASTO,
      nombre_item: '',
      cantidad: null,
      moneda_original: moneda,
      monto_original: round2(monto),
      monto_usd: usd,
      monto_bs: bs,
      pagado_usd: pagado.usd,
      pagado_bs: pagado.bs,
    });
  }
  return filas;
}

/**
 * Normaliza los SERVICIOS DIRECTOS (`servicios_directos`) a filas. Traen
 * `unidad_solicitante` (departamento). `en_proceso` fuera. Lo pagado sale de
 * `gasto` si tiene `pagada_at`, o de `abonado_total` (pago con abonos).
 */
export function normalizarServicios(servicios: ServicioDirecto[], ctx: ContextoCompras): FilaReporteCompras[] {
  const filas: FilaReporteCompras[] = [];
  for (const s of servicios) {
    const clase = clasificarEstadoDirectaServicio(s.estado);
    if (clase === 'excluida') continue;
    const moneda = (s.moneda || 'USD').toUpperCase();
    const monto = Number(s.gasto) || 0;
    const { usd, bs } = montoUsdBs(monto, moneda, ctx.tasaBcv);
    const pagadoNativo = s.pagada_at ? monto : (Number(s.abonado_total) || 0);
    const pagado = montoUsdBs(pagadoNativo, moneda, ctx.tasaBcv);
    filas.push({
      id: `sd-${s.id}`,
      ambito: 'ordenes',
      tipo_compra: 'servicio',
      fecha: diaDe(s.created_at),
      codigo: (s.codigo || '—').trim() || '—',
      departamento: normalizarDepartamento(s.unidad_solicitante),
      proveedor: (s.proveedor_nombre || '').trim() || proveedorDe(s.proveedor_id, ctx),
      estado: s.estado,
      estado_rotulo: statusBadge(s.estado).label,
      clase_estado: clase,
      categoria: '',
      categoria_gasto: null,
      nombre_item: '',
      cantidad: null,
      moneda_original: moneda,
      monto_original: round2(monto),
      monto_usd: usd,
      monto_bs: bs,
      pagado_usd: pagado.usd,
      pagado_bs: pagado.bs,
    });
  }
  return filas;
}

/* ───────────── Filtros ───────────── */

export interface FiltrosCompras {
  departamentosSel?: string[];
  categoriasSel?: string[];
  proveedoresSel?: string[];
  estadosSel?: ClaseEstadoCompra[];
  tiposSel?: TipoCompra[];
}

/** Filtra las filas por las selecciones (vacío/omitido = sin filtro). */
export function filtrarFilasCompras(filas: FilaReporteCompras[], f: FiltrosCompras): FilaReporteCompras[] {
  const { departamentosSel, categoriasSel, proveedoresSel, estadosSel, tiposSel } = f;
  return filas.filter((row) => {
    if (departamentosSel && departamentosSel.length > 0 && !departamentosSel.includes(row.departamento)) return false;
    if (categoriasSel && categoriasSel.length > 0 && !categoriasSel.includes(row.categoria)) return false;
    if (proveedoresSel && proveedoresSel.length > 0 && !proveedoresSel.includes(row.proveedor)) return false;
    if (estadosSel && estadosSel.length > 0 && !estadosSel.includes(row.clase_estado)) return false;
    if (tiposSel && tiposSel.length > 0 && !tiposSel.includes(row.tipo_compra)) return false;
    return true;
  });
}

/* ───────────── Resumen / KPIs ───────────── */

/** Cotización ya atribuida a un departamento por la capa de datos. */
export interface CotizacionCompras {
  departamento: string;
}

export interface RankDepto {
  departamento: string;
  usd: number;
  bs: number;
  pct: number;
}

export interface BloqueCategoriaGasto {
  categoria: string;
  usd: number;
  bs: number;
}

export interface TopCompras {
  nombre: string;
  usd: number;
  cantidad?: number;
}

export interface ResumenReporteCompras {
  totalCompras: number;
  totalUsd: number;
  totalBs: number;
  finalizadasCount: number;
  finalizadasUsd: number;
  finalizadasBs: number;
  pendientesCount: number;
  pendientesUsd: number;
  pendientesBs: number;
  pagadoUsd: number;
  pagadoBs: number;
  rankingDeptoGasto: RankDepto[];
  comprasDirectasPorCategoriaGasto: BloqueCategoriaGasto[];
  totalDirectasUsd: number;
  totalDirectasBs: number;
  rankingDeptoCotizaciones: { departamento: string; cotizaciones: number }[];
  topCategorias: TopCompras[];
  topItems: TopCompras[];
  deptoQueMasGasto: string | null;
  tasaBcv: number;
}

/** Top-N de una clave sumando usd (y, opcional, cantidad). */
function topPor(
  filas: FilaReporteCompras[],
  clave: (f: FilaReporteCompras) => string,
  conCantidad: boolean,
  n = 5,
): TopCompras[] {
  const usd = new Map<string, number>();
  const cant = new Map<string, number>();
  for (const f of filas) {
    const k = clave(f);
    usd.set(k, (usd.get(k) || 0) + (f.monto_usd || 0));
    if (conCantidad) cant.set(k, (cant.get(k) || 0) + (f.cantidad || 0));
  }
  return Array.from(usd.entries())
    .map(([nombre, v]) => (conCantidad
      ? { nombre, usd: round2(v), cantidad: round2(cant.get(nombre) || 0) }
      : { nombre, usd: round2(v) }))
    .sort((a, b) => b.usd - a.usd)
    .slice(0, n);
}

/**
 * Resumen/KPIs del rango. `filasOrdenes` = ámbito órdenes (las 3 fuentes, ya sin
 * excluidas); `filasItems` = ámbito ítems (solo órdenes); `cotizaciones` = ya
 * atribuidas a su departamento por la capa de datos.
 *
 * Reglas duras (decisión de la líder):
 *  · Total del rango: incluye las TRES fuentes.
 *  · Ranking por departamento: SOLO órdenes + servicios (EXCLUYE compras directas).
 *  · Compras directas: bloque propio por categoría de gasto, dentro del total.
 */
export function resumenCompras(
  filasOrdenes: FilaReporteCompras[],
  filasItems: FilaReporteCompras[],
  cotizaciones: CotizacionCompras[],
  tasaBcv: number,
): ResumenReporteCompras {
  let totalUsd = 0, totalBs = 0;
  let finCount = 0, finUsd = 0, finBs = 0;
  let penCount = 0, penUsd = 0, penBs = 0;
  let pagUsd = 0, pagBs = 0;
  let dirUsd = 0, dirBs = 0;

  const gastoDepto = new Map<string, { usd: number; bs: number }>();
  const dirPorCat = new Map<string, { usd: number; bs: number }>();

  for (const f of filasOrdenes) {
    totalUsd += f.monto_usd; totalBs += f.monto_bs;
    if (f.clase_estado === 'finalizada') { finCount += 1; finUsd += f.monto_usd; finBs += f.monto_bs; }
    else if (f.clase_estado === 'pendiente') { penCount += 1; penUsd += f.monto_usd; penBs += f.monto_bs; }
    pagUsd += f.pagado_usd; pagBs += f.pagado_bs;

    if (f.tipo_compra === 'directa') {
      dirUsd += f.monto_usd; dirBs += f.monto_bs;
      const cat = f.categoria_gasto || SIN_CATEGORIA_GASTO;
      const g = dirPorCat.get(cat) || { usd: 0, bs: 0 };
      g.usd += f.monto_usd; g.bs += f.monto_bs; dirPorCat.set(cat, g);
    } else {
      // órdenes + servicios directos entran al ranking por departamento
      const g = gastoDepto.get(f.departamento) || { usd: 0, bs: 0 };
      g.usd += f.monto_usd; g.bs += f.monto_bs; gastoDepto.set(f.departamento, g);
    }
  }

  const baseRanking = Array.from(gastoDepto.values()).reduce((a, g) => a + Math.abs(g.usd), 0);
  const rankingDeptoGasto: RankDepto[] = Array.from(gastoDepto.entries())
    .map(([departamento, g]) => ({
      departamento,
      usd: round2(g.usd),
      bs: round2(g.bs),
      pct: baseRanking > 0 ? Math.round((g.usd / baseRanking) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.usd - a.usd);

  const comprasDirectasPorCategoriaGasto: BloqueCategoriaGasto[] = Array.from(dirPorCat.entries())
    .map(([categoria, g]) => ({ categoria, usd: round2(g.usd), bs: round2(g.bs) }))
    .sort((a, b) => b.usd - a.usd);

  const cotDepto = new Map<string, number>();
  for (const c of cotizaciones) cotDepto.set(c.departamento, (cotDepto.get(c.departamento) || 0) + 1);
  const rankingDeptoCotizaciones = Array.from(cotDepto.entries())
    .map(([departamento, n]) => ({ departamento, cotizaciones: n }))
    .sort((a, b) => b.cotizaciones - a.cotizaciones);

  return {
    totalCompras: filasOrdenes.length,
    totalUsd: round2(totalUsd),
    totalBs: round2(totalBs),
    finalizadasCount: finCount,
    finalizadasUsd: round2(finUsd),
    finalizadasBs: round2(finBs),
    pendientesCount: penCount,
    pendientesUsd: round2(penUsd),
    pendientesBs: round2(penBs),
    pagadoUsd: round2(pagUsd),
    pagadoBs: round2(pagBs),
    rankingDeptoGasto,
    comprasDirectasPorCategoriaGasto,
    totalDirectasUsd: round2(dirUsd),
    totalDirectasBs: round2(dirBs),
    rankingDeptoCotizaciones,
    topCategorias: topPor(filasItems, (f) => f.categoria, false),
    topItems: topPor(filasItems, (f) => f.nombre_item, true),
    deptoQueMasGasto: rankingDeptoGasto[0]?.departamento ?? null,
    tasaBcv,
  };
}
