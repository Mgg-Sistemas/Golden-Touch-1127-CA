/* ============================================================
   Golden Touch · Centro de Acopio · CONTRATOS de producción
   Correlativo "Producción GT-01", -02, … con fecha + hora automáticas
   y lugar de extracción tomado de un catálogo editable.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { registrarMovimiento } from '@/modules/inventario/movimientos.repository';
import { tasaActualAcopio } from '@/modules/acopio/caja.repository';
import type { CatalogoAcopio, ContratoAcopio, TipoCatalogoAcopio } from '@/shared/lib/types';

/** Producto del inventario al que entra la casiterita de los contratos (al cerrar). */
export const CASITERITA_SKU = 'CASITERITA';
export const CASITERITA_ALMACEN = 'PRODUCCION';

/** Resuelve (creándolo si falta) el producto 'Casiterita' destino del stock. */
async function casiteritaProductoId(): Promise<string> {
  const { data } = await supabase.from('productos').select('id').eq('sku', CASITERITA_SKU).maybeSingle();
  if ((data as { id?: string } | null)?.id) return (data as { id: string }).id;
  const { data: nuevo, error } = await supabase
    .from('productos')
    .insert({ sku: CASITERITA_SKU, nombre: 'Casiterita', categoria: 'Mineral', unidad: 'Kg', almacen: CASITERITA_ALMACEN, tipo: 'final', estado: 'activo' })
    .select('id')
    .single();
  if (error) throw error;
  return (nuevo as { id: string }).id;
}

/** Prefijo del correlativo de contratos. */
export const CONTRATO_PREFIJO = 'Producción GT';
/**
 * Correlativo MÍNIMO desde el que arrancan los contratos en el sistema.
 * Los contratos #1–#45 ya existían hechos a mano (cargados en la caja como
 * movimientos), así que el primero creado en el sistema debe ser el #46 para
 * continuar la secuencia real sin pisarla.
 */
export const SEQ_INICIAL_CONTRATO = 46;
/** Formatea el correlativo: 1 → "Producción GT-01". */
export const numeroContrato = (seq: number) => `${CONTRATO_PREFIJO}-${String(seq).padStart(2, '0')}`;

/** Hora actual del sistema (zona Venezuela) en formato «8:02:00 AM». */
export function horaSistema(): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Caracas', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  }).format(new Date());
}

/* ───────────── Contratos ───────────── */

export async function listContratos(): Promise<ContratoAcopio[]> {
  const { data, error } = await supabase
    .from('acopio_contratos')
    .select('*')
    .order('seq', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ContratoAcopio[];
}

/** Próximo correlativo disponible (máximo seq + 1, con piso en SEQ_INICIAL_CONTRATO). */
export async function nextSeqContrato(): Promise<number> {
  const { data, error } = await supabase
    .from('acopio_contratos')
    .select('seq')
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const siguiente = ((data as { seq?: number } | null)?.seq ?? 0) + 1;
  // Hasta que se cree el primero, el piso garantiza arrancar en #46 (secuencia real).
  return Math.max(siguiente, SEQ_INICIAL_CONTRATO);
}

/** Datos editables de un contrato (los inputs; las fórmulas las calcula la BD). */
export interface ContratoInput {
  supervisor?: string | null;
  lugarExtraccion: string;
  molino?: string | null;
  tonProcesadas?: number;
  kgHumedo?: number;
  kgSecos?: number;
  kgSecoLimpio?: number;
  observaciones?: string | null;
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function payloadContrato(input: ContratoInput): Record<string, unknown> {
  return {
    supervisor: input.supervisor?.trim() || null,
    lugar_extraccion: input.lugarExtraccion.trim(),
    molino: input.molino?.trim() || null,
    ton_procesadas: n(input.tonProcesadas),
    kg_humedo: n(input.kgHumedo),
    kg_secos: n(input.kgSecos),
    kg_seco_limpio: n(input.kgSecoLimpio),
    observaciones: input.observaciones?.trim() || null,
  };
}

/**
 * Calcula las mismas fórmulas del Excel en el front (para el preview en vivo).
 * Idéntico a las columnas generadas de la BD.
 */
export function formulasContrato(i: { tonProcesadas?: number; kgHumedo?: number; kgSecos?: number; kgSecoLimpio?: number }) {
  const ton = n(i.tonProcesadas), hum = n(i.kgHumedo), sec = n(i.kgSecos), lim = n(i.kgSecoLimpio);
  const div = (a: number, b: number) => (b === 0 ? null : a / b);
  return {
    tolva: ton / 1.2,
    pctRecuperadoImpurezas: div(hum, ton * 1000),
    pctHumedad: hum === 0 ? null : sec / hum - 1,
    pctRecuperacionCasiterita: div(lim, ton * 1000),
    kgHierro: lim - sec,
    pctHierro: div(lim - sec, sec),
  };
}

export async function crearContrato(input: ContratoInput & { actor: string; actorName?: string | null }): Promise<ContratoAcopio> {
  const lugar = (input.lugarExtraccion || '').trim();
  if (!lugar) throw new Error('Indicá el lugar de extracción.');

  // Guardamos lugar y supervisor en el catálogo si son nuevos (upsert idempotente).
  await addCatalogoAcopio('lugar_extraccion', lugar).catch(() => { /* ya existe: ok */ });
  if (input.supervisor?.trim()) await addCatalogoAcopio('supervisor', input.supervisor).catch(() => {});

  // Correlativo + reintento ante colisión (alta concurrente).
  for (let intento = 0; intento < 5; intento++) {
    const seq = await nextSeqContrato();
    const { data, error } = await supabase
      .from('acopio_contratos')
      .insert({
        numero: numeroContrato(seq),
        seq,
        fecha: new Date().toISOString().slice(0, 10),
        hora: horaSistema(),
        ...payloadContrato(input),
        created_by: input.actor,
        actor_name: input.actorName ?? null,
      })
      .select('*')
      .single();
    if (!error) return data as ContratoAcopio;
    if ((error as { code?: string }).code !== '23505') throw error;
    // 23505 = correlativo tomado por otro usuario: reintentamos con el siguiente.
  }
  throw new Error('No se pudo asignar el número de contrato. Intentá de nuevo.');
}

/** Etiqueta de la observación del contrato que refleja el peso de mesa. */
const ETIQUETA_MESA = 'Material de Mesa:';

/**
 * Inserta/actualiza la línea «Material de Mesa: X» dentro de una observación,
 * conservando el resto del texto. Si el peso es null, deja la etiqueta vacía.
 */
export function aplicarMaterialDeMesa(obs: string | null | undefined, pesoMojado: number | null): string {
  const valorTxt = pesoMojado == null ? '' : ` ${pesoMojado} KG SECO`;
  const linea = `${ETIQUETA_MESA}${valorTxt}`;
  const actual = obs ?? '';
  const re = /^Material de Mesa:.*$/m;
  if (re.test(actual)) return actual.replace(re, linea);
  return actual.trim() ? `${linea}\n${actual}` : linea;
}

/**
 * KG MESAS · guarda los pesos manuales (mojado/seco) de un contrato. La BD
 * recalcula sola la Merma (= seco − mojado) y el % de merma (columnas generadas).
 * Además refleja el «Pesos Mojado» en la observación del contrato como
 * «Material de Mesa: X» (conservando el resto del texto). `null` lo deja vacío.
 */
export async function setMesaContrato(id: string, pesoMojado: number | null, pesoSeco: number | null): Promise<void> {
  const norm = (v: number | null) => (v == null || !Number.isFinite(v) ? null : v);
  const pm = norm(pesoMojado), ps = norm(pesoSeco);
  // Traemos la observación actual para actualizar SOLO la línea «Material de Mesa:».
  const { data } = await supabase.from('acopio_contratos').select('observaciones').eq('id', id).maybeSingle();
  const nuevaObs = aplicarMaterialDeMesa((data as { observaciones?: string | null } | null)?.observaciones, pm);
  const { error } = await supabase
    .from('acopio_contratos')
    .update({ mesa_peso_mojado: pm, mesa_peso_seco: ps, observaciones: nuevaObs })
    .eq('id', id);
  if (error) throw error;
}

export async function actualizarContrato(id: string, input: ContratoInput): Promise<void> {
  const lugar = (input.lugarExtraccion || '').trim();
  if (!lugar) throw new Error('Indicá el lugar de extracción.');
  await addCatalogoAcopio('lugar_extraccion', lugar).catch(() => { /* ya existe: ok */ });
  if (input.supervisor?.trim()) await addCatalogoAcopio('supervisor', input.supervisor).catch(() => {});
  const payload = payloadContrato(input);
  // Conservar siempre el «Material de Mesa: X» en la observación según el Pesos Mojado
  // cargado en KG Mesas, para que editar/guardar el contrato no lo pise.
  const { data } = await supabase.from('acopio_contratos').select('mesa_peso_mojado').eq('id', id).maybeSingle();
  const mesa = (data as { mesa_peso_mojado?: number | null } | null)?.mesa_peso_mojado ?? null;
  payload.observaciones = aplicarMaterialDeMesa(payload.observaciones as string | null, mesa);
  const { error } = await supabase.from('acopio_contratos').update(payload).eq('id', id);
  if (error) throw error;
}

type ContratoMov = { numero: string; estado: string; kg_seco_limpio: number | null; mov_id: string | null; mov_producto_id: string | null; mov_almacen: string | null; mov_cantidad: number | null };

/** Revierte del inventario la casiterita que el contrato había sumado (salida). */
async function revertirEntradaCasiterita(c: ContratoMov, actor: string, actorName: string | null, refTipo: string): Promise<void> {
  const cant = Number(c.mov_cantidad) || 0;
  if (c.mov_id && c.mov_producto_id && c.mov_almacen && cant > 0) {
    await registrarMovimiento({
      producto_id: c.mov_producto_id, tipo: 'salida', delta: -cant, almacen: c.mov_almacen,
      actor, actor_name: actorName, ref_tipo: refTipo, ref_id: '', ref_codigo: c.numero,
      detalle: `Contrato ${c.numero} · revierte Casiterita`,
    });
  }
}

/**
 * CIERRA el contrato y sincroniza el inventario: la casiterita (kg_seco_limpio)
 * entra como stock del producto 'Casiterita' en PRODUCCION. Guarda la traza
 * para poder revertir al reabrir/eliminar. Idempotente (si ya está cerrado, no hace nada).
 */
export async function cerrarContrato(id: string, actor: string, actorName?: string | null): Promise<void> {
  const { data, error } = await supabase
    .from('acopio_contratos')
    .select('numero, estado, kg_seco_limpio, mov_id, mov_producto_id, mov_almacen, mov_cantidad, mesa_peso_mojado, observaciones')
    .eq('id', id).single();
  if (error) throw error;
  const c = data as ContratoMov & { mesa_peso_mojado: number | null; observaciones: string | null };
  if (c.estado === 'cerrado') return;

  // Al cerrar, volcamos el «Pesos Mojado» (cargado en KG Mesas) a la observación
  // del contrato como «Material de Mesa: X», conservando el resto del texto.
  const obsConMesa = aplicarMaterialDeMesa(c.observaciones, c.mesa_peso_mojado ?? null);

  const cantidad = Number(c.kg_seco_limpio) || 0;
  let movId: string | null = null, movProductoId: string | null = null, movAlmacen: string | null = null;
  if (cantidad > 0) {
    movProductoId = await casiteritaProductoId();
    movAlmacen = CASITERITA_ALMACEN;
    // El costo de la casiterita que entra es la TASA del material en acopio
    // (Facturado + Gastos + Nóminas) ÷ Kg cerrados. Así el movimiento (y su PMP)
    // queda valorizado a la tasa vigente de acopio.
    const tasa = await tasaActualAcopio().catch(() => 0);
    const mov = await registrarMovimiento({
      producto_id: movProductoId, tipo: 'entrada', delta: cantidad, almacen: movAlmacen,
      actor, actor_name: actorName ?? null,
      ref_tipo: 'contrato_produccion', ref_id: id, ref_codigo: c.numero,
      detalle: `Contrato ${c.numero} · Casiterita · tasa acopio ${tasa.toFixed(2)} $/Kg`,
      precio_unitario: tasa > 0 ? tasa : undefined,
    });
    movId = mov.id;
  }
  const { error: uErr } = await supabase.from('acopio_contratos').update({
    estado: 'cerrado', cerrado_at: new Date().toISOString(), cerrado_por: actor,
    mov_id: movId, mov_producto_id: movProductoId, mov_almacen: movAlmacen, mov_cantidad: cantidad,
    observaciones: obsConMesa,
  }).eq('id', id);
  if (uErr) throw uErr;
}

/** REABRE el contrato: revierte la entrada de casiterita del inventario y vuelve a 'activo'. */
export async function reabrirContrato(id: string, actor: string, actorName?: string | null): Promise<void> {
  const { data, error } = await supabase
    .from('acopio_contratos')
    .select('numero, estado, kg_seco_limpio, mov_id, mov_producto_id, mov_almacen, mov_cantidad')
    .eq('id', id).single();
  if (error) throw error;
  const c = data as ContratoMov;
  if (c.estado === 'activo') return;
  await revertirEntradaCasiterita(c, actor, actorName ?? null, 'contrato_produccion_reapertura');
  const { error: uErr } = await supabase.from('acopio_contratos').update({
    estado: 'activo', cerrado_at: null, cerrado_por: null,
    mov_id: null, mov_producto_id: null, mov_almacen: null, mov_cantidad: null,
  }).eq('id', id);
  if (uErr) throw uErr;
}

export async function eliminarContrato(id: string, actor = 'sistema', actorName: string | null = null): Promise<void> {
  // Si estaba cerrado, revertimos primero la casiterita que había sumado al inventario.
  const { data } = await supabase
    .from('acopio_contratos')
    .select('numero, estado, kg_seco_limpio, mov_id, mov_producto_id, mov_almacen, mov_cantidad')
    .eq('id', id).maybeSingle();
  if (data) await revertirEntradaCasiterita(data as ContratoMov, actor, actorName, 'contrato_produccion_eliminacion').catch(() => {});
  const { error } = await supabase.from('acopio_contratos').delete().eq('id', id);
  if (error) throw error;
}

/** Resumen para las tarjetas de Producción: contratos activos + KG de Casiterita. */
export interface ResumenContratos {
  activos: number;
  totalContratos: number;
  kgCasiterita: number;
  kgCasiteritaActivos: number;
}

export async function resumenContratos(): Promise<ResumenContratos> {
  const { data, error } = await supabase
    .from('acopio_contratos')
    .select('estado, kg_seco_limpio');
  if (error) throw error;
  const rows = (data ?? []) as Array<{ estado: string; kg_seco_limpio: number | null }>;
  return rows.reduce<ResumenContratos>((a, r) => {
    const kg = Number(r.kg_seco_limpio) || 0; // Casiterita = Kg seco, limpio
    a.totalContratos += 1;
    a.kgCasiterita += kg;
    if (r.estado === 'activo') { a.activos += 1; a.kgCasiteritaActivos += kg; }
    return a;
  }, { activos: 0, totalContratos: 0, kgCasiterita: 0, kgCasiteritaActivos: 0 });
}

/* ───────────── Catálogo del acopio (lugares de extracción, …) ───────────── */

export async function listCatalogosAcopio(tipo?: TipoCatalogoAcopio): Promise<CatalogoAcopio[]> {
  let q = supabase.from('acopio_catalogos').select('*')
    .order('orden', { ascending: true })
    .order('valor', { ascending: true });
  if (tipo) q = q.eq('tipo', tipo);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CatalogoAcopio[];
}

export async function addCatalogoAcopio(tipo: TipoCatalogoAcopio, valor: string): Promise<CatalogoAcopio> {
  const v = valor.trim();
  if (!v) throw new Error('Indicá el valor.');
  const { data, error } = await supabase
    .from('acopio_catalogos')
    .insert({ tipo, valor: v, orden: 999 })
    .select('*')
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Ese valor ya existe en el catálogo.');
    throw error;
  }
  return data as CatalogoAcopio;
}

export async function updateCatalogoAcopio(id: string, valor: string): Promise<void> {
  const v = valor.trim();
  if (!v) throw new Error('Indicá el valor.');
  const { error } = await supabase.from('acopio_catalogos').update({ valor: v }).eq('id', id);
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Ese valor ya existe en el catálogo.');
    throw error;
  }
}

export async function setCatalogoAcopioActivo(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from('acopio_catalogos').update({ activo }).eq('id', id);
  if (error) throw error;
}

export async function eliminarCatalogoAcopio(id: string): Promise<void> {
  const { error } = await supabase.from('acopio_catalogos').delete().eq('id', id);
  if (error) throw error;
}
