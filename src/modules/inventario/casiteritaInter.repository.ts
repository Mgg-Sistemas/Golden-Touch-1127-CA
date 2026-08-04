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
  /** Kg a enviar desde `almacenOrigen`. Se ignora cuando `barrerTodo` es true. */
  kg?: number;
  /**
   * true → BARRE la casiterita de TODOS los almacenes con existencia y los deja en 0
   * (el inventario de casiterita queda en 0 tras el traslado). false (por defecto) →
   * modo explícito: envía los `kg` pedidos desde `almacenOrigen`.
   */
  barrerTodo?: boolean;
  actor: string;
  actorName?: string | null;
  detalle?: string | null;
}): Promise<{ kg: number }> {
  if (!esCasiterita(input.producto)) throw new Error('Solo se puede enviar CASITERITA por este puente.');

  // Existencias con stock > 0: TODOS los almacenes (barrerTodo) o solo el de origen.
  let qy = supabase
    .from('existencias')
    .select('almacen, stock, costo_promedio')
    .eq('producto_id', input.producto.id)
    .gt('stock', 0);
  if (!input.barrerTodo) qy = qy.eq('almacen', input.almacenOrigen);
  const { data: exRows, error: exErr } = await qy;
  if (exErr) throw exErr;

  // Se lee el stock (redondeo a 6 decimales para limpiar ruido de punto flotante). La
  // RPC hace greatest(0, stock + delta), así que vaciar con delta = -stock deja la
  // existencia EXACTAMENTE en 0, sin residuales por redondeo.
  let rows = (exRows ?? [])
    .map((r) => ({
      almacen: String(r.almacen),
      stock: Math.round((Number(r.stock) || 0) * 1e6) / 1e6,
      costo: Number(r.costo_promedio) || 0,
    }))
    .filter((r) => r.stock > 0);

  if (!input.barrerTodo) {
    // Modo explícito (Inventario): enviar los Kg pedidos desde el almacén de origen. Si
    // cubren (dentro de un epsilon) todo el stock del almacén, se hace SNAP a 0 exacto
    // para no dejar residuales por redondeo.
    const row = rows.find((r) => r.almacen === input.almacenOrigen) ?? null;
    const stockOrigen = row?.stock ?? 0;
    const pedido = Math.round((Number(input.kg) || 0) * 10000) / 10000;
    if (pedido <= 0) throw new Error('Para enviar casiterita al otro sistema, los Kg deben ser mayores que 0.');
    if (pedido > stockOrigen + 1e-6) throw new Error(`Stock insuficiente en ${input.almacenOrigen}. Disponible: ${stockOrigen} Kg.`);
    const kgReal = pedido >= stockOrigen - 1e-6 ? stockOrigen : pedido;
    rows = [{ almacen: input.almacenOrigen, stock: kgReal, costo: row?.costo ?? 0 }];
  }

  if (!rows.length) throw new Error(`No hay casiterita con stock para enviar (${input.producto.nombre}).`);

  const kg = Math.round(rows.reduce((a, r) => a + r.stock, 0) * 10000) / 10000;
  if (kg <= 0) throw new Error('Para enviar casiterita al otro sistema, los Kg deben ser mayores que 0.');

  // Costo (PMP) ponderado del stock que sale: viaja para valorar en el destino.
  const valor = rows.reduce((a, r) => a + r.stock * r.costo, 0);
  let costo = valor > 0 ? valor / kg : 0;
  if (costo <= 0) costo = Number(input.producto.precio) || 0;
  costo = Math.round(costo * 10000) / 10000;

  const transfId = crypto.randomUUID();
  const obsBase = (input.detalle ?? '').trim();
  const motivo = `→ ${DESTINO_EXTERNO_CASITERITA_LABEL}${obsBase ? ' · ' + obsBase : ''}`;
  const resumen = `${kg.toLocaleString('es-VE', { maximumFractionDigits: 2 })} Kg de ${input.producto.nombre}`;
  const almacenOrigenLabel = rows.length > 1
    ? `VARIOS (${rows.map((r) => r.almacen).join(', ')})`
    : rows[0].almacen;

  // 1) Sale de CADA almacén con existencia (cada uno queda en 0). Mismo transf_id → una
  //    sola transferencia lógica; la RPC deja la existencia en 0 (greatest(0, ...)).
  for (const r of rows) {
    await registrarMovimiento({
      producto_id: input.producto.id,
      tipo: 'transferencia',
      delta: -r.stock,
      almacen: r.almacen,
      actor: input.actor,
      actor_name: input.actorName ?? null,
      ref_tipo: 'casiterita_inter',
      ref_id: transfId,
      ref_codigo: input.producto.sku,
      destino: DESTINO_EXTERNO_CASITERITA_LABEL,
      detalle: `${r.stock.toLocaleString('es-VE', { maximumFractionDigits: 4 })} Kg desde ${r.almacen} · ${motivo}`,
    });
  }

  // 2) Registra la transferencia saliente (contrato compartido con el otro sistema).
  const { data: row, error: insErr } = await supabase.from('transferencias_casiterita_inter').insert({
    transf_id: transfId, direccion: 'saliente', estado: 'enviada',
    empresa_origen: EMPRESA, empresa_destino: 'mgg',
    producto_id: input.producto.id, producto_nombre: input.producto.nombre, sku: input.producto.sku,
    kg, costo_unitario: costo,
    almacen_origen: almacenOrigenLabel, almacen_destino: ALMACEN_DESTINO_CASITERITA,
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
        kg, costo_unitario: costo,
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

  return { kg };
}

/** Lista las transferencias de casiterita inter-sistema (este sistema). */
export async function listTransferenciasCasiterita(): Promise<TransferenciaCasiteritaInter[]> {
  const { data, error } = await supabase.from('transferencias_casiterita_inter').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TransferenciaCasiteritaInter[];
}
