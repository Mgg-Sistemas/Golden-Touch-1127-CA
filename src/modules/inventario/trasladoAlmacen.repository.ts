/* ============================================================
   Golden Touch · Inventario · Traslado entre almacenes (29/10/2026)
   Un solo RPC atómico (supabase/2026-10-29-inventario-traslado-entre-almacenes.sql):
   saca del producto en su depósito y mete en su gemelo del otro depósito
   (lo crea si no existe). Ver inventarioMovil.ts para el aviso de WhatsApp.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { TrasladoAlmacen } from './inventarioMovil';

export async function trasladarEntreAlmacenes(input: {
  producto_id: string; cantidad: number; destino?: string; nota?: string | null; actor: string; actor_name?: string | null;
}): Promise<TrasladoAlmacen> {
  const { data, error } = await supabase.rpc('inventario_trasladar_deposito', { p: input });
  if (error) throw new Error(error.message);
  return data as TrasladoAlmacen;
}
