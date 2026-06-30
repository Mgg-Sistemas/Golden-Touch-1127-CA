/* ============================================================
   Golden Touch · RECEPCIONES (laboratorio de mineral)
   Cada cierre de caja del Centro de Acopio genera una RECEPCIÓN con el
   saldo de KG de casiterita acumulado. Sobre esa misma fila el laboratorio
   carga el análisis por elemento (A/B/C → Promedio) — «Recepción Global
   Laboratorio». La recepción NO entra al inventario al cerrar la caja: el
   ingreso a inventario ocurre en un paso posterior (a definir).
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';

const TABLE = 'recepciones_lab';

/** Lectura por elemento del análisis (A, B, C). El Promedio se calcula en el front. */
export interface AnalisisElemento {
  a?: number | null;
  b?: number | null;
  c?: number | null;
}
/** Análisis por elemento. `ucv` es un valor único (no A/B/C); el resto son {a,b,c}. */
export type AnalisisLab = Record<string, AnalisisElemento | number | null>;

export interface RecepcionLab {
  id: string;
  item: number;
  n_analisis: number | null;
  fecha_hora: string;
  peso_kg: number;
  procedencia: string;
  caja_id?: string | null;
  caja_numero?: string | null;
  analisis: AnalisisLab;
  observacion?: string | null;
  created_by?: string | null;
  actor_name?: string | null;
  created_at: string;
  updated_at?: string | null;
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Lista las recepciones (orden cronológico por Item). */
export async function listRecepciones(): Promise<RecepcionLab[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('item', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as RecepcionLab[];
}

/** Próximos correlativos (item y n_análisis) a partir del máximo actual. */
async function siguientesCorrelativos(): Promise<{ item: number; nAnalisis: number }> {
  const { data, error } = await supabase.from(TABLE).select('item, n_analisis');
  if (error) throw error;
  let maxItem = 0, maxAna = 0;
  for (const r of (data ?? []) as Array<{ item: number | null; n_analisis: number | null }>) {
    maxItem = Math.max(maxItem, num(r.item));
    maxAna = Math.max(maxAna, num(r.n_analisis));
  }
  return { item: maxItem + 1, nAnalisis: maxAna + 1 };
}

export interface CrearRecepcionInput {
  pesoKg?: number;
  procedencia?: string | null;
  fechaHora?: string | null;
  cajaId?: string | null;
  cajaNumero?: string | null;
  actor: string;
  actorName?: string | null;
}

/** Crea una recepción (manual o desde un cierre de caja). Item y N° Análisis se autoasignan. */
export async function crearRecepcion(input: CrearRecepcionInput): Promise<RecepcionLab> {
  const { item, nAnalisis } = await siguientesCorrelativos();
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      item,
      n_analisis: nAnalisis,
      fecha_hora: input.fechaHora ?? new Date().toISOString(),
      peso_kg: Math.max(0, num(input.pesoKg)),
      procedencia: (input.procedencia?.trim() || 'PERAMANAL'),
      caja_id: input.cajaId ?? null,
      caja_numero: input.cajaNumero ?? null,
      analisis: {},
      created_by: input.actor,
      actor_name: input.actorName ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as RecepcionLab;
}

/**
 * Crea la recepción que dispara el CIERRE de caja del Centro de Acopio:
 * toma el saldo de KG de casiterita acumulado como Peso KG. No entra a inventario.
 * Idempotente por caja: si ya hay una recepción de esa caja, no duplica.
 */
export async function crearRecepcionDesdeCierre(input: {
  cajaId: string;
  cajaNumero?: string | null;
  pesoKg: number;
  actor: string;
  actorName?: string | null;
}): Promise<RecepcionLab | null> {
  const { data: ya } = await supabase.from(TABLE).select('id').eq('caja_id', input.cajaId).maybeSingle();
  if (ya) return null; // ya existe la recepción de ese cierre
  return crearRecepcion({
    pesoKg: input.pesoKg,
    cajaId: input.cajaId,
    cajaNumero: input.cajaNumero ?? null,
    actor: input.actor,
    actorName: input.actorName ?? null,
  });
}

export interface ActualizarRecepcionPatch {
  item?: number;
  n_analisis?: number | null;
  fecha_hora?: string;
  peso_kg?: number;
  procedencia?: string;
  analisis?: AnalisisLab;
  observacion?: string | null;
}

export async function actualizarRecepcion(id: string, patch: ActualizarRecepcionPatch): Promise<RecepcionLab> {
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.item != null) upd.item = Math.max(1, Math.round(num(patch.item)));
  if (patch.n_analisis !== undefined) upd.n_analisis = patch.n_analisis == null ? null : Math.max(1, Math.round(num(patch.n_analisis)));
  if (patch.fecha_hora != null) upd.fecha_hora = patch.fecha_hora;
  if (patch.peso_kg != null) upd.peso_kg = Math.max(0, num(patch.peso_kg));
  if (patch.procedencia != null) upd.procedencia = patch.procedencia.trim() || 'PERAMANAL';
  if (patch.analisis != null) upd.analisis = patch.analisis;
  if (patch.observacion !== undefined) upd.observacion = patch.observacion?.trim() || null;
  const { data, error } = await supabase.from(TABLE).update(upd).eq('id', id).select('*').single();
  if (error) throw error;
  return data as RecepcionLab;
}

export async function eliminarRecepcion(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

/* ───────────── Análisis químicos (tabla de laboratorio, independiente) ─────────────
   Las filas de análisis (N° Análisis + leyes por elemento) son INDEPENDIENTES de las
   recepciones de KG (tabla de arriba): se agregan/eliminan con el botón «Añadir valores». */

const TABLE_ANA = 'recepciones_analisis';

export interface AnalisisRow {
  id: string;
  n_analisis: number | null;
  analisis: AnalisisLab;
  observacion?: string | null;
  created_by?: string | null;
  actor_name?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export async function listAnalisis(): Promise<AnalisisRow[]> {
  const { data, error } = await supabase
    .from(TABLE_ANA)
    .select('*')
    .order('n_analisis', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AnalisisRow[];
}

/** Crea una fila de análisis. El N° Análisis se autoasigna (máx + 1). */
export async function crearAnalisis(input: { actor: string; actorName?: string | null }): Promise<AnalisisRow> {
  const { data: rows } = await supabase.from(TABLE_ANA).select('n_analisis');
  let max = 0;
  for (const r of (rows ?? []) as Array<{ n_analisis: number | null }>) max = Math.max(max, num(r.n_analisis));
  const { data, error } = await supabase.from(TABLE_ANA).insert({
    n_analisis: max + 1, analisis: {}, created_by: input.actor, actor_name: input.actorName ?? null,
  }).select('*').single();
  if (error) throw error;
  return data as AnalisisRow;
}

export async function actualizarAnalisisRow(id: string, patch: { n_analisis?: number | null; analisis?: AnalisisLab; observacion?: string | null }): Promise<void> {
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.n_analisis !== undefined) upd.n_analisis = patch.n_analisis == null ? null : Math.max(1, Math.round(num(patch.n_analisis)));
  if (patch.analisis != null) upd.analisis = patch.analisis;
  if (patch.observacion !== undefined) upd.observacion = patch.observacion?.trim() || null;
  const { error } = await supabase.from(TABLE_ANA).update(upd).eq('id', id);
  if (error) throw error;
}

export async function eliminarAnalisis(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE_ANA).delete().eq('id', id);
  if (error) throw error;
}

/* ───────────── Minerales (columnas configurables del laboratorio) ───────────── */

const TABLE_MIN = 'recepciones_minerales';

export interface MineralLab {
  id: string;
  clave: string;          // clave estable usada en el JSON de análisis
  nombre: string;         // ej. "Sn (Estaño)"
  subtitulo?: string | null;
  columnas: 'abc' | 'prom'; // 'abc' = A/B/C/Prom · 'prom' = solo Prom (como UCV)
  color: string;
  orden: number;
  activo: boolean;
}

/** Lista los minerales (columnas del laboratorio). `soloActivos` para la tabla de análisis. */
export async function listMinerales(soloActivos = false): Promise<MineralLab[]> {
  let q = supabase.from(TABLE_MIN).select('*').order('orden', { ascending: true }).order('nombre', { ascending: true });
  if (soloActivos) q = q.eq('activo', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as MineralLab[];
}

/** Genera una clave estable y única a partir del nombre (para el JSON de análisis). */
async function claveUnica(nombre: string): Promise<string> {
  const base = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'min';
  const { data } = await supabase.from(TABLE_MIN).select('clave');
  const usadas = new Set((data ?? []).map((r) => (r as { clave: string }).clave));
  if (!usadas.has(base)) return base;
  for (let i = 2; i < 999; i++) { const c = `${base}_${i}`; if (!usadas.has(c)) return c; }
  return `${base}_${Date.now()}`;
}

export async function addMineral(input: { nombre: string; subtitulo?: string | null; columnas: 'abc' | 'prom'; color?: string | null }): Promise<MineralLab> {
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error('Indicá el nombre del mineral.');
  const clave = await claveUnica(nombre);
  const { data: max } = await supabase.from(TABLE_MIN).select('orden').order('orden', { ascending: false }).limit(1).maybeSingle();
  const orden = (num((max as { orden?: number } | null)?.orden) || 0) + 1;
  const { data, error } = await supabase.from(TABLE_MIN).insert({
    clave, nombre, subtitulo: input.subtitulo?.trim() || null,
    columnas: input.columnas === 'prom' ? 'prom' : 'abc',
    color: input.color?.trim() || '#888888', orden, activo: true,
  }).select('*').single();
  if (error) throw error;
  return data as MineralLab;
}

export async function updateMineral(id: string, patch: { nombre?: string; subtitulo?: string | null; columnas?: 'abc' | 'prom'; color?: string; orden?: number; activo?: boolean }): Promise<void> {
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.nombre != null) { const n = patch.nombre.trim(); if (!n) throw new Error('El nombre no puede estar vacío.'); upd.nombre = n; }
  if (patch.subtitulo !== undefined) upd.subtitulo = patch.subtitulo?.trim() || null;
  if (patch.columnas != null) upd.columnas = patch.columnas === 'prom' ? 'prom' : 'abc';
  if (patch.color != null) upd.color = patch.color.trim() || '#888888';
  if (patch.orden != null) upd.orden = Math.round(num(patch.orden));
  if (patch.activo != null) upd.activo = patch.activo;
  const { error } = await supabase.from(TABLE_MIN).update(upd).eq('id', id);
  if (error) throw error;
}

export async function setMineralActivo(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from(TABLE_MIN).update({ activo, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

/* ───────────── Humedad Provisional (tabla independiente) ─────────────
   Peso (Gr) Húmedos · Peso (Gr) seco → % Humedad = (húmedos − seco)/húmedos × 100
   y Merma peso H2O = húmedos − seco. El promedio del lote del % es el promedio
   simple; la Merma del lote es la sumatoria de la columna. */

const TABLE_HPROV = 'recepciones_humedad_prov';

export interface HumedadProvRow {
  id: string;
  peso_humedo: number | null;
  peso_seco: number | null;
  observacion?: string | null;
  created_by?: string | null;
  actor_name?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export async function listHumedadProv(): Promise<HumedadProvRow[]> {
  const { data, error } = await supabase.from(TABLE_HPROV).select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as HumedadProvRow[];
}

export async function crearHumedadProv(input: { actor: string; actorName?: string | null }): Promise<HumedadProvRow> {
  const { data, error } = await supabase.from(TABLE_HPROV).insert({
    peso_humedo: null, peso_seco: null, created_by: input.actor, actor_name: input.actorName ?? null,
  }).select('*').single();
  if (error) throw error;
  return data as HumedadProvRow;
}

export async function actualizarHumedadProv(id: string, patch: { peso_humedo?: number | null; peso_seco?: number | null }): Promise<void> {
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.peso_humedo !== undefined) upd.peso_humedo = patch.peso_humedo == null ? null : Math.max(0, num(patch.peso_humedo));
  if (patch.peso_seco !== undefined) upd.peso_seco = patch.peso_seco == null ? null : Math.max(0, num(patch.peso_seco));
  const { error } = await supabase.from(TABLE_HPROV).update(upd).eq('id', id);
  if (error) throw error;
}

export async function eliminarHumedadProv(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE_HPROV).delete().eq('id', id);
  if (error) throw error;
}

/** % Humedad de una fila provisional. (húmedos − seco) / húmedos × 100. */
export function pctHumedadProv(r: { peso_humedo: number | null; peso_seco: number | null }): number | null {
  const h = Number(r.peso_humedo), s = Number(r.peso_seco);
  if (!Number.isFinite(h) || h <= 0 || !Number.isFinite(s)) return null;
  return round3(((h - s) / h) * 100);
}
/** Merma de agua de una fila provisional (gramos). húmedos − seco. */
export function mermaH2OProv(r: { peso_humedo: number | null; peso_seco: number | null }): number | null {
  const h = Number(r.peso_humedo), s = Number(r.peso_seco);
  if (!Number.isFinite(h) || !Number.isFinite(s)) return null;
  return round2(h - s);
}
/** Promedio del lote del % de humedad provisional (promedio simple de los % con valor). */
export function promedioHumedadProv(filas: Array<{ peso_humedo: number | null; peso_seco: number | null }>): number | null {
  const ps = filas.map(pctHumedadProv).filter((x): x is number => x != null);
  if (!ps.length) return null;
  return round3(ps.reduce((a, b) => a + b, 0) / ps.length);
}

/* ───────────── Humedad Final (tabla independiente) ─────────────
   Peso (Kg) recogido · el % Humedad final aplicado proviene del promedio del lote
   de la Humedad Provisional; Merma peso H2O = recogido × %humedad/100.
   El total de Peso recogido y de Merma son sumatorias; el % del lote, promedio. */

const TABLE_HFIN = 'recepciones_humedad_final';

export interface HumedadFinalRow {
  id: string;
  peso_recogido: number | null;
  observacion?: string | null;
  created_by?: string | null;
  actor_name?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export async function listHumedadFinal(): Promise<HumedadFinalRow[]> {
  const { data, error } = await supabase.from(TABLE_HFIN).select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as HumedadFinalRow[];
}

export async function crearHumedadFinal(input: { actor: string; actorName?: string | null }): Promise<HumedadFinalRow> {
  const { data, error } = await supabase.from(TABLE_HFIN).insert({
    peso_recogido: null, created_by: input.actor, actor_name: input.actorName ?? null,
  }).select('*').single();
  if (error) throw error;
  return data as HumedadFinalRow;
}

export async function actualizarHumedadFinal(id: string, patch: { peso_recogido?: number | null }): Promise<void> {
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.peso_recogido !== undefined) upd.peso_recogido = patch.peso_recogido == null ? null : Math.max(0, num(patch.peso_recogido));
  const { error } = await supabase.from(TABLE_HFIN).update(upd).eq('id', id);
  if (error) throw error;
}

export async function eliminarHumedadFinal(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE_HFIN).delete().eq('id', id);
  if (error) throw error;
}

/** Merma peso H2O de una fila final = recogido × (%humedad final / 100). */
export function mermaH2OFinal(pesoRecogido: number | null, pctHumedadFinal: number | null): number | null {
  const p = Number(pesoRecogido);
  if (!Number.isFinite(p)) return null;
  const h = pctHumedadFinal == null ? 0 : Number(pctHumedadFinal);
  return round2(p * (h / 100));
}

/* ───────────── Cálculos (Promedio por análisis · Promedio del lote) ───────────── */

// Las leyes de mineral se redondean a 3 decimales (se muestran con mín. 2, máx. 3).
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Promedio (A+B+C)/3 de un elemento en una recepción. Promedia solo los valores cargados. */
export function promElemento(analisis: AnalisisLab | null | undefined, key: string, abc: boolean): number | null {
  const v = analisis?.[key];
  if (!abc) {
    const n = Number(v);
    return v == null || !Number.isFinite(n) ? null : round3(n);
  }
  const e = (v && typeof v === 'object') ? v as AnalisisElemento : null;
  if (!e) return null;
  const vals = [e.a, e.b, e.c].map((x) => Number(x)).filter((x) => Number.isFinite(x));
  if (!vals.length) return null;
  // (A+B+C)/3 — siempre dividido entre 3 (las celdas vacías cuentan como 0 si hay alguna cargada).
  const suma = vals.reduce((a, b) => a + b, 0);
  return round3(suma / 3);
}

/** Promedio del lote de un elemento: promedio de los Prom de todas las filas que lo tienen. */
export function promedioLote(filas: Array<{ analisis: AnalisisLab }>, key: string, abc: boolean): number | null {
  const proms = filas
    .map((r) => promElemento(r.analisis, key, abc))
    .filter((x): x is number => x != null);
  if (!proms.length) return null;
  return round3(proms.reduce((a, b) => a + b, 0) / proms.length);
}
