/* ============================================================
   Golden Touch · Solicitudes de Pedido · Revisión de Almacén (29/10/2026)

   Antes de que una Solicitud de Pedido (SP) llegue a Compras, Almacén mira
   si ya tiene lo que piden. Por cada renglón dice cuánto TIENE; lo que falta
   es lo que sigue a Compras para cotizar.

   Aquí vive la parte sin pantalla ni base, para poder probarla:
   · la propuesta según las existencias del Inventario General,
   · los botones de lote (todo según existencias, todo disponible, todo a Compras),
   · el resumen (lo que tiene / lo que va a Compras),
   · los dos mensajes de WhatsApp: el de la SP y el de la revisión.

   El flujo se enciende con el interruptor `compras_revision_almacen`
   (tabla `sistema_interruptores`). Apagado, las SP van directo a Compras.
   ============================================================ */
import { num } from '@/shared/lib/format';
import { sinSelectorDeEmoji } from '@/shared/lib/whatsapp';

/** Un renglón de `ordenes.items` tal como lo guarda Pedidos. */
export interface RenglonSP {
  sku?: string | null;
  nombre: string;
  unidad?: string | null;
  cantidad: number;
  productoId?: string | null;
  comprar?: boolean | null;
  finalidad?: string | null;
}

/** Lo que hace falta de la SP para los mensajes. */
export interface OrdenSP {
  codigo: string;
  solicitante?: string | null;
  unidad_solicitante?: string | null;
  urgente?: boolean | null;
  motivo?: string | null;
  finalidad?: string | null;
  created_at?: string | null;
  estado?: string | null;
  items: RenglonSP[];
}

/** Lo que Almacén dice de un renglón: cuánto de lo pedido TIENE. `idx` = posición en `items`. */
export interface RevisionRenglon {
  idx: number;
  cantidad_disponible: number;
}

/** Existencia actual por id de producto (Inventario General). */
export type StockPorProducto = Record<string, number>;

export type ModoLote = 'todo_disponible_segun_stock' | 'todo_a_compras' | 'todo_disponible';

export interface LineaResumen {
  nombre: string;
  unidad: string;
  cantidad: number;
}

export interface ResumenRevision {
  disponibles: LineaResumen[];
  aCompras: LineaResumen[];
}

/** Las cantidades admiten decimales (2,5 KG): se redondea a 4 cifras para que 0,1 + 0,2 no deje basura. */
export const redondear = (n: number): number => Math.round((Number(n) || 0) * 1e4) / 1e4;

// Lo solicitado va tal cual (sin redondear): la base rechaza un «disponible» mayor que lo solicitado.
const cantidadDe = (it: RenglonSP): number => Math.max(0, Number(it.cantidad) || 0);

/** Lo que Almacén puede decir que tiene de un renglón: entre 0 y lo solicitado. */
export function acotarDisponible(valor: number | null | undefined, solicitada: number): number {
  const v = redondear(Number(valor) || 0);
  if (v <= 0) return 0;
  return Math.min(v, Math.max(0, Number(solicitada) || 0));
}

/** Cuánto sigue a Compras de un renglón. */
export const faltante = (solicitada: number, disponible: number): number =>
  Math.max(0, redondear(solicitada - acotarDisponible(disponible, solicitada)));

/** Existencia del producto del renglón; `null` si el renglón no tiene producto del inventario. */
export function stockDe(it: RenglonSP, stock: StockPorProducto): number | null {
  if (!it.productoId) return null;
  const s = stock[it.productoId];
  return s == null ? null : Math.max(0, Number(s) || 0);
}

export type EstadoExistencia = 'alcanza' | 'parcial' | 'sin_stock' | 'sin_vincular';

/** Para el color de la existencia: verde si alcanza, ámbar si es parcial, rojo si no hay o no está vinculado. */
export function estadoExistencia(solicitada: number, stock: number | null): EstadoExistencia {
  if (stock == null) return 'sin_vincular';
  if (stock <= 0) return 'sin_stock';
  return stock >= solicitada ? 'alcanza' : 'parcial';
}

/** Propuesta inicial: de cada renglón, lo que alcance la existencia (0 si no tiene producto vinculado). */
export function propuestaDesdeExistencias(items: readonly RenglonSP[], stockPorProducto: StockPorProducto): RevisionRenglon[] {
  return items.map((it, idx) => {
    const s = stockDe(it, stockPorProducto);
    return { idx, cantidad_disponible: s == null ? 0 : acotarDisponible(s, cantidadDe(it)) };
  });
}

/** Botones de lote: aplican lo mismo a todos los renglones. */
export function aplicarLote(
  items: readonly RenglonSP[], modo: ModoLote, stockPorProducto: StockPorProducto = {},
): RevisionRenglon[] {
  if (modo === 'todo_disponible_segun_stock') return propuestaDesdeExistencias(items, stockPorProducto);
  return items.map((it, idx) => ({ idx, cantidad_disponible: modo === 'todo_disponible' ? cantidadDe(it) : 0 }));
}

/** Lo que tiene Almacén y lo que va a Compras. Un renglón puede salir en las dos listas (parcial). */
export function resumenRevision(items: readonly RenglonSP[], revision: readonly RevisionRenglon[]): ResumenRevision {
  const porIdx = new Map(revision.map((r) => [r.idx, r.cantidad_disponible]));
  const disponibles: LineaResumen[] = [];
  const aCompras: LineaResumen[] = [];
  items.forEach((it, idx) => {
    const sol = cantidadDe(it);
    const tiene = acotarDisponible(porIdx.get(idx) ?? 0, sol);
    const falta = faltante(sol, tiene);
    const base = { nombre: (it.nombre ?? '').trim() || 'SIN NOMBRE', unidad: (it.unidad ?? '').trim() || 'und' };
    if (tiene > 0) disponibles.push({ ...base, cantidad: tiene });
    if (falta > 0) aCompras.push({ ...base, cantidad: falta });
  });
  return { disponibles, aCompras };
}

/**
 * Lo guardado en `solicitudes_revision_almacen.items_revision`, leído con cuidado:
 * solo lo que trae `idx` y una cantidad. Acepta `cantidad_disponible` o `disponible`.
 */
export function revisionGuardada(v: unknown): RevisionRenglon[] {
  if (!Array.isArray(v)) return [];
  const out: RevisionRenglon[] = [];
  for (const x of v) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const idx = Number(o.idx);
    const cant = Number(o.cantidad_disponible ?? o.disponible);
    if (!Number.isInteger(idx) || idx < 0 || !Number.isFinite(cant)) continue;
    out.push({ idx, cantidad_disponible: Math.max(0, redondear(cant)) });
  }
  return out;
}

/* ── Mensajes de WhatsApp ── */

const EMPRESA = 'GOLDEN TOUCH 1127 C.A.';

const linea = (l: LineaResumen) => `🔸 ${num(l.cantidad)} ${l.unidad.toUpperCase()} · ${l.nombre}`;

function lineaQuien(o: Pick<OrdenSP, 'solicitante' | 'unidad_solicitante'>): string {
  return [
    o.solicitante?.trim() ? `👤 Solicitante: ${o.solicitante.trim()}` : '',
    o.unidad_solicitante?.trim() ? `🏢 Unidad: ${o.unidad_solicitante.trim()}` : '',
  ].filter(Boolean).join(' · ');
}

/** «ALMACÉN HA REVISADO LA ORDEN…»: lo que tiene y lo que pide a Compras. */
export function textoWhatsappRevision(
  orden: Pick<OrdenSP, 'codigo' | 'solicitante' | 'unidad_solicitante'>,
  resumen: ResumenRevision,
  quien: string,
  nota?: string | null,
): string {
  const lineas: string[] = [`📦 *ALMACÉN HA REVISADO LA ORDEN ${orden.codigo}*`];
  const q = lineaQuien(orden);
  if (q) lineas.push(q);
  if (resumen.disponibles.length) {
    lineas.push('✅ *TIENE:*', ...resumen.disponibles.map(linea));
  } else {
    lineas.push('✅ *TIENE:* nada de lo solicitado');
  }
  if (resumen.aCompras.length) {
    lineas.push('🛒 *VA A SOLICITAR A COMPRAS:*', ...resumen.aCompras.map(linea));
  } else {
    lineas.push('🛒 *VA A SOLICITAR A COMPRAS:* nada, Almacén cubre todo');
  }
  if (nota?.trim()) lineas.push(`📝 Nota: ${nota.trim()}`);
  lineas.push(`🏢 ${EMPRESA}${quien.trim() ? ` · Revisado por ${quien.trim()}` : ''}`);
  return sinSelectorDeEmoji(lineas.join('\n'));
}

/** Nombre del estado de la SP en el mensaje. */
export function estadoSolicitudTexto(estado?: string | null): string {
  switch (estado) {
    case 'revision_almacen': return 'En revisión de Almacén';
    case 'pendiente': return 'En Compras, por aprobar';
    case 'aprobada': return 'Aprobada, en cotización';
    case 'finalizada': return 'Finalizada';
    case 'rechazada': return 'Rechazada';
    case 'cancelada': return 'Cancelada';
    case null: case undefined: case '': return 'En revisión de Almacén';
    default: return estado.replace(/_/g, ' ');
  }
}

function fechaHoraVE(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const f = new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(d);
  return f.replace(/,\s*/, ' · ');
}

/** La SP en sí, para pasarla al grupo apenas llega. */
export function textoWhatsappSolicitud(orden: OrdenSP): string {
  const lineas: string[] = [`📝 *SOLICITUD DE PEDIDO ${orden.codigo}*`];
  const fecha = fechaHoraVE(orden.created_at);
  if (fecha) lineas.push(`📅 Fecha: ${fecha}`);
  const q = lineaQuien(orden);
  if (q) lineas.push(q);
  if (orden.urgente) lineas.push('🚨 *URGENTE*');
  if (orden.motivo?.trim()) lineas.push(`🎯 Motivo: ${orden.motivo.trim()}`);
  if (orden.finalidad?.trim()) lineas.push(`📌 Finalidad: ${orden.finalidad.trim()}`);
  lineas.push('📦 Productos:');
  orden.items.forEach((it) => {
    const base = linea({ nombre: (it.nombre ?? '').trim() || 'SIN NOMBRE', unidad: (it.unidad ?? '').trim() || 'und', cantidad: cantidadDe(it) });
    lineas.push(it.finalidad?.trim() ? `${base} (para: ${it.finalidad.trim()})` : base);
  });
  lineas.push(`📍 Estado: ${estadoSolicitudTexto(orden.estado)}`);
  lineas.push(`🏢 ${EMPRESA}`);
  return sinSelectorDeEmoji(lineas.join('\n'));
}
