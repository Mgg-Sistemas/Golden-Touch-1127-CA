import { supabase } from '@/shared/lib/supabase';
import type { ItemOrden } from '@/shared/lib/types';
import { aplicarVinculos, type ProductoAsignable } from './piezasMaquinaria';

/** Estados en que la solicitud todavía se está cotizando (sus renglones son los de la orden). */
const ESTADOS_COTIZANDO = ['pendiente', 'aprobada', 'desistida_proveedor'];

/**
 * Deja en la SOLICITUD los productos que el analista les puso a las piezas de
 * Maquinaria al cotizar (clave: el sku que el renglón tenía en la orden). Solo mientras
 * se cotiza: al aceptar una oferta, los renglones de la orden pasan a ser los de la oferta.
 */
export async function guardarVinculosPiezasEnOrden(ordenId: string, vinculos: Map<string, ProductoAsignable>): Promise<void> {
  if (!vinculos.size) return;
  const { data, error } = await supabase.from('ordenes').select('items, estado').eq('id', ordenId).single();
  if (error) throw error;
  const fila = data as { items: ItemOrden[] | null; estado: string };
  if (!ESTADOS_COTIZANDO.includes(fila.estado)) return;
  const items = Array.isArray(fila.items) ? fila.items : [];
  const nuevos = aplicarVinculos(items, vinculos);
  if (nuevos === items) return;
  const { error: errUpd } = await supabase.from('ordenes').update({ items: nuevos }).eq('id', ordenId);
  if (errUpd) throw errUpd;
}
