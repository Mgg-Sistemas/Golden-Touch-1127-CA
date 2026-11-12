/* ============================================================
   Entregas del almacén para mantenimiento + bitácora por segmentos
   (12/11/2026) · lógica pura, sin Supabase.

   FLUJO: el almacenista saca material (teléfono o PC) y marca la máquina →
   se crea una ENTREGA «pendiente» que ven todos los de Maquinaria → la
   registran (queda en la bitácora con horómetro y fotos) o la rechazan
   (vuelve al almacenista como devolución, que le da entrada).

   BITÁCORA POR SEGMENTOS: cada «switch» (Filtros, Aceite, Combustible,
   Mangueras, Cauchos…) es una bitácora propia filtrable por fechas y con
   buscador. Un registro cae en un segmento por su tipo (o tipos) o, para los
   registros viejos sin tipo preciso, por las palabras de su trabajo, pieza
   o consumibles («FILTRO DE AIRE» → Filtros). Combustible no sale de la
   bitácora: son los surtidos de Combustible de esa máquina.
   ============================================================ */

export interface ItemEntrega {
  producto_id: string;
  producto_nombre: string;
  unidad: string | null;
  cantidad: number;
  almacen: string | null;
  salida_id?: string | null;
}

export interface FotoArchivo { path: string; filename: string }

export type EstadoEntrega = 'pendiente' | 'registrada' | 'rechazada';

export interface EntregaAlmacen {
  id: string;
  codigo: string;
  equipo_id: string;
  equipo_nombre: string;
  origen: 'telefono' | 'pc';
  almacen: string | null;
  salida_ids: string[];
  solicitud_salida_id: string | null;
  ref_codigo: string | null;
  items: ItemEntrega[];
  tipo_sugerido: string | null;
  nota: string | null;
  fotos: FotoArchivo[];
  estado: EstadoEntrega;
  entregado_por: string | null;
  entregado_por_nombre: string | null;
  created_at: string;
  atendida_por: string | null;
  atendida_por_nombre: string | null;
  atendida_en: string | null;
  mantenimiento_id: string | null;
  rechazo_motivo: string | null;
  devolucion_estado: 'pendiente' | 'recibida' | null;
  devolucion_por_nombre: string | null;
  devolucion_en: string | null;
}

const fmtCant = (n: number) => Number(n).toLocaleString('es-VE', { maximumFractionDigits: 4 });

/** «Almacenista entrega 4 ítems para la máquina X». */
export function resumenEntrega(e: Pick<EntregaAlmacen, 'items' | 'equipo_nombre' | 'entregado_por_nombre' | 'entregado_por'>): string {
  const n = e.items.length;
  const quien = e.entregado_por_nombre || e.entregado_por || 'El almacén';
  return `${quien} entrega ${n} ${n === 1 ? 'ítem' : 'ítems'} para la máquina ${e.equipo_nombre}`;
}

export function lineaItem(i: ItemEntrega): string {
  return `${i.producto_nombre} ×${fmtCant(i.cantidad)}${i.unidad ? ` ${i.unidad}` : ''}`;
}

/** Error de la casilla «para mantenimiento» del almacenista, o null si está bien. */
export function errorEntregaMantenimiento(paraMantenimiento: boolean, equipoId: string): string | null {
  if (!paraMantenimiento) return null;
  return equipoId ? null : 'Elige la máquina a la que va el material.';
}

/** Error del registro de Maquinaria, o null si está bien. */
export function errorRegistroEntrega(d: { tipos: string[]; fecha: string; horometro: string; kilometraje: string }): string | null {
  if (!d.tipos.length) return 'Indica qué se hizo (al menos un tipo de mantenimiento).';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) return 'Indica la fecha en que se hizo el mantenimiento.';
  const hoy = new Date().toISOString().slice(0, 10);
  if (d.fecha > hoy) return 'La fecha del mantenimiento no puede ser futura.';
  for (const [v, nombre] of [[d.horometro, 'horómetro'], [d.kilometraje, 'kilometraje']] as const) {
    if (v.trim() && !(Number(v) >= 0)) return `El ${nombre} tiene que ser un número.`;
  }
  return null;
}

/* ─────────────── Segmentos de la bitácora ─────────────── */

export type SegmentoBitacora =
  | 'todos' | 'filtros' | 'aceite' | 'combustible' | 'mangueras' | 'cauchos' | 'frenos'
  | 'electrico' | 'hidraulico' | 'refrigerante' | 'piezas' | 'servicio' | 'otros';

interface DefSegmento {
  valor: SegmentoBitacora;
  etiqueta: string;
  icono: string;
  tipos: string[];
  palabras: RegExp | null;
}

export const SEGMENTOS_BITACORA: DefSegmento[] = [
  { valor: 'todos', etiqueta: 'Todo', icono: '📒', tipos: [], palabras: null },
  { valor: 'filtros', etiqueta: 'Filtros', icono: '🧯', tipos: ['cambio_filtro'], palabras: /\bfiltros?\b/ },
  { valor: 'aceite', etiqueta: 'Aceite y lubricación', icono: '🛢', tipos: ['cambio_aceite', 'engrase'], palabras: /\b(aceite|lubric|grasa|engrase)/ },
  { valor: 'combustible', etiqueta: 'Combustible', icono: '⛽', tipos: [], palabras: null },
  { valor: 'mangueras', etiqueta: 'Mangueras', icono: '🪢', tipos: ['cambio_manguera'], palabras: /\bmangueras?\b/ },
  { valor: 'cauchos', etiqueta: 'Cauchos', icono: '🛞', tipos: ['cambio_caucho'], palabras: /\b(cauchos?|neumaticos?|llantas?|cauchera)\b/ },
  { valor: 'frenos', etiqueta: 'Frenos', icono: '🛑', tipos: ['frenos'], palabras: /\b(frenos?|pastillas?|bandas?)\b/ },
  { valor: 'electrico', etiqueta: 'Eléctrico y batería', icono: '🔋', tipos: ['bateria', 'sistema_electrico'], palabras: /\b(bateria|alternador|arranque|electric)/ },
  { valor: 'hidraulico', etiqueta: 'Hidráulico', icono: '💧', tipos: ['sistema_hidraulico'], palabras: /\bhidraulic/ },
  { valor: 'refrigerante', etiqueta: 'Refrigerante', icono: '❄', tipos: ['refrigerante'], palabras: /\b(refrigerante|radiador|anticongelante)/ },
  { valor: 'piezas', etiqueta: 'Repuestos y piezas', icono: '⚙', tipos: ['repuestos', 'cambio_pieza', 'soldadura', 'pintura'], palabras: null },
  { valor: 'servicio', etiqueta: 'Servicio y reparación', icono: '🔧', tipos: ['servicio', 'reparacion', 'inspeccion'], palabras: null },
  { valor: 'otros', etiqueta: 'Otros', icono: '•', tipos: ['otro', 'lectura'], palabras: null },
];

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Lo que hace falta de un registro de la bitácora para clasificarlo y buscarlo. */
export interface RegistroBitacora {
  id: string;
  fecha: string;
  tipo: string | null;
  tipos?: string[] | null;
  pieza?: string | null;
  trabajo?: string | null;
  consumibles?: string | null;
  mecanico?: string | null;
  ubicacion?: string | null;
  observacion?: string | null;
  actor_name?: string | null;
  horometro?: number | null;
  kilometraje?: number | null;
}

export function tiposDe(r: Pick<RegistroBitacora, 'tipo' | 'tipos'>): string[] {
  const xs = [...(r.tipos ?? []), ...(r.tipo ? [r.tipo] : [])];
  return [...new Set(xs.filter(Boolean))];
}

/** Segmentos en los que cae un registro (sin «todos» ni «combustible»). */
export function segmentosDe(r: RegistroBitacora): SegmentoBitacora[] {
  const tipos = tiposDe(r);
  const texto = sinTildes([r.pieza, r.trabajo, r.consumibles].filter(Boolean).join(' '));
  const out = SEGMENTOS_BITACORA
    .filter((s) => s.valor !== 'todos' && s.valor !== 'combustible')
    .filter((s) => s.tipos.some((t) => tipos.includes(t)) || (!!s.palabras && s.palabras.test(texto)))
    .map((s) => s.valor);
  return out.length ? out : ['otros'];
}

export interface FiltroBitacora {
  segmento: SegmentoBitacora;
  desde: string;
  hasta: string;
  texto: string;
}

export const FILTRO_BITACORA_VACIO: FiltroBitacora = { segmento: 'todos', desde: '', hasta: '', texto: '' };

/** Texto en el que busca el buscador: todas las características del registro. */
export function textoBuscable(r: RegistroBitacora, etiquetaTipo: (t: string) => string): string {
  return sinTildes([
    r.fecha, ...tiposDe(r).map(etiquetaTipo), r.pieza, r.trabajo, r.consumibles, r.mecanico, r.ubicacion,
    r.observacion, r.actor_name, r.horometro != null ? String(r.horometro) : '', r.kilometraje != null ? String(r.kilometraje) : '',
  ].filter(Boolean).join(' '));
}

export function enRango(fecha: string, desde: string, hasta: string): boolean {
  const d = String(fecha).slice(0, 10);
  if (desde && d < desde) return false;
  if (hasta && d > hasta) return false;
  return true;
}

export function filtrarBitacora<T extends RegistroBitacora>(rows: T[], f: FiltroBitacora, etiquetaTipo: (t: string) => string): T[] {
  const q = sinTildes(f.texto.trim());
  return rows.filter((r) => {
    if (f.segmento !== 'todos' && !segmentosDe(r).includes(f.segmento)) return false;
    if (!enRango(r.fecha, f.desde, f.hasta)) return false;
    if (q && !q.split(/\s+/).every((p) => textoBuscable(r, etiquetaTipo).includes(p))) return false;
    return true;
  });
}

/** Cuántos registros tiene cada segmento (para el número del switch). */
export function conteoPorSegmento(rows: RegistroBitacora[]): Record<SegmentoBitacora, number> {
  const out = Object.fromEntries(SEGMENTOS_BITACORA.map((s) => [s.valor, 0])) as Record<SegmentoBitacora, number>;
  out.todos = rows.length;
  for (const r of rows) for (const s of segmentosDe(r)) out[s] += 1;
  return out;
}

/** Surtido de combustible (para el segmento Combustible). */
export interface SurtidoBuscable {
  fecha: string;
  litros: number;
  horometro_fin: number | null;
  kilometraje: number | null;
  ubicacion: string | null;
  autorizado_por: string | null;
}

export function filtrarSurtidos<T extends SurtidoBuscable>(rows: T[], f: FiltroBitacora): T[] {
  const q = sinTildes(f.texto.trim());
  return rows.filter((r) => {
    if (!enRango(r.fecha, f.desde, f.hasta)) return false;
    if (!q) return true;
    const heno = sinTildes([r.fecha, String(r.litros), r.horometro_fin ?? '', r.kilometraje ?? '', r.ubicacion, r.autorizado_por].join(' '));
    return q.split(/\s+/).every((p) => heno.includes(p));
  });
}
