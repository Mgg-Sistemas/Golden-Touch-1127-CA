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
  /** La venta que ABRIÓ la cuenta (no todas: la cuenta es corriente y acumula). */
  ref_venta_id?: string | null;
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
  /** La venta a crédito que generó ESTE cargo. Acá se ve venta por venta: la
   *  cuenta acumula varias ventas del mismo cliente, el cargo no. */
  ref_venta_id?: string | null;
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
 *
 * La cuenta y su cargo son DOS escrituras que valen las dos o ninguna: si la
 * segunda falla, queda una deuda cargada sin el renglón que dice de dónde salió.
 * Por eso la regla vive en la base (`crear_o_acumular_cxc`) y acá solo se la
 * llama. Además así una venta a crédito puede confirmarse y cargarle la deuda al
 * cliente en la MISMA transacción: un corte de red en el medio ya no puede dejar
 * una venta a crédito sin deuda registrada.
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
  const { data, error } = await supabase.rpc('crear_o_acumular_cxc', {
    p_tipo: input.tipo,
    p_contraparte: input.contraparte.trim(),
    p_monto: round2(input.monto),
    p_moneda: input.moneda,
    p_cuenta: input.cuenta ?? null,
    p_caja_id: input.cajaId ?? null,
    p_caja_mov_id: input.cajaMovId ?? null,
    p_nota: input.nota?.trim() || null,
    p_actor: input.actor ?? null,
    p_actor_name: input.actorName ?? null,
  });
  if (error) throw error;
  return data as CuentaPorCobrar;
}

/**
 * RESTA un cargo de una cuenta por cobrar y deja un cargo negativo como rastro.
 * La usa la anulación de una venta a crédito: la cuenta del cliente es CORRIENTE
 * y la comparten otras ventas, así que anular una NO cierra la cuenta — le resta
 * lo de esa venta y nada más. Se niega si dejara la cuenta con más cobrado que
 * debido: esa plata hay que devolverla primero.
 */
export async function revertirCargoCuentaPorCobrar(input: {
  cuentaId: string;
  monto: number;
  nota?: string | null;
  actor?: string | null;
  actorName?: string | null;
}): Promise<CuentaPorCobrar> {
  const { data, error } = await supabase.rpc('revertir_cargo_cxc', {
    p_cuenta_id: input.cuentaId,
    p_monto: round2(input.monto),
    p_nota: input.nota?.trim() || null,
    p_actor: input.actor ?? null,
    p_actor_name: input.actorName ?? null,
  });
  if (error) throw error;
  return data as CuentaPorCobrar;
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
  // GT-SIN-02 · Mismo criterio que en cuentas por pagar: el cobrado se recalcula
  // sumando la tabla de cobros (fuente de verdad, ya con la fila recién
  // insertada) y se escribe con `lte` para que una lectura vieja no lo haga
  // retroceder pisando el cobro de otro usuario.
  const { data: filasCobros, error: sumErr } = await supabase
    .from(CXC_ABONOS).select('monto').eq('cuenta_id', c.id);
  if (sumErr) throw sumErr;
  const nuevoCobrado = round2((filasCobros ?? []).reduce((a, r) => a + (Number(r.monto) || 0), 0));
  const estado: EstadoCxC = nuevoCobrado >= c.monto - 0.01 ? 'saldada' : 'abierta';
  const { data: cuOk, error: cuErr } = await supabase.from(CXC)
    .update({ cobrado: nuevoCobrado, estado, updated_at: new Date().toISOString() })
    .eq('id', c.id)
    .lte('cobrado', nuevoCobrado)
    .select('*').maybeSingle();
  if (cuErr) throw cuErr;
  let cu = cuOk;
  if (!cu) {
    const { data: actual } = await supabase.from(CXC).select('*').eq('id', c.id).single();
    cu = actual;
  }

  return { cuenta: cu as CuentaPorCobrar, cobro: ab as CobroCxC };
}
