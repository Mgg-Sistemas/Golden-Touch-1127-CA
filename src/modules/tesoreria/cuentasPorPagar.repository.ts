/* ============================================================
   MGG · Tesorería · Cuentas por pagar (manuales)
   Un ingreso manual de dinero a caja marcado como Cliente o
   Proveedor genera una cuenta por pagar por el mismo monto, que
   se salda con abonos (egresos de caja). Independiente de los
   créditos de compras (OC), se muestra junto a ellos.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { registrarGasto } from './tesoreria.repository';
import { crearOAcumularCuentaPorCobrar } from './cuentasPorCobrar.repository';
import { ingresarDineroCaja } from '@/modules/salidas/cajas.repository';
import { registrarMovimiento } from '@/modules/inventario/movimientos.repository';
import type { CuentaCaja, MovimientoCaja } from '@/shared/lib/types';

/** Nombre de la contraparte de la deuda a MGG recibida DIRECTO en Tesorería.
 *  Distinto de 'MGG' a propósito: la deuda de Acopio ('MGG') la sincroniza un
 *  trigger; usar otro nombre evita que el trigger pise estos ingresos manuales. */
export const MGG_DIRECTO = 'MGG · directo';

export type TipoCxP = 'cliente' | 'proveedor';
export type EstadoCxP = 'abierta' | 'saldada';

export interface CuentaPorPagar {
  id: string;
  tipo: TipoCxP;
  contraparte: string;
  monto: number;
  abonado: number;
  moneda: string;
  cuenta?: string | null;
  caja_id?: string | null;
  caja_mov_id?: string | null;
  estado: EstadoCxP;
  nota?: string | null;
  actor?: string | null;
  actor_name?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface AbonoCxP {
  id: string;
  cuenta_id: string;
  monto: number;
  moneda: string;
  caja_id?: string | null;
  cuenta?: string | null;
  caja_mov_id?: string | null;
  saldo_restante?: number | null;
  nota?: string | null;
  actor?: string | null;
  actor_name?: string | null;
  at: string;
}

/** Un INGRESO (préstamo) que suma a la cuenta por pagar; cada uno con su fecha. */
export interface IngresoCxP {
  id: string;
  cuenta_id: string;
  monto: number;
  moneda: string;
  caja_id?: string | null;
  cuenta?: string | null;
  caja_mov_id?: string | null;
  total_adeudado?: number | null;
  nota?: string | null;
  actor?: string | null;
  actor_name?: string | null;
  at: string;
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const CXP = 'cuentas_por_pagar';
const CXP_ABONOS = 'cuentas_por_pagar_abonos';
const CXP_INGRESOS = 'cuentas_por_pagar_ingresos';

/**
 * Registra un ingreso (préstamo) manual de cliente/proveedor como cuenta por pagar.
 * INCREMENTAL: si ya existe una cuenta ABIERTA del mismo cliente/proveedor en la misma
 * moneda, se SUMA a esa cuenta (no se crea otra) y queda una nueva fila de ingreso con su
 * fecha. Si no existe, se crea la cuenta y su primer ingreso. Así, varios préstamos del
 * mismo cliente se acumulan y el PDF lista cada fecha + el total adeudado.
 */
export async function crearCuentaPorPagar(input: {
  tipo: TipoCxP;
  contraparte: string;
  monto: number;
  moneda: string;
  cuenta?: string | null;
  cajaId?: string | null;
  cajaMovId?: string | null;
  nota?: string | null;
  actor?: string | null;
  actorName?: string | null;
}): Promise<CuentaPorPagar> {
  const monto = round2(input.monto);
  if (monto <= 0) throw new Error('El monto debe ser mayor que 0.');
  const contraparte = input.contraparte.trim();
  if (!contraparte) throw new Error('Indicá el cliente o proveedor.');

  // ¿Ya hay una cuenta ABIERTA del mismo cliente/proveedor en esta moneda?
  const { data: existentes } = await supabase.from(CXP).select('*')
    .eq('tipo', input.tipo).eq('moneda', input.moneda).eq('estado', 'abierta')
    .ilike('contraparte', contraparte)        // exacto, sin distinguir mayúsculas
    .order('created_at', { ascending: false }).limit(1);
  const existente = (existentes?.[0] ?? null) as CuentaPorPagar | null;

  let cuentaRow: CuentaPorPagar;
  if (existente) {
    // Acumula: el monto total prestado sube; el saldo adeudado también.
    const nuevoMonto = round2(Number(existente.monto) + monto);
    const { data: cu, error: cuErr } = await supabase.from(CXP)
      .update({ monto: nuevoMonto, updated_at: new Date().toISOString() })
      .eq('id', existente.id).select('*').single();
    if (cuErr) throw cuErr;
    cuentaRow = cu as CuentaPorPagar;
  } else {
    const { data, error } = await supabase.from(CXP).insert({
      tipo: input.tipo, contraparte, monto, abonado: 0,
      moneda: input.moneda, cuenta: input.cuenta ?? null, caja_id: input.cajaId ?? null,
      caja_mov_id: input.cajaMovId ?? null, estado: 'abierta', nota: input.nota?.trim() || null,
      actor: input.actor ?? null, actor_name: input.actorName ?? null,
    }).select('*').single();
    if (error) throw error;
    cuentaRow = data as CuentaPorPagar;
  }

  // Deja la fila del ingreso con su fecha y el total adeudado tras él.
  const totalAdeudado = round2(Number(cuentaRow.monto) - (Number(cuentaRow.abonado) || 0));
  const { error: ingErr } = await supabase.from(CXP_INGRESOS).insert({
    cuenta_id: cuentaRow.id, monto, moneda: input.moneda,
    caja_id: input.cajaId ?? null, cuenta: input.cuenta ?? null, caja_mov_id: input.cajaMovId ?? null,
    total_adeudado: totalAdeudado, nota: input.nota?.trim() || null,
    actor: input.actor ?? null, actor_name: input.actorName ?? null,
  });
  if (ingErr) throw ingErr;

  return cuentaRow;
}

/** Lista los ingresos (préstamos) de una cuenta, del más viejo al más nuevo. */
export async function listIngresosCuenta(cuentaId: string): Promise<IngresoCxP[]> {
  const { data, error } = await supabase.from(CXP_INGRESOS).select('*').eq('cuenta_id', cuentaId).order('at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as IngresoCxP[];
}

export async function listCuentasPorPagar(soloAbiertas = true): Promise<CuentaPorPagar[]> {
  let q = supabase.from(CXP).select('*').order('created_at', { ascending: false });
  if (soloAbiertas) q = q.eq('estado', 'abierta');
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CuentaPorPagar[];
}

export async function listAbonosCuenta(cuentaId: string): Promise<AbonoCxP[]> {
  const { data, error } = await supabase.from(CXP_ABONOS).select('*').eq('cuenta_id', cuentaId).order('at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AbonoCxP[];
}

/**
 * Registra un abono a una cuenta por pagar: egreso real de la caja elegida (en
 * la misma moneda de la cuenta) + actualiza lo abonado. Al saldar, estado='saldada'.
 */
export async function registrarAbonoCuenta(input: {
  cuenta: CuentaPorPagar;
  cajaId: string;
  cuentaCaja: CuentaCaja;
  monto: number;
  nota?: string | null;
  actor: string;
  actorName?: string | null;
}): Promise<{ cuenta: CuentaPorPagar; abono: AbonoCxP; exceso: number }> {
  const c = input.cuenta;
  const monto = round2(input.monto);
  if (monto <= 0) throw new Error('El abono debe ser mayor que 0.');
  const saldoPrev = round2(c.monto - (Number(c.abonado) || 0));
  // Se permite pagar de MÁS: el excedente se convierte en cuenta por COBRAR (queda a
  // favor de la empresa). `aplicado` salda la cuenta por pagar; `exceso` va a cobrar.
  const exceso = round2(Math.max(0, monto - saldoPrev));
  const aplicado = round2(monto - exceso);

  // 1) Egreso real de la caja por el monto COMPLETO pagado (misma moneda de la cuenta).
  const mov = await registrarGasto({
    cajaId: input.cajaId, monto, moneda: c.moneda, cuenta: input.cuentaCaja,
    concepto: `Abono cuenta por pagar · ${c.tipo === 'proveedor' ? 'Proveedor' : 'Cliente'}: ${c.contraparte}`,
    categoria: 'abono_cxp', actor: input.actor, actorName: input.actorName,
  });

  // 2) Registro del abono aplicado (la parte que salda la cuenta) + saldo restante.
  const saldoRestante = round2(saldoPrev - aplicado);
  const notaAbono = exceso > 0.01
    ? `${input.nota?.trim() ? input.nota.trim() + ' · ' : ''}Pago ${monto} ${c.moneda} (excedente ${exceso} → cuenta por cobrar)`
    : (input.nota?.trim() || null);
  const { data: ab, error: abErr } = await supabase.from(CXP_ABONOS).insert({
    cuenta_id: c.id, monto: aplicado > 0 ? aplicado : monto, moneda: c.moneda, caja_id: input.cajaId, cuenta: input.cuentaCaja,
    caja_mov_id: mov.id, saldo_restante: saldoRestante, nota: notaAbono,
    actor: input.actor, actor_name: input.actorName ?? null,
  }).select('*').single();
  if (abErr) throw abErr;

  // 3) Actualiza la cuenta por pagar (abonado + estado).
  const nuevoAbonado = round2((Number(c.abonado) || 0) + aplicado);
  const estado: EstadoCxP = nuevoAbonado >= c.monto - 0.01 ? 'saldada' : 'abierta';
  const { data: cu, error: cuErr } = await supabase.from(CXP)
    .update({ abonado: nuevoAbonado, estado, updated_at: new Date().toISOString() })
    .eq('id', c.id).select('*').single();
  if (cuErr) throw cuErr;

  // 4) Si se pagó de más, el excedente queda como cuenta por COBRAR (incremental).
  if (exceso > 0.01) {
    await crearOAcumularCuentaPorCobrar({
      tipo: c.tipo, contraparte: c.contraparte, monto: exceso, moneda: c.moneda,
      cuenta: input.cuentaCaja, cajaId: input.cajaId, cajaMovId: mov.id,
      nota: `Excedente de pago a ${c.contraparte}`, actor: input.actor, actorName: input.actorName,
    });
  }

  return { cuenta: cu as CuentaPorPagar, abono: ab as AbonoCxP, exceso };
}

/**
 * Paga una cuenta por pagar ENTREGANDO PRODUCTOS (no dinero). Ej.: GT salda
 * deuda con MGG entregando casiterita. Cada producto se valora a precio de
 * inventario × cantidad, se descuenta del almacén indicado (movimiento de
 * salida) y el valor total abona la cuenta por pagar (sin egreso de caja).
 */
export async function pagarCuentaConProductos(input: {
  cuenta: CuentaPorPagar;
  items: Array<{ productoId: string; sku: string; nombre: string; cantidad: number; precio: number; almacen?: string | null }>;
  nota?: string | null;
  actor: string;
  actorName?: string | null;
}): Promise<{ cuenta: CuentaPorPagar; abono: AbonoCxP; valorTotal: number }> {
  const c = input.cuenta;
  const items = input.items.filter((i) => i.productoId && Number(i.cantidad) > 0);
  if (!items.length) throw new Error('Agregá al menos un producto a entregar.');

  // Valor total = Σ (precio de inventario × cantidad).
  const valorTotal = round2(items.reduce((a, i) => a + Number(i.cantidad) * Number(i.precio), 0));
  if (valorTotal <= 0) throw new Error('El valor de los productos debe ser mayor que 0.');

  const saldoPrev = round2(c.monto - (Number(c.abonado) || 0));
  const aplicado = round2(Math.min(valorTotal, saldoPrev));

  // 1) Descontar cada producto del inventario (salida), valorado a su precio.
  for (const it of items) {
    await registrarMovimiento({
      producto_id: it.productoId,
      tipo: 'salida',
      delta: -Math.abs(Number(it.cantidad)),
      almacen: it.almacen ?? null,
      actor: input.actor,
      actor_name: input.actorName ?? null,
      ref_tipo: 'cxp_productos',
      detalle: `Pago en producto a ${c.contraparte} · ${it.sku} ${it.nombre}`,
    });
  }

  // 2) Abono a la cuenta por pagar por el valor entregado (sin egreso de caja).
  const detalleProd = items.map((i) => `${i.cantidad} ${i.sku}`).join(', ');
  const saldoRestante = round2(saldoPrev - aplicado);
  const notaAbono = `Pago en productos (${detalleProd}) = ${valorTotal} ${c.moneda}${input.nota?.trim() ? ' · ' + input.nota.trim() : ''}`;
  const { data: ab, error: abErr } = await supabase.from(CXP_ABONOS).insert({
    cuenta_id: c.id, monto: aplicado, moneda: c.moneda, caja_id: null, cuenta: null,
    caja_mov_id: null, saldo_restante: saldoRestante, nota: notaAbono,
    actor: input.actor, actor_name: input.actorName ?? null,
  }).select('*').single();
  if (abErr) throw abErr;

  // 3) Actualizar la cuenta por pagar (abonado + estado).
  const nuevoAbonado = round2((Number(c.abonado) || 0) + aplicado);
  const estado: EstadoCxP = nuevoAbonado >= c.monto - 0.01 ? 'saldada' : 'abierta';
  const { data: cu, error: cuErr } = await supabase.from(CXP)
    .update({ abonado: nuevoAbonado, estado, updated_at: new Date().toISOString() })
    .eq('id', c.id).select('*').single();
  if (cuErr) throw cuErr;

  return { cuenta: cu as CuentaPorPagar, abono: ab as AbonoCxP, valorTotal };
}

/**
 * Abona una cuenta por pagar RECIBIENDO PRODUCTO de la contraparte (ej.: MGG rinde
 * la deuda de "USD entregados" entregando casiterita). El producto ENTRA al
 * inventario (entrada, valuado a valorUsd/cantidad) y su valor al cambio (USD)
 * abona la deuda. No entra dinero a caja.
 */
export async function abonarCuentaConProductoRecibido(input: {
  cuenta: CuentaPorPagar;
  productoId: string;
  almacen: string;
  cantidad: number;
  valorUsd: number;            // valor al cambio (USD) que abona la deuda
  nota?: string | null;
  actor: string;
  actorName?: string | null;
}): Promise<{ cuenta: CuentaPorPagar; abono: AbonoCxP }> {
  const c = input.cuenta;
  const valor = round2(input.valorUsd);
  const cant = Number(input.cantidad) || 0;
  if (cant <= 0) throw new Error('La cantidad recibida debe ser mayor que 0.');
  if (valor <= 0) throw new Error('El valor del producto (al cambio) debe ser mayor que 0.');

  // 1) El producto ENTRA al inventario (entrada con costo = valor / cantidad). Sin caja.
  await registrarMovimiento({
    producto_id: input.productoId,
    tipo: 'entrada',
    delta: Math.abs(cant),
    almacen: input.almacen,
    precio_unitario: round2(valor / cant),
    actor: input.actor,
    actor_name: input.actorName ?? null,
    ref_tipo: 'cxp_productos',
    detalle: `Abono en producto (al cambio) · deuda ${c.contraparte}`,
  });

  // 2) Abono por el valor al cambio (sin egreso de caja).
  const saldoPrev = round2(c.monto - (Number(c.abonado) || 0));
  const aplicado = round2(Math.min(valor, saldoPrev));
  const saldoRestante = round2(saldoPrev - aplicado);
  const { data: ab, error: abErr } = await supabase.from(CXP_ABONOS).insert({
    cuenta_id: c.id, monto: aplicado, moneda: c.moneda, caja_id: null, cuenta: null,
    caja_mov_id: null, saldo_restante: saldoRestante,
    nota: `Abono en producto (al cambio): ${cant} und = ${valor} ${c.moneda}${input.nota?.trim() ? ' · ' + input.nota.trim() : ''}`,
    actor: input.actor, actor_name: input.actorName ?? null,
  }).select('*').single();
  if (abErr) throw abErr;

  // 3) Actualiza la cuenta (abonado + estado).
  const nuevoAbonado = round2((Number(c.abonado) || 0) + aplicado);
  const estado: EstadoCxP = nuevoAbonado >= c.monto - 0.01 ? 'saldada' : 'abierta';
  const { data: cu, error: cuErr } = await supabase.from(CXP)
    .update({ abonado: nuevoAbonado, estado, updated_at: new Date().toISOString() })
    .eq('id', c.id).select('*').single();
  if (cuErr) throw cuErr;

  return { cuenta: cu as CuentaPorPagar, abono: ab as AbonoCxP };
}

/**
 * RECIBIR DINERO DE MGG (directo en Tesorería). Hace lo mismo que la entrada de
 * dinero en Acopio, pero el dinero entra DIRECTO a la caja elegida (sube su saldo
 * visible) y queda anclado como una CUENTA POR PAGAR a MGG ("MGG · directo"), en
 * la MONEDA de la caja. Esa deuda se salda después con abonos o entregando
 * producto (igual que las demás cuentas por pagar). Es una cuenta APARTE de la
 * deuda "MGG" de Acopio (que la sincroniza un trigger), por eso no colisionan.
 */
export async function recibirDineroDeMGG(input: {
  cajaId: string;
  monto: number;
  nota?: string | null;
  actor: string;
  actorName?: string | null;
}): Promise<{ cuenta: CuentaPorPagar; mov: MovimientoCaja }> {
  const monto = round2(input.monto);
  if (monto <= 0) throw new Error('El monto a recibir debe ser mayor que 0.');
  const detalle = input.nota?.trim() ? ` · ${input.nota.trim()}` : '';

  // 1) El dinero ENTRA a la caja (sube el saldo visible + espejo multimoneda).
  const mov = await ingresarDineroCaja({
    cajaId: input.cajaId, monto,
    concepto: `Recibido de MGG${detalle}`, categoria: 'recibido_mgg',
    actor: input.actor, actorName: input.actorName,
  });

  // 2) Deuda a MGG (cuenta por pagar APARTE, en la moneda de la caja), anclada a
  //    la caja y al movimiento. Si ya hay una abierta en esa moneda, se acumula.
  const cuenta = await crearCuentaPorPagar({
    tipo: 'proveedor', contraparte: MGG_DIRECTO, monto, moneda: mov.moneda,
    cajaId: input.cajaId, cajaMovId: mov.id,
    nota: `Recibido directo de MGG${detalle}`,
    actor: input.actor, actorName: input.actorName,
  });

  return { cuenta, mov };
}
