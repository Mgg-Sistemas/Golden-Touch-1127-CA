/* ============================================================
   Golden Touch · Tesorería · Caja multimoneda (saldos + lotes + promedio)
   Una caja contiene varias monedas (Bs, USD, USDT, COP). Bs se
   divide en dos cuentas: jurídica y personal. Cada moneda lleva
   su saldo y una TASA PROMEDIO PONDERADA (Bs por unidad), igual
   que el PMP del inventario: un ingreso recalcula el promedio,
   un egreso sale a esa tasa. Cada ingreso queda como un "lote"
   para la trazabilidad de a qué tasa entró cada parte.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { CajaSaldo, CajaLote, CuentaCaja } from '@/shared/lib/types';

const SALDOS = 'caja_saldos';
const LOTES = 'caja_lotes';

export function round2(n: number): number { return Math.round((Number(n) || 0) * 100) / 100; }
export function round4(n: number): number { return Math.round((Number(n) || 0) * 10000) / 10000; }

/** Saldos de todas las cajas (con nombre de caja). */
export async function listSaldos(): Promise<CajaSaldo[]> {
  const { data, error } = await supabase
    .from(SALDOS)
    .select('*, caja:cajas(nombre)')
    .order('moneda', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CajaSaldo[];
}

/** Saldos de una caja puntual. */
export async function saldosDeCaja(cajaId: string): Promise<CajaSaldo[]> {
  const { data, error } = await supabase.from(SALDOS).select('*').eq('caja_id', cajaId).order('moneda');
  if (error) throw error;
  return (data ?? []) as CajaSaldo[];
}

export interface IngresarDivisaInput {
  cajaId: string;
  cuenta: CuentaCaja;
  moneda: string;
  monto: number;
  /** Bs por 1 unidad de la moneda al comprarla (para USD/USDT/COP). Bs = 1. */
  tasaBs?: number | null;
  origen?: string | null;
  motivo?: string | null;
  actor: string;
  actorName?: string | null;
}

/**
 * Ingresa divisa a una caja: suma al saldo y recalcula la tasa promedio
 * ponderada. Registra el lote (trazabilidad). Devuelve el saldo actualizado.
 */
export async function ingresarDivisa(input: IngresarDivisaInput): Promise<CajaSaldo> {
  const monto = round2(input.monto);
  if (monto <= 0) throw new Error('El monto debe ser mayor que 0.');
  const esBs = input.moneda === 'Bs';
  const tasaBs = esBs ? 1 : round4(Number(input.tasaBs) || 0);
  if (!esBs && tasaBs <= 0) throw new Error('Indicá la tasa de compra (Bs por unidad).');

  // Saldo actual de (caja, cuenta, moneda).
  const { data: actual } = await supabase
    .from(SALDOS)
    .select('id, saldo, tasa_prom')
    .eq('caja_id', input.cajaId).eq('cuenta', input.cuenta).eq('moneda', input.moneda)
    .maybeSingle();

  const saldoAntes = Number(actual?.saldo) || 0;
  const tasaAntes = Number(actual?.tasa_prom) || 0;
  const saldoDespues = round2(saldoAntes + monto);
  // Promedio ponderado (Bs por unidad). Bs siempre 1.
  const tasaProm = esBs
    ? 1
    : (saldoAntes > 0 && tasaAntes > 0
        ? round4((saldoAntes * tasaAntes + monto * tasaBs) / saldoDespues)
        : tasaBs);

  // Upsert del saldo.
  const { data: up, error: upErr } = await supabase
    .from(SALDOS)
    .upsert(
      { caja_id: input.cajaId, cuenta: input.cuenta, moneda: input.moneda, saldo: saldoDespues, tasa_prom: tasaProm, updated_at: new Date().toISOString() },
      { onConflict: 'caja_id,cuenta,moneda' },
    )
    .select('*')
    .single();
  if (upErr) throw upErr;

  // Lote para la trazabilidad.
  const { error: loteErr } = await supabase.from(LOTES).insert({
    caja_id: input.cajaId, cuenta: input.cuenta, moneda: input.moneda,
    monto, tasa_bs: esBs ? null : tasaBs,
    origen: input.origen ?? null, motivo: input.motivo ?? null,
    actor: input.actor, actor_name: input.actorName ?? null,
  });
  if (loteErr) throw loteErr;

  // Movimiento en el libro de la caja (para el historial visible).
  await supabase.from('movimientos_caja').insert({
    caja_id: input.cajaId, tipo: 'ingreso', monto, moneda: input.moneda,
    cuenta: input.cuenta, tasa_bs: esBs ? null : tasaBs,
    saldo_antes: saldoAntes, saldo_despues: saldoDespues,
    motivo: input.motivo ?? input.origen ?? 'Ingreso de divisa',
    actor: input.actor, actor_name: input.actorName ?? null,
  });

  return up as CajaSaldo;
}

/** Trazabilidad: lotes (ingresos) de una caja, filtrable por moneda/cuenta. */
export async function listLotes(filtros: { cajaId: string; moneda?: string; cuenta?: CuentaCaja }): Promise<CajaLote[]> {
  let q = supabase.from(LOTES).select('*').eq('caja_id', filtros.cajaId).order('created_at', { ascending: false });
  if (filtros.moneda) q = q.eq('moneda', filtros.moneda);
  if (filtros.cuenta) q = q.eq('cuenta', filtros.cuenta);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CajaLote[];
}

export interface EgresarDivisaInput {
  cajaId: string;
  cuenta: CuentaCaja;
  moneda: string;
  monto: number;             // EN LA MONEDA de la cuenta
  concepto?: string | null;
  categoria?: string | null; // ej. 'pago_oc'
  // Opcional: etiqueta de gasto (categoría/subcategoría del catálogo jerárquico).
  gastoCategoria?: string | null;
  gastoSubcategoria?: string | null;
  refOrdenId?: string | null;
  actor: string;
  actorName?: string | null;
}

/**
 * Egreso de una (caja, cuenta, moneda) puntual: descuenta del saldo multimoneda
 * (valida fondos) y deja el movimiento en el libro de la caja. Se usa para el
 * multipago de una OC desde la caja Multimoneda (una pata por moneda).
 */
export async function egresarDivisa(input: EgresarDivisaInput): Promise<{ id: string }> {
  const monto = round2(input.monto);
  if (monto <= 0) throw new Error('El monto debe ser mayor que 0.');

  const { data: actual } = await supabase
    .from(SALDOS)
    .select('id, saldo, tasa_prom')
    .eq('caja_id', input.cajaId).eq('cuenta', input.cuenta).eq('moneda', input.moneda)
    .maybeSingle();
  const saldoAntes = Number(actual?.saldo) || 0;
  if (monto > saldoAntes)
    throw new Error(`Saldo insuficiente en ${input.moneda}${input.cuenta !== 'general' ? ` (${input.cuenta})` : ''}. Disponible: ${saldoAntes}.`);
  const saldoDespues = round2(saldoAntes - monto);
  const tasaBs = input.moneda === 'Bs' ? null : (Number(actual?.tasa_prom) || null);

  const { error: upErr } = await supabase
    .from(SALDOS)
    .update({ saldo: saldoDespues, updated_at: new Date().toISOString() })
    .eq('caja_id', input.cajaId).eq('cuenta', input.cuenta).eq('moneda', input.moneda);
  if (upErr) throw upErr;

  const { data: mov, error: movErr } = await supabase.from('movimientos_caja').insert({
    caja_id: input.cajaId, tipo: 'salida', monto, moneda: input.moneda, cuenta: input.cuenta,
    tasa_bs: tasaBs, saldo_antes: saldoAntes, saldo_despues: saldoDespues,
    motivo: input.concepto?.trim() || 'Pago de compra', categoria: input.categoria ?? 'pago_oc',
    gasto_categoria: input.gastoCategoria?.trim() || null,
    gasto_subcategoria: input.gastoSubcategoria?.trim() || null,
    ref_orden_id: input.refOrdenId ?? null,
    actor: input.actor, actor_name: input.actorName ?? null,
  }).select('id').single();
  if (movErr) throw movErr;
  return mov as { id: string };
}

export interface TrasladoLeg { cuenta: CuentaCaja; moneda: string; monto: number; }

/**
 * Traslada dinero de una caja a otra (p. ej. a un Centro de Acopio) por moneda:
 * descuenta cada (cuenta, moneda) del origen y la suma al destino recalculando
 * su tasa promedio ponderada. Registra ambos lados en el libro (traslado_salida /
 * traslado_entrada) con el motivo. El motivo es OBLIGATORIO.
 */
export async function trasladoEntreCajasMulti(input: {
  origenId: string; destinoId: string; legs: TrasladoLeg[]; motivo: string;
  origenNombre?: string; destinoNombre?: string; actor: string; actorName?: string | null;
}): Promise<void> {
  if (!input.origenId || !input.destinoId) throw new Error('Elegí caja origen y destino.');
  if (input.origenId === input.destinoId) throw new Error('El origen y el destino no pueden ser la misma caja.');
  if (!input.motivo?.trim()) throw new Error('El motivo es obligatorio.');
  const legs = (input.legs ?? []).map((l) => ({ ...l, monto: round2(l.monto) })).filter((l) => l.monto > 0);
  if (!legs.length) throw new Error('Indicá al menos un monto a trasladar.');
  const motivo = input.motivo.trim();
  const now = new Date().toISOString();

  for (const leg of legs) {
    // ── Origen: validar fondos y descontar ──
    const { data: orig } = await supabase.from(SALDOS).select('id, saldo, tasa_prom')
      .eq('caja_id', input.origenId).eq('cuenta', leg.cuenta).eq('moneda', leg.moneda).maybeSingle();
    const saldoAntesO = Number(orig?.saldo) || 0;
    if (leg.monto > saldoAntesO)
      throw new Error(`Saldo insuficiente en ${leg.moneda}${leg.cuenta !== 'general' ? ` (${leg.cuenta})` : ''}. Disponible: ${saldoAntesO}.`);
    const tasaOrigen = leg.moneda === 'Bs' ? 1 : (Number(orig?.tasa_prom) || 0);
    const saldoDespuesO = round2(saldoAntesO - leg.monto);
    await supabase.from(SALDOS).update({ saldo: saldoDespuesO, updated_at: now })
      .eq('caja_id', input.origenId).eq('cuenta', leg.cuenta).eq('moneda', leg.moneda);
    await supabase.from('movimientos_caja').insert({
      caja_id: input.origenId, tipo: 'traslado_salida', monto: leg.monto, moneda: leg.moneda, cuenta: leg.cuenta,
      tasa_bs: leg.moneda === 'Bs' ? null : (tasaOrigen || null), saldo_antes: saldoAntesO, saldo_despues: saldoDespuesO,
      motivo: `Traslado a ${input.destinoNombre ?? 'Centro de Acopio'} · ${motivo}`, categoria: 'traslado',
      actor: input.actor, actor_name: input.actorName ?? null,
    });

    // ── Destino: sumar y recalcular promedio ponderado ──
    const { data: dest } = await supabase.from(SALDOS).select('id, saldo, tasa_prom')
      .eq('caja_id', input.destinoId).eq('cuenta', leg.cuenta).eq('moneda', leg.moneda).maybeSingle();
    const saldoAntesD = Number(dest?.saldo) || 0;
    const tasaDest = Number(dest?.tasa_prom) || 0;
    const saldoDespuesD = round2(saldoAntesD + leg.monto);
    const nuevaTasa = leg.moneda === 'Bs' ? 1
      : (saldoDespuesD > 0 ? round4((saldoAntesD * tasaDest + leg.monto * tasaOrigen) / saldoDespuesD) : tasaOrigen);
    await supabase.from(SALDOS).upsert(
      { caja_id: input.destinoId, cuenta: leg.cuenta, moneda: leg.moneda, saldo: saldoDespuesD, tasa_prom: nuevaTasa, updated_at: now },
      { onConflict: 'caja_id,cuenta,moneda' },
    );
    await supabase.from('movimientos_caja').insert({
      caja_id: input.destinoId, tipo: 'traslado_entrada', monto: leg.monto, moneda: leg.moneda, cuenta: leg.cuenta,
      tasa_bs: leg.moneda === 'Bs' ? null : (nuevaTasa || null), saldo_antes: saldoAntesD, saldo_despues: saldoDespuesD,
      motivo: `Traslado desde ${input.origenNombre ?? 'caja'} · ${motivo}`, categoria: 'traslado',
      actor: input.actor, actor_name: input.actorName ?? null,
    });
  }
}

/**
 * CONVIERTE dinero entre dos monedas DENTRO de la misma caja (desde saldos existentes).
 * Ej.: 1000 USD → Bs a una tasa: descuenta 1000 del saldo USD y suma el equivalente al
 * saldo Bs (o viceversa). Deja ambos movimientos en el libro con categoría 'conversion'.
 */
export async function convertirDivisaEnCaja(input: {
  cajaId: string;
  desde: { cuenta: CuentaCaja; moneda: string; monto: number };
  hacia: { cuenta: CuentaCaja; moneda: string; monto: number };
  /** Bs por 1 unidad de la moneda destino (1 si Bs) — para su tasa promedio. */
  tasaBsHacia?: number | null;
  actor: string;
  actorName?: string | null;
}): Promise<void> {
  const dMonto = round2(input.desde.monto);
  const hMonto = round2(input.hacia.monto);
  if (dMonto <= 0 || hMonto <= 0) throw new Error('Indicá montos válidos para convertir.');
  if (input.desde.moneda === input.hacia.moneda && input.desde.cuenta === input.hacia.cuenta)
    throw new Error('Elegí monedas (o cuentas) distintas para convertir.');
  const now = new Date().toISOString();

  // 1) Descontar del saldo ORIGEN (valida fondos).
  const { data: orig } = await supabase.from(SALDOS).select('id, saldo, tasa_prom')
    .eq('caja_id', input.cajaId).eq('cuenta', input.desde.cuenta).eq('moneda', input.desde.moneda).maybeSingle();
  const saldoAntesO = Number(orig?.saldo) || 0;
  if (dMonto > saldoAntesO)
    throw new Error(`Saldo insuficiente en ${input.desde.moneda}${input.desde.cuenta !== 'general' ? ` (${input.desde.cuenta})` : ''}. Disponible: ${saldoAntesO}.`);
  const saldoDespuesO = round2(saldoAntesO - dMonto);
  await supabase.from(SALDOS).update({ saldo: saldoDespuesO, updated_at: now })
    .eq('caja_id', input.cajaId).eq('cuenta', input.desde.cuenta).eq('moneda', input.desde.moneda);
  await supabase.from('movimientos_caja').insert({
    caja_id: input.cajaId, tipo: 'salida', monto: dMonto, moneda: input.desde.moneda, cuenta: input.desde.cuenta,
    tasa_bs: input.desde.moneda === 'Bs' ? null : (Number(orig?.tasa_prom) || null),
    saldo_antes: saldoAntesO, saldo_despues: saldoDespuesO,
    motivo: `Conversión ${input.desde.moneda} → ${input.hacia.moneda}`, categoria: 'conversion',
    actor: input.actor, actor_name: input.actorName ?? null,
  });

  // 2) Sumar al saldo DESTINO (recalcula promedio ponderado).
  const esBsH = input.hacia.moneda === 'Bs';
  const tasaH = esBsH ? 1 : round4(Number(input.tasaBsHacia) || 0);
  const { data: dest } = await supabase.from(SALDOS).select('id, saldo, tasa_prom')
    .eq('caja_id', input.cajaId).eq('cuenta', input.hacia.cuenta).eq('moneda', input.hacia.moneda).maybeSingle();
  const saldoAntesD = Number(dest?.saldo) || 0;
  const tasaDest = Number(dest?.tasa_prom) || 0;
  const saldoDespuesD = round2(saldoAntesD + hMonto);
  const nuevaTasa = esBsH ? 1
    : (saldoAntesD > 0 && tasaDest > 0 ? round4((saldoAntesD * tasaDest + hMonto * tasaH) / saldoDespuesD) : (tasaH || tasaDest || 0));
  await supabase.from(SALDOS).upsert(
    { caja_id: input.cajaId, cuenta: input.hacia.cuenta, moneda: input.hacia.moneda, saldo: saldoDespuesD, tasa_prom: nuevaTasa, updated_at: now },
    { onConflict: 'caja_id,cuenta,moneda' });
  await supabase.from(LOTES).insert({
    caja_id: input.cajaId, cuenta: input.hacia.cuenta, moneda: input.hacia.moneda,
    monto: hMonto, tasa_bs: esBsH ? null : tasaH,
    origen: `Conversión desde ${input.desde.moneda}`, motivo: `Conversión ${input.desde.moneda} → ${input.hacia.moneda}`,
    actor: input.actor, actor_name: input.actorName ?? null,
  });
  await supabase.from('movimientos_caja').insert({
    caja_id: input.cajaId, tipo: 'ingreso', monto: hMonto, moneda: input.hacia.moneda, cuenta: input.hacia.cuenta,
    tasa_bs: esBsH ? null : tasaH, saldo_antes: saldoAntesD, saldo_despues: saldoDespuesD,
    motivo: `Conversión desde ${input.desde.moneda}`, categoria: 'conversion',
    actor: input.actor, actor_name: input.actorName ?? null,
  });
}

/** Ajusta (fija) el saldo y/o la tasa promedio de una (caja, cuenta, moneda). */
export async function ajustarSaldoDivisa(input: {
  cajaId: string; cuenta: CuentaCaja; moneda: string; saldo: number; tasaProm?: number | null;
}): Promise<void> {
  const saldo = round2(input.saldo);
  const tasaProm = input.moneda === 'Bs' ? 1 : (input.tasaProm != null ? round4(input.tasaProm) : null);
  const { error } = await supabase.from(SALDOS).upsert(
    { caja_id: input.cajaId, cuenta: input.cuenta, moneda: input.moneda, saldo, tasa_prom: tasaProm, updated_at: new Date().toISOString() },
    { onConflict: 'caja_id,cuenta,moneda' },
  );
  if (error) throw error;
}
