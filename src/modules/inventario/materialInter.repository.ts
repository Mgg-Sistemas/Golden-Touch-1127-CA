/* ============================================================
   Golden Touch · Inventario · Puente de MATERIAL a MGG (10/11/2026)
   Pedido de la administradora: «se necesita hacer un puente entre el
   almacén Los Pinos y MGG almacén Los Pinos … tengo productos en GT que
   necesito en MGG Los Pinos».

   1) Los renglones SALEN del Almacén Los Pinos de GT («General»): una
      salida tipo transferencia por producto (ref_tipo 'material_inter',
      ref_id = transf_id). Viaja lo que la base APLICÓ, no lo que se leyó.
   2) Se guarda la transferencia SALIENTE y se empuja a MGG (transfer-enviar
      → transfer-recibir, recurso 'material'). En MGG queda «por confirmar»:
      el almacenista empareja cada producto (o lo crea) y al aceptar entra a
      su Almacén Los Pinos con el costo de GT (PMP).
   3) MGG responde por ACK: 'recibida' o 'rechazada' (con motivo). Si la
      rechaza, o si el envío falló, desde aquí se DEVUELVE al inventario.
   `transf_id` es el id global compartido → un reintento nunca duplica.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { TransferenciaMaterialInter, ItemMaterialInter } from '@/shared/lib/types';
import { registrarMovimiento } from './movimientos.repository';

const EMPRESA = (import.meta.env.VITE_EMPRESA_CODIGO as string | undefined)?.trim() || 'golden-touch';
/** Almacén Los Pinos de GT (el General es Los Pinos). */
export const ALMACEN_ORIGEN_MATERIAL = 'General';
export const DESTINO_MATERIAL_LABEL = 'MGG · Almacén Los Pinos (otro sistema)';
const TABLA = 'transferencias_material_inter';

const r4 = (n: number) => Math.round((Number(n) || 0) * 10000) / 10000;
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const cantTxt = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 4 });

/** Lo que hay en Los Pinos de GT para elegir (con stock y costo de ese almacén). */
export interface ProductoParaMgg {
  id: string; sku: string; nombre: string; unidad: string; categoria: string | null;
  stock: number; costo: number;
}

export async function listProductosParaMgg(): Promise<ProductoParaMgg[]> {
  const { data: ex, error } = await supabase.from('existencias')
    .select('producto_id, stock, costo_promedio')
    .eq('almacen', ALMACEN_ORIGEN_MATERIAL).gt('stock', 0);
  if (error) throw error;
  const filas = (ex ?? []) as Array<{ producto_id: string; stock: number; costo_promedio: number | null }>;
  if (!filas.length) return [];
  const ids = filas.map((f) => f.producto_id);
  const productos: Array<{ id: string; sku: string; nombre: string; unidad: string | null; categoria: string | null; precio: number | null; estado: string | null }> = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error: pErr } = await supabase.from('productos')
      .select('id, sku, nombre, unidad, categoria, precio, estado').in('id', ids.slice(i, i + 200));
    if (pErr) throw pErr;
    productos.push(...((data ?? []) as typeof productos));
  }
  const porId = new Map(productos.map((p) => [p.id, p]));
  return filas
    .map((f) => {
      const p = porId.get(f.producto_id);
      if (!p || (p.estado && p.estado !== 'activo')) return null;
      const costo = Number(f.costo_promedio) > 0 ? Number(f.costo_promedio) : Number(p.precio) || 0;
      return {
        id: p.id, sku: p.sku, nombre: p.nombre, unidad: p.unidad || 'UND', categoria: p.categoria,
        stock: Number(f.stock) || 0, costo: r4(costo),
      };
    })
    .filter((x): x is ProductoParaMgg => !!x)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Validación de los renglones antes de enviar (pura: se prueba sin base). */
export function errorRenglonesMaterial(renglones: Array<{ producto: ProductoParaMgg; cantidad: number }>): string | null {
  if (!renglones.length) return 'Agrega al menos un producto.';
  const vistos = new Set<string>();
  for (const r of renglones) {
    if (vistos.has(r.producto.id)) return `«${r.producto.nombre}» está repetido.`;
    vistos.add(r.producto.id);
    if (!(r.cantidad > 0)) return `Escribe cuánto de «${r.producto.nombre}» se envía.`;
    if (r.cantidad > r.producto.stock + 1e-9) {
      return `De «${r.producto.nombre}» solo hay ${cantTxt(r.producto.stock)} ${r.producto.unidad} en Los Pinos.`;
    }
  }
  return null;
}

/** Resumen corto para la lista y el WhatsApp. */
export function resumenMaterial(items: Pick<ItemMaterialInter, 'nombre' | 'cantidad' | 'unidad'>[]): string {
  if (!items.length) return 'Sin productos';
  const primero = `${cantTxt(items[0].cantidad)} ${items[0].unidad ?? ''} ${items[0].nombre}`.replace(/\s+/g, ' ').trim();
  return items.length === 1 ? primero : `${primero} y ${items.length - 1} producto(s) más`;
}

async function empujar(transfId: string): Promise<void> {
  const { data: res, error } = await supabase.functions.invoke('transfer-enviar', {
    body: { tipo: 'transferencia', recurso: 'material', transf_id: transfId },
  });
  if (error) throw error;
  const r = res as { entregada?: boolean; error?: string } | null;
  if (!r?.entregada) throw new Error(r?.error || 'MGG no confirmó que la recibió.');
}

/** Devuelve al Almacén Los Pinos lo que ya había salido (envío cortado, fallido o rechazado). */
async function devolver(items: ItemMaterialInter[], transfId: string, motivo: string, actor: string, actorName: string | null): Promise<string[]> {
  const fallaron: string[] = [];
  for (const it of items) {
    if (!it.producto_id || !(it.cantidad > 0)) continue;
    try {
      await registrarMovimiento({
        producto_id: it.producto_id, tipo: 'transferencia', delta: it.cantidad, almacen: ALMACEN_ORIGEN_MATERIAL,
        actor, actor_name: actorName, ref_tipo: 'material_inter', ref_id: transfId, ref_codigo: it.sku,
        detalle: `Devolución de ${cantTxt(it.cantidad)} ${it.unidad ?? ''} a Los Pinos · ${motivo}`,
      });
    } catch (e) {
      fallaron.push(`${it.nombre} (${e instanceof Error ? e.message : 'error'})`);
    }
  }
  return fallaron;
}

/**
 * Envía productos del Almacén Los Pinos de GT al Almacén Los Pinos de MGG.
 * Devuelve la transferencia guardada. Si MGG no se pudo contactar, la mercancía ya
 * salió y la transferencia queda en 'error' para reintentar o devolver.
 */
export async function enviarMaterialAMgg(input: {
  renglones: Array<{ producto: ProductoParaMgg; cantidad: number }>;
  nota?: string | null;
  actor: string;
  actorName?: string | null;
}): Promise<{ transferencia: TransferenciaMaterialInter; entregada: boolean; error: string | null }> {
  const mal = errorRenglonesMaterial(input.renglones);
  if (mal) throw new Error(mal);
  const transfId = crypto.randomUUID();
  const actorName = input.actorName ?? null;
  const nota = (input.nota ?? '').trim();
  const motivo = `→ ${DESTINO_MATERIAL_LABEL}${nota ? ` · ${nota}` : ''}`;

  // 1) Salen de Los Pinos. Se guarda lo que la RPC aplicó de verdad.
  const aplicados: ItemMaterialInter[] = [];
  try {
    for (const r of input.renglones) {
      const mov = await registrarMovimiento({
        producto_id: r.producto.id, tipo: 'transferencia', delta: -r4(r.cantidad), almacen: ALMACEN_ORIGEN_MATERIAL,
        actor: input.actor, actor_name: actorName, ref_tipo: 'material_inter', ref_id: transfId, ref_codigo: r.producto.sku,
        destino: DESTINO_MATERIAL_LABEL,
        detalle: `${cantTxt(r.cantidad)} ${r.producto.unidad} a MGG Los Pinos · ${motivo}`,
      });
      const salieron = r4(Number(mov.stock_antes) - Number(mov.stock_despues));
      if (salieron > 0) {
        aplicados.push({
          producto_id: r.producto.id, sku: r.producto.sku, nombre: r.producto.nombre, unidad: r.producto.unidad,
          categoria: r.producto.categoria, cantidad: salieron, costo_unitario: r.producto.costo,
        });
      }
    }
  } catch (e) {
    const noDevueltos = await devolver(aplicados, transfId, 'el envío a MGG se cortó antes de salir', input.actor, actorName);
    const base = e instanceof Error ? e.message : 'No se pudo completar el envío';
    if (noDevueltos.length) throw new Error(`${base} · ADEMÁS no se pudo devolver a Los Pinos: ${noDevueltos.join('; ')}. Revisa el kardex.`);
    throw e;
  }
  if (!aplicados.length) throw new Error('No salió nada del inventario, así que no hay nada que enviar.');

  // 2) La transferencia saliente.
  const total = r2(aplicados.reduce((a, it) => a + it.cantidad * (Number(it.costo_unitario) || 0), 0));
  const { data: row, error: insErr } = await supabase.from(TABLA).insert({
    transf_id: transfId, direccion: 'saliente', estado: 'enviada',
    empresa_origen: EMPRESA, empresa_destino: 'mgg',
    almacen_origen: 'Almacén Los Pinos (GT)', almacen_destino: 'Los Pinos',
    items: aplicados, total_usd: total, resumen: resumenMaterial(aplicados), motivo: nota || null,
    actor: input.actor, actor_name: actorName,
  }).select('*').single();
  if (insErr) {
    const noDevueltos = await devolver(aplicados, transfId, 'no se pudo registrar el envío', input.actor, actorName);
    throw new Error(`No se pudo registrar el envío: ${insErr.message}${noDevueltos.length ? ` · ADEMÁS no se devolvió: ${noDevueltos.join('; ')}` : ' (la mercancía volvió a Los Pinos)'}`);
  }
  const t = row as TransferenciaMaterialInter;

  // 3) A MGG: queda «por confirmar» allá (sigue 'enviada' aquí hasta el ACK).
  try {
    await empujar(transfId);
    return { transferencia: t, entregada: true, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'No se pudo entregar';
    await supabase.from(TABLA).update({ estado: 'error', mensaje_error: msg }).eq('id', t.id);
    return { transferencia: { ...t, estado: 'error', mensaje_error: msg }, entregada: false, error: msg };
  }
}

/** Reintenta una que quedó en 'error' (idempotente: MGG deduplica por transf_id). */
export async function reintentarMaterial(id: string): Promise<void> {
  const { data, error } = await supabase.from(TABLA).update({ estado: 'enviada', mensaje_error: null })
    .eq('id', id).eq('estado', 'error').select('transf_id');
  if (error) throw error;
  const t = (data ?? [])[0] as { transf_id: string } | undefined;
  if (!t) throw new Error('Ese envío ya no está en error: alguien lo reintentó o lo devolvió.');
  try {
    await empujar(t.transf_id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'No se pudo entregar';
    await supabase.from(TABLA).update({ estado: 'error', mensaje_error: msg }).eq('id', id);
    throw new Error(`Sigue sin llegar a MGG: ${msg}`);
  }
}

/**
 * Devuelve la mercancía a Los Pinos de GT. Solo para un envío RECHAZADO por MGG o en
 * ERROR. ⚠ En 'error', primero reintentar: si MGG sí la había recibido, devolverla la
 * duplicaría entre los dos sistemas.
 */
export async function devolverMaterial(input: { id: string; actor: string; actorName?: string | null }): Promise<void> {
  const { data, error } = await supabase.from(TABLA)
    .update({ estado: 'devuelta', devuelta_at: new Date().toISOString(), devuelta_por: input.actorName || input.actor })
    .eq('id', input.id).in('estado', ['error', 'rechazada']).select('*');
  if (error) throw error;
  const t = (data ?? [])[0] as TransferenciaMaterialInter | undefined;
  if (!t) throw new Error('Ese envío ya no se puede devolver (alguien lo devolvió o MGG lo recibió).');
  const items = (t.items ?? []) as ItemMaterialInter[];
  const fallaron = await devolver(items, t.transf_id,
    t.rechazo_motivo ? `MGG lo rechazó: ${t.rechazo_motivo}` : 'el envío a MGG no llegó', input.actor, input.actorName ?? null);
  if (fallaron.length) {
    await supabase.from(TABLA).update({ mensaje_error: `Devuelta a medias, falta: ${fallaron.join('; ')}` }).eq('id', t.id);
    throw new Error(`Se devolvió a medias. Falta: ${fallaron.join('; ')}. Revisa el kardex.`);
  }
}

export async function listTransferenciasMaterial(): Promise<TransferenciaMaterialInter[]> {
  const { data, error } = await supabase.from(TABLA).select('*').order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []) as TransferenciaMaterialInter[];
}

/** WhatsApp del envío (para copiar o mandar con el botón). */
export function mensajeEnvioMaterial(t: Pick<TransferenciaMaterialInter, 'items' | 'total_usd' | 'motivo' | 'created_at'>, quien: string): string {
  const items = (t.items ?? []) as ItemMaterialInter[];
  const lineas = items.map((i) => `• ${cantTxt(i.cantidad)} ${i.unidad ?? ''} ${i.nombre}`.replace(/\s+/g, ' '));
  return [
    '📦 *ENVÍO DE MATERIAL A MGG LOS PINOS*',
    '',
    `🏬 *De:* Almacén Los Pinos (Golden Touch)`,
    `🏬 *Para:* Almacén Los Pinos (MGG) · por confirmar allá`,
    ...lineas,
    t.total_usd != null ? `💵 *Valor:* $ ${Number(t.total_usd).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '',
    t.motivo ? `📝 *Nota:* ${t.motivo}` : '',
    `👤 *Envió:* ${quien}`,
    '🏢 *GOLDEN TOUCH 1127 C.A.*',
  ].filter(Boolean).join('\n');
}
