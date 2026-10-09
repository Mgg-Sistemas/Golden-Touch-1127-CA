/* ============================================================
   Golden Touch · Cocina · Los movimientos de inventario del ciclo

   Pedido del usuario (28/09/2026): «que los movimientos de consumo y las
   salidas desde inventario, los ajustes manuales, coincidan con el módulo de
   alimentación».

   Las cuentas ya coincidían —«+ Entradas» y «− Mermas / salidas» del panel
   salen del mismo kardex que Inventario—, pero la lista de Movimientos solo
   mostraba las COMIDAS. Quien miraba la pantalla veía un total de entradas y
   otro de mermas sin una sola fila detrás: para cotejar había que irse a
   Inventario y sumar a mano.

   Aquí viven las reglas para armar esa lista, sin base ni React.
   ============================================================ */

import { esDeCocina } from './claseMovimiento';

const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

/** Una fila del kardex de víveres que no es una comida. */
export interface MovInventario {
  id: string;
  producto_id: string;
  nombre: string;
  unidad: string | null;
  /** Categoría del víver en el inventario, para la búsqueda. */
  categoria?: string | null;
  fecha: string;
  /** Positivo entró, negativo salió. */
  delta: number;
  /** El tipo del kardex: entrada, salida, ajuste, traslado… */
  tipo: string;
  /** De dónde viene: orden, compra_directa, manual, salida_modulo… `null` = suelto. */
  origen: string | null;
  /** Código del comprobante (la OC, la salida, la compra). */
  comprobante: string | null;
  detalle: string | null;
  responsable: string | null;
}

/** La fila cruda del kardex, tal como sale de `movimientos`. */
export interface FilaKardex {
  id?: string | null;
  producto_id: string;
  delta: number;
  at: string;
  tipo: string;
  ref_tipo?: string | null;
  ref_codigo?: string | null;
  detalle?: string | null;
  actor_name?: string | null;
  actor?: string | null;
}

/** Cómo se dice cada origen en la pantalla. Lo que no esté aquí sale tal cual. */
export const ROTULO_ORIGEN: Record<string, string> = {
  orden: 'Orden de compra',
  compra_directa: 'Compra directa',
  manual: 'Carga manual',
  salida_modulo: 'Salida de material',
  ajuste: 'Ajuste de inventario',
  traslado: 'Traslado',
  recepcion: 'Recepción',
  devolucion: 'Devolución',
  cocina: 'Comida',
};

export function rotuloOrigen(origen: string | null | undefined, tipo: string): string {
  const o = (origen ?? '').trim();
  if (o && ROTULO_ORIGEN[o]) return ROTULO_ORIGEN[o];
  if (o) return o.replace(/_/g, ' ');
  // Sin origen, el tipo del kardex es lo único que hay: «salida» suelta = ajuste a mano.
  return tipo === 'entrada' ? 'Entrada suelta' : 'Ajuste manual';
}

/**
 * Las filas del kardex que le tocan al ciclo: solo víveres, sin las comidas (esas
 * tienen su propia tabla) y sin los movimientos en cero. Sale de lo más nuevo a lo
 * más viejo, que es como se revisa.
 */
export function filasInventario(
  filas: FilaKardex[],
  viveres: { id: string; nombre: string; unidad: string | null; categoria?: string | null }[],
): MovInventario[] {
  const porId = new Map(viveres.map((p) => [p.id, p]));
  return filas
    .filter((r) => porId.has(r.producto_id) && !esDeCocina(r.ref_tipo) && (Number(r.delta) || 0) !== 0)
    .map((r, i) => {
      const p = porId.get(r.producto_id)!;
      return {
        id: String(r.id ?? `${r.producto_id}-${r.at}-${i}`),
        producto_id: r.producto_id,
        nombre: p.nombre,
        unidad: p.unidad ?? null,
        categoria: p.categoria ?? null,
        fecha: r.at,
        delta: round2(Number(r.delta) || 0),
        tipo: r.tipo,
        origen: r.ref_tipo ?? null,
        comprobante: r.ref_codigo?.trim() || null,
        detalle: r.detalle?.trim() || null,
        responsable: r.actor_name?.trim() || r.actor?.trim() || null,
      };
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.nombre.localeCompare(b.nombre));
}

export interface TotalesInventario {
  /** Lo que entró, en unidades. Es el «+ Entradas» del panel. */
  entradas: number;
  /** Lo que salió sin ser comida. Es el «− Mermas / salidas» del panel. */
  salidas: number;
  filas: number;
}

/** Los dos totales que tienen que dar lo mismo que las tarjetas del panel. */
export function totalesInventario(filas: MovInventario[]): TotalesInventario {
  let entradas = 0, salidas = 0;
  for (const f of filas) {
    if (f.delta > 0) entradas = round2(entradas + f.delta);
    else salidas = round2(salidas + Math.abs(f.delta));
  }
  return { entradas, salidas, filas: filas.length };
}

/**
 * Busca por víver, categoría, comprobante, motivo, responsable, tipo de movimiento,
 * fecha o cantidad, sin acentos. Con varias palabras, tienen que estar todas
 * (09/10/2026).
 */
export function buscarInventario(filas: MovInventario[], texto: string): MovInventario[] {
  // Se recorta: un espacio suelto en el buscador vaciaba la tabla entera.
  const palabras = norm(texto).split(/\s+/).filter(Boolean);
  if (!palabras.length) return filas;
  return filas.filter((f) => {
    const cant = String(Math.abs(f.delta));
    const t = norm([
      f.nombre, f.categoria, f.unidad, f.comprobante, f.detalle, f.responsable, rotuloOrigen(f.origen, f.tipo),
      f.tipo, f.delta > 0 ? 'entrada entro' : 'salida salio', f.fecha, cant, cant.replace('.', ','),
    ].filter(Boolean).join(' '));
    return palabras.every((p) => t.includes(p));
  });
}

/** Los tipos de movimiento que hay en la tabla, para el selector (sin repetir, en orden). */
export function tiposInventario(filas: MovInventario[]): string[] {
  return [...new Set(filas.map((f) => rotuloOrigen(f.origen, f.tipo)))].sort((a, b) => a.localeCompare(b, 'es'));
}

/** Deja solo el tipo de movimiento elegido (vacío = todos). */
export function filtrarTipoInventario(filas: MovInventario[], tipo: string): MovInventario[] {
  return tipo ? filas.filter((f) => rotuloOrigen(f.origen, f.tipo) === tipo) : filas;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
