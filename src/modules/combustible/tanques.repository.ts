/* ============================================================
   Golden Touch · Combustible · TANQUES (réplica del Excel)
   Libro mayor de diésel por tanque, carga directa (sin aprobación):
     · ENTRADA  → suma litros y recalcula la tasa (promedio ponderado PMP).
     · USO      → descuenta litros al costo promedio (tasa) del tanque.
     · TRASLADO → descuenta del tanque origen y, si es entre tanques,
                  acredita el destino al costo (tasa) del origen.
   El saldo corriente (litros y USD) se acumula al listar, como en el Excel.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type {
  CatalogoCombustible,
  ConciliacionCombustible,
  MovimientoTanque,
  TanqueCombustible,
  TipoCatalogoCombustible,
  TipoMovTanque,
} from '@/shared/lib/types';

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round = (v: number, d = 4) => Math.round(v * 10 ** d) / 10 ** d;
const hoy = () => new Date().toISOString().slice(0, 10);

/* ───────────── Catálogos ───────────── */

export async function listCatalogos(): Promise<CatalogoCombustible[]> {
  const { data, error } = await supabase
    .from('combustible_catalogos')
    .select('*')
    .order('tipo', { ascending: true })
    .order('orden', { ascending: true })
    .order('valor', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CatalogoCombustible[];
}

export async function addCatalogo(tipo: TipoCatalogoCombustible, valor: string): Promise<CatalogoCombustible> {
  const v = valor.trim();
  if (!v) throw new Error('Indicá el valor.');
  const { data, error } = await supabase
    .from('combustible_catalogos')
    .insert({ tipo, valor: v, orden: 999 })
    .select('*')
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Ese valor ya existe en el catálogo.');
    throw error;
  }
  return data as CatalogoCombustible;
}

export async function setCatalogoActivo(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from('combustible_catalogos').update({ activo }).eq('id', id);
  if (error) throw error;
}

/* ───────────── Tanques ───────────── */

export async function listTanques(): Promise<TanqueCombustible[]> {
  const { data, error } = await supabase
    .from('combustible_tanques')
    .select('*')
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TanqueCombustible[];
}

export async function crearTanque(input: {
  nombre: string;
  capacidadLitros?: number;
  saldoLitros?: number;
  tasaUsdLitro?: number;
  ubicacion?: string | null;
  actor: string;
}): Promise<TanqueCombustible> {
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error('Indicá el nombre del tanque.');
  const saldoLitros = Math.max(0, num(input.saldoLitros));
  const tasa = Math.max(0, num(input.tasaUsdLitro));
  const { data, error } = await supabase
    .from('combustible_tanques')
    .insert({
      nombre,
      capacidad_litros: Math.max(0, num(input.capacidadLitros)),
      saldo_litros: saldoLitros,
      saldo_usd: round(saldoLitros * tasa, 2),
      tasa_usd_litro: tasa,
      ubicacion: input.ubicacion?.trim() || null,
      created_by: input.actor,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as TanqueCombustible;
}

export async function renombrarTanque(id: string, nombre: string): Promise<void> {
  const n = nombre.trim();
  if (!n) throw new Error('El nombre no puede estar vacío.');
  const { error } = await supabase.from('combustible_tanques').update({ nombre: n, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function setEstadoTanque(id: string, estado: 'activo' | 'inactivo'): Promise<void> {
  const { error } = await supabase.from('combustible_tanques').update({ estado, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

async function getTanque(id: string): Promise<TanqueCombustible> {
  const { data, error } = await supabase.from('combustible_tanques').select('*').eq('id', id).single();
  if (error || !data) throw error ?? new Error('Tanque no encontrado.');
  return data as TanqueCombustible;
}

async function aplicarSaldoTanque(id: string, saldoLitros: number, saldoUsd: number, tasa: number): Promise<void> {
  const { error } = await supabase
    .from('combustible_tanques')
    .update({ saldo_litros: round(saldoLitros, 2), saldo_usd: round(saldoUsd, 2), tasa_usd_litro: round(tasa, 4), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/* ───────────── Movimientos (libro mayor) ───────────── */

export async function listMovimientosTanque(tanqueId: string): Promise<MovimientoTanque[]> {
  const { data, error } = await supabase
    .from('combustible_tanque_movimientos')
    .select('*')
    .eq('tanque_id', tanqueId)
    .order('fecha', { ascending: true })
    .order('orden', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  // Saldos corridos (litros y USD), como en el Excel.
  let saldoL = 0;
  let saldoU = 0;
  return (data ?? []).map((row) => {
    const m = row as MovimientoTanque;
    if (m.tipo === 'entrada') { saldoL += num(m.litros); saldoU += num(m.monto_usd); }
    else { saldoL -= num(m.litros); saldoU -= num(m.monto_usd); }
    return { ...m, saldo_litros: round(saldoL, 2), saldo_usd: round(saldoU, 2) };
  });
}

/** Campos comunes de una fila del libro (se llenan desde el formulario). */
export interface MovimientoTanqueCampos {
  fecha?: string;
  hora?: string | null;
  equipo?: string | null;
  autorizado_por?: string | null;
  ubicacion?: string | null;
  observacion?: string | null;
  contadorGlobalIni?: number | null;
  contadorGlobalFin?: number | null;
  horometroIni?: number | null;
  horometroFin?: number | null;
}

async function insertarMovimiento(payload: Record<string, unknown>): Promise<MovimientoTanque> {
  const { data, error } = await supabase.from('combustible_tanque_movimientos').insert(payload).select('*').single();
  if (error) throw error;
  return data as MovimientoTanque;
}

function campos(c: MovimientoTanqueCampos): Record<string, unknown> {
  return {
    fecha: c.fecha || hoy(),
    hora: c.hora?.trim() || null,
    equipo: c.equipo?.trim() || null,
    autorizado_por: c.autorizado_por?.trim() || null,
    ubicacion: c.ubicacion?.trim() || null,
    observacion: c.observacion?.trim() || null,
    contador_global_ini: c.contadorGlobalIni ?? null,
    contador_global_fin: c.contadorGlobalFin ?? null,
    horometro_ini: c.horometroIni ?? null,
    horometro_fin: c.horometroFin ?? null,
  };
}

/** ENTRADA: entra combustible al tanque a un costo; recalcula la tasa PMP. */
export async function registrarEntrada(input: {
  tanqueId: string;
  litros: number;
  costoLitro: number;
  campos?: MovimientoTanqueCampos;
  actor: string;
  actorName?: string | null;
}): Promise<void> {
  const litros = num(input.litros);
  if (litros <= 0) throw new Error('Los litros deben ser mayores que 0.');
  const costo = Math.max(0, num(input.costoLitro));
  const t = await getTanque(input.tanqueId);

  const saldoL = num(t.saldo_litros) + litros;
  const saldoU = num(t.saldo_usd) + litros * costo;
  const tasa = saldoL > 0 ? saldoU / saldoL : costo; // promedio ponderado

  await insertarMovimiento({
    ...campos(input.campos ?? {}),
    tanque_id: input.tanqueId,
    tipo: 'entrada',
    litros,
    tasa_usd_litro: round(costo, 4),
    created_by: input.actor,
    actor_name: input.actorName ?? null,
  });
  await aplicarSaldoTanque(input.tanqueId, saldoL, saldoU, tasa);
}

/** USO: el equipo consume combustible del tanque (al costo promedio actual). */
export async function registrarUso(input: {
  tanqueId: string;
  litros: number;
  campos?: MovimientoTanqueCampos;
  actor: string;
  actorName?: string | null;
}): Promise<void> {
  const litros = num(input.litros);
  if (litros <= 0) throw new Error('Los litros deben ser mayores que 0.');
  const t = await getTanque(input.tanqueId);
  const tasa = num(t.tasa_usd_litro);

  await insertarMovimiento({
    ...campos(input.campos ?? {}),
    tanque_id: input.tanqueId,
    tipo: 'uso',
    litros,
    tasa_usd_litro: round(tasa, 4),
    created_by: input.actor,
    actor_name: input.actorName ?? null,
  });
  await aplicarSaldoTanque(input.tanqueId, num(t.saldo_litros) - litros, num(t.saldo_usd) - litros * tasa, tasa);
}

/**
 * TRASLADO: sale combustible del tanque origen. Si `tanqueDestinoId` está
 * presente, también ENTRA al tanque destino (al costo/tasa del origen).
 */
export async function registrarTraslado(input: {
  tanqueId: string;
  litros: number;
  tanqueDestinoId?: string | null;
  campos?: MovimientoTanqueCampos;
  actor: string;
  actorName?: string | null;
}): Promise<void> {
  const litros = num(input.litros);
  if (litros <= 0) throw new Error('Los litros deben ser mayores que 0.');
  if (input.tanqueDestinoId && input.tanqueDestinoId === input.tanqueId) throw new Error('El destino debe ser un tanque distinto.');
  const t = await getTanque(input.tanqueId);
  const tasa = num(t.tasa_usd_litro);

  await insertarMovimiento({
    ...campos(input.campos ?? {}),
    tanque_id: input.tanqueId,
    tipo: 'traslado',
    litros,
    tanque_destino_id: input.tanqueDestinoId ?? null,
    tasa_usd_litro: round(tasa, 4),
    created_by: input.actor,
    actor_name: input.actorName ?? null,
  });
  await aplicarSaldoTanque(input.tanqueId, num(t.saldo_litros) - litros, num(t.saldo_usd) - litros * tasa, tasa);

  // Si el traslado va a otro tanque, lo acreditamos como ENTRADA en el destino.
  if (input.tanqueDestinoId) {
    await registrarEntrada({
      tanqueId: input.tanqueDestinoId,
      litros,
      costoLitro: tasa,
      campos: { ...input.campos, observacion: `Traslado desde ${t.nombre}${input.campos?.observacion ? ' · ' + input.campos.observacion : ''}` },
      actor: input.actor,
      actorName: input.actorName ?? null,
    });
  }
}

export async function eliminarMovimientoTanque(mov: MovimientoTanque): Promise<void> {
  // Revierte el efecto en el saldo del tanque y borra la fila.
  const t = await getTanque(mov.tanque_id);
  const litros = num(mov.litros);
  const monto = num(mov.monto_usd);
  let saldoL = num(t.saldo_litros);
  let saldoU = num(t.saldo_usd);
  if (mov.tipo === 'entrada') { saldoL -= litros; saldoU -= monto; }
  else { saldoL += litros; saldoU += monto; }
  const tasa = saldoL > 0 ? saldoU / saldoL : num(t.tasa_usd_litro);
  const { error } = await supabase.from('combustible_tanque_movimientos').delete().eq('id', mov.id);
  if (error) throw error;
  await aplicarSaldoTanque(mov.tanque_id, saldoL, saldoU, tasa);
}

/* ───────────── Reporte global ───────────── */

export interface ReporteTanque {
  tanque: TanqueCombustible;
  entradas: number;
  uso: number;
  traslados: number;
  disponible: number;
}

/** Reporte de volumen disponible por tanque (réplica de la hoja resumen). */
export async function reporteGlobal(): Promise<ReporteTanque[]> {
  const tanques = await listTanques();
  const { data, error } = await supabase
    .from('combustible_tanque_movimientos')
    .select('tanque_id, tipo, litros');
  if (error) throw error;
  const agg = new Map<string, { entradas: number; uso: number; traslados: number }>();
  for (const row of (data ?? []) as Array<{ tanque_id: string; tipo: TipoMovTanque; litros: number }>) {
    const a = agg.get(row.tanque_id) ?? { entradas: 0, uso: 0, traslados: 0 };
    if (row.tipo === 'entrada') a.entradas += num(row.litros);
    else if (row.tipo === 'uso') a.uso += num(row.litros);
    else a.traslados += num(row.litros);
    agg.set(row.tanque_id, a);
  }
  return tanques.map((tanque) => {
    const a = agg.get(tanque.id) ?? { entradas: 0, uso: 0, traslados: 0 };
    return { tanque, entradas: a.entradas, uso: a.uso, traslados: a.traslados, disponible: num(tanque.saldo_litros) };
  });
}

/* ───────────── Conciliación (libro vs mina) ───────────── */

export async function listConciliaciones(tanqueId?: string): Promise<ConciliacionCombustible[]> {
  let q = supabase.from('combustible_conciliaciones').select('*').order('fecha', { ascending: false });
  if (tanqueId) q = q.eq('tanque_id', tanqueId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ConciliacionCombustible[];
}

export async function crearConciliacion(input: {
  tanqueId: string;
  periodo?: string | null;
  saldoLibros: number;
  saldoReportadoMina: number;
  notas?: string | null;
  actor: string;
}): Promise<ConciliacionCombustible> {
  const { data, error } = await supabase
    .from('combustible_conciliaciones')
    .insert({
      tanque_id: input.tanqueId,
      periodo: input.periodo?.trim() || null,
      saldo_libros: num(input.saldoLibros),
      saldo_reportado_mina: num(input.saldoReportadoMina),
      notas: input.notas?.trim() || null,
      created_by: input.actor,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as ConciliacionCombustible;
}

/* ───────────── Consumo por equipo (gráfica) ───────────── */

export interface ConsumoEquipoItem {
  id: string;
  nombre: string;
  cantidad: number;
  valor: number;
}

/** Uso de combustible por EQUIPO en un rango de fechas (litros + USD al costo). */
export async function consumoPorEquipo(desde: Date, hasta: Date): Promise<ConsumoEquipoItem[]> {
  const { data, error } = await supabase
    .from('combustible_tanque_movimientos')
    .select('equipo, litros, monto_usd, fecha, tipo')
    .eq('tipo', 'uso')
    .gte('fecha', desde.toISOString().slice(0, 10))
    .lte('fecha', hasta.toISOString().slice(0, 10));
  if (error) throw error;
  const acc = new Map<string, ConsumoEquipoItem>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const nombre = (row.equipo as string)?.trim() || '— sin equipo —';
    const litros = num(row.litros);
    if (litros <= 0) continue;
    const cur = acc.get(nombre) ?? { id: nombre, nombre, cantidad: 0, valor: 0 };
    cur.cantidad += litros;
    cur.valor += num(row.monto_usd);
    acc.set(nombre, cur);
  }
  return Array.from(acc.values())
    .map((x) => ({ ...x, cantidad: round(x.cantidad, 2), valor: round(x.valor, 2) }))
    .sort((a, b) => b.cantidad - a.cantidad);
}
