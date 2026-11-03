/* ============================================================
   Golden Touch · Inventario · Motor del Reporte Moldeable
   (03/11/2026)

   Motor de datos PURO y SÍNCRONO para el reporte de inventario flexible,
   calcado del de Tesorería (reporteTesoreriaMoldeable.ts). Consolida dos
   ámbitos en una sola fila normalizada:
     · existencias  → foto actual: stock y valor por almacén/sede/categoría
     · movimientos  → entradas / salidas / consumo / traslados del período

   REGLA DE ORO: aquí NO se lee de Supabase. Las funciones reciben los datos
   YA leídos por la capa de repositorios/modal (existencias, almacenes y los
   movimientos del resumen), más los mapas de apoyo (producto por id, sede por
   almacén). Así todo el cálculo es determinista y testeable con fixtures.

   REGLA DURA DE DATOS: el stock y el valor por almacén/sede salen de las
   `existencias` (stock × costo_promedio/PMP de cada almacén), NUNCA de
   `producto.stock`/`producto.precio`. El valor se expresa en dólares ($),
   igual que el resto del inventario.
   ============================================================ */

import type { Existencia } from '@/shared/lib/types';
import type { MovResumenRow } from './resumenInventario';

/* ───────────── Tipos de configuración ───────────── */

/** Qué ámbito del inventario se está reportando. */
export type AmbitoInventario = 'existencias' | 'movimientos';

/** Dimensión principal de agrupación de las filas. */
export type ModoAgrupacionInventario =
  | 'categoria'
  | 'almacen'
  | 'sede'
  | 'unidad'
  | 'estado'
  | 'tipo'
  | 'dia'
  | 'mes'
  | 'detallado';

/** Tipo de movimiento ya normalizado (entradas/salidas/consumo/traslados/ajustes). */
export type TipoMovInventario = 'entrada' | 'salida' | 'consumo' | 'traslado' | 'ajuste';

/** Valor que decide el signo de un movimiento en el flujo del inventario. */
export const ETIQUETA_TIPO_MOV: Record<TipoMovInventario, string> = {
  entrada: 'Entrada',
  salida: 'Salida',
  consumo: 'Consumo',
  traslado: 'Traslado',
  ajuste: 'Ajuste',
};

export const SIN_SEDE = 'Sin sede';

/* ───────────── Mapas de apoyo (ya leídos) ───────────── */

/** Ficha mínima de un producto para enriquecer existencias y movimientos. */
export interface ProductoInfoInventario {
  sku: string;
  nombre: string;
  categoria: string;
  unidad: string;
  stock_min: number;
  estado: string;
}

/** Producto por id (metadatos). */
export type MapaProductos = Map<string, ProductoInfoInventario>;
/** Sede por NOMBRE de almacén (el stock se indexa por nombre de almacén). */
export type MapaSedes = Map<string, string>;

/**
 * Sede de un almacén por su nombre. Un nombre que no es un almacén registrado
 * ('PRODUCCION' de los martillos y la casiterita, 'LOS PINOS', 'GT MATANZA'…) la base
 * lo trata como el General (ver supabase/2026-10-30-permisos-por-deposito.sql), así que
 * toma la sede del General; «Sin sede» solo si tampoco se conoce la del General (03/11/2026).
 */
export function sedeDeAlmacen(almacen: string | null | undefined, sedes: MapaSedes): string {
  return sedes.get(almacen || 'General') || sedes.get('General') || SIN_SEDE;
}

/** Movimientos del período, separados por tipo (del resumen de inventario). */
export interface MovimientosInventario {
  entradas: MovResumenRow[];
  salidas: MovResumenRow[];
  traslados: MovResumenRow[];
}

/* ───────────── Fila normalizada ───────────── */

export interface FilaReporteInventario {
  id: string;
  ambito: AmbitoInventario;

  // Identificación del producto
  producto_id: string;
  sku: string;
  nombre: string;
  categoria: string;
  unidad: string;

  // Ubicación
  almacen: string;
  sede: string;

  // Existencias (foto actual)
  stock: number | null;          // unidades en existencia (ámbito existencias)
  costo_promedio: number;        // $ por unidad (PMP del almacén)
  valor: number;                 // $ = stock × costo (o cantidad × costo en movimientos)
  stock_min: number;
  bajo_minimo: boolean;
  estado: string | null;

  // Movimientos del período
  fecha: string;                 // YYYY-MM-DD ('' en existencias)
  hora?: string | null;          // HH:mm
  tipo_mov: TipoMovInventario | null;
  cantidad: number | null;       // |delta| del movimiento (ámbito movimientos)
  responsable?: string | null;   // quién ejecutó
  destino?: string | null;       // destinatario / almacén destino

  // Métricas de grupo (cuando la fila representa un grupo agrupado)
  total_items?: number;
  pct_del_total?: number;        // % del valor respecto al total del período
}

/* ───────────── Resumen / KPIs ───────────── */

export interface TopItemInventario {
  nombre: string;
  valor: number;
  porcentaje: number;
}

export interface ResumenReporteInventario {
  ambito: AmbitoInventario;
  // Existencias
  valorTotal: number;            // Σ stock × costo
  stockTotal: number;            // Σ stock
  numItems: number;              // nº de filas (productos·almacén)
  numBajoMinimo: number;         // nº de existencias por debajo del mínimo
  // Movimientos
  entradas: number;              // Σ cantidad de entradas
  salidas: number;               // Σ cantidad de salidas
  consumo: number;               // Σ cantidad de consumo
  traslados: number;             // Σ cantidad de traslados
  valorEntradas: number;         // $ de entradas
  valorSalidas: number;          // $ de salidas (y consumo)
  totalMovimientos: number;      // nº de movimientos del período
  // Comunes
  topCategorias: TopItemInventario[];
  topAlmacenes: TopItemInventario[];
}

/* ───────────── Métrica de ficha ejecutiva ───────────── */

export interface MetricaFichaInventario {
  clave: string;
  etiqueta: string;
  valor: string;
  sub?: string;
  colorHex: string;
  colorRgb: [number, number, number];
}

/* ───────────── Catálogo de columnas ───────────── */

export interface CampoColumnaInventario {
  clave: string;
  etiqueta: string;
  descripcion?: string;
  anchoPdf: number;
  anchoExcel: number;
  alineacion: 'left' | 'right' | 'center';
  formato?: 'texto' | 'numero' | 'moneda' | 'porcentaje';
  /** En qué ámbito tiene sentido la columna ('ambos' por defecto). */
  ambito?: AmbitoInventario | 'ambos';
}

export const CAMPOS_REPORTE_INVENTARIO: CampoColumnaInventario[] = [
  { clave: 'sku', etiqueta: 'Código (SKU)', anchoPdf: 16, anchoExcel: 16, alineacion: 'left', formato: 'texto', descripcion: 'Código del producto', ambito: 'ambos' },
  { clave: 'nombre', etiqueta: 'Producto', anchoPdf: 30, anchoExcel: 32, alineacion: 'left', formato: 'texto', descripcion: 'Nombre del producto', ambito: 'ambos' },
  { clave: 'categoria', etiqueta: 'Categoría', anchoPdf: 20, anchoExcel: 20, alineacion: 'left', formato: 'texto', descripcion: 'Categoría del producto', ambito: 'ambos' },
  { clave: 'unidad', etiqueta: 'Unidad', anchoPdf: 12, anchoExcel: 12, alineacion: 'center', formato: 'texto', descripcion: 'Unidad de medida', ambito: 'ambos' },
  { clave: 'almacen', etiqueta: 'Almacén', anchoPdf: 22, anchoExcel: 22, alineacion: 'left', formato: 'texto', descripcion: 'Almacén / subalmacén', ambito: 'ambos' },
  { clave: 'sede', etiqueta: 'Sede', anchoPdf: 18, anchoExcel: 18, alineacion: 'left', formato: 'texto', descripcion: 'Sede física que agrupa el almacén', ambito: 'ambos' },
  { clave: 'stock', etiqueta: 'Existencia (stock)', anchoPdf: 15, anchoExcel: 15, alineacion: 'right', formato: 'numero', descripcion: 'Unidades en existencia', ambito: 'existencias' },
  { clave: 'costo', etiqueta: 'Costo promedio ($)', anchoPdf: 16, anchoExcel: 16, alineacion: 'right', formato: 'moneda', descripcion: 'Costo unitario (PMP del almacén)', ambito: 'ambos' },
  { clave: 'valor', etiqueta: 'Valor ($)', anchoPdf: 17, anchoExcel: 17, alineacion: 'right', formato: 'moneda', descripcion: 'Stock × costo promedio', ambito: 'ambos' },
  { clave: 'stock_min', etiqueta: 'Stock mínimo', anchoPdf: 14, anchoExcel: 14, alineacion: 'right', formato: 'numero', descripcion: 'Mínimo antes de reponer', ambito: 'existencias' },
  { clave: 'bajo_minimo', etiqueta: '¿Bajo mínimo?', anchoPdf: 14, anchoExcel: 14, alineacion: 'center', formato: 'texto', descripcion: 'Si el stock está por debajo del mínimo', ambito: 'existencias' },
  { clave: 'estado', etiqueta: 'Estado', anchoPdf: 13, anchoExcel: 13, alineacion: 'center', formato: 'texto', descripcion: 'Activo / inactivo', ambito: 'existencias' },
  { clave: 'fecha', etiqueta: 'Fecha', anchoPdf: 14, anchoExcel: 13, alineacion: 'center', formato: 'texto', descripcion: 'Fecha del movimiento', ambito: 'movimientos' },
  { clave: 'tipo_mov', etiqueta: 'Tipo de movimiento', anchoPdf: 16, anchoExcel: 16, alineacion: 'center', formato: 'texto', descripcion: 'Entrada, salida, consumo o traslado', ambito: 'movimientos' },
  { clave: 'cantidad', etiqueta: 'Cantidad', anchoPdf: 14, anchoExcel: 14, alineacion: 'right', formato: 'numero', descripcion: 'Cantidad movida', ambito: 'movimientos' },
  { clave: 'destino', etiqueta: 'Destino', anchoPdf: 22, anchoExcel: 22, alineacion: 'left', formato: 'texto', descripcion: 'Destinatario o almacén destino', ambito: 'movimientos' },
  { clave: 'responsable', etiqueta: 'Responsable', anchoPdf: 20, anchoExcel: 20, alineacion: 'left', formato: 'texto', descripcion: 'Quién ejecutó el movimiento', ambito: 'movimientos' },
  { clave: 'pct_total', etiqueta: '% del Total', anchoPdf: 13, anchoExcel: 12, alineacion: 'right', formato: 'porcentaje', descripcion: 'Peso en valor sobre el total', ambito: 'ambos' },
];

export const CAMPOS_POR_DEFECTO_POR_MODO: Record<ModoAgrupacionInventario, string[]> = {
  categoria: ['categoria', 'stock', 'valor', 'pct_total'],
  almacen: ['almacen', 'sede', 'stock', 'valor', 'pct_total'],
  sede: ['sede', 'stock', 'valor', 'pct_total'],
  unidad: ['unidad', 'stock', 'valor', 'pct_total'],
  estado: ['estado', 'stock', 'valor', 'pct_total'],
  tipo: ['tipo_mov', 'cantidad', 'valor', 'pct_total'],
  dia: ['fecha', 'tipo_mov', 'cantidad', 'valor'],
  mes: ['fecha', 'cantidad', 'valor', 'pct_total'],
  detallado: ['sku', 'nombre', 'categoria', 'almacen', 'sede', 'stock', 'costo', 'valor'],
};

/** Columnas por defecto cuando se arranca en un ámbito (detalle completo por ámbito). */
export const CAMPOS_DETALLE_POR_AMBITO: Record<AmbitoInventario, string[]> = {
  existencias: ['sku', 'nombre', 'categoria', 'unidad', 'almacen', 'sede', 'stock', 'costo', 'valor', 'bajo_minimo'],
  movimientos: ['fecha', 'tipo_mov', 'sku', 'nombre', 'almacen', 'sede', 'cantidad', 'valor', 'destino', 'responsable'],
};

/* ───────────── Opciones del reporte ───────────── */

export interface FiltrosInventario {
  categoriasSel?: string[];
  almacenesSel?: string[];
  sedesSel?: string[];
  unidadesSel?: string[];
  estadosSel?: string[];
  tiposSel?: TipoMovInventario[];
  /** Solo las existencias por debajo del mínimo (ámbito existencias). */
  soloBajoMinimo?: boolean;
  /** Oculta las existencias sin stock (stock ≤ 0). */
  ocultarSinStock?: boolean;
}

export type OrdenReporteInventario = 'valor' | 'stock' | 'nombre' | 'fecha';

/* ───────────── Utilidades numéricas y de fecha ───────────── */

const MESES_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Redondeo a 2 decimales. */
export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Redondeo a 3 decimales (cantidades de stock admiten fracción). */
export function round3(n: number): number {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

/** Etiqueta "Mes Año" a partir de un YYYY-MM o YYYY-MM-DD. */
export function mesEtiqueta(fechaIso: string): string {
  const [y, m] = (fechaIso || '').split('-');
  const mesIdx = Number(m) - 1;
  if (mesIdx >= 0 && mesIdx < 12 && y) return `${MESES_ES[mesIdx]} ${y}`;
  return fechaIso || 'Sin fecha';
}

/** Día (YYYY-MM-DD) de un instante ISO o de una fecha ya en ese formato. */
export function diaDe(valor: string | null | undefined): string {
  const s = (valor ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** Hora (HH:mm) de un instante ISO, o null si no se puede derivar. */
export function horaDe(valor: string | null | undefined): string | null {
  const s = (valor ?? '').trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(11, 16);
}

/* ───────────── Normalizador: existencias ───────────── */

/**
 * Normaliza las existencias (stock + costo por almacén) a filas del reporte.
 * El valor SIEMPRE sale de stock × costo_promedio del almacén (REGLA DURA).
 * La sede se resuelve por el NOMBRE del almacén; si el almacén no existe como
 * entidad (datos legados) cae en «Sin sede».
 */
export function normalizarExistencias(
  existencias: Existencia[],
  productos: MapaProductos,
  sedes: MapaSedes,
): FilaReporteInventario[] {
  return existencias.map((e, idx) => {
    const info = productos.get(e.producto_id);
    const stock = round3(Number(e.stock) || 0);
    const costo = round2(Number(e.costo_promedio) || 0);
    const stockMin = round3(Number(info?.stock_min) || 0);
    const bajo = stockMin > 0 && stock < stockMin;
    return {
      id: `ex-${e.producto_id}-${e.almacen || 'General'}-${idx}`,
      ambito: 'existencias',
      producto_id: e.producto_id,
      sku: info?.sku || '—',
      nombre: info?.nombre || '—',
      categoria: info?.categoria || 'Sin categoría',
      unidad: info?.unidad || 'und',
      almacen: e.almacen || 'General',
      sede: sedeDeAlmacen(e.almacen, sedes),
      stock,
      costo_promedio: costo,
      valor: round2(stock * costo),
      stock_min: stockMin,
      bajo_minimo: bajo,
      estado: info?.estado || null,
      fecha: '',
      hora: null,
      tipo_mov: null,
      cantidad: null,
      responsable: null,
      destino: null,
    };
  });
}

/* ───────────── Normalizador: movimientos del período ───────────── */

/**
 * Normaliza los movimientos del período (ya cargados en el resumen) a filas del
 * reporte. Las entradas, salidas y traslados vienen en bloques separados; el
 * valor en $ de cada movimiento es |delta| × costo (ya calculado en el resumen).
 */
export function normalizarMovimientosInventario(
  movs: MovimientosInventario,
  productos: MapaProductos,
  sedes: MapaSedes,
): FilaReporteInventario[] {
  const filas: FilaReporteInventario[] = [];
  const empujar = (fila: MovResumenRow, tipo: TipoMovInventario) => {
    const info = productos.get(fila.producto_id);
    const cantidad = round3(Number(fila.cantidad) || 0);
    const valor = round2(Number(fila.valor) || 0);
    const costo = cantidad > 0 ? round2(valor / cantidad) : 0;
    filas.push({
      id: `mov-${tipo}-${fila.id}`,
      ambito: 'movimientos',
      producto_id: fila.producto_id,
      sku: fila.sku || info?.sku || '—',
      nombre: fila.nombre || info?.nombre || '—',
      categoria: info?.categoria || 'Sin categoría',
      unidad: info?.unidad || 'und',
      almacen: fila.almacen || 'General',
      sede: sedeDeAlmacen(fila.almacen, sedes),
      stock: null,
      costo_promedio: costo,
      valor,
      stock_min: 0,
      bajo_minimo: false,
      estado: null,
      fecha: diaDe(fila.at),
      hora: horaDe(fila.at),
      tipo_mov: tipo,
      cantidad,
      responsable: (fila.actor || '').trim() || null,
      destino: (fila.destino || fila.detalle || '').trim() || null,
    });
  };
  for (const f of movs.entradas) empujar(f, tipoDeMov(f.tipo, 'entrada'));
  for (const f of movs.salidas) empujar(f, tipoDeMov(f.tipo, 'salida'));
  for (const f of movs.traslados) empujar(f, 'traslado');
  return filas;
}

/** Mapea el tipo del movimiento crudo al tipo normalizado, con un respaldo. */
function tipoDeMov(tipo: string, respaldo: TipoMovInventario): TipoMovInventario {
  switch (tipo) {
    case 'entrada': return 'entrada';
    case 'salida': return 'salida';
    case 'consumo': return 'consumo';
    case 'transferencia': return 'traslado';
    case 'ajuste': return 'ajuste';
    default: return respaldo;
  }
}

/* ───────────── Filtros ───────────── */

/** Filtra las filas por las selecciones de chips/checks (vacío = sin filtro). */
export function filtrarFilasInventario(filas: FilaReporteInventario[], f: FiltrosInventario): FilaReporteInventario[] {
  const { categoriasSel, almacenesSel, sedesSel, unidadesSel, estadosSel, tiposSel, soloBajoMinimo, ocultarSinStock } = f;
  return filas.filter((row) => {
    if (categoriasSel && categoriasSel.length > 0 && !categoriasSel.includes(row.categoria)) return false;
    if (almacenesSel && almacenesSel.length > 0 && !almacenesSel.includes(row.almacen)) return false;
    if (sedesSel && sedesSel.length > 0 && !sedesSel.includes(row.sede)) return false;
    if (unidadesSel && unidadesSel.length > 0 && !unidadesSel.includes(row.unidad)) return false;
    if (estadosSel && estadosSel.length > 0) {
      if (!row.estado || !estadosSel.includes(row.estado)) return false;
    }
    if (tiposSel && tiposSel.length > 0) {
      if (!row.tipo_mov || !tiposSel.includes(row.tipo_mov)) return false;
    }
    if (soloBajoMinimo && !row.bajo_minimo) return false;
    if (ocultarSinStock && row.ambito === 'existencias' && (row.stock ?? 0) <= 0) return false;
    return true;
  });
}

/* ───────────── Resumen / KPIs ───────────── */

function topPorValor(
  filas: FilaReporteInventario[],
  clave: (f: FilaReporteInventario) => string,
): TopItemInventario[] {
  const map = new Map<string, number>();
  let base = 0;
  for (const f of filas) {
    const v = Math.abs(f.valor);
    map.set(clave(f), (map.get(clave(f)) || 0) + v);
    base += v;
  }
  return Array.from(map.entries())
    .map(([nombre, valor]) => ({
      nombre,
      valor: round2(valor),
      porcentaje: base > 0 ? Math.round((valor / base) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 5);
}

/** KPIs del reporte a partir de las filas de detalle (ya filtradas). */
export function resumenInventario(filas: FilaReporteInventario[], ambito: AmbitoInventario): ResumenReporteInventario {
  let valorTotal = 0, stockTotal = 0, numBajo = 0;
  let entradas = 0, salidas = 0, consumo = 0, traslados = 0, valorEntradas = 0, valorSalidas = 0;
  for (const f of filas) {
    valorTotal += f.valor;
    if (f.ambito === 'existencias') {
      stockTotal += f.stock ?? 0;
      if (f.bajo_minimo) numBajo += 1;
    } else {
      const c = f.cantidad ?? 0;
      switch (f.tipo_mov) {
        case 'entrada': entradas += c; valorEntradas += f.valor; break;
        case 'salida': salidas += c; valorSalidas += f.valor; break;
        case 'consumo': consumo += c; valorSalidas += f.valor; break;
        case 'traslado': traslados += c; break;
        default: break;
      }
    }
  }
  return {
    ambito,
    valorTotal: round2(valorTotal),
    stockTotal: round3(stockTotal),
    numItems: filas.length,
    numBajoMinimo: numBajo,
    entradas: round3(entradas),
    salidas: round3(salidas),
    consumo: round3(consumo),
    traslados: round3(traslados),
    valorEntradas: round2(valorEntradas),
    valorSalidas: round2(valorSalidas),
    totalMovimientos: ambito === 'movimientos' ? filas.length : 0,
    topCategorias: topPorValor(filas, (f) => f.categoria),
    topAlmacenes: topPorValor(filas, (f) => f.almacen),
  };
}

/* ───────────── Agrupación y procesamiento ───────────── */

interface AcumuladorInventario {
  clave: string;
  etiqueta: string;
  categoria: string;
  almacen: string;
  sede: string;
  unidad: string;
  estado: string | null;
  tipo: TipoMovInventario | null;
  fecha: string;
  stock: number;
  cantidad: number;
  valor: number;
  items: number;
  tieneStock: boolean;
  tieneCantidad: boolean;
}

/** Clave + etiqueta del grupo de una fila según la dimensión elegida. */
function claveGrupo(f: FilaReporteInventario, modo: ModoAgrupacionInventario): { clave: string; etiqueta: string } {
  switch (modo) {
    case 'categoria': return { clave: f.categoria, etiqueta: f.categoria };
    case 'almacen': return { clave: f.almacen, etiqueta: f.almacen };
    case 'sede': return { clave: f.sede, etiqueta: f.sede };
    case 'unidad': return { clave: f.unidad, etiqueta: f.unidad };
    case 'estado': return { clave: f.estado || 'Sin estado', etiqueta: f.estado || 'Sin estado' };
    case 'tipo': return { clave: f.tipo_mov || 'otro', etiqueta: f.tipo_mov ? ETIQUETA_TIPO_MOV[f.tipo_mov] : 'Otro' };
    case 'dia': return { clave: f.fecha || 'Sin fecha', etiqueta: f.fecha || 'Sin fecha' };
    case 'mes': return { clave: (f.fecha || '').slice(0, 7) || 'Sin fecha', etiqueta: mesEtiqueta(f.fecha) };
    default: return { clave: f.id, etiqueta: f.nombre || f.categoria };
  }
}

/**
 * Genera las filas del reporte según la dimensión de agrupación, más el resumen.
 * El % del total se calcula sobre el |valor| de todas las filas del período.
 * El resumen (KPIs) siempre sale del detalle completo, no de los grupos.
 */
export function procesarFilasReporteInventario(
  filasDetalle: FilaReporteInventario[],
  agrupacion: ModoAgrupacionInventario,
  opciones: { ordenarPor?: OrdenReporteInventario; ambito?: AmbitoInventario } = {},
): { filas: FilaReporteInventario[]; resumen: ResumenReporteInventario } {
  const ambito = opciones.ambito ?? filasDetalle[0]?.ambito ?? 'existencias';
  const ordenarPor = opciones.ordenarPor ?? 'valor';
  const resumen = resumenInventario(filasDetalle, ambito);

  const totalValor = filasDetalle.reduce((a, f) => a + Math.abs(f.valor), 0);
  const pctDe = (valor: number): number => (totalValor > 0 ? Math.round((Math.abs(valor) / totalValor) * 1000) / 10 : 0);

  if (agrupacion === 'detallado') {
    const filas = filasDetalle.map((f) => ({ ...f, total_items: 1, pct_del_total: pctDe(f.valor) }));
    ordenarFilas(filas, ordenarPor);
    return { filas, resumen };
  }

  const mapa = new Map<string, AcumuladorInventario>();
  for (const f of filasDetalle) {
    const { clave, etiqueta } = claveGrupo(f, agrupacion);
    let g = mapa.get(clave);
    if (!g) {
      g = {
        clave, etiqueta,
        categoria: f.categoria,
        almacen: f.almacen,
        sede: f.sede,
        unidad: f.unidad,
        estado: f.estado,
        tipo: f.tipo_mov,
        fecha: f.fecha,
        stock: 0, cantidad: 0, valor: 0, items: 0,
        tieneStock: false, tieneCantidad: false,
      };
      mapa.set(clave, g);
    }
    if (f.stock != null) { g.stock += f.stock; g.tieneStock = true; }
    if (f.cantidad != null) { g.cantidad += f.cantidad; g.tieneCantidad = true; }
    g.valor += f.valor;
    g.items += 1;
  }

  const filas: FilaReporteInventario[] = Array.from(mapa.values()).map((g) => ({
    id: g.clave || g.etiqueta,
    ambito,
    producto_id: '',
    sku: '',
    nombre: g.etiqueta,
    categoria: agrupacion === 'categoria' ? g.etiqueta : g.categoria,
    unidad: agrupacion === 'unidad' ? g.etiqueta : g.unidad,
    almacen: agrupacion === 'almacen' ? g.etiqueta : g.almacen,
    sede: agrupacion === 'sede' ? g.etiqueta : g.sede,
    stock: g.tieneStock ? round3(g.stock) : null,
    costo_promedio: 0,
    valor: round2(g.valor),
    stock_min: 0,
    bajo_minimo: false,
    estado: agrupacion === 'estado' ? g.etiqueta : g.estado,
    fecha: g.fecha,
    hora: null,
    tipo_mov: agrupacion === 'tipo' ? (g.tipo ?? null) : g.tipo,
    cantidad: g.tieneCantidad ? round3(g.cantidad) : null,
    responsable: null,
    destino: null,
    total_items: g.items,
    pct_del_total: pctDe(g.valor),
  }));

  if (agrupacion === 'mes' || agrupacion === 'dia') {
    filas.sort((a, b) => a.id.localeCompare(b.id));
  } else {
    ordenarFilas(filas, ordenarPor);
  }

  return { filas, resumen };
}

function ordenarFilas(filas: FilaReporteInventario[], ordenarPor: OrdenReporteInventario): void {
  switch (ordenarPor) {
    case 'stock': filas.sort((a, b) => (Math.abs(b.stock ?? b.cantidad ?? 0)) - (Math.abs(a.stock ?? a.cantidad ?? 0))); break;
    case 'nombre': filas.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')); break;
    case 'fecha': filas.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '')); break;
    default: filas.sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
  }
}

/* ───────────── Métricas de la ficha ejecutiva ───────────── */

const fmtNum = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtMoney = (n: number) => `$ ${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Métricas visibles de una ficha ejecutiva según las columnas marcadas. Devuelve
 * como máximo 4 recuadros; si no quedó ninguno marcado, al menos el valor en $.
 */
export function obtenerMetricasFichaInventario(
  f: FilaReporteInventario,
  columnasClaves: string[],
): MetricaFichaInventario[] {
  const metricas: MetricaFichaInventario[] = [];

  if (columnasClaves.includes('valor')) {
    metricas.push({
      clave: 'valor',
      etiqueta: 'VALOR ($)',
      valor: fmtMoney(f.valor),
      sub: f.costo_promedio > 0 ? `Costo: ${fmtMoney(f.costo_promedio)}` : 'Stock × costo',
      colorHex: '#22c55e',
      colorRgb: [22, 163, 74],
    });
  }

  if (f.ambito === 'existencias' && columnasClaves.includes('stock') && f.stock != null && metricas.length < 4) {
    metricas.push({
      clave: 'stock',
      etiqueta: 'EXISTENCIA',
      valor: `${fmtNum(f.stock)} ${f.unidad}`,
      sub: f.stock_min > 0 ? `Mínimo: ${fmtNum(f.stock_min)}` : 'Sin mínimo',
      colorHex: f.bajo_minimo ? '#ef4444' : '#38bdf8',
      colorRgb: f.bajo_minimo ? [220, 38, 38] : [2, 132, 199],
    });
  }

  if (f.ambito === 'movimientos' && columnasClaves.includes('cantidad') && f.cantidad != null && metricas.length < 4) {
    metricas.push({
      clave: 'cantidad',
      etiqueta: 'CANTIDAD',
      valor: `${fmtNum(f.cantidad)} ${f.unidad}`,
      sub: f.tipo_mov ? ETIQUETA_TIPO_MOV[f.tipo_mov] : '',
      colorHex: '#38bdf8',
      colorRgb: [2, 132, 199],
    });
  }

  if (f.total_items != null && metricas.length < 4) {
    metricas.push({
      clave: 'items',
      etiqueta: f.ambito === 'movimientos' ? 'MOVIMIENTOS' : 'PRODUCTOS',
      valor: `${f.total_items}`,
      sub: f.total_items === 1 ? 'registro' : 'registros',
      colorHex: '#a855f7',
      colorRgb: [147, 51, 234],
    });
  }

  if (columnasClaves.includes('pct_total') && f.pct_del_total != null && metricas.length < 4) {
    metricas.push({
      clave: 'pct_total',
      etiqueta: '% DEL TOTAL',
      valor: `${f.pct_del_total.toFixed(1)}%`,
      sub: 'del valor',
      colorHex: '#eab308',
      colorRgb: [202, 138, 4],
    });
  }

  if (metricas.length === 0) {
    metricas.push({
      clave: 'valor',
      etiqueta: 'VALOR ($)',
      valor: fmtMoney(f.valor),
      sub: 'Stock × costo',
      colorHex: '#22c55e',
      colorRgb: [22, 163, 74],
    });
  }

  return metricas.slice(0, 4);
}
