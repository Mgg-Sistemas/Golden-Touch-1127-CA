/* ============================================================
   Golden Touch · Salidas / Traslados · Tesorería (Supabase)
   Cajas con saldo (USD/Bs) y su libro de movimientos. La salida
   de dinero es un anticipo que queda PENDIENTE y luego se concilia
   con la recepción de mineral equivalente (entra al inventario).
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { Caja, MovimientoCaja, Moneda, MonedaCaja } from '@/shared/lib/types';
import { registrarMovimiento } from '@/modules/inventario/movimientos.repository';
import { createProducto, findBySku } from '@/modules/inventario/inventario.repository';

const TABLE = 'cajas';
const LIBRO = 'movimientos_caja';

function round2(n: number): number { return Math.round(n * 100) / 100; }

/* ───────────── Cajas (CRUD) ───────────── */

export async function listCajas(): Promise<Caja[]> {
  const { data, error } = await supabase.from(TABLE).select('*').order('nombre', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Caja[];
}

export async function listCajasActivas(): Promise<Caja[]> {
  // Excluye los centros de acopio (son destino de traslado, no cajas para pagar/ingresar).
  // Incluye las de tipo NULL (datos viejos): `.neq` por sí solo descarta los NULL
  // (NULL <> 'centro_acopio' = NULL), lo que dejaría esas cajas invisibles.
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('estado', 'activo')
    .or('tipo.is.null,tipo.neq.centro_acopio')
    .order('nombre', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Caja[];
}

/** Centros de acopio activos (manejan saldo propio; destino del traslado de dinero). */
export async function listCentrosAcopio(): Promise<Caja[]> {
  const { data, error } = await supabase.from(TABLE).select('*').eq('estado', 'activo').eq('tipo', 'centro_acopio').order('nombre', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Caja[];
}

export async function crearCaja(input: { nombre: string; moneda: Moneda | MonedaCaja; saldoInicial?: number }, actorEmail?: string): Promise<Caja> {
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error('El nombre de la caja es obligatorio');
  const saldo = round2(Number(input.saldoInicial) || 0);
  const { data, error } = await supabase
    .from(TABLE)
    // tipo: 'caja' explícito — listCajasActivas filtra con `tipo <> 'centro_acopio'`,
    // y un tipo NULL no satisface ese filtro (NULL <> 'x' = NULL), por lo que la caja
    // quedaría invisible en Tesorería. Siempre la marcamos como caja normal.
    .insert({ nombre, moneda: input.moneda, saldo, tipo: 'caja', created_by: actorEmail ?? null })
    .select('*')
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Ya existe una caja con ese nombre y moneda');
    throw error;
  }
  return data as Caja;
}

export async function renombrarCaja(id: string, nombre: string): Promise<Caja> {
  const limpio = nombre.trim();
  if (!limpio) throw new Error('El nombre no puede estar vacío');
  const { data, error } = await supabase
    .from(TABLE)
    .update({ nombre: limpio, updated_at: new Date().toISOString() })
    .eq('id', id).select('*').single();
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Ya existe una caja con ese nombre y moneda');
    throw error;
  }
  return data as Caja;
}

export async function deshabilitarCaja(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).update({ estado: 'inactivo', updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function habilitarCaja(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).update({ estado: 'activo', updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

/** Lee una caja (saldo actual). */
async function getCaja(id: string): Promise<Caja> {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Caja no encontrada');
  return data as Caja;
}

/** Ajuste manual del saldo (deja registro en el libro). */
export async function ajustarSaldo(id: string, nuevoSaldo: number, motivo: string, actor: string, actorName?: string | null): Promise<void> {
  const caja = await getCaja(id);
  const saldoAntes = Number(caja.saldo) || 0;
  const saldoDespues = round2(Number(nuevoSaldo) || 0);
  const delta = round2(saldoDespues - saldoAntes);
  await supabase.from(LIBRO).insert({
    caja_id: id, tipo: 'ajuste', monto: Math.abs(delta), moneda: caja.moneda,
    saldo_antes: saldoAntes, saldo_despues: saldoDespues,
    motivo: motivo || 'Ajuste de saldo', actor, actor_name: actorName ?? null,
  });
  const { error } = await supabase.from(TABLE).update({ saldo: saldoDespues, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

/* ───────────── Ingreso de dinero (entrada · suma al saldo) ───────────── */

/**
 * Ingresa dinero a una caja: SUMA el monto al saldo actual (no lo fija).
 * Ej.: caja con 100 + ingreso de 100 = 200. Queda como movimiento 'ingreso'.
 */
export async function ingresarDinero(
  id: string, monto: number, motivo: string, actor: string, actorName?: string | null,
): Promise<void> {
  const m = round2(Number(monto) || 0);
  if (m <= 0) throw new Error('El monto a ingresar debe ser mayor que 0.');
  const caja = await getCaja(id);
  const saldoAntes = Number(caja.saldo) || 0;
  const saldoDespues = round2(saldoAntes + m);
  await supabase.from(LIBRO).insert({
    caja_id: id, tipo: 'ingreso', monto: m, moneda: caja.moneda,
    saldo_antes: saldoAntes, saldo_despues: saldoDespues,
    motivo: motivo || 'Ingreso de dinero', actor, actor_name: actorName ?? null,
  });
  const { error } = await supabase.from(TABLE).update({ saldo: saldoDespues, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

/* ───────────── Egreso simple sincronizado con el saldo VISIBLE de la caja ─────────────
   Descuenta el `cajas.saldo` (el saldo que se ve en el selector de caja y en el módulo
   de Cajas) y, si la caja además lleva un saldo multimoneda (caja_saldos) en su moneda,
   lo espeja para que ambos queden alineados. Se usa en Compra Directa: el gasto SIEMPRE
   debe reflejarse en el saldo de la caja de la que sale el dinero. */
export async function egresarGastoCaja(input: {
  cajaId: string; monto: number; concepto: string; categoria?: string;
  gastoCategoria?: string | null; gastoSubcategoria?: string | null;
  actor: string; actorName?: string | null;
}): Promise<MovimientoCaja> {
  const monto = round2(Number(input.monto) || 0);
  if (monto <= 0) throw new Error('El monto debe ser mayor que 0.');
  if (!input.concepto.trim()) throw new Error('Indicá el concepto del gasto.');
  const caja = await getCaja(input.cajaId);
  const saldoAntes = Number(caja.saldo) || 0;
  if (monto > saldoAntes)
    throw new Error(`Saldo insuficiente en ${caja.nombre}. Disponible: ${saldoAntes} ${caja.moneda}.`);
  const saldoDespues = round2(saldoAntes - monto);

  const { data, error } = await supabase.from(LIBRO).insert({
    caja_id: input.cajaId, tipo: 'salida', monto, moneda: caja.moneda,
    saldo_antes: saldoAntes, saldo_despues: saldoDespues,
    motivo: input.concepto.trim(), categoria: input.categoria ?? 'gasto',
    gasto_categoria: input.gastoCategoria?.trim() || null,
    gasto_subcategoria: input.gastoSubcategoria?.trim() || null,
    actor: input.actor, actor_name: input.actorName ?? null,
  }).select('*').single();
  if (error) throw error;

  const { error: uErr } = await supabase.from(TABLE).update({ saldo: saldoDespues, updated_at: new Date().toISOString() }).eq('id', input.cajaId);
  if (uErr) throw uErr;

  // Espejo opcional: si la caja lleva saldo multimoneda en su propia moneda (cuenta general),
  // se descuenta también para que el saldo visible y el multimoneda no se desincronicen.
  const { data: s } = await supabase.from('caja_saldos')
    .select('id, saldo').eq('caja_id', input.cajaId).eq('cuenta', 'general').eq('moneda', caja.moneda).maybeSingle();
  if (s) {
    await supabase.from('caja_saldos')
      .update({ saldo: round2((Number((s as { saldo: number }).saldo) || 0) - monto), updated_at: new Date().toISOString() })
      .eq('id', (s as { id: string }).id);
  }
  return data as MovimientoCaja;
}

/* ───────────── Ingreso de dinero sincronizado con el saldo VISIBLE de la caja ─────────────
   Inverso de `egresarGastoCaja`: SUMA al `cajas.saldo` (el que se ve en el selector y en
   Cajas) y, si la caja además lleva saldo multimoneda (caja_saldos) en su moneda, lo
   espeja. Devuelve el movimiento (para anclar, p. ej., una cuenta por pagar). */
export async function ingresarDineroCaja(input: {
  cajaId: string; monto: number; concepto: string; categoria?: string;
  actor: string; actorName?: string | null;
}): Promise<MovimientoCaja> {
  const monto = round2(Number(input.monto) || 0);
  if (monto <= 0) throw new Error('El monto debe ser mayor que 0.');
  if (!input.concepto.trim()) throw new Error('Indicá el concepto del ingreso.');
  const caja = await getCaja(input.cajaId);
  const saldoAntes = Number(caja.saldo) || 0;
  const saldoDespues = round2(saldoAntes + monto);

  const { data, error } = await supabase.from(LIBRO).insert({
    caja_id: input.cajaId, tipo: 'ingreso', monto, moneda: caja.moneda,
    saldo_antes: saldoAntes, saldo_despues: saldoDespues,
    motivo: input.concepto.trim(), categoria: input.categoria ?? 'ingreso',
    actor: input.actor, actor_name: input.actorName ?? null,
  }).select('*').single();
  if (error) throw error;

  const { error: uErr } = await supabase.from(TABLE).update({ saldo: saldoDespues, updated_at: new Date().toISOString() }).eq('id', input.cajaId);
  if (uErr) throw uErr;

  // Espejo opcional: si la caja lleva saldo multimoneda en su propia moneda (cuenta general),
  // se suma también para que el saldo visible y el multimoneda no se desincronicen.
  const { data: s } = await supabase.from('caja_saldos')
    .select('id, saldo').eq('caja_id', input.cajaId).eq('cuenta', 'general').eq('moneda', caja.moneda).maybeSingle();
  if (s) {
    await supabase.from('caja_saldos')
      .update({ saldo: round2((Number((s as { saldo: number }).saldo) || 0) + monto), updated_at: new Date().toISOString() })
      .eq('id', (s as { id: string }).id);
  }
  return data as MovimientoCaja;
}

/* ───────────── Editar / borrar movimientos MANUALES (gasto / ingreso / ajuste) ─────────────
   Solo movimientos sueltos cargados a mano. Los VINCULADOS (pago de OC, traslado entre
   cajas, conciliación de mineral, pago de compra/servicio directo, conversión, reverso)
   NO se editan acá: se anulan desde su módulo, para no descuadrar el otro lado/inventario.
   Al editar/borrar se SINCRONIZA el saldo de la caja (legacy o multimoneda). */

const CATEGORIAS_VINCULADAS = new Set(['pago_oc', 'traslado', 'conversion', 'compra_directa', 'servicio_directo', 'reverso', 'conciliacion']);

/** ¿Es un movimiento manual editable/borrable desde Tesorería? */
export function esMovimientoEditable(m: MovimientoCaja): boolean {
  if (!['salida', 'ingreso', 'ajuste'].includes(m.tipo)) return false;
  const r = m as unknown as Record<string, unknown>;
  if (r.ref_orden_id || r.ref_caja_id || r.estado_mineral || r.mineral_mov_id) return false;
  if (m.categoria && CATEGORIAS_VINCULADAS.has(m.categoria)) return false;
  return true;
}

/** Efecto del movimiento sobre el saldo (saldo_despues − saldo_antes). */
function efectoMov(m: MovimientoCaja): number {
  return round2(Number(m.saldo_despues) - Number(m.saldo_antes));
}

/** Suma `delta` al saldo de la caja del movimiento (legacy cajas.saldo + espejo, o multimoneda caja_saldos). */
async function aplicarDeltaSaldo(m: MovimientoCaja, delta: number): Promise<void> {
  if (!delta) return;
  const r = m as unknown as Record<string, unknown>;
  const cuenta = (r.cuenta as string | null) || null;
  if (cuenta) {
    // Multimoneda: ajusta caja_saldos (no toca la tasa promedio).
    const { data } = await supabase.from('caja_saldos')
      .select('id, saldo').eq('caja_id', m.caja_id).eq('cuenta', cuenta).eq('moneda', m.moneda).maybeSingle();
    const saldo = round2((Number((data as { saldo?: number } | null)?.saldo) || 0) + delta);
    if (data) await supabase.from('caja_saldos').update({ saldo, updated_at: new Date().toISOString() }).eq('id', (data as { id: string }).id);
    else await supabase.from('caja_saldos').upsert({ caja_id: m.caja_id, cuenta, moneda: m.moneda, saldo, updated_at: new Date().toISOString() }, { onConflict: 'caja_id,cuenta,moneda' });
    return;
  }
  // Legacy: ajusta cajas.saldo y espeja la cuenta general en su moneda si existe.
  const caja = await getCaja(m.caja_id);
  const saldo = round2((Number(caja.saldo) || 0) + delta);
  await supabase.from(TABLE).update({ saldo, updated_at: new Date().toISOString() }).eq('id', m.caja_id);
  const { data: s } = await supabase.from('caja_saldos')
    .select('id, saldo').eq('caja_id', m.caja_id).eq('cuenta', 'general').eq('moneda', caja.moneda).maybeSingle();
  if (s) await supabase.from('caja_saldos').update({ saldo: round2((Number((s as { saldo: number }).saldo) || 0) + delta), updated_at: new Date().toISOString() }).eq('id', (s as { id: string }).id);
}

/** Borra un movimiento manual y revierte su efecto en el saldo de la caja. */
export async function eliminarMovimientoCajaManual(m: MovimientoCaja): Promise<void> {
  if (!esMovimientoEditable(m))
    throw new Error('Este movimiento está vinculado (OC, traslado, conciliación, conversión o directo) y no se edita acá: anulalo desde su módulo.');
  await aplicarDeltaSaldo(m, -efectoMov(m));
  const { error } = await supabase.from(LIBRO).delete().eq('id', m.id);
  if (error) throw error;
}

export interface EditarMovimientoManualInput {
  mov: MovimientoCaja;
  /** Nuevo monto (para salida/ingreso). En 'ajuste' no cambia el efecto. */
  monto: number;
  motivo: string;
  gastoCategoria?: string | null;
  gastoSubcategoria?: string | null;
  /** Nueva fecha/hora ISO (opcional). */
  fecha?: string | null;
}

/** Edita un movimiento manual: si cambia el monto, ajusta el saldo por la diferencia (sincroniza). */
export async function editarMovimientoCajaManual(input: EditarMovimientoManualInput): Promise<void> {
  const m = input.mov;
  if (!esMovimientoEditable(m))
    throw new Error('Este movimiento está vinculado y no se edita acá: anulalo desde su módulo.');
  const montoNuevo = round2(Number(input.monto) || 0);
  if (m.tipo !== 'ajuste' && montoNuevo <= 0) throw new Error('El monto debe ser mayor que 0.');

  const efectoViejo = efectoMov(m);
  let efectoNuevo = efectoViejo;
  if (m.tipo === 'salida') efectoNuevo = -montoNuevo;
  else if (m.tipo === 'ingreso') efectoNuevo = montoNuevo;
  // 'ajuste': se mantiene el efecto original (no se recalcula por monto).

  const diff = round2(efectoNuevo - efectoViejo);
  if (diff !== 0) await aplicarDeltaSaldo(m, diff);

  const patch: Record<string, unknown> = {
    monto: m.tipo === 'ajuste' ? m.monto : montoNuevo,
    saldo_despues: round2(Number(m.saldo_antes) + efectoNuevo),
    motivo: input.motivo?.trim() || m.motivo,
    gasto_categoria: input.gastoCategoria?.trim() || null,
    gasto_subcategoria: input.gastoSubcategoria?.trim() || null,
  };
  if (input.fecha) patch.at = input.fecha;
  const { error } = await supabase.from(LIBRO).update(patch).eq('id', m.id);
  if (error) throw error;
}

/* ───────────── Salida de dinero (anticipo · queda pendiente) ───────────── */

export interface SalidaDineroInput {
  cajaId: string;
  destino: string;
  motivo: string;
  monto: number;
  actor: string;
  actorName?: string | null;
}

export async function salidaDinero(input: SalidaDineroInput): Promise<MovimientoCaja> {
  const monto = round2(Number(input.monto) || 0);
  if (monto <= 0) throw new Error('El monto debe ser mayor que 0.');
  const caja = await getCaja(input.cajaId);
  const saldoAntes = Number(caja.saldo) || 0;
  if (monto > saldoAntes) throw new Error(`Saldo insuficiente en ${caja.nombre}. Disponible: ${saldoAntes} ${caja.moneda}.`);
  const saldoDespues = round2(saldoAntes - monto);

  const { data, error } = await supabase.from(LIBRO).insert({
    caja_id: input.cajaId, tipo: 'salida', monto, moneda: caja.moneda,
    saldo_antes: saldoAntes, saldo_despues: saldoDespues,
    motivo: input.motivo || null, destino: input.destino || null,
    estado_mineral: 'pendiente',
    actor: input.actor, actor_name: input.actorName ?? null,
  }).select('*').single();
  if (error) throw error;

  const { error: uErr } = await supabase.from(TABLE).update({ saldo: saldoDespues, updated_at: new Date().toISOString() }).eq('id', input.cajaId);
  if (uErr) throw uErr;
  return data as MovimientoCaja;
}

/* ───────────── Traslado de dinero entre cajas (misma moneda) ───────────── */

export interface TrasladoDineroInput {
  origenId: string;
  destinoId: string;
  monto: number;
  motivo?: string | null;
  /** Texto de la nota de entrega (se imprime en el PDF cuando está marcada). */
  notaEntrega?: string | null;
  actor: string;
  actorName?: string | null;
}

export async function trasladoDinero(input: TrasladoDineroInput): Promise<MovimientoCaja> {
  const monto = round2(Number(input.monto) || 0);
  if (monto <= 0) throw new Error('El monto debe ser mayor que 0.');
  if (input.origenId === input.destinoId) throw new Error('La caja origen y destino deben ser distintas.');
  const [origen, destino] = await Promise.all([getCaja(input.origenId), getCaja(input.destinoId)]);
  if (origen.moneda !== destino.moneda) throw new Error('El traslado debe ser entre cajas de la misma moneda.');
  const saldoOrigenAntes = Number(origen.saldo) || 0;
  if (monto > saldoOrigenAntes) throw new Error(`Saldo insuficiente en ${origen.nombre}. Disponible: ${saldoOrigenAntes} ${origen.moneda}.`);
  const saldoOrigenDespues = round2(saldoOrigenAntes - monto);
  const saldoDestinoAntes = Number(destino.saldo) || 0;
  const saldoDestinoDespues = round2(saldoDestinoAntes + monto);

  const motivo = input.motivo?.trim() || null;
  const notaEntrega = input.notaEntrega?.trim() || null;
  const { data: movs, error: e1 } = await supabase.from(LIBRO).insert([
    {
      caja_id: input.origenId, tipo: 'traslado_salida', monto, moneda: origen.moneda,
      saldo_antes: saldoOrigenAntes, saldo_despues: saldoOrigenDespues,
      motivo, nota_entrega: notaEntrega, destino: destino.nombre, ref_caja_id: input.destinoId,
      actor: input.actor, actor_name: input.actorName ?? null,
    },
    {
      caja_id: input.destinoId, tipo: 'traslado_entrada', monto, moneda: destino.moneda,
      saldo_antes: saldoDestinoAntes, saldo_despues: saldoDestinoDespues,
      motivo, nota_entrega: notaEntrega, destino: origen.nombre, ref_caja_id: input.origenId,
      actor: input.actor, actor_name: input.actorName ?? null,
    },
  ]).select('*');
  if (e1) throw e1;

  const { error: e2 } = await supabase.from(TABLE).update({ saldo: saldoOrigenDespues, updated_at: new Date().toISOString() }).eq('id', input.origenId);
  if (e2) throw e2;
  const { error: e3 } = await supabase.from(TABLE).update({ saldo: saldoDestinoDespues, updated_at: new Date().toISOString() }).eq('id', input.destinoId);
  if (e3) throw e3;

  // Devuelve el lado salida (traslado_salida) para trazar la solicitud.
  const ladoSalida = (movs ?? []).find((m) => (m as MovimientoCaja).tipo === 'traslado_salida');
  return (ladoSalida ?? (movs ?? [])[0]) as MovimientoCaja;
}

/* ───────────── Conciliación con recepción de mineral ───────────── */

function slugSku(nombre: string): string {
  const base = nombre.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 16);
  const suf = Math.floor(performance.now() % 100000).toString(36).toUpperCase();
  return `MIN-${base || 'MINERAL'}-${suf}`;
}

export interface ConciliarMineralInput {
  movId: string;
  /** Producto existente; si es null se crea uno nuevo con `productoNuevo`. */
  productoId: string | null;
  productoNuevo?: { nombre: string; unidad: 'KG' | 'G' } | null;
  almacen: string;
  cantidad: number;
  unidad: 'KG' | 'G';
  costoUnit: number;
  descripcion: string;
  actor: string;
  actorName?: string | null;
}

/**
 * Concilia una salida de dinero pendiente con la recepción del mineral:
 * registra la entrada al inventario (suma stock + PMP) y marca el movimiento
 * de caja como conciliado, guardando los datos del mineral recibido.
 */
export async function conciliarConMineral(input: ConciliarMineralInput): Promise<void> {
  const cantidad = Number(input.cantidad) || 0;
  if (cantidad <= 0) throw new Error('El total de mineral debe ser mayor que 0.');
  const costo = Number(input.costoUnit) || 0;

  // 1) Resolver el producto mineral (existente o nuevo).
  let productoId = input.productoId;
  let productoNombre = '';
  if (!productoId) {
    if (!input.productoNuevo?.nombre.trim()) throw new Error('Indicá el mineral recibido.');
    const nombre = input.productoNuevo.nombre.trim().toUpperCase();
    const sku = slugSku(nombre);
    if (await findBySku(sku)) throw new Error(`Ya existe un producto con el SKU ${sku}.`);
    const prod = await createProducto({
      sku, nombre, categoria: 'MINERALES', unidad: input.productoNuevo.unidad,
      stock: 0, stock_min: 0, precio: costo, almacen: input.almacen, estado: 'activo',
    });
    productoId = prod.id;
    productoNombre = prod.nombre;
  }

  // 2) Entrada al inventario (suma stock + recalcula PMP del almacén).
  const mov = await registrarMovimiento({
    producto_id: productoId,
    tipo: 'entrada',
    delta: cantidad,
    almacen: input.almacen,
    actor: input.actor,
    actor_name: input.actorName ?? null,
    ref_tipo: 'conciliacion_mineral',
    ref_id: input.movId,
    detalle: `Recepción de mineral por anticipo · ${input.descripcion || ''}`.trim(),
    precio_unitario: costo,
  });

  // 3) Marcar la salida de dinero como conciliada.
  const { error } = await supabase.from(LIBRO).update({
    estado_mineral: 'conciliada',
    mineral_producto_id: productoId,
    mineral_producto_nombre: productoNombre || null,
    mineral_cantidad: cantidad,
    mineral_unidad: input.unidad,
    mineral_costo_unit: costo,
    mineral_descripcion: input.descripcion || null,
    mineral_mov_id: mov.id,
    conciliada_at: new Date().toISOString(),
  }).eq('id', input.movId);
  if (error) throw error;
}

/* ───────────── Consultas ───────────── */

export async function listMovimientosCaja(): Promise<MovimientoCaja[]> {
  const { data, error } = await supabase
    .from(LIBRO)
    .select('*, caja:cajas!movimientos_caja_caja_id_fkey(nombre, moneda)')
    .order('at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MovimientoCaja[];
}

/** Salidas de dinero (anticipos a conciliar con mineral), con su estado.
 *  Solo anticipos: los gastos/pagos planos de Tesorería (estado_mineral null) se excluyen. */
export async function listSalidasDinero(): Promise<MovimientoCaja[]> {
  const { data, error } = await supabase
    .from(LIBRO)
    .select('*, caja:cajas!movimientos_caja_caja_id_fkey(nombre, moneda)')
    .eq('tipo', 'salida')
    .not('estado_mineral', 'is', null)
    .order('at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MovimientoCaja[];
}

/** Traslados de dinero (solo el lado de salida, para no duplicar). */
export async function listTrasladosDinero(): Promise<MovimientoCaja[]> {
  const { data, error } = await supabase
    .from(LIBRO)
    .select('*, caja:cajas!movimientos_caja_caja_id_fkey(nombre, moneda)')
    .eq('tipo', 'traslado_salida')
    .order('at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MovimientoCaja[];
}
