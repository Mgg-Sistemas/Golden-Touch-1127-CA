/* ============================================================
   Golden Touch · Tesorería · Cuentas por COBRAR
   Lo que un cliente/proveedor le debe a la empresa. Nace cuando se paga de más
   una cuenta por pagar (el excedente queda a favor). Es INCREMENTAL: varios
   cargos del mismo cliente/proveedor (misma moneda) se acumulan en una sola
   cuenta. Se cobra con abonos = entradas de dinero a la caja elegida.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { ingresarDivisa } from './cajaSaldos.repository';
import type { CuentaCaja } from '@/shared/lib/types';

export type TipoCxC = 'cliente' | 'proveedor';
export type EstadoCxC = 'abierta' | 'saldada';

export interface CuentaPorCobrar {
  id: string;
  tipo: TipoCxC;
  contraparte: string;
  monto: number;     // total que nos deben (acumulado)
  cobrado: number;   // total ya recibido
  moneda: string;
  cuenta?: string | null;
  caja_id?: string | null;
  caja_mov_id?: string | null;
  estado: EstadoCxC;
  nota?: string | null;
  actor?: string | null;
  actor_name?: string | null;
  created_at: string;
  updated_at?: string | null;
}

/** Un cargo que aumenta lo que nos deben (incremental), con su fecha. */
export interface CargoCxC {
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

/** Un cobro recibido (entrada de dinero) contra una cuenta por cobrar. */
export interface CobroCxC {
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

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const CXC = 'cuentas_por_cobrar';
const CXC_CARGOS = 'cuentas_por_cobrar_cargos';
const CXC_ABONOS = 'cuentas_por_cobrar_abonos';

/**
 * Crea/ACUMULA una cuenta por cobrar (incremental). Si ya existe una cuenta ABIERTA
 * del mismo cliente/proveedor en la misma moneda, suma el cargo a esa cuenta y deja
 * una fila de cargo con su fecha; si no, crea la cuenta y su primer cargo.
 */
export async function crearOAcumularCuentaPorCobrar(input: {
  tipo: TipoCxC;
  contraparte: string;
  monto: number;
  moneda: string;
  cuenta?: string | null;
  cajaId?: string | null;
  cajaMovId?: string | null;
  nota?: string | null;
  actor?: string | null;
  actorName?: string | null;
}): Promise<CuentaPorCobrar> {
  const monto = round2(input.monto);
  if (monto <= 0) throw new Error('El monto debe ser mayor que 0.');
  const contraparte = input.contraparte.trim();
  if (!contraparte) throw new Error('Indicá el cliente o proveedor.');

  const { data: existentes } = await supabase.from(CXC).select('*')
    .eq('tipo', input.tipo).eq('moneda', input.moneda).eq('estado', 'abierta')
    .ilike('contraparte', contraparte)
    .order('created_at', { ascending: false }).limit(1);
  const existente = (existentes?.[0] ?? null) as CuentaPorCobrar | null;

  let cuentaRow: CuentaPorCobrar;
  if (existente) {
    const nuevoMonto = round2(Number(existente.monto) + monto);
    const { data: cu, error } = await supabase.from(CXC)
      .update({ monto: nuevoMonto, estado: 'abierta', updated_at: new Date().toISOString() })
      .eq('id', existente.id).select('*').single();
    if (error) throw error;
    cuentaRow = cu as CuentaPorCobrar;
  } else {
    const { data, error } = await supabase.from(CXC).insert({
      tipo: input.tipo, contraparte, monto, cobrado: 0, moneda: input.moneda,
      cuenta: input.cuenta ?? null, caja_id: input.cajaId ?? null, caja_mov_id: input.cajaMovId ?? null,
      estado: 'abierta', nota: input.nota?.trim() || null, actor: input.actor ?? null, actor_name: input.actorName ?? null,
    }).select('*').single();
    if (error) throw error;
    cuentaRow = data as CuentaPorCobrar;
  }

  const totalAdeudado = round2(Number(cuentaRow.monto) - (Number(cuentaRow.cobrado) || 0));
  const { error: cgErr } = await supabase.from(CXC_CARGOS).insert({
    cuenta_id: cuentaRow.id, monto, moneda: input.moneda,
    caja_id: input.cajaId ?? null, cuenta: input.cuenta ?? null, caja_mov_id: input.cajaMovId ?? null,
    total_adeudado: totalAdeudado, nota: input.nota?.trim() || null,
    actor: input.actor ?? null, actor_name: input.actorName ?? null,
  });
  if (cgErr) throw cgErr;

  return cuentaRow;
}

export async function listCuentasPorCobrar(soloAbiertas = true): Promise<CuentaPorCobrar[]> {
  let q = supabase.from(CXC).select('*').order('created_at', { ascending: false });
  if (soloAbiertas) q = q.eq('estado', 'abierta');
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CuentaPorCobrar[];
}

/** Cargos (lo que se le fue cargando al cliente), del más viejo al más nuevo. */
export async function listCargosCobrar(cuentaId: string): Promise<CargoCxC[]> {
  const { data, error } = await supabase.from(CXC_CARGOS).select('*').eq('cuenta_id', cuentaId).order('at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CargoCxC[];
}

/** Cobros recibidos, del más nuevo al más viejo. */
export async function listCobrosCuenta(cuentaId: string): Promise<CobroCxC[]> {
  const { data, error } = await supabase.from(CXC_ABONOS).select('*').eq('cuenta_id', cuentaId).order('at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CobroCxC[];
}

/**
 * Registra un cobro (abono recibido): ENTRA dinero real a la caja elegida (en la
 * misma moneda de la cuenta) + actualiza lo cobrado. Al cobrar todo, estado='saldada'.
 */
export async function registrarCobro(input: {
  cuenta: CuentaPorCobrar;
  cajaId: string;
  cuentaCaja: CuentaCaja;
  monto: number;
  tasaBs?: number | null;   // Bs por unidad (para USD/USDT/COP); Bs = 1
  nota?: string | null;
  actor: string;
  actorName?: string | null;
}): Promise<{ cuenta: CuentaPorCobrar; cobro: CobroCxC }> {
  const c = input.cuenta;
  const monto = round2(input.monto);
  if (monto <= 0) throw new Error('El cobro debe ser mayor que 0.');
  const saldoPrev = round2(c.monto - (Number(c.cobrado) || 0));
  if (monto > saldoPrev + 0.01) throw new Error(`El cobro (${monto}) supera el saldo pendiente (${saldoPrev} ${c.moneda}).`);

  // 1) Entrada real de dinero a la caja (misma moneda de la cuenta por cobrar).
  await ingresarDivisa({
    cajaId: input.cajaId, cuenta: input.cuentaCaja, moneda: c.moneda, monto,
    tasaBs: c.moneda === 'Bs' ? 1 : (Number(input.tasaBs) || 0),
    origen: `${c.tipo === 'proveedor' ? 'Proveedor' : 'Cliente'}: ${c.contraparte}`,
    motivo: `Cobro cuenta por cobrar · ${c.contraparte}`, actor: input.actor, actorName: input.actorName,
  });

  // 2) Registro del cobro + saldo restante.
  const saldoRestante = round2(saldoPrev - monto);
  const { data: ab, error: abErr } = await supabase.from(CXC_ABONOS).insert({
    cuenta_id: c.id, monto, moneda: c.moneda, caja_id: input.cajaId, cuenta: input.cuentaCaja,
    caja_mov_id: null, saldo_restante: saldoRestante, nota: input.nota?.trim() || null,
    actor: input.actor, actor_name: input.actorName ?? null,
  }).select('*').single();
  if (abErr) throw abErr;

  // 3) Actualiza la cuenta (cobrado + estado).
  const nuevoCobrado = round2((Number(c.cobrado) || 0) + monto);
  const estado: EstadoCxC = nuevoCobrado >= c.monto - 0.01 ? 'saldada' : 'abierta';
  const { data: cu, error: cuErr } = await supabase.from(CXC)
    .update({ cobrado: nuevoCobrado, estado, updated_at: new Date().toISOString() })
    .eq('id', c.id).select('*').single();
  if (cuErr) throw cuErr;

  return { cuenta: cu as CuentaPorCobrar, cobro: ab as CobroCxC };
}
