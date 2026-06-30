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

/** % Humedad de una fila provisional. 100 − (Peso seco / Peso húmedos) × 4. */
export function pctHumedadProv(r: { peso_humedo: number | null; peso_seco: number | null }): number | null {
  const h = Number(r.peso_humedo), s = Number(r.peso_seco);
  if (!Number.isFinite(h) || h <= 0 || !Number.isFinite(s)) return null;
  return round3(100 - (s / h) * 4);
}
/** Merma de agua de una fila provisional = Peso (húmedos) × % Humedad / 100. */
export function mermaH2OProv(r: { peso_humedo: number | null; peso_seco: number | null }): number | null {
  const pct = pctHumedadProv(r);
  const h = Number(r.peso_humedo);
  if (pct == null || !Number.isFinite(h)) return null;
  return round2(h * (pct / 100));
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

/** Merma peso H2O de una fila final = Peso Kg (casiterita recibida) − Peso (Kg) recogido. */
export function mermaH2OFinal(pesoKg: number | null, pesoRecogido: number | null): number | null {
  const pk = Number(pesoKg), pr = Number(pesoRecogido);
  if (!Number.isFinite(pr)) return null;
  return round2((Number.isFinite(pk) ? pk : 0) - pr);
}

/** % Humedad final = Merma peso H2O / Peso Kg × 100. */
export function pctHumedadFinal(pesoKg: number | null, pesoRecogido: number | null): number | null {
  const pk = Number(pesoKg);
  const merma = mermaH2OFinal(pesoKg, pesoRecogido);
  if (merma == null || !Number.isFinite(pk) || pk <= 0) return null;
  return round3((merma / pk) * 100);
}

/* ───────────── Bigbags (Pesos Húmedos / Pesos Secos) ─────────────
   Cada bigbag tiene número incremental (desde 1), procedencia (A, B, ALI, D,
   FALTANTE…), un peso húmedo y un peso seco. La fila «BIG BAG» de cada tabla
   resta la tara de los bigbags ingresados: −(cantidad de bigbags con peso) × 1.5.
   El TOTAL NETO = suma de los pesos + esa fórmula (puede ser negativo). */

const TABLE_BB = 'recepciones_bigbags';
export const TARA_BIGBAG = 1.5;

export interface BigbagRow {
  id: string;
  numero: number;
  procedencia: string | null;
  peso_humedo: number | null;
  peso_seco: number | null;
  pesada_id?: string | null;
  created_by?: string | null;
  actor_name?: string | null;
  created_at: string;
  updated_at?: string | null;
}

/** Bigbags de una pesada. `pesadaId = null` (por defecto) = set de trabajo sin guardar. */
export async function listBigbags(pesadaId: string | null = null): Promise<BigbagRow[]> {
  let q = supabase.from(TABLE_BB).select('*')
    .order('numero', { ascending: true }).order('created_at', { ascending: true });
  q = pesadaId == null ? q.is('pesada_id', null) : q.eq('pesada_id', pesadaId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as BigbagRow[];
}

export async function crearBigbag(input: { actor: string; actorName?: string | null; pesadaId?: string | null }): Promise<BigbagRow> {
  const pesadaId = input.pesadaId ?? null;
  let q = supabase.from(TABLE_BB).select('numero');
  q = pesadaId == null ? q.is('pesada_id', null) : q.eq('pesada_id', pesadaId);
  const { data: rows } = await q;
  let max = 0;
  for (const r of (rows ?? []) as Array<{ numero: number | null }>) max = Math.max(max, num(r.numero));
  const { data, error } = await supabase.from(TABLE_BB).insert({
    numero: max + 1, procedencia: null, peso_humedo: null, peso_seco: null, pesada_id: pesadaId,
    created_by: input.actor, actor_name: input.actorName ?? null,
  }).select('*').single();
  if (error) throw error;
  return data as BigbagRow;
}

export async function actualizarBigbag(id: string, patch: { numero?: number; procedencia?: string | null; peso_humedo?: number | null; peso_seco?: number | null }): Promise<void> {
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.numero != null) upd.numero = Math.max(1, Math.round(num(patch.numero)));
  if (patch.procedencia !== undefined) upd.procedencia = patch.procedencia?.trim() || null;
  if (patch.peso_humedo !== undefined) upd.peso_humedo = patch.peso_humedo == null ? null : num(patch.peso_humedo);
  if (patch.peso_seco !== undefined) upd.peso_seco = patch.peso_seco == null ? null : num(patch.peso_seco);
  const { error } = await supabase.from(TABLE_BB).update(upd).eq('id', id);
  if (error) throw error;
}

export async function eliminarBigbag(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE_BB).delete().eq('id', id);
  if (error) throw error;
}

/** Fórmula de la fila «BIG BAG»: −(cantidad de bigbags con peso) × 1.5. */
export function formulaBigbag(cantidadConPeso: number): number {
  return round2(-cantidadConPeso * TARA_BIGBAG);
}

/** Totales de un conjunto de bigbags (húmedos/secos): suma, BIG BAG y neto. */
export function totalesBigbags(bigbags: BigbagRow[]): {
  nBigbags: number; sumaHumedo: number; sumaSeco: number;
  bigBagHumedo: number; bigBagSeco: number; netoHumedo: number; netoSeco: number;
} {
  const humConPeso = bigbags.filter((b) => b.peso_humedo != null).length;
  const secConPeso = bigbags.filter((b) => b.peso_seco != null).length;
  const sumaHumedo = round2(bigbags.reduce((a, b) => a + (Number(b.peso_humedo) || 0), 0));
  const sumaSeco = round2(bigbags.reduce((a, b) => a + (Number(b.peso_seco) || 0), 0));
  const bigBagHumedo = formulaBigbag(humConPeso);
  const bigBagSeco = formulaBigbag(secConPeso);
  return {
    nBigbags: bigbags.length, sumaHumedo, sumaSeco, bigBagHumedo, bigBagSeco,
    netoHumedo: round2(sumaHumedo + bigBagHumedo), netoSeco: round2(sumaSeco + bigBagSeco),
  };
}

/* ───────────── Pesadas guardadas (histórico modificable) ───────────── */

const TABLE_PESADAS = 'recepciones_pesadas';

export interface PesadaRow {
  id: string;
  fecha: string;
  n_bigbags: number;
  suma_humedo: number;
  suma_seco: number;
  big_bag_humedo: number;
  big_bag_seco: number;
  neto_humedo: number;
  neto_seco: number;
  observacion?: string | null;
  consumida: boolean;
  created_by?: string | null;
  actor_name?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export async function listPesadas(): Promise<PesadaRow[]> {
  const { data, error } = await supabase.from(TABLE_PESADAS).select('*').order('fecha', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PesadaRow[];
}

/** Guarda el set de trabajo (bigbags sin pesada) como una pesada del histórico. */
export async function guardarPesada(input: { actor: string; actorName?: string | null; observacion?: string | null }): Promise<PesadaRow> {
  const trabajo = await listBigbags(null);
  if (!trabajo.length) throw new Error('No hay bigbags para guardar.');
  const t = totalesBigbags(trabajo);
  const { data, error } = await supabase.from(TABLE_PESADAS).insert({
    n_bigbags: t.nBigbags, suma_humedo: t.sumaHumedo, suma_seco: t.sumaSeco,
    big_bag_humedo: t.bigBagHumedo, big_bag_seco: t.bigBagSeco,
    neto_humedo: t.netoHumedo, neto_seco: t.netoSeco,
    observacion: input.observacion?.trim() || null,
    created_by: input.actor, actor_name: input.actorName ?? null,
  }).select('*').single();
  if (error) throw error;
  const pesada = data as PesadaRow;
  const ids = trabajo.map((b) => b.id);
  const { error: e2 } = await supabase.from(TABLE_BB).update({ pesada_id: pesada.id }).in('id', ids);
  if (e2) throw e2;
  return pesada;
}

/** Recalcula y guarda los totales de una pesada a partir de sus bigbags (tras editarla). */
export async function recomputarPesada(pesadaId: string): Promise<void> {
  const bigbags = await listBigbags(pesadaId);
  const t = totalesBigbags(bigbags);
  const { error } = await supabase.from(TABLE_PESADAS).update({
    n_bigbags: t.nBigbags, suma_humedo: t.sumaHumedo, suma_seco: t.sumaSeco,
    big_bag_humedo: t.bigBagHumedo, big_bag_seco: t.bigBagSeco,
    neto_humedo: t.netoHumedo, neto_seco: t.netoSeco, updated_at: new Date().toISOString(),
  }).eq('id', pesadaId);
  if (error) throw error;
}

export async function actualizarPesada(id: string, patch: { observacion?: string | null; consumida?: boolean; fecha?: string }): Promise<void> {
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.observacion !== undefined) upd.observacion = patch.observacion?.trim() || null;
  if (patch.consumida != null) upd.consumida = patch.consumida;
  if (patch.fecha != null) upd.fecha = patch.fecha;
  const { error } = await supabase.from(TABLE_PESADAS).update(upd).eq('id', id);
  if (error) throw error;
}

/** Elimina una pesada del histórico (y en cascada sus bigbags). */
export async function eliminarPesada(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE_PESADAS).delete().eq('id', id);
  if (error) throw error;
}

/* ───────────── Conciliación (vs Centros de Acopio) ─────────────
   Compara el Peso KG total recibido contra lo reportado por los centros de acopio
   (incluye aliados). Cálculos:
     Reportado  = Σ saldos KG de los centros
     Faltante   = Peso KG total − Reportado            (en rojo)
     No llegó   = Faltante + Kg bolsas + Muestras lab   (en rojo)
     %No llegó  = No llegó / Reportado × 100            (en rojo) */

const TABLE_CONCIL = 'recepciones_conciliaciones';

export interface ConciliacionCentro { nombre: string; kg: number | null }

export interface Conciliacion {
  id: string;
  numero: number;
  fecha: string;
  peso_kg_total: number;
  kg_bolsas: number;
  muestras_lab: number;
  centros: ConciliacionCentro[];
  reportado: number;
  faltante: number;
  no_llego: number;
  porcentaje: number;
  observacion?: string | null;
  created_by?: string | null;
  actor_name?: string | null;
  created_at: string;
  updated_at?: string | null;
}

/** Calcula los totales de una conciliación a partir de sus campos. */
export function calcConciliacion(c: { peso_kg_total: number | null; kg_bolsas: number | null; muestras_lab: number | null; centros: ConciliacionCentro[] }): {
  reportado: number; faltante: number; noLlego: number; porcentaje: number;
} {
  const reportado = round2((c.centros ?? []).reduce((a, x) => a + (Number(x.kg) || 0), 0));
  const faltante = round2(num(c.peso_kg_total) - reportado);
  const noLlego = round2(faltante + num(c.kg_bolsas) + num(c.muestras_lab));
  const porcentaje = reportado !== 0 ? round2((noLlego / reportado) * 100) : 0;
  return { reportado, faltante, noLlego, porcentaje };
}

function normConcil(row: Record<string, unknown>): Conciliacion {
  const r = row as unknown as Conciliacion;
  return { ...r, centros: Array.isArray(r.centros) ? r.centros : [] };
}

export async function listConciliaciones(): Promise<Conciliacion[]> {
  const { data, error } = await supabase.from(TABLE_CONCIL).select('*')
    .order('numero', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => normConcil(r as Record<string, unknown>));
}

/** Crea una conciliación. El N° lo pide el usuario la 1ª vez; luego sugiere máx+1. */
export async function crearConciliacion(input: { numero?: number | null; actor: string; actorName?: string | null }): Promise<Conciliacion> {
  let numero = input.numero != null ? Math.max(1, Math.round(num(input.numero))) : 0;
  if (!numero) {
    const { data: rows } = await supabase.from(TABLE_CONCIL).select('numero');
    let max = 0;
    for (const r of (rows ?? []) as Array<{ numero: number | null }>) max = Math.max(max, num(r.numero));
    numero = max + 1;
  }
  const { data, error } = await supabase.from(TABLE_CONCIL).insert({
    numero, peso_kg_total: 0, kg_bolsas: 0, muestras_lab: 0, centros: [],
    reportado: 0, faltante: 0, no_llego: 0, porcentaje: 0,
    created_by: input.actor, actor_name: input.actorName ?? null,
  }).select('*').single();
  if (error) throw error;
  return normConcil(data as Record<string, unknown>);
}

export async function actualizarConciliacion(id: string, patch: {
  numero?: number; fecha?: string; peso_kg_total?: number | null; kg_bolsas?: number | null;
  muestras_lab?: number | null; centros?: ConciliacionCentro[]; observacion?: string | null;
}): Promise<void> {
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.numero != null) upd.numero = Math.max(1, Math.round(num(patch.numero)));
  if (patch.fecha != null) upd.fecha = patch.fecha;
  if (patch.peso_kg_total !== undefined) upd.peso_kg_total = num(patch.peso_kg_total);
  if (patch.kg_bolsas !== undefined) upd.kg_bolsas = num(patch.kg_bolsas);
  if (patch.muestras_lab !== undefined) upd.muestras_lab = num(patch.muestras_lab);
  if (patch.centros !== undefined) upd.centros = patch.centros;
  if (patch.observacion !== undefined) upd.observacion = patch.observacion?.trim() || null;
  // Recalcular snapshot si cambió algo que afecte los totales.
  if (['peso_kg_total', 'kg_bolsas', 'muestras_lab', 'centros'].some((k) => k in upd)) {
    const { data: cur } = await supabase.from(TABLE_CONCIL).select('peso_kg_total, kg_bolsas, muestras_lab, centros').eq('id', id).single();
    const base = (cur ?? {}) as { peso_kg_total: number; kg_bolsas: number; muestras_lab: number; centros: ConciliacionCentro[] };
    const t = calcConciliacion({
      peso_kg_total: 'peso_kg_total' in upd ? (upd.peso_kg_total as number) : base.peso_kg_total,
      kg_bolsas: 'kg_bolsas' in upd ? (upd.kg_bolsas as number) : base.kg_bolsas,
      muestras_lab: 'muestras_lab' in upd ? (upd.muestras_lab as number) : base.muestras_lab,
      centros: 'centros' in upd ? (upd.centros as ConciliacionCentro[]) : (Array.isArray(base.centros) ? base.centros : []),
    });
    upd.reportado = t.reportado; upd.faltante = t.faltante; upd.no_llego = t.noLlego; upd.porcentaje = t.porcentaje;
  }
  const { error } = await supabase.from(TABLE_CONCIL).update(upd).eq('id', id);
  if (error) throw error;
}

export async function eliminarConciliacion(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE_CONCIL).delete().eq('id', id);
  if (error) throw error;
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
