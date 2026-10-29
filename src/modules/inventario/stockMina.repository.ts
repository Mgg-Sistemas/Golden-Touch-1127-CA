/* ============================================================
   Golden Touch · Depósito Mina · movimientos para el reporte de stock
   Ver stockMinaWhatsapp.ts (el cálculo y el mensaje).
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { MovimientoStock } from './stockMinaWhatsapp';

const PAGINA = 1000; // tope de filas de PostgREST por pedido

/**
 * Movimientos de un depósito desde el día `desde` (hora de Venezuela) hasta hoy.
 * Se traen también los posteriores al «hasta»: con ellos se reconstruye el stock
 * de esa fecha a partir del stock actual.
 */
export async function listMovimientosDepositoDesde(almacen: string, desde: string): Promise<MovimientoStock[]> {
  const out: MovimientoStock[] = [];
  for (let i = 0; ; i += PAGINA) {
    const { data, error } = await supabase
      .from('movimientos')
      .select('producto_id, delta, at')
      .eq('almacen', almacen)
      .gte('at', `${desde}T00:00:00-04:00`)
      .order('at', { ascending: true })
      .range(i, i + PAGINA - 1);
    if (error) throw error;
    out.push(...((data ?? []) as MovimientoStock[]));
    if (!data || data.length < PAGINA) return out;
  }
}
