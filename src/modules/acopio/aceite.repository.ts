/* ============================================================
   Golden Touch · Centro de Acopio · CONSUMO DE ACEITE (molinos)
   Mismo modelo que «CONSUMO MAZOS MARTILLOS GT», pero de aceite:
   libro tipo caja con dinero (entregados/facturados → saldo $) y
   unidades en LITROS (entregados − a GT − consumidos → restantes).
   El consumo genera, por trigger, el gasto «USO DE ACEITE» en la
   caja de Peramanal abierta (a la tasa vigente $/L).
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export interface AceiteMovimiento {
  id: string;
  fecha: string;
  descripcion: string | null;
  usd_entregados: number;
  cantidad_entregados: number;   // litros entregados
  usd_facturados: number;
  aceite_a_gt: number;           // litros entregados a GT
  consumidos: number;            // litros consumidos/usados (uso) → genera gasto en Acopio
  orden: number;
  created_by?: string | null;
  actor_name?: string | null;
  created_at?: string;
  // Calculados al listar (no se persisten):
  precio_usd_litro: number;      // usd_facturados / cantidad_entregados
  saldo_usd: number;             // corrido: + entregados − facturados
  litros_restantes: number;      // corrido: + entregados − a GT − consumidos
}

export interface AceiteInput {
  fecha: string;
  descripcion?: string | null;
  usd_entregados?: number;
  cantidad_entregados?: number;
  usd_facturados?: number;
  aceite_a_gt?: number;
  consumidos?: number;
}

/** Lista en orden cronológico y calcula saldo $ y litros restantes corridos. */
export async function listMovimientosAceite(): Promise<AceiteMovimiento[]> {
  const { data, error } = await supabase
    .from('acopio_aceite_movimientos')
    .select('*')
    .order('fecha', { ascending: true })
    .order('orden', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  let saldo = 0;
  let restantes = 0;
  return (data ?? []).map((row) => {
    const m = row as AceiteMovimiento;
    const cant = num(m.cantidad_entregados);
    saldo += num(m.usd_entregados) - num(m.usd_facturados);
    restantes += cant - num(m.aceite_a_gt) - num(m.consumidos);
    return {
      ...m,
      consumidos: num(m.consumidos),
      precio_usd_litro: cant > 0 ? num(m.usd_facturados) / cant : 0,
      saldo_usd: saldo,
      litros_restantes: restantes,
    };
  });
}

/** Precio vigente del litro = Σ facturados / Σ litros entregados (tasa con la que se
 *  valora el consumo/gasto). */
export function precioVigenteAceite(movs: AceiteMovimiento[]): number {
  const cant = movs.reduce((a, m) => a + num(m.cantidad_entregados), 0);
  const fac = movs.reduce((a, m) => a + num(m.usd_facturados), 0);
  return cant > 0 ? fac / cant : 0;
}

function payloadAceite(input: AceiteInput): Record<string, unknown> {
  return {
    fecha: input.fecha,
    descripcion: input.descripcion?.trim() || null,
    usd_entregados: num(input.usd_entregados),
    cantidad_entregados: num(input.cantidad_entregados),
    usd_facturados: num(input.usd_facturados),
    aceite_a_gt: num(input.aceite_a_gt),
    consumidos: num(input.consumidos),
  };
}

export async function crearMovimientoAceite(input: AceiteInput, actor: string, actorName?: string | null): Promise<void> {
  if (!input.fecha) throw new Error('Indicá la fecha del movimiento.');
  // Si lleva consumo, un trigger de la BD crea el gasto «USO DE ACEITE» en la caja de
  // Acopio; acá solo guardamos el movimiento.
  const { error } = await supabase.from('acopio_aceite_movimientos').insert({
    ...payloadAceite(input),
    created_by: actor,
    actor_name: actorName ?? null,
  });
  if (error) throw error;
}

/** Edita un movimiento de aceite. El trigger re-crea/actualiza el gasto ligado. */
export async function actualizarMovimientoAceite(id: string, input: AceiteInput): Promise<void> {
  if (!input.fecha) throw new Error('Indicá la fecha del movimiento.');
  const { error } = await supabase.from('acopio_aceite_movimientos')
    .update({ ...payloadAceite(input), updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function eliminarMovimientoAceite(id: string): Promise<void> {
  // El gasto ligado (ref_aceite_id) se borra en cascada por FK.
  const { error } = await supabase.from('acopio_aceite_movimientos').delete().eq('id', id);
  if (error) throw error;
}

export interface ResumenAceite {
  saldoUsd: number;
  restantes: number;             // litros restantes
  totalEntregadoUsd: number;
  totalFacturadoUsd: number;
  totalEntregados: number;       // litros que entraron
  totalAGt: number;              // litros entregados a GT
  totalConsumidos: number;       // litros consumidos/usados (uso)
  gastoConsumoUsd: number;       // consumidos × precio vigente → gasto en Acopio
  precioVigente: number;         // Σ facturados / Σ entregados ($/L)
}

/** Agregados de cabecera (a partir de la lista ya calculada). */
export function resumirAceite(movs: AceiteMovimiento[]): ResumenAceite {
  const totalEntregadoUsd = movs.reduce((a, m) => a + num(m.usd_entregados), 0);
  const totalFacturadoUsd = movs.reduce((a, m) => a + num(m.usd_facturados), 0);
  const totalEntregados = movs.reduce((a, m) => a + num(m.cantidad_entregados), 0);
  const totalAGt = movs.reduce((a, m) => a + num(m.aceite_a_gt), 0);
  const totalConsumidos = movs.reduce((a, m) => a + num(m.consumidos), 0);
  const precioVigente = precioVigenteAceite(movs);
  return {
    saldoUsd: totalEntregadoUsd - totalFacturadoUsd,
    restantes: totalEntregados - totalAGt - totalConsumidos,
    totalEntregadoUsd, totalFacturadoUsd, totalEntregados, totalAGt,
    totalConsumidos, gastoConsumoUsd: totalConsumidos * precioVigente, precioVigente,
  };
}
