/* ============================================================
   Golden Touch · Control de Alimentación (Cocina)
   Cada movimiento es un consumo de VÍVERES por tipo de comida
   (desayuno/almuerzo/cena), con correlativo, fecha/hora, nº de
   platos y valor (precios tomados del inventario). Los víveres se
   descuentan del inventario (movimiento de consumo).
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { Producto } from '@/shared/lib/types';
import { listProductos } from '@/modules/inventario/inventario.repository';
import { registrarMovimiento } from '@/modules/inventario/movimientos.repository';
import { push } from '@/modules/notificaciones/notif.repository';

const TABLE = 'cocina_movimientos';
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export type TipoComida = 'desayuno' | 'almuerzo' | 'cena';
export const TIPOS_COMIDA: { value: TipoComida; label: string; icono: string }[] = [
  { value: 'desayuno', label: 'Desayuno', icono: '🍳' },
  { value: 'almuerzo', label: 'Almuerzo', icono: '🍽' },
  { value: 'cena', label: 'Cena', icono: '🌙' },
];
export function labelTipoComida(v?: string | null): string {
  return TIPOS_COMIDA.find((t) => t.value === v)?.label ?? (v ?? '—');
}

export interface CocinaItem {
  producto_id: string;
  sku: string;
  nombre: string;
  cantidad: number;
  precio: number;          // precio unitario tomado del inventario (PMP)
  almacen?: string | null;
}

export interface CocinaMovimiento {
  id: string;
  codigo: string | null;
  tipo_comida: TipoComida;
  platos: number;
  items: CocinaItem[];
  valor_total: number;
  nota?: string | null;
  actor?: string | null;
  actor_name?: string | null;
  at: string;
  created_at: string;
}

const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** ¿La categoría del producto entra en Distribución de comidas? Abarca las familias de
 *  cocina: ALIMENTOS, VÍVERES, CARNES, PROTEÍNAS, LIMPIEZA (el stem "limpi" cubre también
 *  la variante mal escrita "LIMPIENZA") y HORTALIZAS Y LEGUMBRES. Se compara sin acentos
 *  ni mayúsculas. */
export const esCategoriaViveres = (categoria: string | null | undefined): boolean => {
  const c = norm(categoria ?? '');
  return ['aliment', 'viver', 'carne', 'proteina', 'limpi', 'hortaliza', 'legumbre', 'verdura'].some((k) => c.includes(k));
};

/** TODOS los víveres del inventario GENERAL (activos), sin importar el almacén donde
 *  estén ubicados. El stock y el precio (PMP) salen del inventario. */
export async function listViveres(): Promise<Producto[]> {
  const prods = await listProductos();
  return prods
    .filter((p) => p.estado === 'activo' && esCategoriaViveres(p.categoria))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/* ───────────── Alerta de víveres bajos → Analistas de Compras ───────────── */

const DEDUP_VIVERES_BAJOS = 'viveres-stock-bajo';

/**
 * Víveres cuyo stock cayó al 20% (o menos) de su stock mínimo. Requiere que el víver
 * tenga `stock_min > 0` configurado (si es 0, no hay nivel de referencia y no alerta).
 */
export function viveresBajos(viveres: Producto[]): Producto[] {
  return viveres.filter((p) =>
    p.estado === 'activo' &&
    Number(p.stock_min) > 0 &&
    Number(p.stock) <= Number(p.stock_min) * 0.2,
  );
}

/**
 * Avisa a los Analistas de Compras cuando hay víveres al 20% o menos de su mínimo.
 * La notificación va DIRIGIDA al rol `analista_de_compras` (la RLS de notificaciones
 * filtra por destino = rol, así que solo ellos la ven en la campana). Con `dedup_key`
 * para no repetir el aviso mientras siga sin leerse. Best-effort: nunca rompe el flujo.
 */
export async function alertarViveresBajosACompras(viveres: Producto[]): Promise<void> {
  const bajos = viveresBajos(viveres);
  if (!bajos.length) return;
  const nombres = bajos.slice(0, 4).map((p) => p.nombre).join(', ');
  const extra = bajos.length > 4 ? ` y ${bajos.length - 4} más` : '';
  try {
    await push({
      destino: 'analista_de_compras',
      kind: 'warning',
      title: '🥫 Víveres para reponer (20% del mínimo)',
      message: `${bajos.length} víver(es) al 20% o menos de su mínimo: ${nombres}${extra}.`,
      link: '#/app/pedidos',
      dedup_key: DEDUP_VIVERES_BAJOS,
    });
  } catch { /* la notificación no debe romper el flujo de cocina */ }
}

export interface CocinaFiltros {
  desde?: string;       // YYYY-MM-DD
  hasta?: string;       // YYYY-MM-DD
  tipo?: TipoComida | '';
}

/** Orden en que se sirven las comidas del día, para desempatar dentro de una fecha. */
const ORDEN_COMIDA: Record<string, number> = { desayuno: 0, almuerzo: 1, cena: 2 };

/**
 * Día del servicio leído en la hora de CARACAS (−04:00). `at` es timestamptz en
 * UTC: recortar la ISO a secas mandaría al día siguiente todo lo cargado después
 * de las 8 PM. Es el mismo cuidado que ya llevan los filtros (GT-INT-07).
 */
function diaServicio(at: string | null | undefined): string {
  const d = new Date(at ?? '');
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Ordena los movimientos como se lee un calendario: por DÍA DEL SERVICIO y, dentro
 * del día, por comida (desayuno → almuerzo → cena).
 *
 * Hace falta porque `at` guarda la fecha del servicio junto con la HORA EN QUE SE
 * TECLEÓ. Ordenar por `at` a secas mezcla el calendario con el orden de carga: si se
 * cargan el 29, después el 1 y después el 30, la lista salía en ese mismo desorden, y
 * dentro de un día la cena podía quedar encima del desayuno según cuál se tecleó
 * primero. Comparando primero el día y después la comida, el orden es siempre el real
 * del servicio, sin importar cuándo se cargó.
 */
export function ordenarPorServicio(movs: CocinaMovimiento[]): CocinaMovimiento[] {
  return [...movs].sort((a, b) => {
    const da = diaServicio(a.at), db = diaServicio(b.at);
    if (da !== db) return da < db ? -1 : 1;
    const ca = ORDEN_COMIDA[a.tipo_comida] ?? 9;
    const cb = ORDEN_COMIDA[b.tipo_comida] ?? 9;
    if (ca !== cb) return ca - cb;
    return String(a.at ?? '').localeCompare(String(b.at ?? ''));
  });
}

export async function listMovimientosCocina(filtros: CocinaFiltros = {}): Promise<CocinaMovimiento[]> {
  let q = supabase.from(TABLE).select('*').order('at', { ascending: true });
  if (filtros.tipo) q = q.eq('tipo_comida', filtros.tipo);
  // GT-INT-07 · Los límites llevan el offset de Caracas (−04:00) explícito. Sin
  // él, `at` es timestamptz y Postgres interpretaba los literales como UTC: los
  // cortes caían a medianoche UTC (8 PM de Caracas) y la cena de la noche se
  // contaba en el día siguiente.
  if (filtros.desde) q = q.gte('at', `${filtros.desde}T00:00:00-04:00`);
  if (filtros.hasta) q = q.lte('at', `${filtros.hasta}T23:59:59.999-04:00`);
  const { data, error } = await q;
  if (error) throw error;
  // El orden final lo pone el DÍA DEL SERVICIO, no el momento de la carga.
  return ordenarPorServicio((data ?? []) as CocinaMovimiento[]);
}

/** Correlativo atómico CK-AAAA-#### (reusa next_correlativo). */
async function nextCodigoCocina(): Promise<string> {
  const year = new Date().getFullYear();
  const { data, error } = await supabase.rpc('next_correlativo', { p_clave: `cocina-${year}` });
  if (error) throw error;
  const n = Number(data) || 1;
  return `CK-${year}-${String(n).padStart(4, '0')}`;
}

export interface CrearMovimientoCocinaInput {
  tipoComida: TipoComida;
  platos: number;
  items: CocinaItem[];
  nota?: string | null;
  /** Fecha/hora del servicio (ISO). Permite cargar comidas de un día desfasado. Por defecto, ahora. */
  at?: string | null;
  actor: string;
  actorName?: string | null;
}

/**
 * Almacenes donde el producto TIENE stock (> 0), con el mayor stock primero. Si se
 * indica un almacén preferido y tiene stock, va de primero. Es la base para descontar
 * el consumo de cocina de donde REALMENTE hay existencias (no del «almacén por defecto»
 * del producto, que puede estar vacío).
 */
async function almacenesConStock(productoId: string, preferido?: string | null): Promise<{ almacen: string; stock: number }[]> {
  const { data, error } = await supabase
    .from('existencias')
    .select('almacen, stock')
    .eq('producto_id', productoId)
    .gt('stock', 0)
    .order('stock', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []).map((r) => ({ almacen: String(r.almacen), stock: Number(r.stock) || 0 }));
  if (preferido) {
    const i = rows.findIndex((r) => r.almacen === preferido);
    if (i > 0) { const [p] = rows.splice(i, 1); rows.unshift(p); }
  }
  return rows;
}

/**
 * Descuenta `cantidad` de un víver tomándola del/los almacén(es) con stock (mayor
 * stock primero, o el preferido si lo tiene). Reparte el consumo entre varios almacenes
 * si hace falta (derrame). Si el stock total no alcanza, el resto se descuenta igual del
 * almacén preferido (o el primero con stock) para dejar la traza. Devuelve lo consumido.
 */
async function consumirDeInventario(o: {
  productoId: string; cantidad: number; almacenPreferido?: string | null;
  actor: string; actorName?: string | null; detalle: string;
  refId?: string | null; refCodigo?: string | null;
}): Promise<void> {
  let restante = round2(Math.abs(o.cantidad));
  if (restante <= 0) return;
  const fuentes = await almacenesConStock(o.productoId, o.almacenPreferido);
  for (const f of fuentes) {
    if (restante <= 1e-9) break;
    const toma = Math.min(restante, f.stock);
    if (toma <= 0) continue;
    await registrarMovimiento({
      producto_id: o.productoId, tipo: 'consumo', delta: -toma, almacen: f.almacen,
      actor: o.actor, actor_name: o.actorName ?? null, ref_tipo: 'cocina',
      ref_id: o.refId ?? null, ref_codigo: o.refCodigo ?? null, detalle: o.detalle,
    });
    restante = round2(restante - toma);
  }
  if (restante > 1e-9) {
    // No había stock suficiente en ningún almacén: se descuenta el resto del almacén
    // preferido (o el primero con stock) para dejar el registro (la RPC no baja de 0).
    const alm = o.almacenPreferido || fuentes[0]?.almacen || null;
    await registrarMovimiento({
      producto_id: o.productoId, tipo: 'consumo', delta: -restante, almacen: alm,
      actor: o.actor, actor_name: o.actorName ?? null, ref_tipo: 'cocina',
      ref_id: o.refId ?? null, ref_codigo: o.refCodigo ?? null, detalle: o.detalle,
    });
  }
}

/**
 * Registra un movimiento de cocina: descuenta cada víver del inventario (consumo)
 * y guarda el registro con su correlativo, valor (Σ cantidad×precio) y nº de platos.
 */
export async function crearMovimientoCocina(input: CrearMovimientoCocinaInput): Promise<CocinaMovimiento> {
  const items = (input.items ?? []).filter((i) => i.producto_id && Number(i.cantidad) > 0);
  if (!items.length) throw new Error('Agregá al menos un víver con cantidad.');
  if (!Number.isFinite(input.platos) || input.platos <= 0) throw new Error('Indicá cuántos platos se realizaron (mayor que 0).');

  // ── GT-SIN-13 · El REGISTRO va primero, el descuento después ────────────────
  // Antes se descontaban los N víveres y recién al final se insertaba el
  // registro. Si se cortaba la conexión a mitad (o fallaba el insert), quedaban
  // víveres consumidos y NINGÚN movimiento de cocina que lo explicara —y encima
  // los descuentos salían sin referencia, así que no había forma de revertirlos.
  // Ahora el registro existe antes de tocar el inventario y cada descuento lleva
  // su `refId`/`refCodigo`, igual que ya hacía la edición.
  const valorTotal = round2(items.reduce((a, i) => a + Number(i.cantidad) * Number(i.precio), 0));
  const codigo = await nextCodigoCocina();
  const { data, error } = await supabase.from(TABLE).insert({
    codigo,
    tipo_comida: input.tipoComida,
    platos: Math.trunc(input.platos),
    items,
    valor_total: valorTotal,
    nota: input.nota?.trim() || null,
    // Fecha del servicio: si viene una fecha desfasada se guarda esa; si no, el default (now()).
    ...(input.at ? { at: input.at } : {}),
    actor: input.actor,
    actor_name: input.actorName ?? null,
  }).select('*').single();
  if (error) throw error;
  const mov = data as CocinaMovimiento;

  // Descontar cada víver del inventario (consumo) desde el/los almacén(es) que
  // tengan stock (no del «almacén por defecto» del producto, que puede estar vacío).
  const aplicados: CocinaItem[] = [];
  try {
    for (const it of items) {
      await consumirDeInventario({
        productoId: it.producto_id,
        cantidad: Math.abs(Number(it.cantidad)),
        almacenPreferido: it.almacen ?? null,
        actor: input.actor,
        actorName: input.actorName ?? null,
        detalle: `Consumo cocina · ${labelTipoComida(input.tipoComida)} · ${it.sku} ${it.nombre}`,
        refId: mov.id,
        refCodigo: codigo,
      });
      aplicados.push(it);
    }
  } catch (e) {
    // Se cortó a mitad: se reintegra lo ya descontado y se borra el registro,
    // para que el ciclo de mercado no quede con un consumo a medias.
    for (const it of aplicados) {
      await reintegrarAlInventario({
        productoId: it.producto_id, cantidad: Math.abs(Number(it.cantidad)),
        almacenPreferido: it.almacen ?? null, actor: input.actor, actorName: input.actorName ?? null,
        detalle: `Reverso consumo cocina ${codigo} · ${it.sku} ${it.nombre}`,
        refId: mov.id, refCodigo: codigo,
      }).catch(() => { /* mejor esfuerzo: el registro se borra igual */ });
    }
    await supabase.from(TABLE).delete().eq('id', mov.id);
    throw e;
  }
  return mov;
}

/** Devuelve `cantidad` de un víver al inventario (ajuste +), al almacén con más stock. */
async function reintegrarAlInventario(o: {
  productoId: string; cantidad: number; almacenPreferido?: string | null;
  actor: string; actorName?: string | null; detalle: string;
  refId?: string | null; refCodigo?: string | null;
}): Promise<void> {
  const cant = round2(Math.abs(o.cantidad));
  if (cant <= 0) return;
  const fuentes = await almacenesConStock(o.productoId, o.almacenPreferido ?? null);
  await registrarMovimiento({
    producto_id: o.productoId, tipo: 'ajuste', delta: cant,
    almacen: fuentes[0]?.almacen ?? o.almacenPreferido ?? null,
    actor: o.actor, actor_name: o.actorName ?? null,
    ref_tipo: 'cocina', ref_id: o.refId ?? null, ref_codigo: o.refCodigo ?? null,
    detalle: o.detalle,
  });
}

export interface ActualizarMovimientoCocinaInput {
  tipoComida: TipoComida;
  platos: number;
  items: CocinaItem[];
  nota?: string | null;
  at?: string | null;
  actor: string;
  actorName?: string | null;
}

/**
 * Edita un movimiento de cocina (tipo, platos, víveres, cantidades, nota y fecha) y
 * RECONCILIA el inventario por la DIFERENCIA respecto a lo que se había consumido:
 *   · si una cantidad baja (o se quita un víver) → la diferencia se REINTEGRA al stock (ajuste +).
 *   · si una cantidad sube (o se agrega un víver) → se consume la diferencia (consumo −).
 * Los víveres que no cambian no generan movimiento de inventario. No toca el PMP (sin precio).
 */
export async function actualizarMovimientoCocina(id: string, input: ActualizarMovimientoCocinaInput): Promise<CocinaMovimiento> {
  const items = (input.items ?? []).filter((i) => i.producto_id && Number(i.cantidad) > 0);
  if (!items.length) throw new Error('Agregá al menos un víver con cantidad.');
  if (!Number.isFinite(input.platos) || input.platos <= 0) throw new Error('Indicá cuántos platos se realizaron (mayor que 0).');

  // 1) Movimiento actual (para calcular la diferencia de consumo por víver).
  const { data: cur, error: eCur } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (eCur) throw eCur;
  const prev = cur as CocinaMovimiento;

  type Info = { cant: number; sku: string; nombre: string; almacen: string | null };
  const acumular = (arr: CocinaItem[]) => {
    const m = new Map<string, Info>();
    for (const it of arr ?? []) {
      const p = m.get(it.producto_id);
      m.set(it.producto_id, {
        cant: (p?.cant ?? 0) + Number(it.cantidad || 0),
        sku: it.sku, nombre: it.nombre, almacen: it.almacen ?? null,
      });
    }
    return m;
  };
  const viejo = acumular(Array.isArray(prev.items) ? prev.items : []);
  const nuevo = acumular(items);

  // 2) Reconciliar inventario por la diferencia (stockDelta = viejo − nuevo).
  for (const pid of new Set([...viejo.keys(), ...nuevo.keys()])) {
    const o = viejo.get(pid); const n = nuevo.get(pid);
    const stockDelta = round2((o?.cant ?? 0) - (n?.cant ?? 0)); // >0 reintegra, <0 consume más
    if (Math.abs(stockDelta) < 1e-9) continue;
    const meta = (n ?? o) as Info;
    const detalle = `Edición cocina ${prev.codigo ?? ''} · ${labelTipoComida(input.tipoComida)} · ${meta.sku} ${meta.nombre} · ${stockDelta > 0 ? `reintegro ${round2(Math.abs(stockDelta))}` : `consumo extra ${round2(Math.abs(stockDelta))}`}`;
    if (stockDelta < 0) {
      // Consumo extra: se descuenta del/los almacén(es) con stock.
      await consumirDeInventario({
        productoId: pid, cantidad: Math.abs(stockDelta), almacenPreferido: meta.almacen ?? null,
        actor: input.actor, actorName: input.actorName ?? null, detalle, refId: id, refCodigo: prev.codigo,
      });
    } else {
      // Reintegro: vuelve al almacén con más stock (o el indicado si no hay ninguno con stock).
      const fuentes = await almacenesConStock(pid, meta.almacen ?? null);
      await registrarMovimiento({
        producto_id: pid, tipo: 'ajuste', delta: stockDelta,
        almacen: fuentes[0]?.almacen ?? meta.almacen ?? null,
        actor: input.actor, actor_name: input.actorName ?? null,
        ref_tipo: 'cocina', ref_id: id, ref_codigo: prev.codigo, detalle,
      });
    }
  }

  // 3) Actualizar el registro con los nuevos datos.
  const valorTotal = round2(items.reduce((a, i) => a + Number(i.cantidad) * Number(i.precio), 0));
  const patch: Record<string, unknown> = {
    tipo_comida: input.tipoComida,
    platos: Math.trunc(input.platos),
    items,
    valor_total: valorTotal,
    nota: input.nota?.trim() || null,
  };
  if (input.at) patch.at = input.at;
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data as CocinaMovimiento;
}

/**
 * Elimina un movimiento de cocina y DEVUELVE los víveres al inventario.
 *
 * GT-SIN-14 · Antes solo borraba la fila: el consumo quedaba aplicado para
 * siempre. Era asimétrico —editar sí reconcilia por diferencia y reintegra— y
 * además rompía la cuenta del ciclo de mercado, porque el consumo se calcula
 * sobre los registros vivos: al borrar salía del informe pero el stock no
 * volvía, y ese descuadre quedaba congelado en el resumen del ciclo.
 *
 * El borrado va primero y hace de reserva: `delete … returning` entrega la fila
 * una sola vez, así que dos personas borrando a la vez no reintegran el doble.
 */
export async function eliminarMovimientoCocina(
  id: string, actor = 'sistema', actorName: string | null = null,
): Promise<void> {
  const { data, error } = await supabase.from(TABLE).delete().eq('id', id).select('*');
  if (error) throw error;
  const mov = (data ?? [])[0] as CocinaMovimiento | undefined;
  if (!mov) return; // ya lo había borrado otro usuario

  const items = Array.isArray(mov.items) ? (mov.items as CocinaItem[]) : [];
  for (const it of items) {
    if (!it.producto_id || !(Number(it.cantidad) > 0)) continue;
    await reintegrarAlInventario({
      productoId: it.producto_id,
      cantidad: Math.abs(Number(it.cantidad)),
      almacenPreferido: it.almacen ?? null,
      actor, actorName,
      detalle: `Reverso por eliminación · cocina ${mov.codigo ?? ''} · ${it.sku} ${it.nombre}`.trim(),
      refId: mov.id, refCodigo: mov.codigo ?? null,
    });
  }
}

/* ───────────── Resumen / consumo ───────────── */

export interface ConsumoProductoCocina {
  producto_id: string;
  sku: string;
  nombre: string;
  cantidad: number;   // unidades consumidas
  valor: number;      // $ consumidos
}
export interface ResumenCocina {
  movimientos: number;
  platos: number;
  valorTotal: number;
  promedioPorPlato: number;
  porTipo: Record<TipoComida, { platos: number; valor: number; movimientos: number }>;
  topProductos: ConsumoProductoCocina[];   // víveres más consumidos (por valor)
}

/** Agrega un conjunto de movimientos en KPIs + top de víveres más consumidos. */
export function resumirCocina(movs: CocinaMovimiento[]): ResumenCocina {
  const porTipo: ResumenCocina['porTipo'] = {
    desayuno: { platos: 0, valor: 0, movimientos: 0 },
    almuerzo: { platos: 0, valor: 0, movimientos: 0 },
    cena: { platos: 0, valor: 0, movimientos: 0 },
  };
  const prodMap = new Map<string, ConsumoProductoCocina>();
  let platos = 0, valorTotal = 0;
  for (const m of movs) {
    platos += Number(m.platos) || 0;
    valorTotal = round2(valorTotal + (Number(m.valor_total) || 0));
    const t = porTipo[m.tipo_comida as TipoComida];
    if (t) { t.platos += Number(m.platos) || 0; t.valor = round2(t.valor + (Number(m.valor_total) || 0)); t.movimientos += 1; }
    for (const it of m.items ?? []) {
      const key = it.producto_id || it.sku;
      const acc = prodMap.get(key) ?? { producto_id: it.producto_id, sku: it.sku, nombre: it.nombre, cantidad: 0, valor: 0 };
      acc.cantidad = round2(acc.cantidad + (Number(it.cantidad) || 0));
      acc.valor = round2(acc.valor + (Number(it.cantidad) || 0) * (Number(it.precio) || 0));
      prodMap.set(key, acc);
    }
  }
  const topProductos = Array.from(prodMap.values()).sort((a, b) => b.valor - a.valor);
  return {
    movimientos: movs.length,
    platos,
    valorTotal,
    promedioPorPlato: platos > 0 ? round2(valorTotal / platos) : 0,
    porTipo,
    topProductos,
  };
}
