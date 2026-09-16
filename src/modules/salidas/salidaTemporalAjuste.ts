/* ============================================================
   Golden Touch · Salidas Temporales · Ajuste de inventario al editar
   Una salida temporal se puede editar en cualquier estado. Si ya movió
   inventario, cambiar materiales o cantidades mueve solo la DIFERENCIA:

     pendiente   → no movió nada.
     en_transito → salió cada material del inventario (los nuevos no).
     finalizada  → salió y además retornó (los nuevos solo retornaron).

   Se compara lo que la salida movió con lo que movería con los datos nuevos
   y se devuelven los movimientos de ajuste por producto + almacén.
   ============================================================ */
import type { EstadoSalidaTemporal, ItemSalidaTemporal } from '@/shared/lib/types';

const r4 = (n: number) => Math.round(n * 10000) / 10000;

export interface EfectoItem {
  producto_id: string;
  almacen: string;
  nombre: string;
  /** Cantidad que salió del inventario (tramo de salida). */
  salida: number;
  /** Cantidad que retornó al inventario (tramo de retorno). */
  retorno: number;
}

export interface AjusteMovimiento {
  producto_id: string;
  almacen: string;
  nombre: string;
  /** Tramo del kardex al que corrige: la salida o el retorno. */
  tramo: 'salida' | 'retorno';
  /** Cambio en el stock: positivo entra, negativo sale. */
  delta: number;
}

/** Lo que una salida temporal movió en el inventario, por producto + almacén. */
export function efectosInventario(items: ItemSalidaTemporal[], estado: EstadoSalidaTemporal): Map<string, EfectoItem> {
  const out = new Map<string, EfectoItem>();
  if (estado === 'pendiente') return out;
  const sumar = (it: ItemSalidaTemporal, almacen: string, campo: 'salida' | 'retorno') => {
    const key = `${it.producto_id}|${almacen}`;
    const e = out.get(key) ?? { producto_id: it.producto_id!, almacen, nombre: it.producto_nombre ?? '', salida: 0, retorno: 0 };
    e[campo] = r4(e[campo] + (Number(it.cantidad) || 0));
    out.set(key, e);
  };
  for (const it of items ?? []) {
    if (!it.producto_id) continue;
    // Mismas reglas que aprobar y finalizar: sale solo lo existente con almacén;
    // retorna todo, al almacén del renglón o al General.
    if (!it.es_nuevo && it.almacen) sumar(it, it.almacen, 'salida');
    if (estado === 'finalizada') sumar(it, it.almacen || 'General', 'retorno');
  }
  return out;
}

/**
 * Movimientos para pasar del efecto de `antes` al de `despues`. Primero van los
 * que suman stock, para que un cambio de material no deje el stock en negativo
 * a mitad de camino.
 */
export function ajustesPorEdicion(antes: Map<string, EfectoItem>, despues: Map<string, EfectoItem>): AjusteMovimiento[] {
  const out: AjusteMovimiento[] = [];
  for (const key of new Set([...antes.keys(), ...despues.keys()])) {
    const a = antes.get(key);
    const d = despues.get(key);
    const base = (d ?? a)!;
    const dSalida = r4((d?.salida ?? 0) - (a?.salida ?? 0));
    const dRetorno = r4((d?.retorno ?? 0) - (a?.retorno ?? 0));
    if (dSalida) out.push({ producto_id: base.producto_id, almacen: base.almacen, nombre: base.nombre, tramo: 'salida', delta: -dSalida });
    if (dRetorno) out.push({ producto_id: base.producto_id, almacen: base.almacen, nombre: base.nombre, tramo: 'retorno', delta: dRetorno });
  }
  return out.sort((x, y) => y.delta - x.delta);
}

/** Lo que el ajuste necesita sacar del stock, neto por producto + almacén (solo los que bajan). */
export function faltantesDeStock(ajustes: AjusteMovimiento[]): EfectoItem[] {
  const neto = new Map<string, EfectoItem>();
  for (const aj of ajustes) {
    const key = `${aj.producto_id}|${aj.almacen}`;
    const e = neto.get(key) ?? { producto_id: aj.producto_id, almacen: aj.almacen, nombre: aj.nombre, salida: 0, retorno: 0 };
    e.salida = r4(e.salida - aj.delta);
    neto.set(key, e);
  }
  return [...neto.values()].filter((e) => e.salida > 0);
}

/** Minutos entre la salida y el retorno (0 si faltan fechas o están al revés). */
export function duracionEntre(desde?: string | null, hasta?: string | null): number {
  if (!desde || !hasta) return 0;
  const ms = new Date(hasta).getTime() - new Date(desde).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 60000)) : 0;
}
