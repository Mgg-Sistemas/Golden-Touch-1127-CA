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

/**
 * 04/11/2026: el saldo VIVO de cada caja está en `caja_saldos` (una fila por cuenta y
 * moneda: general, jurídica, personal…); la columna `cajas.saldo` quedó vieja (la Caja Bs
 * decía Bs 492 con Bs 1,88 millones disponibles). Se muestra la suma de las cuentas en la
 * moneda de la caja; si la caja no tiene filas ahí, queda lo que dice `cajas.saldo`.
 */
async function conSaldoVivo(cajas: Caja[]): Promise<Caja[]> {
  if (!cajas.length) return cajas;
  const { data, error } = await supabase.from('caja_saldos').select('caja_id, moneda, saldo').in('caja_id', cajas.map((c) => c.id));
  if (error || !data) return cajas;
  const suma = new Map<string, number>();
  for (const r of data as Array<{ caja_id: string; moneda: string; saldo: number | string | null }>) {
    const k = `${r.caja_id}|${r.moneda}`;
    suma.set(k, round2((suma.get(k) ?? 0) + (Number(r.saldo) || 0)));
  }
  return cajas.map((c) => {
    const k = `${c.id}|${c.moneda}`;
    return suma.has(k) ? { ...c, saldo: suma.get(k) as number } : c;
  });
}

export async function listCajas(): Promise<Caja[]> {
  const { data, error } = await supabase.from(TABLE).select('*').order('nombre', { ascending: true });
  if (error) throw error;
  return conSaldoVivo((data ?? []) as Caja[]);
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
  return conSaldoVivo((data ?? []) as Caja[]);
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

/** Aplica un delta al saldo VISIBLE de la caja de forma ATÓMICA (RPC con lock de la fila).
 *  Con `permitirNegativo=false` valida fondos en el servidor y lanza «Saldo insuficiente…».
 *  Devuelve saldo antes/después + moneda/nombre (para el libro y los mensajes). */
async function aplicarSaldoCaja(cajaId: string, delta: number, permitirNegativo: boolean): Promise<{ saldoAntes: number; saldoDespues: number; moneda: string; nombre: string }> {
  const { data, error } = await supabase.rpc('aplicar_saldo_caja', {
    p_caja_id: cajaId, p_delta: delta, p_permitir_negativo: permitirNegativo,
  });
  if (error) throw new Error(error.message || 'No se pudo actualizar el saldo de la caja.');
  const r = data as { saldo_antes: number; saldo_despues: number; moneda: string; nombre: string };
  return { saldoAntes: Number(r.saldo_antes) || 0, saldoDespues: Number(r.saldo_despues) || 0, moneda: r.moneda, nombre: r.nombre };
}

/** Espeja el delta en el saldo multimoneda de la misma moneda (prefiere `general`; en Bs cae
 *  a `juridica` o `personal` cuando la caja lleva esas cuentas en `caja_saldos`), SOLO si ya
 *  existe alguna fila para esa caja y moneda. Atómico. */
async function espejarSaldoGeneral(
  cajaId: string,
  moneda: string,
  delta: number,
): Promise<{ cuenta: string; saldoAntes: number; saldoDespues: number } | null> {
  if (!delta) return null;
  const { data } = await supabase.from('caja_saldos')
    .select('id, cuenta, saldo').eq('caja_id', cajaId).eq('moneda', moneda);
  const filas = (data ?? []) as Array<{ id: string; cuenta: string; saldo: number | string | null }>;
  if (!filas.length) return null;
  const elegida =
    filas.find((f) => f.cuenta === 'general') ??
    (moneda === 'Bs' ? filas.find((f) => f.cuenta === 'juridica') : undefined) ??
    [...filas].sort((a, b) => (Number(b.saldo) || 0) - (Number(a.saldo) || 0))[0];
  const cuenta = String(elegida.cuenta);
  const { data: r, error } = await supabase.rpc('aplicar_saldo_divisa', {
    p_caja_id: cajaId, p_cuenta: cuenta, p_moneda: moneda, p_delta: delta, p_permitir_negativo: true,
  });
  if (error) throw new Error(error.message || 'No se pudo espejar el saldo multimoneda.');
  const res = r as { saldo_antes: number; saldo_despues: number };
  return {
    cuenta,
    saldoAntes: Number(res.saldo_antes) || 0,
    saldoDespues: Number(res.saldo_despues) || 0,
  };
}

/** Ajuste manual del saldo (deja registro en el libro y sincroniza `caja_saldos` si existe). */
export async function ajustarSaldo(id: string, nuevoSaldo: number, motivo: string, actor: string, actorName?: string | null): Promise<void> {
  const caja = await getCaja(id);
  const { data: filasSaldos } = await supabase.from('caja_saldos')
    .select('cuenta, saldo').eq('caja_id', id).eq('moneda', caja.moneda);
  const vivos = (filasSaldos ?? []) as Array<{ cuenta: string; saldo: number | string | null }>;
  const saldoAntes = vivos.length
    ? round2(vivos.reduce((acc, r) => acc + (Number(r.saldo) || 0), 0))
    : Number(caja.saldo) || 0;
  const saldoDespues = round2(Number(nuevoSaldo) || 0);
  const delta = round2(saldoDespues - saldoAntes);
  let cuentaMov: string | null = null;
  if (vivos.length && delta !== 0) {
    const esp = await espejarSaldoGeneral(id, caja.moneda, delta);
    cuentaMov = esp?.cuenta ?? null;
  }
  await supabase.from(LIBRO).insert({
    caja_id: id, tipo: 'ajuste', monto: Math.abs(delta), moneda: caja.moneda,
    saldo_antes: saldoAntes, saldo_despues: saldoDespues,
    ...(cuentaMov ? { cuenta: cuentaMov } : {}),
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
  const { saldoAntes, saldoDespues, moneda } = await aplicarSaldoCaja(id, m, true);
  const esp = await espejarSaldoGeneral(id, moneda, m);
  await supabase.from(LIBRO).insert({
    caja_id: id, tipo: 'ingreso', monto: m, moneda,
    saldo_antes: esp ? esp.saldoAntes : saldoAntes,
    saldo_despues: esp ? esp.saldoDespues : saldoDespues,
    ...(esp ? { cuenta: esp.cuenta } : {}),
    motivo: motivo || 'Ingreso de dinero', actor, actor_name: actorName ?? null,
  });
}

/* ───────────── Egreso simple sincronizado con el saldo VIVO de la caja ─────────────
   Si la caja maneja `caja_saldos` en su moneda (general / jurídica / personal), valida y
   descuenta contra ese saldo vivo (nunca contra un `cajas.saldo` desfasado) y espeja en
   `cajas.saldo`. Si no tiene filas en `caja_saldos`, descuenta de `cajas.saldo`. */
export async function egresarGastoCaja(input: {
  cajaId: string; monto: number; concepto: string; categoria?: string;
  gastoCategoria?: string | null; gastoSubcategoria?: string | null;
  actor: string; actorName?: string | null;
}): Promise<MovimientoCaja> {
  const monto = round2(Number(input.monto) || 0);
  if (monto <= 0) throw new Error('El monto debe ser mayor que 0.');
  if (!input.concepto.trim()) throw new Error('Indica el concepto del gasto.');

  const caja = await getCaja(input.cajaId);
  const { data: filasRaw } = await supabase.from('caja_saldos')
    .select('cuenta, saldo').eq('caja_id', input.cajaId).eq('moneda', caja.moneda);
  const todas = (filasRaw ?? []) as Array<{ cuenta: string; saldo: number | string | null }>;

  if (todas.length > 0) {
    const positivas = todas
      .filter((s) => (Number(s.saldo) || 0) > 0)
      .sort((a, b) => (Number(b.saldo) || 0) - (Number(a.saldo) || 0));
    const candidata =
      positivas.find((s) => s.cuenta === 'general' && (Number(s.saldo) || 0) >= monto - 0.005) ??
      positivas.find((s) => (Number(s.saldo) || 0) >= monto - 0.005) ??
      positivas[0] ??
      todas[0];
    const cuenta = String(candidata.cuenta);
    const { data: r, error: eDiv } = await supabase.rpc('aplicar_saldo_divisa', {
      p_caja_id: input.cajaId, p_cuenta: cuenta, p_moneda: caja.moneda, p_delta: -monto, p_permitir_negativo: false,
    });
    if (eDiv) throw new Error(eDiv.message || `Saldo insuficiente en ${caja.nombre}.`);
    const res = r as { saldo_antes: number; saldo_despues: number };
    const saldoAntes = Number(res.saldo_antes) || 0;
    const saldoDespues = Number(res.saldo_despues) || 0;

    const { data, error } = await supabase.from(LIBRO).insert({
      caja_id: input.cajaId, tipo: 'salida', monto, moneda: caja.moneda, cuenta,
      saldo_antes: saldoAntes, saldo_despues: saldoDespues,
      motivo: input.concepto.trim(), categoria: input.categoria ?? 'gasto',
      gasto_categoria: input.gastoCategoria?.trim() || null,
      gasto_subcategoria: input.gastoSubcategoria?.trim() || null,
      actor: input.actor, actor_name: input.actorName ?? null,
    }).select('*').single();
    if (error) {
      await supabase.rpc('aplicar_saldo_divisa', {
        p_caja_id: input.cajaId, p_cuenta: cuenta, p_moneda: caja.moneda, p_delta: monto, p_permitir_negativo: true,
      });
      throw error;
    }
    await aplicarSaldoCaja(input.cajaId, -monto, true).catch(() => undefined);
    return data as MovimientoCaja;
  }

  // Caja legada sin `caja_saldos`: descuento ATÓMICO del saldo visible.
  const { saldoAntes, saldoDespues, moneda } = await aplicarSaldoCaja(input.cajaId, -monto, false);
  const { data, error } = await supabase.from(LIBRO).insert({
    caja_id: input.cajaId, tipo: 'salida', monto, moneda,
    saldo_antes: saldoAntes, saldo_despues: saldoDespues,
    motivo: input.concepto.trim(), categoria: input.categoria ?? 'gasto',
    gasto_categoria: input.gastoCategoria?.trim() || null,
    gasto_subcategoria: input.gastoSubcategoria?.trim() || null,
    actor: input.actor, actor_name: input.actorName ?? null,
  }).select('*').single();
  if (error) {
    await aplicarSaldoCaja(input.cajaId, monto, true).catch(() => undefined);
    throw error;
  }
  return data as MovimientoCaja;
}

/* ───────────── Ingreso de dinero sincronizado con el saldo VIVO de la caja ─────────────
   Inverso de `egresarGastoCaja`: SUMA al `cajas.saldo` y, si la caja además lleva saldo
   multimoneda (`caja_saldos`, incluida jurídica/personal en Bs), lo espeja de inmediato
   para que el dinero recibido (ej. Recibir dinero de MGG o reversos) quede disponible al pagar. */
export async function ingresarDineroCaja(input: {
  cajaId: string; monto: number; concepto: string; categoria?: string;
  actor: string; actorName?: string | null;
}): Promise<MovimientoCaja> {
  const monto = round2(Number(input.monto) || 0);
  if (monto <= 0) throw new Error('El monto debe ser mayor que 0.');
  if (!input.concepto.trim()) throw new Error('Indica el concepto del ingreso.');
  const { saldoAntes, saldoDespues, moneda } = await aplicarSaldoCaja(input.cajaId, monto, true);
  const esp = await espejarSaldoGeneral(input.cajaId, moneda, monto);

  const { data, error } = await supabase.from(LIBRO).insert({
    caja_id: input.cajaId, tipo: 'ingreso', monto, moneda,
    saldo_antes: esp ? esp.saldoAntes : saldoAntes,
    saldo_despues: esp ? esp.saldoDespues : saldoDespues,
    ...(esp ? { cuenta: esp.cuenta } : {}),
    motivo: input.concepto.trim(), categoria: input.categoria ?? 'ingreso',
    actor: input.actor, actor_name: input.actorName ?? null,
  }).select('*').single();
  if (error) throw error;

  return data as MovimientoCaja;
}

/* ───────────── Editar / borrar movimientos MANUALES (gasto / ingreso / ajuste) ─────────────
   Solo movimientos sueltos cargados a mano. Los VINCULADOS (pago de OC, traslado entre
   cajas, conciliación de mineral, pago de compra/servicio directo, conversión, reverso)
   NO se editan aquí: se anulan desde su módulo, para no descuadrar el otro lado/inventario.
   Al editar/borrar se SINCRONIZA el saldo de la caja (legacy o multimoneda). */

const CATEGORIAS_VINCULADAS = new Set(['pago_oc', 'reembolso_oc', 'traslado', 'conversion', 'compra_directa', 'servicio_directo', 'reembolso_compra_directa', 'reembolso_servicio_directo', 'reverso', 'conciliacion']);

/** ¿Es un movimiento manual EDITABLE desde Tesorería? (editar monto/motivo/fecha) */
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
    // Multimoneda: ajusta caja_saldos de forma atómica (no toca la tasa promedio; permite
    // negativo porque es una corrección/reverso). La RPC hace upsert si la fila no existe.
    const { error } = await supabase.rpc('aplicar_saldo_divisa', {
      p_caja_id: m.caja_id, p_cuenta: cuenta, p_moneda: m.moneda, p_delta: delta, p_permitir_negativo: true,
    });
    if (error) throw new Error(error.message || 'No se pudo ajustar el saldo multimoneda.');
    return;
  }
  // Legacy: ajusta cajas.saldo atómicamente y espeja la cuenta general en su moneda si existe.
  const { moneda } = await aplicarSaldoCaja(m.caja_id, delta, true);
  await espejarSaldoGeneral(m.caja_id, moneda, delta);
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
    throw new Error('Este movimiento está vinculado y no se edita aquí: anulalo desde su módulo.');
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

/**
 * Cambia SOLO la fecha (`at`) de CUALQUIER movimiento — incluidos los vinculados
 * (pago de OC, traslado, conversión, directo, conciliación…). No toca montos ni saldos
 * ni el otro lado de la operación: útil cuando el pago real fue otro día pero se cargó
 * tarde al sistema. Si el movimiento es un pago de OC / compra o servicio directo, se
 * sincroniza además la fecha de pago del documento vinculado para que coincida.
 */
export async function editarFechaMovimiento(mov: MovimientoCaja, fechaIso: string): Promise<void> {
  if (!fechaIso) throw new Error('Indica la fecha del movimiento.');
  const { error } = await supabase.from(LIBRO).update({ at: fechaIso }).eq('id', mov.id);
  if (error) throw error;
  // Sincroniza la fecha de pago del/los documento(s) vinculado(s) para que TODO coincida
  // (best-effort: si alguno falla no bloquea el cambio de fecha del movimiento).
  const r = mov as unknown as Record<string, unknown>;
  const refOrden = r.ref_orden_id as string | null | undefined;
  const refNomina = r.ref_nomina_renglon_id as string | null | undefined;
  const tareas: PromiseLike<unknown>[] = [
    supabase.from('compras_directas').update({ pagada_at: fechaIso }).eq('caja_mov_id', mov.id),
    supabase.from('servicios_directos').update({ pagada_at: fechaIso }).eq('caja_mov_id', mov.id),
    refNomina
      ? supabase.from('nomina_renglones').update({ pagada_en: fechaIso }).eq('id', refNomina)
      : supabase.from('nomina_renglones').update({ pagada_en: fechaIso }).eq('caja_mov_id', mov.id),
  ];
  if (refOrden) tareas.push(supabase.from('ordenes').update({ pagada_en: fechaIso }).eq('id', refOrden));
  await Promise.allSettled(tareas);
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
  // Salida ATÓMICA (valida fondos con lock).
  const { saldoAntes, saldoDespues, moneda } = await aplicarSaldoCaja(input.cajaId, -monto, false);

  const { data, error } = await supabase.from(LIBRO).insert({
    caja_id: input.cajaId, tipo: 'salida', monto, moneda,
    saldo_antes: saldoAntes, saldo_despues: saldoDespues,
    motivo: input.motivo || null, destino: input.destino || null,
    estado_mineral: 'pendiente',
    actor: input.actor, actor_name: input.actorName ?? null,
  }).select('*').single();
  if (error) throw error;
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
  // Movimientos de saldo ATÓMICOS: descuenta el origen (valida fondos) y acredita el destino.
  const o = await aplicarSaldoCaja(input.origenId, -monto, false);
  const d = await aplicarSaldoCaja(input.destinoId, monto, true);

  const motivo = input.motivo?.trim() || null;
  const notaEntrega = input.notaEntrega?.trim() || null;
  const { data: movs, error: e1 } = await supabase.from(LIBRO).insert([
    {
      caja_id: input.origenId, tipo: 'traslado_salida', monto, moneda: origen.moneda,
      saldo_antes: o.saldoAntes, saldo_despues: o.saldoDespues,
      motivo, nota_entrega: notaEntrega, destino: destino.nombre, ref_caja_id: input.destinoId,
      actor: input.actor, actor_name: input.actorName ?? null,
    },
    {
      caja_id: input.destinoId, tipo: 'traslado_entrada', monto, moneda: destino.moneda,
      saldo_antes: d.saldoAntes, saldo_despues: d.saldoDespues,
      motivo, nota_entrega: notaEntrega, destino: origen.nombre, ref_caja_id: input.origenId,
      actor: input.actor, actor_name: input.actorName ?? null,
    },
  ]).select('*');
  if (e1) throw e1;

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
    if (!input.productoNuevo?.nombre.trim()) throw new Error('Indica el mineral recibido.');
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
