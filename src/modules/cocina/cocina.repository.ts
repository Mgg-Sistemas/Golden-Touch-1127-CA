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

/** Productos de la categoría VÍVERES (activos). El stock y el precio (PMP) salen del inventario. */
export async function listViveres(): Promise<Producto[]> {
  const prods = await listProductos();
  return prods
    .filter((p) => p.estado === 'activo' && norm(p.categoria) === 'viveres')
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export interface CocinaFiltros {
  desde?: string;       // YYYY-MM-DD
  hasta?: string;       // YYYY-MM-DD
  tipo?: TipoComida | '';
}

export async function listMovimientosCocina(filtros: CocinaFiltros = {}): Promise<CocinaMovimiento[]> {
  let q = supabase.from(TABLE).select('*').order('at', { ascending: false });
  if (filtros.tipo) q = q.eq('tipo_comida', filtros.tipo);
  if (filtros.desde) q = q.gte('at', `${filtros.desde}T00:00:00`);
  if (filtros.hasta) q = q.lte('at', `${filtros.hasta}T23:59:59`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CocinaMovimiento[];
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
  actor: string;
  actorName?: string | null;
}

/**
 * Registra un movimiento de cocina: descuenta cada víver del inventario (consumo)
 * y guarda el registro con su correlativo, valor (Σ cantidad×precio) y nº de platos.
 */
export async function crearMovimientoCocina(input: CrearMovimientoCocinaInput): Promise<CocinaMovimiento> {
  const items = (input.items ?? []).filter((i) => i.producto_id && Number(i.cantidad) > 0);
  if (!items.length) throw new Error('Agregá al menos un víver con cantidad.');
  if (!Number.isFinite(input.platos) || input.platos <= 0) throw new Error('Indicá cuántos platos se realizaron (mayor que 0).');

  // 1) Descontar cada víver del inventario (consumo).
  for (const it of items) {
    await registrarMovimiento({
      producto_id: it.producto_id,
      tipo: 'consumo',
      delta: -Math.abs(Number(it.cantidad)),
      almacen: it.almacen ?? null,
      actor: input.actor,
      actor_name: input.actorName ?? null,
      ref_tipo: 'cocina',
      detalle: `Consumo cocina · ${labelTipoComida(input.tipoComida)} · ${it.sku} ${it.nombre}`,
    });
  }

  // 2) Guardar el registro de cocina.
  const valorTotal = round2(items.reduce((a, i) => a + Number(i.cantidad) * Number(i.precio), 0));
  const codigo = await nextCodigoCocina();
  const { data, error } = await supabase.from(TABLE).insert({
    codigo,
    tipo_comida: input.tipoComida,
    platos: Math.trunc(input.platos),
    items,
    valor_total: valorTotal,
    nota: input.nota?.trim() || null,
    actor: input.actor,
    actor_name: input.actorName ?? null,
  }).select('*').single();
  if (error) throw error;
  return data as CocinaMovimiento;
}

export async function eliminarMovimientoCocina(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
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
