/* ============================================================
   Golden Touch · Inventario · Puente inter-sistema de CASITERITA
   Cuando se traslada CASITERITA a un destino EXTERNO, además de la
   salida local se empuja el mineral al OTRO sistema por el puente
   (transfer-enviar → transfer-recibir con recurso='casiterita'). El
   otro sistema lo recibe AUTOMÁTICO en el almacén "LOS PINOS - CASITERITA".
   `transf_id` es el id GLOBAL compartido → idempotencia (un reintento
   nunca acredita dos veces).
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { Producto, TransferenciaCasiteritaInter } from '@/shared/lib/types';
import { registrarMovimiento } from './movimientos.repository';

/** Empresa/sistema propio (este Supabase). El mismo build desplegado como el otro
 *  sistema usa su propio código y queda simétrico. */
const EMPRESA = (import.meta.env.VITE_EMPRESA_CODIGO as string | undefined)?.trim() || 'mineral-group';

/** Almacén donde el OTRO sistema recibe la casiterita. */
export const ALMACEN_DESTINO_CASITERITA = 'LOS PINOS - CASITERITA';
/** Valor centinela del selector de destino para el envío al otro sistema. */
export const DESTINO_EXTERNO_CASITERITA = '__externo_los_pinos_casiterita__';
export const DESTINO_EXTERNO_CASITERITA_LABEL = 'LOS PINOS - CASITERITA (otro sistema)';

const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** ¿El producto es CASITERITA? (por nombre o categoría). Solo estos pueden enviarse
 *  por el puente al otro sistema. */
export function esCasiterita(p: Pick<Producto, 'nombre' | 'categoria'>): boolean {
  return norm(`${p.nombre ?? ''} ${p.categoria ?? ''}`).includes('casiterita');
}

/**
 * Traslado de CASITERITA al OTRO sistema (destino externo). Descuenta del almacén de
 * origen de ESTE sistema (salida tipo transferencia) y empuja los Kg al otro Supabase.
 * El destino lo recibe AUTOMÁTICO en "LOS PINOS - CASITERITA". Si el otro sistema aún
 * no está configurado, la salida local queda registrada y la transferencia en 'error'
 * para reintentar.
 */
export async function registrarTrasladoCasiteritaExterno(input: {
  producto: Producto;
  almacenOrigen: string;
  kg: number;
  actor: string;
  actorName?: string | null;
  detalle?: string | null;
}): Promise<void> {
  const kg = Math.round((Number(input.kg) || 0) * 10000) / 10000;
  if (kg <= 0) throw new Error('Para enviar casiterita al otro sistema, los Kg deben ser mayores que 0.');
  if (!esCasiterita(input.producto)) throw new Error('Solo se puede enviar CASITERITA por este puente.');

  // Stock y costo (PMP) del almacén de origen: el costo viaja para valorar en el destino.
  const { data: ex } = await supabase
    .from('existencias')
    .select('stock, costo_promedio')
    .eq('producto_id', input.producto.id)
    .eq('almacen', input.almacenOrigen)
    .maybeSingle();
  const stockOrigen = Number(ex?.stock) || 0;
  if (kg > stockOrigen) throw new Error(`Stock insuficiente en ${input.almacenOrigen}. Disponible: ${stockOrigen} Kg.`);
  let costo = Number(ex?.costo_promedio) || 0;
  if (costo <= 0) costo = Number(input.producto.precio) || 0;

  const transfId = crypto.randomUUID();
  const obsBase = (input.detalle ?? '').trim();
  const motivo = `→ ${DESTINO_EXTERNO_CASITERITA_LABEL}${obsBase ? ' · ' + obsBase : ''}`;
  const resumen = `${kg.toLocaleString('es-VE', { maximumFractionDigits: 2 })} Kg de ${input.producto.nombre}`;

  // 1) Sale del almacén de origen (queda registrado como transferencia externa).
  await registrarMovimiento({
    producto_id: input.producto.id,
    tipo: 'transferencia',
    delta: -kg,
    almacen: input.almacenOrigen,
    actor: input.actor,
    actor_name: input.actorName ?? null,
    ref_tipo: 'casiterita_inter',
    ref_id: transfId,
    ref_codigo: input.producto.sku,
    destino: DESTINO_EXTERNO_CASITERITA_LABEL,
    detalle: `${resumen} · ${motivo}`,
  });

  // 2) Registra la transferencia saliente (contrato compartido con el otro sistema).
  const { data: row, error: insErr } = await supabase.from('transferencias_casiterita_inter').insert({
    transf_id: transfId, direccion: 'saliente', estado: 'enviada',
    empresa_origen: EMPRESA, empresa_destino: 'mgg',
    producto_id: input.producto.id, producto_nombre: input.producto.nombre, sku: input.producto.sku,
    kg, costo_unitario: Math.round(costo * 10000) / 10000,
    almacen_origen: input.almacenOrigen, almacen_destino: ALMACEN_DESTINO_CASITERITA,
    resumen, motivo,
    actor: input.actor, actor_name: input.actorName ?? null,
  }).select('id').single();
  if (insErr) throw insErr;
  const rowId = (row as { id: string }).id;

  // 3) Empuja al otro sistema (recurso='casiterita'). Recepción AUTOMÁTICA en el destino.
  try {
    const { data: res, error } = await supabase.functions.invoke('transfer-enviar', {
      body: {
        tipo: 'transferencia', recurso: 'casiterita', transf_id: transfId,
        empresa_origen: EMPRESA, empresa_destino: 'mgg',
        producto_nombre: input.producto.nombre, sku: input.producto.sku,
        kg, costo_unitario: Math.round(costo * 10000) / 10000,
        almacen_destino: ALMACEN_DESTINO_CASITERITA,
        resumen, motivo,
        actor: input.actor, actor_name: input.actorName ?? null,
      },
    });
    if (error) throw error;
    if (res && (res as { entregada?: boolean }).entregada === false) {
      throw new Error((res as { error?: string }).error || 'El otro sistema no aceptó la casiterita.');
    }
    // Recepción automática en el destino → la saliente queda 'recibida'.
    await supabase.from('transferencias_casiterita_inter')
      .update({ estado: 'recibida', confirmada_at: new Date().toISOString(), mensaje_error: null }).eq('id', rowId);
  } catch (e) {
    await supabase.from('transferencias_casiterita_inter')
      .update({ estado: 'error', mensaje_error: e instanceof Error ? e.message : 'No se pudo entregar' }).eq('id', rowId);
    throw new Error(`La casiterita salió del almacén pero no se pudo entregar al otro sistema (queda para reintentar): ${e instanceof Error ? e.message : ''}`);
  }
}

/** Lista las transferencias de casiterita inter-sistema (este sistema). */
export async function listTransferenciasCasiterita(): Promise<TransferenciaCasiteritaInter[]> {
  const { data, error } = await supabase.from('transferencias_casiterita_inter').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TransferenciaCasiteritaInter[];
}
