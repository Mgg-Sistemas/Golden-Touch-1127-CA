/* ============================================================
   Golden Touch · Centro de Acopio · CONTRATOS de producción
   Correlativo "Producción GT-01", -02, … con fecha + hora automáticas
   y lugar de extracción tomado de un catálogo editable.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { CatalogoAcopio, ContratoAcopio, TipoCatalogoAcopio } from '@/shared/lib/types';

/** Prefijo del correlativo de contratos. */
export const CONTRATO_PREFIJO = 'Producción GT';
/** Formatea el correlativo: 1 → "Producción GT-01". */
export const numeroContrato = (seq: number) => `${CONTRATO_PREFIJO}-${String(seq).padStart(2, '0')}`;

/** Hora actual del sistema (zona Venezuela) en formato «8:02:00 AM». */
export function horaSistema(): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Caracas', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  }).format(new Date());
}

/* ───────────── Contratos ───────────── */

export async function listContratos(): Promise<ContratoAcopio[]> {
  const { data, error } = await supabase
    .from('acopio_contratos')
    .select('*')
    .order('seq', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ContratoAcopio[];
}

/** Próximo correlativo disponible (lee el máximo seq y suma 1). */
export async function nextSeqContrato(): Promise<number> {
  const { data, error } = await supabase
    .from('acopio_contratos')
    .select('seq')
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return ((data as { seq?: number } | null)?.seq ?? 0) + 1;
}

/** Datos editables de un contrato (los inputs; las fórmulas las calcula la BD). */
export interface ContratoInput {
  supervisor?: string | null;
  lugarExtraccion: string;
  molino?: string | null;
  tonProcesadas?: number;
  kgHumedo?: number;
  kgSecos?: number;
  kgSecoLimpio?: number;
  materialMesaKg?: number;
  observaciones?: string | null;
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function payloadContrato(input: ContratoInput): Record<string, unknown> {
  return {
    supervisor: input.supervisor?.trim() || null,
    lugar_extraccion: input.lugarExtraccion.trim(),
    molino: input.molino?.trim() || null,
    ton_procesadas: n(input.tonProcesadas),
    kg_humedo: n(input.kgHumedo),
    kg_secos: n(input.kgSecos),
    kg_seco_limpio: n(input.kgSecoLimpio),
    material_mesa_kg: n(input.materialMesaKg),
    observaciones: input.observaciones?.trim() || null,
  };
}

/**
 * Calcula las mismas fórmulas del Excel en el front (para el preview en vivo).
 * Idéntico a las columnas generadas de la BD.
 */
export function formulasContrato(i: { tonProcesadas?: number; kgHumedo?: number; kgSecos?: number; kgSecoLimpio?: number }) {
  const ton = n(i.tonProcesadas), hum = n(i.kgHumedo), sec = n(i.kgSecos), lim = n(i.kgSecoLimpio);
  const div = (a: number, b: number) => (b === 0 ? null : a / b);
  return {
    tolva: ton / 1.2,
    pctRecuperadoImpurezas: div(hum, ton * 1000),
    pctHumedad: hum === 0 ? null : sec / hum - 1,
    pctRecuperacionCasiterita: div(lim, ton * 1000),
    kgHierro: lim - sec,
    pctHierro: div(lim - sec, sec),
  };
}

export async function crearContrato(input: ContratoInput & { actor: string; actorName?: string | null }): Promise<ContratoAcopio> {
  const lugar = (input.lugarExtraccion || '').trim();
  if (!lugar) throw new Error('Indicá el lugar de extracción.');

  // Guardamos lugar y supervisor en el catálogo si son nuevos (upsert idempotente).
  await addCatalogoAcopio('lugar_extraccion', lugar).catch(() => { /* ya existe: ok */ });
  if (input.supervisor?.trim()) await addCatalogoAcopio('supervisor', input.supervisor).catch(() => {});

  // Correlativo + reintento ante colisión (alta concurrente).
  for (let intento = 0; intento < 5; intento++) {
    const seq = await nextSeqContrato();
    const { data, error } = await supabase
      .from('acopio_contratos')
      .insert({
        numero: numeroContrato(seq),
        seq,
        fecha: new Date().toISOString().slice(0, 10),
        hora: horaSistema(),
        ...payloadContrato(input),
        created_by: input.actor,
        actor_name: input.actorName ?? null,
      })
      .select('*')
      .single();
    if (!error) return data as ContratoAcopio;
    if ((error as { code?: string }).code !== '23505') throw error;
    // 23505 = correlativo tomado por otro usuario: reintentamos con el siguiente.
  }
  throw new Error('No se pudo asignar el número de contrato. Intentá de nuevo.');
}

export async function actualizarContrato(id: string, input: ContratoInput): Promise<void> {
  const lugar = (input.lugarExtraccion || '').trim();
  if (!lugar) throw new Error('Indicá el lugar de extracción.');
  await addCatalogoAcopio('lugar_extraccion', lugar).catch(() => { /* ya existe: ok */ });
  if (input.supervisor?.trim()) await addCatalogoAcopio('supervisor', input.supervisor).catch(() => {});
  const { error } = await supabase.from('acopio_contratos').update(payloadContrato(input)).eq('id', id);
  if (error) throw error;
}

/** Cierra (estado='cerrado') o reabre (estado='activo') un contrato. */
export async function setEstadoContrato(id: string, estado: 'activo' | 'cerrado', actor: string): Promise<void> {
  const patch: Record<string, unknown> = { estado };
  if (estado === 'cerrado') { patch.cerrado_at = new Date().toISOString(); patch.cerrado_por = actor; }
  else { patch.cerrado_at = null; patch.cerrado_por = null; }
  const { error } = await supabase.from('acopio_contratos').update(patch).eq('id', id);
  if (error) throw error;
}

export async function eliminarContrato(id: string): Promise<void> {
  const { error } = await supabase.from('acopio_contratos').delete().eq('id', id);
  if (error) throw error;
}

/** Resumen para las tarjetas de Producción: contratos activos + KG de Casiterita. */
export interface ResumenContratos {
  activos: number;
  totalContratos: number;
  kgCasiterita: number;
  kgCasiteritaActivos: number;
}

export async function resumenContratos(): Promise<ResumenContratos> {
  const { data, error } = await supabase
    .from('acopio_contratos')
    .select('estado, kg_seco_limpio');
  if (error) throw error;
  const rows = (data ?? []) as Array<{ estado: string; kg_seco_limpio: number | null }>;
  return rows.reduce<ResumenContratos>((a, r) => {
    const kg = Number(r.kg_seco_limpio) || 0; // Casiterita = Kg seco, limpio
    a.totalContratos += 1;
    a.kgCasiterita += kg;
    if (r.estado === 'activo') { a.activos += 1; a.kgCasiteritaActivos += kg; }
    return a;
  }, { activos: 0, totalContratos: 0, kgCasiterita: 0, kgCasiteritaActivos: 0 });
}

/* ───────────── Catálogo del acopio (lugares de extracción, …) ───────────── */

export async function listCatalogosAcopio(tipo?: TipoCatalogoAcopio): Promise<CatalogoAcopio[]> {
  let q = supabase.from('acopio_catalogos').select('*')
    .order('orden', { ascending: true })
    .order('valor', { ascending: true });
  if (tipo) q = q.eq('tipo', tipo);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CatalogoAcopio[];
}

export async function addCatalogoAcopio(tipo: TipoCatalogoAcopio, valor: string): Promise<CatalogoAcopio> {
  const v = valor.trim();
  if (!v) throw new Error('Indicá el valor.');
  const { data, error } = await supabase
    .from('acopio_catalogos')
    .insert({ tipo, valor: v, orden: 999 })
    .select('*')
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Ese valor ya existe en el catálogo.');
    throw error;
  }
  return data as CatalogoAcopio;
}

export async function updateCatalogoAcopio(id: string, valor: string): Promise<void> {
  const v = valor.trim();
  if (!v) throw new Error('Indicá el valor.');
  const { error } = await supabase.from('acopio_catalogos').update({ valor: v }).eq('id', id);
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Ese valor ya existe en el catálogo.');
    throw error;
  }
}

export async function setCatalogoAcopioActivo(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from('acopio_catalogos').update({ activo }).eq('id', id);
  if (error) throw error;
}

export async function eliminarCatalogoAcopio(id: string): Promise<void> {
  const { error } = await supabase.from('acopio_catalogos').delete().eq('id', id);
  if (error) throw error;
}
