/* ============================================================
   Golden Touch · Solicitudes de Pedido · Revisión de Almacén (29/10/2026)

   Antes de que una Solicitud de Pedido (SP) llegue a Compras, Almacén mira
   si ya tiene lo que piden. Por cada renglón dice cuánto TIENE; lo que falta
   es lo que sigue a Compras para cotizar.

   Aquí vive la parte sin pantalla ni base, para poder probarla:
   · la propuesta según las existencias del Inventario General,
   · los botones de lote (todo según existencias, todo disponible, todo a Compras)
     y el aviso que se muestra al pulsarlos (02/11/2026),
   · el resumen (lo que tiene / lo que va a Compras),
   · los dos mensajes de WhatsApp: el de la SP y el de la revisión.

   02/11/2026 · Solo cuenta LOS PINOS. El Depósito Mina ya no entra en la
   revisión (ni se lee su existencia ni se muestra). El desglose `por_almacen`
   {los_pinos, mina} se sigue guardando con mina = 0 para no tocar la RPC
   `almacen_revisar_solicitud`; una revisión vieja con mina > 0 se lee igual.

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

/**
 * De dónde sale lo que tiene Almacén. Desde el 02/11/2026 solo LOS PINOS; `mina` queda
 * en el desglose guardado (siempre 0) por compatibilidad con la base y con lo ya revisado.
 */
export type AlmacenRevision = 'los_pinos' | 'mina';
export const ALMACEN_LOS_PINOS = { key: 'los_pinos' as const, label: 'Los Pinos', icono: '📍' };
export type PorAlmacen = Record<AlmacenRevision, number>;

/** Lo que Almacén dice de un renglón: cuánto de lo pedido TIENE. `idx` = posición en `items`. */
export interface RevisionRenglon {
  idx: number;
  cantidad_disponible: number;
  /** Desglose guardado en la base (suma = cantidad_disponible). Sin él, todo es de Los Pinos. */
  por_almacen?: PorAlmacen;
}

/** Existencia actual por id de producto (Los Pinos, el inventario de siempre). */
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

/** Lo de cada almacén, acotado: cada parte ≥ 0 y la suma nunca pasa de lo solicitado. */
export function acotarPorAlmacen(pa: Partial<PorAlmacen>, solicitada: number): PorAlmacen {
  const los = acotarDisponible(pa.los_pinos ?? 0, solicitada);
  const mina = acotarDisponible(pa.mina ?? 0, Math.max(0, redondear(solicitada - los)));
  return { los_pinos: los, mina };
}

/** Desglose de un renglón revisado: sin `por_almacen`, todo lo disponible es de Los Pinos. */
export function porAlmacenDe(r: RevisionRenglon | undefined): PorAlmacen {
  if (!r) return { los_pinos: 0, mina: 0 };
  return r.por_almacen ?? { los_pinos: r.cantidad_disponible, mina: 0 };
}

/** Cuánto TIENE Almacén de un renglón revisado (Los Pinos; una revisión vieja con Mina también cuenta). */
export const tieneDe = (r: RevisionRenglon | undefined): number => {
  const pa = porAlmacenDe(r);
  return redondear(pa.los_pinos + pa.mina);
};

/** Un renglón revisado desde Los Pinos (la Mina siempre en 0 desde el 02/11/2026). */
export const renglonLosPinos = (idx: number, cantidad: number): RevisionRenglon =>
  ({ idx, cantidad_disponible: redondear(cantidad), por_almacen: { los_pinos: redondear(cantidad), mina: 0 } });

/** Producto del inventario que se parece a un renglón escrito a mano (sin `productoId`). */
export interface ParecidoInventario { nombre: string; stock: number; unidad: string }
export type BuscarParecido = (nombre: string) => ParecidoInventario | null;

const unidadDe = (u?: string | null) => ((u ?? '').trim() || 'und').toUpperCase();
const nombreDe = (it: RenglonSP) => (it.nombre ?? '').trim() || 'SIN NOMBRE';
const mismoNombre = (a?: string | null, b?: string | null) =>
  (a ?? '').trim().toUpperCase().replace(/\s+/g, ' ') === (b ?? '').trim().toUpperCase().replace(/\s+/g, ' ');

/**
 * De dónde sale la existencia de un renglón (02/11/2026):
 * · `vinculado`: tiene producto del inventario y apareció en Los Pinos;
 * · `no_esta`: tiene producto pero ya no está en el Inventario General;
 * · `parecido`: escrito a mano, se usa la existencia del producto parecido;
 * · `sin_vincular`: escrito a mano y sin parecido → nada que entregar.
 */
export type OrigenExistencia = 'vinculado' | 'no_esta' | 'parecido' | 'sin_vincular';
export interface ExistenciaRenglon { origen: OrigenExistencia; stock: number | null; unidad: string; parecido?: string }

export function existenciaRenglon(it: RenglonSP, stock: StockPorProducto, sugerido: BuscarParecido = () => null): ExistenciaRenglon {
  if (it.productoId) {
    const st = stockDe(it, stock);
    return st == null
      ? { origen: 'no_esta', stock: null, unidad: unidadDe(it.unidad) }
      : { origen: 'vinculado', stock: st, unidad: unidadDe(it.unidad) };
  }
  const sug = sugerido(it.nombre ?? '');
  if (!sug) return { origen: 'sin_vincular', stock: null, unidad: unidadDe(it.unidad) };
  return { origen: 'parecido', stock: Math.max(0, Number(sug.stock) || 0), unidad: unidadDe(sug.unidad), parecido: sug.nombre };
}

/**
 * Propuesta: de cada renglón, lo que alcance en Los Pinos. Con `sugerido`, un renglón sin
 * vincular toma la existencia del producto parecido (el almacenista lo corrige si no es).
 * Sin producto ni parecido: 0.
 */
export function propuestaDesdeExistencias(
  items: readonly RenglonSP[], stockPorProducto: StockPorProducto, sugerido?: BuscarParecido,
): RevisionRenglon[] {
  return items.map((it, idx) => renglonLosPinos(idx, acotarDisponible(existenciaRenglon(it, stockPorProducto, sugerido).stock ?? 0, cantidadDe(it))));
}

/** Botones de lote: aplican lo mismo a todos los renglones. */
export function aplicarLote(
  items: readonly RenglonSP[], modo: ModoLote, stockPorProducto: StockPorProducto = {}, sugerido?: BuscarParecido,
): RevisionRenglon[] {
  if (modo === 'todo_disponible_segun_stock') return propuestaDesdeExistencias(items, stockPorProducto, sugerido);
  return items.map((it, idx) => renglonLosPinos(idx, modo === 'todo_disponible' ? cantidadDe(it) : 0));
}

/** Lo que tiene Almacén y lo que va a Compras. Un renglón puede salir en las dos listas (parcial). */
export function resumenRevision(items: readonly RenglonSP[], revision: readonly RevisionRenglon[]): ResumenRevision {
  const porIdx = new Map(revision.map((r) => [r.idx, r]));
  const disponibles: LineaResumen[] = [];
  const aCompras: LineaResumen[] = [];
  items.forEach((it, idx) => {
    const sol = cantidadDe(it);
    const pa = acotarPorAlmacen(porAlmacenDe(porIdx.get(idx)), sol);
    const tiene = redondear(pa.los_pinos + pa.mina);
    const falta = faltante(sol, tiene);
    const base = { nombre: (it.nombre ?? '').trim() || 'SIN NOMBRE', unidad: (it.unidad ?? '').trim() || 'und' };
    if (tiene > 0) disponibles.push({ ...base, cantidad: tiene });
    if (falta > 0) aCompras.push({ ...base, cantidad: falta });
  });
  return { disponibles, aCompras };
}

/* ── Aviso al pulsar un botón de lote (02/11/2026) ──
   Antes «Todo a Compras» con Los Pinos ya en 0 «no hacía nada» y parecía fallar.
   Ahora cada botón responde con un toast; el texto se arma aquí para probarlo. */

export const TEXTO_SIN_EXISTENCIA = 'Según inventario Los Pinos no hay existencia de lo solicitado: todo va a Compras.';

/**
 * «Según inventario Los Pinos: ACEITE HIDRAULICO 68 · hay 40 LITROS (parecido) · sale 1 ·
 * TORNILLO · no está en inventario → Compras», un tramo por renglón con la existencia
 * del momento y cuánto sale. Si no hay existencia de nada: lo dice y todo va a Compras.
 */
export function textoLoteSegunExistencias(
  items: readonly RenglonSP[], stock: StockPorProducto, sugerido: BuscarParecido = () => null,
): string {
  let hayAlgo = false;
  const tramos = items.map((it) => {
    const n = nombreDe(it);
    const e = existenciaRenglon(it, stock, sugerido);
    if (e.origen === 'no_esta') return `${n} · no está en inventario → Compras`;
    if (e.origen === 'sin_vincular') return `${n} · sin vincular → Compras`;
    const st = e.stock ?? 0;
    const par = e.origen === 'parecido' ? (mismoNombre(e.parecido, n) ? ' (parecido)' : ` (parecido: ${e.parecido})`) : '';
    const sale = acotarDisponible(st, cantidadDe(it));
    if (sale > 0) hayAlgo = true;
    return sale > 0 ? `${n} · hay ${num(st)} ${e.unidad}${par} · sale ${num(sale)}` : `${n} · hay ${num(st)} ${e.unidad}${par} → Compras`;
  });
  if (!items.length || !hayAlgo) return TEXTO_SIN_EXISTENCIA;
  return `Según inventario Los Pinos: ${tramos.join(' · ')}`;
}

export const TEXTO_LOTE_TODO_DISPONIBLE = 'Todo marcado como disponible en Los Pinos.';
/** «Todo a Compras» además abre la confirmación de «Marcar como revisada» (02/11/2026). */
export const TEXTO_LOTE_TODO_A_COMPRAS = 'Todo va a Compras: Los Pinos no entrega nada. Confirma para enviarla.';

/** Qué se le dice a la usuaria al pulsar cada botón de lote (texto y color del toast). */
export function avisoLote(
  modo: ModoLote, items: readonly RenglonSP[], stock: StockPorProducto, sugerido?: BuscarParecido,
): { texto: string; tipo: 'info' | 'success' | 'warning' } {
  if (modo === 'todo_disponible') return { texto: TEXTO_LOTE_TODO_DISPONIBLE, tipo: 'success' };
  if (modo === 'todo_a_compras') return { texto: TEXTO_LOTE_TODO_A_COMPRAS, tipo: 'warning' };
  const texto = textoLoteSegunExistencias(items, stock, sugerido);
  return { texto, tipo: texto === TEXTO_SIN_EXISTENCIA ? 'warning' : 'info' };
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
    const r: RevisionRenglon = { idx, cantidad_disponible: Math.max(0, redondear(cant)) };
    const pa = o.por_almacen as Record<string, unknown> | null | undefined;
    if (pa && typeof pa === 'object') {
      r.por_almacen = { los_pinos: Math.max(0, redondear(Number(pa.los_pinos) || 0)), mina: Math.max(0, redondear(Number(pa.mina) || 0)) };
    }
    out.push(r);
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
    // 02/11/2026 · Solo Los Pinos entrega.
    lineas.push('✅ *TIENE:*', `${ALMACEN_LOS_PINOS.icono} _${ALMACEN_LOS_PINOS.label}:_`, ...resumen.disponibles.map(linea));
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
