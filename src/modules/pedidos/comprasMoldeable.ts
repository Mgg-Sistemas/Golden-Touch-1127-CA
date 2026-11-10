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
