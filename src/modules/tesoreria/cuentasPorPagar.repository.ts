/* ============================================================
   MGG · Tesorería · Cuentas por pagar (manuales)
   Un ingreso manual de dinero a caja marcado como Cliente o
   Proveedor genera una cuenta por pagar por el mismo monto, que
   se salda con abonos (egresos de caja). Independiente de los
   créditos de compras (OC), se muestra junto a ellos.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { registrarGasto } from './tesoreria.repository';
import type { CuentaCaja } from '@/shared/lib/types';

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

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const CXP = 'cuentas_por_pagar';
const CXP_ABONOS = 'cuentas_por_pagar_abonos';

/** Crea la cuenta por pagar que origina un ingreso manual (cliente/proveedor). */
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
  if (!input.contraparte.trim()) throw new Error('Indicá el cliente o proveedor.');
  const { data, error } = await supabase.from(CXP).insert({
    tipo: input.tipo, contraparte: input.contraparte.trim(), monto, abonado: 0,
    moneda: input.moneda, cuenta: input.cuenta ?? null, caja_id: input.cajaId ?? null,
    caja_mov_id: input.cajaMovId ?? null, estado: 'abierta', nota: input.nota?.trim() || null,
    actor: input.actor ?? null, actor_name: input.actorName ?? null,
  }).select('*').single();
  if (error) throw error;
  return data as CuentaPorPagar;
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
}): Promise<{ cuenta: CuentaPorPagar; abono: AbonoCxP }> {
  const c = input.cuenta;
  const monto = round2(input.monto);
  if (monto <= 0) throw new Error('El abono debe ser mayor que 0.');
  const saldoPrev = round2(c.monto - (Number(c.abonado) || 0));
  if (monto > saldoPrev + 0.01) throw new Error(`El abono (${monto}) supera el saldo pendiente (${saldoPrev} ${c.moneda}).`);

  // 1) Egreso real de la caja (misma moneda de la cuenta por pagar).
  const mov = await registrarGasto({
    cajaId: input.cajaId, monto, moneda: c.moneda, cuenta: input.cuentaCaja,
    concepto: `Abono cuenta por pagar · ${c.tipo === 'proveedor' ? 'Proveedor' : 'Cliente'}: ${c.contraparte}`,
    categoria: 'abono_cxp', actor: input.actor, actorName: input.actorName,
  });

  // 2) Registro del abono + saldo restante.
  const saldoRestante = round2(saldoPrev - monto);
  const { data: ab, error: abErr } = await supabase.from(CXP_ABONOS).insert({
    cuenta_id: c.id, monto, moneda: c.moneda, caja_id: input.cajaId, cuenta: input.cuentaCaja,
    caja_mov_id: mov.id, saldo_restante: saldoRestante, nota: input.nota?.trim() || null,
    actor: input.actor, actor_name: input.actorName ?? null,
  }).select('*').single();
  if (abErr) throw abErr;

  // 3) Actualiza la cuenta (abonado + estado).
  const nuevoAbonado = round2((Number(c.abonado) || 0) + monto);
  const estado: EstadoCxP = nuevoAbonado >= c.monto - 0.01 ? 'saldada' : 'abierta';
  const { data: cu, error: cuErr } = await supabase.from(CXP)
    .update({ abonado: nuevoAbonado, estado, updated_at: new Date().toISOString() })
    .eq('id', c.id).select('*').single();
  if (cuErr) throw cuErr;

  return { cuenta: cu as CuentaPorPagar, abono: ab as AbonoCxP };
}
