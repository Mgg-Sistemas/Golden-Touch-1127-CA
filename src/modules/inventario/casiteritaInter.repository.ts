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
 * Devuelve al almacén el material que ya había salido cuando el barrido se corta a la
 * mitad. Sin esto, un fallo en el segundo renglón dejaría el primero descontado sin
 * transferencia que lo respalde.
 *
 * Devuelve la lista de almacenes que NO se pudieron devolver, para que quien llama lo
 * diga en voz alta: material perdido del inventario en silencio es peor que dos errores
 * juntos en pantalla.
 */
async function devolverAlAlmacen(
  aplicados: { almacen: string; kg: number }[],
  input: { producto: Producto; actor: string; actorName?: string | null },
  transfId: string,
  motivo: string,
): Promise<string[]> {
  const fallaron: string[] = [];
  for (const r of aplicados) {
    try {
      await registrarMovimiento({
        producto_id: input.producto.id,
        tipo: 'transferencia',
        delta: r.kg,
        almacen: r.almacen,
        actor: input.actor,
        actor_name: input.actorName ?? null,
        ref_tipo: 'casiterita_inter',
        ref_id: transfId,
        ref_codigo: input.producto.sku,
        detalle: `Devolución de ${r.kg.toLocaleString('es-VE', { maximumFractionDigits: 4 })} Kg a ${r.almacen}: el traslado se cortó antes de enviarse · ${motivo}`,
      });
    } catch (e) {
      fallaron.push(`${r.kg} Kg en ${r.almacen} (${e instanceof Error ? e.message : 'error'})`);
    }
  }
  return fallaron;
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

  // Se lee el stock (redondeo a 6 decimales para limpiar ruido de punto flotante), así
  // vaciar con delta = -stock deja la existencia EXACTAMENTE en 0, sin residuales.
  // OJO: esta lectura es solo la INTENCIÓN. Desde GT-SIN-16 la RPC ya no recorta a 0 en
  // silencio: si el stock cambió en el medio, levanta «Stock insuficiente». Lo que vale
  // para el puente es lo que devuelve cada movimiento, no lo que se leyó acá.
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

  const transfId = crypto.randomUUID();
  const obsBase = (input.detalle ?? '').trim();
  const motivo = `→ ${DESTINO_EXTERNO_CASITERITA_LABEL}${obsBase ? ' · ' + obsBase : ''}`;

  // 1) Sale de CADA almacén con existencia. Mismo transf_id → una sola transferencia
  //    lógica. De cada movimiento se guarda lo que la RPC APLICÓ DE VERDAD
  //    (stock_antes − stock_despues), que no siempre coincide con lo que se leyó arriba:
  //    entre la lectura y el movimiento otro usuario pudo haber consumido material.
  //    Todo lo que sigue —los Kg que cruzan el puente, el registro de la transferencia y
  //    la cantidad que vuelve a Salidas— se calcula sobre esa cifra, nunca sobre la
  //    lectura. Si no, a MGG se le acreditarían kilos que nunca salieron de acá.
  const aplicados: { almacen: string; kg: number; costo: number }[] = [];
  try {
    for (const r of rows) {
      const mov = await registrarMovimiento({
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
      const salieron = Math.round((Number(mov.stock_antes) - Number(mov.stock_despues)) * 1e6) / 1e6;
      if (salieron > 0) aplicados.push({ almacen: r.almacen, kg: salieron, costo: r.costo });
    }
  } catch (e) {
    // Cortarse a mitad del barrido dejaría material descontado del inventario sin
    // ninguna transferencia que lo respalde. Se devuelve lo que ya había salido.
    const noDevueltos = await devolverAlAlmacen(aplicados, input, transfId, motivo);
    if (noDevueltos.length) {
      const base = e instanceof Error ? e.message : 'No se pudo completar el traslado';
      throw new Error(
        `${base} · ADEMÁS no se pudo devolver al inventario: ${noDevueltos.join('; ')}. ` +
        `Revisá el kardex de ${input.producto.nombre}.`,
      );
    }
    throw e;
  }

  const kg = Math.round(aplicados.reduce((a, r) => a + r.kg, 0) * 10000) / 10000;
  if (kg <= 0) throw new Error(`No salió casiterita del almacén, así que no hay nada que enviar (${input.producto.nombre}).`);

  // Costo (PMP) ponderado del stock que REALMENTE salió: viaja para valorar en el destino.
  const valor = aplicados.reduce((a, r) => a + r.kg * r.costo, 0);
  let costo = valor > 0 ? valor / kg : 0;
  if (costo <= 0) costo = Number(input.producto.precio) || 0;
  costo = Math.round(costo * 10000) / 10000;

  const resumen = `${kg.toLocaleString('es-VE', { maximumFractionDigits: 2 })} Kg de ${input.producto.nombre}`;
  const almacenOrigenLabel = aplicados.length > 1
    ? `VARIOS (${aplicados.map((r) => r.almacen).join(', ')})`
    : aplicados[0].almacen;

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

/* ═══════════════════════════════════════════════════════════════════
   GT-INT-11 · Rescate de una entrega fallida
   La casiterita sale del almacén ANTES de que MGG la acepte. Si el puente
   falla, esos kilos quedan en el limbo: ya no están acá y nunca llegaron
   allá. Estas dos funciones son la salida de ese limbo.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Reintenta entregar a MGG una transferencia que quedó en `error`.
 *
 * SEGURO DE REPETIR: viaja el MISMO `transf_id`, y MGG deduplica por él. Si allá ya
 * había entrado, contesta que ya la tenía y no acredita dos veces.
 *
 * La fila se reserva antes de tocar el puente (`.eq('estado','error')`): si otra persona
 * la está reintentando en este mismo momento, esta llamada se corta acá.
 */
export async function reintentarTrasladoCasiterita(input: {
  id: string;
  actor: string;
  actorName?: string | null;
}): Promise<void> {
  const { data: reservadas, error: resErr } = await supabase
    .from('transferencias_casiterita_inter')
    .update({ estado: 'enviada', mensaje_error: null })
    .eq('id', input.id)
    .eq('estado', 'error')
    .select('*');
  if (resErr) throw resErr;
  const t = (reservadas ?? [])[0] as TransferenciaCasiteritaInter | undefined;
  if (!t) throw new Error('Esa transferencia ya no está en error: alguien la reintentó o la revirtió antes que vos.');

  try {
    const { data: res, error } = await supabase.functions.invoke('transfer-enviar', {
      body: {
        tipo: 'transferencia', recurso: 'casiterita', transf_id: t.transf_id,
        empresa_origen: t.empresa_origen, empresa_destino: t.empresa_destino,
        producto_nombre: t.producto_nombre, sku: t.sku,
        kg: Number(t.kg) || 0, costo_unitario: Number(t.costo_unitario) || 0,
        almacen_destino: t.almacen_destino ?? ALMACEN_DESTINO_CASITERITA,
        resumen: t.resumen, motivo: t.motivo,
        actor: input.actor, actor_name: input.actorName ?? null,
      },
    });
    if (error) throw error;
    if (res && (res as { entregada?: boolean }).entregada === false) {
      throw new Error((res as { error?: string }).error || 'El otro sistema no aceptó la casiterita.');
    }
    // Recepción automática en el destino → la saliente queda 'recibida'.
    await supabase.from('transferencias_casiterita_inter')
      .update({ estado: 'recibida', confirmada_at: new Date().toISOString(), mensaje_error: null })
      .eq('id', input.id);
  } catch (e) {
    // Vuelve a `error` para que se pueda reintentar de nuevo o revertir.
    await supabase.from('transferencias_casiterita_inter')
      .update({ estado: 'error', mensaje_error: e instanceof Error ? e.message : 'No se pudo entregar' })
      .eq('id', input.id);
    throw new Error(`Sigue sin poder entregarse a MGG: ${e instanceof Error ? e.message : ''}`);
  }
}

/**
 * Devuelve la casiterita al almacén y marca la transferencia como `revertida`.
 *
 * ⚠ NO ES SEGURO DE USAR A CIEGAS. Que el puente haya fallado no prueba que MGG no la
 * haya recibido: pudo haber entrado allá y haberse perdido solo el acuse. En ese caso
 * devolver los kilos los DUPLICA entre las dos empresas.
 *
 * El orden correcto es: primero REINTENTAR (que es idempotente y dice la verdad), y
 * recién revertir cuando se confirmó con MGG que nunca llegó. La pantalla lo advierte.
 */
export async function revertirTrasladoCasiterita(input: {
  id: string;
  actor: string;
  actorName?: string | null;
}): Promise<void> {
  const { data: reservadas, error: resErr } = await supabase
    .from('transferencias_casiterita_inter')
    .update({
      estado: 'revertida',
      revertida_at: new Date().toISOString(),
      revertida_por: input.actorName || input.actor,
    })
    .eq('id', input.id)
    .eq('estado', 'error')
    .select('*');
  if (resErr) throw resErr;
  const t = (reservadas ?? [])[0] as TransferenciaCasiteritaInter | undefined;
  if (!t) throw new Error('Esa transferencia ya no está en error: alguien la reintentó o la revirtió antes que vos.');

  const liberar = async (motivo: string) => {
    await supabase.from('transferencias_casiterita_inter')
      .update({ estado: 'error', revertida_at: null, revertida_por: null, mensaje_error: motivo })
      .eq('id', input.id);
  };

  if (!t.producto_id) {
    await liberar('No se pudo devolver: la transferencia no guarda qué producto salió.');
    throw new Error('Esta transferencia no guarda qué producto salió, así que no se puede devolver sola. Cargá la entrada a mano en Inventario.');
  }

  // El almacén guardado puede ser la etiqueta «VARIOS (...)» de un barrido de varios
  // almacenes: en ese caso la devolución va al inventario general, que es donde la RPC
  // deja hoy todo el stock.
  const almacen = (t.almacen_origen ?? '').startsWith('VARIOS') ? null : t.almacen_origen;

  try {
    await registrarMovimiento({
      producto_id: t.producto_id,
      tipo: 'transferencia',
      delta: Number(t.kg) || 0,
      almacen,
      actor: input.actor,
      actor_name: input.actorName ?? null,
      ref_tipo: 'casiterita_inter',
      ref_id: t.transf_id,
      ref_codigo: t.sku,
      detalle: `Devolución de ${DESTINO_EXTERNO_CASITERITA_LABEL}: la entrega falló y la casiterita vuelve al inventario · ${t.resumen ?? ''}`.trim(),
    });
  } catch (e) {
    await liberar(e instanceof Error ? e.message : 'No se pudo devolver al almacén');
    throw new Error(`No se pudo devolver la casiterita al inventario: ${e instanceof Error ? e.message : ''}`);
  }
}

/** Lista las transferencias de casiterita inter-sistema (este sistema). */
export async function listTransferenciasCasiterita(): Promise<TransferenciaCasiteritaInter[]> {
  const { data, error } = await supabase.from('transferencias_casiterita_inter').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TransferenciaCasiteritaInter[];
}
