/* ============================================================
   Golden Touch · RRHH · Anticipos y préstamos (deducciones con saldo)

   Se registran por persona y se descuentan por cuotas en la nómina hasta
   saldar. Cada descuento (o abono a mano, o lo que ya se había pagado de un
   préstamo histórico) es una fila en `anticipos_pagos`; el SALDO lo rehace la
   base a partir de esos abonos, así nadie lo escribe a mano y no se desfasa.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { AnticipoPago, AnticipoPrestamo } from '@/shared/lib/types';
import { money } from '@/shared/lib/format';
import { r2, agregarEntregaAMotivo, type AltaAnticipo } from './anticiposResumen';

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

export interface AcumulacionAnticipoInput {
  fecha: string;
  monto: number;
  motivo?: string | null;
  cuota_sugerida?: number | null;
}

/**
 * Suma un nuevo monto a un préstamo existente del mismo trabajador,
 * guardando la fecha, monto y motivo de la nueva entrega en el historial.
 */
export async function acumularAnticipo(
  anticipoId: string,
  input: AcumulacionAnticipoInput,
  actorEmail?: string,
  actorName?: string | null,
): Promise<AnticipoPrestamo> {
  const monto = r2(Number(input.monto) || 0);
  if (monto <= 0) throw new Error('El monto a sumar debe ser mayor que 0.');

  const ant = await getAnticipo(anticipoId);
  const nuevoTotal = r2((Number(ant.monto_total) || 0) + monto);
  const nuevoMotivo = agregarEntregaAMotivo(
    ant.motivo,
    ant.fecha,
    Number(ant.monto_total) || 0,
    {
      fecha: input.fecha,
      monto,
      motivo: input.motivo?.trim() || null,
    },
  );

  const fechaReciente = input.fecha && (!ant.fecha || input.fecha > ant.fecha) ? input.fecha : ant.fecha;
  const cuota = input.cuota_sugerida != null && Number(input.cuota_sugerida) > 0 ? r2(Number(input.cuota_sugerida)) : ant.cuota_sugerida;

  const patch: Record<string, unknown> = {
    monto_total: nuevoTotal,
    motivo: nuevoMotivo,
    fecha: fechaReciente,
    estado: 'activo',
  };
  if (cuota !== undefined) patch.cuota_sugerida = cuota;
  if (actorEmail) patch.creado_por = actorEmail;
  if (actorName) patch.actor_name = actorName;

  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', anticipoId).select('*').single();
  if (error) throw error;

  try {
    return await sincronizarSaldoAnticipo(anticipoId);
  } catch {
    return data as AnticipoPrestamo;
  }
}

/**
 * Alta desde la pestaña: común o en MODO HISTÓRICO.
 * Si el trabajador ya tiene un préstamo/anticipo ACTIVO del mismo tipo,
 * el nuevo monto se SUMA a lo que ya había pedido prestado y se registran las fechas.
 */
export async function registrarAnticipo(alta: AltaAnticipo, actorEmail?: string, actorName?: string | null): Promise<string> {
  if (!alta.historico) {
    const activos = await listAnticipos(alta.personal_id, true);
    const existente = activos.find((a) => a.tipo === alta.tipo && Number(a.saldo) > 0);
    if (existente) {
      const acumulado = await acumularAnticipo(
        existente.id,
        {
          fecha: alta.fecha,
          monto: Number(alta.monto_total) || 0,
          motivo: alta.motivo,
          cuota_sugerida: alta.cuota_sugerida,
        },
        actorEmail,
        actorName,
      );
      return acumulado.id;
    }

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

export interface ResultadoCotejo {
  consolidados: number;
  afectados: number;
  detalles: string[];
}

/**
 * Coteja y sincroniza préstamos de la base de datos:
 * Si un trabajador tiene múltiples préstamos activos del mismo tipo (ej. Keimer),
 * los unifica en uno solo sumando los montos totales, moviendo sus abonos
 * y registrando el desglose de fechas y motivos.
 */
export async function cotejarYSincronizarPrestamos(
  actorEmail?: string,
  actorName?: string | null,
): Promise<ResultadoCotejo> {
  const todosActivos = await listAnticipos(undefined, true);
  const grupos = new Map<string, AnticipoPrestamo[]>();

  for (const a of todosActivos) {
    if (Number(a.saldo) <= 0) continue;
    const clave = `${a.personal_id}__${a.tipo}`;
    const arr = grupos.get(clave) ?? [];
    arr.push(a);
    grupos.set(clave, arr);
  }

  let consolidados = 0;
  let afectados = 0;
  const detalles: string[] = [];

  for (const [, items] of grupos.entries()) {
    if (items.length <= 1) continue;

    // Orden cronológico ascendente (el más antiguo será el principal a conservar)
    const ordenados = [...items].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.created_at).localeCompare(String(b.created_at)));
    const principal = ordenados[0];
    const secundarios = ordenados.slice(1);

    let montoAcumulado = Number(principal.monto_total) || 0;
    let motivoAcumulado = principal.motivo ?? '';
    let fechaFinal = principal.fecha;

    for (const sec of secundarios) {
      const montoSec = Number(sec.monto_total) || 0;
      motivoAcumulado = agregarEntregaAMotivo(
        motivoAcumulado,
        fechaFinal,
        montoAcumulado,
        {
          fecha: sec.fecha,
          monto: montoSec,
          motivo: sec.motivo,
        },
      );
      montoAcumulado = r2(montoAcumulado + montoSec);
      if (sec.fecha > fechaFinal) fechaFinal = sec.fecha;

      // Reasignar abonos del secundario al principal
      await supabase.from(PAGOS).update({ anticipo_id: principal.id }).eq('anticipo_id', sec.id);

      // Eliminar el secundario ya integrado
      await supabase.from(TABLE).delete().eq('id', sec.id);
      consolidados++;
    }

    // Actualizar el principal con el monto acumulado, nuevo motivo y fecha más reciente
    await supabase.from(TABLE).update({
      monto_total: montoAcumulado,
      motivo: motivoAcumulado,
      fecha: fechaFinal,
      ...(actorEmail ? { creado_por: actorEmail } : {}),
      ...(actorName ? { actor_name: actorName } : {}),
    }).eq('id', principal.id);

    // Recalcular saldo exacto a partir de todos los abonos
    const actualizado = await sincronizarSaldoAnticipo(principal.id);

    afectados++;
    detalles.push(`Consolidados ${ordenados.length} préstamos en 1: Total ${money(montoAcumulado)}, saldo pendiente ${money(actualizado.saldo)}`);
  }

  return { consolidados, afectados, detalles };
}
