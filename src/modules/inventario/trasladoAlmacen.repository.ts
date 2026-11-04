/* ============================================================
   Golden Touch · Inventario · Traslado entre almacenes (29/10/2026)
   Un solo RPC atómico (supabase/2026-10-29-inventario-traslado-entre-almacenes.sql):
   saca del producto en su depósito y mete en su gemelo del otro depósito
   (lo crea si no existe). Ver inventarioMovil.ts para el aviso de WhatsApp.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { TrasladoAlmacen } from './inventarioMovil';
import { agruparTraslados, type MovimientoTraslado, type TrasladoHistorico } from './historicoMovil';

export async function trasladarEntreAlmacenes(input: {
  producto_id: string; cantidad: number; destino?: string; nota?: string | null; actor: string; actor_name?: string | null;
}): Promise<TrasladoAlmacen> {
  const { data, error } = await supabase.rpc('inventario_trasladar_deposito', { p: input });
  if (error) throw new Error(error.message);
  return data as TrasladoAlmacen;
}

/** Valor para un filtro `or` de PostgREST: entre comillas, por si el nombre trae comas o puntos. */
const cotizar = (v: string) => `"${v.replace(/"/g, '\\"')}"`;

/** Histórico del teléfono (03/11/2026): los traslados TRA-#### que salieron de ese almacén o
 *  entraron a él, entre dos fechas (límites ISO). Cada traslado se arma con sus dos
 *  movimientos de stock; el RLS de `movimientos` decide qué patas se ven. */
export async function listTrasladosMovil(f: { almacen: string; desdeIso: string; hastaIso: string; limite?: number }): Promise<TrasladoHistorico[]> {
  const limite = f.limite ?? 200;
  const { data, error } = await supabase.from('movimientos')
    .select('id, ref_codigo, almacen, destino, delta, stock_despues, detalle, actor, actor_name, at, producto_id, producto:productos(sku, nombre, unidad)')
    .eq('ref_tipo', 'traslado_almacen')
    .or(`almacen.eq.${cotizar(f.almacen)},destino.eq.${cotizar(f.almacen)}`)
    .gte('at', f.desdeIso).lt('at', f.hastaIso)
    .order('at', { ascending: false })
    .limit(limite * 2);
  if (error) throw new Error(/permission denied|row-level security/i.test(error.message) ? 'No tienes permiso para ver este depósito.' : error.message);
  return agruparTraslados((data ?? []) as unknown as MovimientoTraslado[]).slice(0, limite);
}
