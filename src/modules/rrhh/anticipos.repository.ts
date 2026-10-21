/* ============================================================
   Golden Touch · RRHH · Anticipos y préstamos (deducciones con saldo)

   Se registran por persona y se descuentan por cuotas en la nómina hasta
   saldar. Cada descuento (o abono a mano, o lo que ya se había pagado de un
   préstamo histórico) es una fila en `anticipos_pagos`; el SALDO lo rehace la
   base a partir de esos abonos, así nadie lo escribe a mano y no se desfasa.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { AnticipoPago, AnticipoPrestamo } from '@/shared/lib/types';
import { r2, type AltaAnticipo } from './anticiposResumen';

const TABLE = 'anticipos_prestamos';
const PAGOS = 'anticipos_pagos';

export async function listAnticipos(personalId?: string, soloActivos = false): Promise<AnticipoPrestamo[]> {
  let q = supabase.from(TABLE).select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false });
  if (personalId) q = q.eq('personal_id', personalId);
  if (soloActivos) q = q.eq('estado', 'activo');
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AnticipoPrestamo[];
}

/** Activos con saldo > 0 de TODO el personal (para armar la nómina). */
export async function listAnticiposActivos(): Promise<AnticipoPrestamo[]> {
  const { data, error } = await supabase.from(TABLE).select('*').eq('estado', 'activo').gt('saldo', 0).order('fecha', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AnticipoPrestamo[];
}

/** Compatibilidad con el alta simple (nómina y otros): sin fecha ni histórico. */
export interface AnticipoInput {
  personal_id: string;
  tipo: 'anticipo' | 'prestamo';
  monto_total: number;
  cuota_sugerida?: number | null;
  motivo?: string | null;
  fecha?: string | null;
}

export async function crearAnticipo(input: AnticipoInput, actorEmail?: string, actorName?: string | null): Promise<AnticipoPrestamo> {
  const monto = r2(Number(input.monto_total) || 0);
  if (!input.personal_id) throw new Error('Indica a quién corresponde.');
  if (monto <= 0) throw new Error('El monto debe ser mayor que 0.');
  const { data, error } = await supabase.from(TABLE).insert({
    personal_id: input.personal_id,
    tipo: input.tipo,
    fecha: input.fecha || new Date().toISOString().slice(0, 10),
    monto_total: monto,
    saldo: monto,
    cuota_sugerida: input.cuota_sugerida != null ? r2(Number(input.cuota_sugerida)) : null,
    motivo: input.motivo?.trim() || null,
    creado_por: actorEmail ?? null,
    actor_name: actorName ?? null,
  }).select('*').single();
  if (error) throw error;
  return data as AnticipoPrestamo;
}

/**
 * Alta desde la pestaña: común o en MODO HISTÓRICO. El histórico va por una
 * función de la base que crea el préstamo y su abono «ya pagado» en un solo
 * paso: o entran los dos o no entra ninguno.
 */
export async function registrarAnticipo(alta: AltaAnticipo, actorEmail?: string, actorName?: string | null): Promise<string> {
  if (!alta.historico) {
    const creado = await crearAnticipo({
      personal_id: alta.personal_id, tipo: alta.tipo, monto_total: Number(alta.monto_total) || 0,
      cuota_sugerida: alta.cuota_sugerida, motivo: alta.motivo, fecha: alta.fecha,
    }, actorEmail, actorName);
    return creado.id;
  }
  const { data, error } = await supabase.rpc('anticipos_cargar_historico', {
    p_personal_id: alta.personal_id,
    p_tipo: alta.tipo,
    p_fecha: alta.fecha,
    p_monto_total: r2(Number(alta.monto_total) || 0),
    p_abonado: alta.abonado != null ? r2(alta.abonado) : 0,
    p_fecha_abono: alta.abonado && alta.abonado > 0 ? alta.fecha_abono : alta.fecha,
    p_motivo: alta.motivo?.trim() || null,
    p_cuota: alta.cuota_sugerida != null ? r2(alta.cuota_sugerida) : null,
    p_actor: actorEmail ?? null,
    p_actor_name: actorName ?? null,
  });
  if (error) throw error;
  return String(data);
}

export interface EdicionAnticipo {
  tipo?: 'anticipo' | 'prestamo';
  fecha?: string;
  monto_total?: number;
  cuota_sugerida?: number | null;
  motivo?: string | null;
}

/** Corrige los datos de un préstamo. Si cambia el total, la base rehace el saldo con los abonos. */
export async function editarAnticipo(id: string, cambios: EdicionAnticipo): Promise<AnticipoPrestamo> {
  const patch: Record<string, unknown> = {};
  if (cambios.tipo) patch.tipo = cambios.tipo;
  if (cambios.fecha) patch.fecha = cambios.fecha;
  if (cambios.monto_total != null) {
    const m = r2(cambios.monto_total);
    if (m <= 0) throw new Error('El monto debe ser mayor que 0.');
    patch.monto_total = m;
  }
  if ('cuota_sugerida' in cambios) patch.cuota_sugerida = cambios.cuota_sugerida != null ? r2(cambios.cuota_sugerida) : null;
  if ('motivo' in cambios) patch.motivo = cambios.motivo?.trim() || null;
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data as AnticipoPrestamo;
}

export async function eliminarAnticipo(id: string): Promise<void> {
  const { data, error } = await supabase.from(TABLE).delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No se pudo eliminar: sin permiso o ya no existía.');
}

export async function getAnticipo(id: string): Promise<AnticipoPrestamo> {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (error) throw error;
  return data as AnticipoPrestamo;
}

/**
 * Recalcula y sincroniza el saldo y estado de un préstamo a partir de la suma
 * de todos sus abonos registrados en `anticipos_pagos`.
 */
export async function sincronizarSaldoAnticipo(anticipoId: string): Promise<AnticipoPrestamo> {
  const { data: ant, error: antErr } = await supabase.from(TABLE).select('*').eq('id', anticipoId).single();
  if (antErr) throw antErr;

  const { data: pagos, error: pagosErr } = await supabase.from(PAGOS).select('monto').eq('anticipo_id', anticipoId);
  if (pagosErr) throw pagosErr;

  const totalPagado = (pagos ?? []).reduce((acc, p) => acc + (Number(p.monto) || 0), 0);
  const montoTotal = Number(ant.monto_total) || 0;
  const nuevoSaldo = Math.max(0, r2(montoTotal - totalPagado));
  const nuevoEstado = nuevoSaldo <= 0 ? 'saldado' : 'activo';

  const { data: updated, error: updErr } = await supabase.from(TABLE).update({
    saldo: nuevoSaldo,
    estado: nuevoEstado,
  }).eq('id', anticipoId).select('*').single();
  if (updErr) throw updErr;

  return updated as AnticipoPrestamo;
}

/* ───────────── Abonos ───────────── */

export async function listPagos(anticipoId: string): Promise<AnticipoPago[]> {
  const { data, error } = await supabase.from(PAGOS).select('*').eq('anticipo_id', anticipoId)
    .order('fecha', { ascending: true }).order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AnticipoPago[];
}

/** Todos los abonos de varios préstamos (para el PDF por trabajador o el listado). */
export async function listPagosDe(anticipoIds: string[]): Promise<AnticipoPago[]> {
  if (!anticipoIds.length) return [];
  const { data, error } = await supabase.from(PAGOS).select('*').in('anticipo_id', anticipoIds)
    .order('fecha', { ascending: true }).order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AnticipoPago[];
}

export interface AbonoInput {
  fecha: string;
  monto: number;
  nota?: string | null;
  origen?: 'manual' | 'historico' | 'nomina';
}

/** Abono a mano (fuera de nómina). La base rechaza el que supere el saldo. */
export async function registrarAbono(anticipoId: string, input: AbonoInput, actorEmail?: string, actorName?: string | null): Promise<AnticipoPago> {
  const monto = r2(Number(input.monto) || 0);
  if (monto <= 0) throw new Error('El abono debe ser mayor que 0.');
  const { data, error } = await supabase.from(PAGOS).insert({
    anticipo_id: anticipoId, fecha: input.fecha, monto, origen: input.origen ?? 'manual',
    nota: input.nota?.trim() || null, created_by: actorEmail ?? null, actor_name: actorName ?? null,
  }).select('*').single();
  if (error) throw error;
  try { await sincronizarSaldoAnticipo(anticipoId); } catch { /* ignore */ }
  return data as AnticipoPago;
}

export interface EdicionAbono {
  fecha?: string;
  monto?: number;
  origen?: 'manual' | 'historico' | 'nomina';
  nota?: string | null;
}

/**
 * Permite editar todos los campos de un abono (fecha, monto, origen, nota)
 * y sincroniza automáticamente el saldo y estado del préstamo.
 */
export async function editarAbono(
  id: string,
  cambios: EdicionAbono,
  actorEmail?: string,
  actorName?: string | null,
): Promise<AnticipoPago> {
  const patch: Record<string, unknown> = {};
  if (cambios.fecha) patch.fecha = cambios.fecha;
  if (cambios.monto != null) {
    const m = r2(cambios.monto);
    if (m <= 0) throw new Error('El abono debe ser mayor que 0.');
    patch.monto = m;
  }
  if (cambios.origen) patch.origen = cambios.origen;
  if ('nota' in cambios) patch.nota = cambios.nota?.trim() || null;
  if (actorEmail) patch.created_by = actorEmail;
  if (actorName) patch.actor_name = actorName;

  const { data, error } = await supabase.from(PAGOS).update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  const pagoActualizado = data as AnticipoPago;

  try {
    await sincronizarSaldoAnticipo(pagoActualizado.anticipo_id);
  } catch (syncErr) {
    console.error('Error sincronizando saldo tras editar abono:', syncErr);
  }

  return pagoActualizado;
}

/** Borra un abono: el saldo del préstamo vuelve a subir. */
export async function eliminarAbono(id: string): Promise<void> {
  const { data: pago } = await supabase.from(PAGOS).select('anticipo_id').eq('id', id).maybeSingle();
  const { data, error } = await supabase.from(PAGOS).delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No se pudo eliminar el abono: sin permiso o ya no existía.');
  if (pago?.anticipo_id) {
    try { await sincronizarSaldoAnticipo(pago.anticipo_id); } catch { /* ignore */ }
  }
}

/** Descuenta `monto` del saldo registrándolo como abono manual (al pagar un renglón fuera de nómina). */
export async function descontarSaldo(id: string, monto: number, actorEmail?: string, actorName?: string | null): Promise<void> {
  const { data, error } = await supabase.from(TABLE).select('saldo').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return;
  const abono = Math.min(r2(Number(monto) || 0), r2(Number(data.saldo) || 0));
  if (abono <= 0) return;
  await registrarAbono(id, { fecha: new Date().toISOString().slice(0, 10), monto: abono }, actorEmail, actorName);
}
