/* ============================================================
   Golden Touch · RECEPCIONES (laboratorio de mineral)
   Cada cierre de caja del Centro de Acopio genera una RECEPCIÓN con el
   saldo de KG de casiterita acumulado. Sobre esa misma fila el laboratorio
   carga el análisis por elemento (A/B/C → Promedio) — «Recepción Global
   Laboratorio». La recepción NO entra al inventario al cerrar la caja: el
   ingreso a inventario ocurre en un paso posterior (a definir).
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { registrarMovimiento } from '@/modules/inventario/movimientos.repository';

const TABLE = 'recepciones_lab';

/** Lectura por elemento del análisis (A, B, C). El Promedio se calcula en el front. */
/** Lectura por elemento: a, b, c, d, e, f… (cantidad configurable por mineral). */
export type AnalisisElemento = { [k: string]: number | null | undefined };
/** Análisis por elemento. `ucv` es un valor único (no A/B/C); el resto son {a,b,c,…}. */
export type AnalisisLab = Record<string, AnalisisElemento | number | null>;
/** Letras de las lecturas, en orden (a→A, b→B…). Soporta hasta 8 lecturas. */
export const LETRAS_LECTURA = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const labelLectura = (i: number) => (LETRAS_LECTURA[i] ?? `x${i}`).toUpperCase();

export interface RecepcionLab {
  id: string;
  item: number;
  n_analisis: number | null;
  fecha_hora: string;
  peso_kg: number;
  procedencia: string;
  /** Tasa del cierre de caja que generó esta recepción (centro de acopio). */
  tasa?: number | null;
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
  tasa?: number | null;
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
      peso_kg: round2(Math.max(0, num(input.pesoKg))),
      tasa: input.tasa == null ? null : num(input.tasa),
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
  tasa?: number | null;
  actor: string;
  actorName?: string | null;
}): Promise<RecepcionLab | null> {
  const { data: ya } = await supabase.from(TABLE).select('id').eq('caja_id', input.cajaId).maybeSingle();
  if (ya) return null; // ya existe la recepción de ese cierre
  return crearRecepcion({
    pesoKg: input.pesoKg,
    tasa: input.tasa ?? null,
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
  if (patch.peso_kg != null) upd.peso_kg = round2(Math.max(0, num(patch.peso_kg)));
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
  /** Procedencia a la que pertenece este análisis (cada procedencia tiene su set). */
  procedencia?: string | null;
  /** N° de muestras/sobres de esta fila (texto libre: "34, 34, 645"). Informativo. */
  muestras?: string | null;
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

/** Crea una fila de análisis en una procedencia. El N° Análisis se autoasigna (máx + 1) dentro de esa procedencia. */
export async function crearAnalisis(input: { actor: string; actorName?: string | null; procedencia?: string | null }): Promise<AnalisisRow> {
  const proc = (input.procedencia?.trim() || 'PERAMANAL').toUpperCase();
  const { data: rows } = await supabase.from(TABLE_ANA).select('n_analisis').eq('procedencia', proc);
  let max = 0;
  for (const r of (rows ?? []) as Array<{ n_analisis: number | null }>) max = Math.max(max, num(r.n_analisis));
  const { data, error } = await supabase.from(TABLE_ANA).insert({
    n_analisis: max + 1, analisis: {}, procedencia: proc,
    created_by: input.actor, actor_name: input.actorName ?? null,
  }).select('*').single();
  if (error) throw error;
  return data as AnalisisRow;
}

export async function actualizarAnalisisRow(id: string, patch: { n_analisis?: number | null; analisis?: AnalisisLab; observacion?: string | null; muestras?: string | null; procedencia?: string | null }): Promise<void> {
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.n_analisis !== undefined) upd.n_analisis = patch.n_analisis == null ? null : Math.max(1, Math.round(num(patch.n_analisis)));
  if (patch.analisis != null) upd.analisis = patch.analisis;
  if (patch.observacion !== undefined) upd.observacion = patch.observacion?.trim() || null;
  if (patch.muestras !== undefined) upd.muestras = patch.muestras?.trim() || null;
  if (patch.procedencia !== undefined) upd.procedencia = (patch.procedencia?.trim() || 'PERAMANAL').toUpperCase();
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
  columnas: 'abc' | 'prom'; // 'abc' = A/B/C…/Prom · 'prom' = solo Prom (como UCV)
  n_lecturas?: number | null; // cantidad de lecturas A,B,C,D,E,F… (solo 'abc'); default 3
  color: string;
  orden: number;
  activo: boolean;
}
/** Cantidad de lecturas saneada de un mineral (1..8); 3 por defecto. */
export function nLecturas(m: { columnas?: string; n_lecturas?: number | null }): number {
  if (m.columnas === 'prom') return 0;
  const n = Math.round(Number(m.n_lecturas ?? 3));
  return Number.isFinite(n) ? Math.min(8, Math.max(1, n)) : 3;
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

export async function addMineral(input: { nombre: string; subtitulo?: string | null; columnas: 'abc' | 'prom'; n_lecturas?: number | null; color?: string | null }): Promise<MineralLab> {
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error('Indicá el nombre (mineral, letra o número).');
  const clave = await claveUnica(nombre);
  const { data: max } = await supabase.from(TABLE_MIN).select('orden').order('orden', { ascending: false }).limit(1).maybeSingle();
  const orden = (num((max as { orden?: number } | null)?.orden) || 0) + 1;
  const esAbc = input.columnas !== 'prom';
  const { data, error } = await supabase.from(TABLE_MIN).insert({
    clave, nombre, subtitulo: input.subtitulo?.trim() || null,
    columnas: esAbc ? 'abc' : 'prom',
    n_lecturas: esAbc ? nLecturas({ columnas: 'abc', n_lecturas: input.n_lecturas }) : 3,
    color: input.color?.trim() || '#888888', orden, activo: true,
  }).select('*').single();
  if (error) throw error;
  return data as MineralLab;
}

export async function updateMineral(id: string, patch: { nombre?: string; subtitulo?: string | null; columnas?: 'abc' | 'prom'; n_lecturas?: number | null; color?: string; orden?: number; activo?: boolean }): Promise<void> {
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.nombre != null) { const n = patch.nombre.trim(); if (!n) throw new Error('El nombre no puede estar vacío.'); upd.nombre = n; }
  if (patch.subtitulo !== undefined) upd.subtitulo = patch.subtitulo?.trim() || null;
  if (patch.columnas != null) upd.columnas = patch.columnas === 'prom' ? 'prom' : 'abc';
  if (patch.n_lecturas != null) upd.n_lecturas = nLecturas({ columnas: 'abc', n_lecturas: patch.n_lecturas });
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
  // % Humedad = 100% − (Peso seco / Peso húmedos) expresado en %. Redondeo a 2 decimales.
  return round2(100 - (s / h) * 100);
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
  return round2(ps.reduce((a, b) => a + b, 0) / ps.length);
}

/* ───────────── Humedad Final (tabla independiente) ─────────────
   Peso (Kg) recogido · el % Humedad final aplicado proviene del promedio del lote
   de la Humedad Provisional; Merma peso H2O = recogido × %humedad/100.
   El total de Peso recogido y de Merma son sumatorias; el % del lote, promedio. */

const TABLE_HFIN = 'recepciones_humedad_final';

export interface HumedadFinalRow {
  id: string;
  peso_recogido: number | null;
  /** Procedencia (A, B, …). Las filas AUTO se generan una por procedencia desde los pesos. */
  procedencia?: string | null;
  /** true = fila generada/sincronizada automáticamente desde los pesos de bigbags. */
  auto?: boolean | null;
  /** Neto húmedo de esa procedencia (suma húmedos − tara). Base para la merma final. */
  neto_humedo?: number | null;
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

/** Merma final POR PROCEDENCIA = Neto húmedo − Peso seco final (peso recogido). */
export function mermaFinalProc(netoHumedo: number | null, pesoSecoFinal: number | null): number | null {
  const nh = Number(netoHumedo), ps = Number(pesoSecoFinal);
  if (!Number.isFinite(nh) && !Number.isFinite(ps)) return null;
  return round2((Number.isFinite(nh) ? nh : 0) - (Number.isFinite(ps) ? ps : 0));
}

/** % Humedad final POR PROCEDENCIA = Merma / Neto húmedo × 100. */
export function pctFinalProc(netoHumedo: number | null, pesoSecoFinal: number | null): number | null {
  const nh = Number(netoHumedo);
  const merma = mermaFinalProc(netoHumedo, pesoSecoFinal);
  if (merma == null || !Number.isFinite(nh) || nh <= 0) return null;
  return round3((merma / nh) * 100);
}

/* ───────────── Bigbags (Pesos Húmedos / Pesos Secos) ─────────────
   Cada bigbag tiene número incremental (desde 1), procedencia (A, B, ALI, D,
   FALTANTE…), un peso húmedo y un peso seco. La fila «BIG BAG» de cada tabla
   resta la tara de los bigbags ingresados: −(cantidad de bigbags con peso) × 1.5.
   El TOTAL NETO = suma de los pesos + esa fórmula (puede ser negativo). */

const TABLE_BB = 'recepciones_bigbags';
export const TARA_BIGBAG = 1.5;

/** Tipo de envase del pesaje (switch). Cada uno descuenta su propia tara por unidad con peso. */
export type TipoPesaje = 'bigbag' | 'saco' | 'bolsa_hielo';
/** Tara (negativa) por unidad con peso, según el tipo. */
export const TARA_TIPO: Record<TipoPesaje, number> = { bigbag: 1.5, saco: 0.06, bolsa_hielo: 0.05 };
/** Etiqueta de la fila de tara / encabezado, según el tipo. */
export const TIPO_LABEL: Record<TipoPesaje, string> = { bigbag: 'BIG BAG', saco: 'SACO', bolsa_hielo: 'BOLSA DE HIELO' };
/** Etiqueta singular (para «X 1», botón «Añadir X»). */
export const TIPO_SINGULAR: Record<TipoPesaje, string> = { bigbag: 'Bigbag', saco: 'Saco', bolsa_hielo: 'Bolsa de hielo' };
export function tipoValido(t: unknown): TipoPesaje { return t === 'saco' || t === 'bolsa_hielo' ? t : 'bigbag'; }

export interface BigbagRow {
  id: string;
  numero: number;
  procedencia: string | null;
  peso_humedo: number | null;
  peso_seco: number | null;
  tipo?: string | null;
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

export async function crearBigbag(input: { actor: string; actorName?: string | null; pesadaId?: string | null; tipo?: TipoPesaje }): Promise<BigbagRow> {
  const pesadaId = input.pesadaId ?? null;
  let q = supabase.from(TABLE_BB).select('numero');
  q = pesadaId == null ? q.is('pesada_id', null) : q.eq('pesada_id', pesadaId);
  const { data: rows } = await q;
  let max = 0;
  for (const r of (rows ?? []) as Array<{ numero: number | null }>) max = Math.max(max, num(r.numero));
  const { data, error } = await supabase.from(TABLE_BB).insert({
    numero: max + 1, procedencia: null, peso_humedo: null, peso_seco: null, pesada_id: pesadaId,
    tipo: input.tipo ?? 'bigbag',
    created_by: input.actor, actor_name: input.actorName ?? null,
  }).select('*').single();
  if (error) throw error;
  return data as BigbagRow;
}

/** Cambia el tipo de TODO el conjunto (set de trabajo o pesada) y, si es pesada, su cabecera. */
export async function cambiarTipoPesos(pesadaId: string | null, tipo: TipoPesaje): Promise<void> {
  let q = supabase.from(TABLE_BB).update({ tipo, updated_at: new Date().toISOString() });
  q = pesadaId == null ? q.is('pesada_id', null) : q.eq('pesada_id', pesadaId);
  const { error } = await q;
  if (error) throw error;
  if (pesadaId) await supabase.from(TABLE_PESADAS).update({ tipo }).eq('id', pesadaId);
}

export async function actualizarBigbag(id: string, patch: { numero?: number; procedencia?: string | null; peso_humedo?: number | null; peso_seco?: number | null; tipo?: TipoPesaje }): Promise<void> {
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.numero != null) upd.numero = Math.max(1, Math.round(num(patch.numero)));
  if (patch.tipo !== undefined) upd.tipo = patch.tipo;
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

/** Fórmula de la fila de tara: −(cantidad de unidades con peso) × tara del tipo. */
export function formulaBigbag(cantidadConPeso: number, tipo: TipoPesaje = 'bigbag'): number {
  return round2(-cantidadConPeso * TARA_TIPO[tipo]);
}

const TIPOS_PESAJE: TipoPesaje[] = ['bigbag', 'saco', 'bolsa_hielo'];

/**
 * Totales de un conjunto de pesajes (húmedos/secos): suma, tara y neto.
 * La tara se calcula POR CATEGORÍA: en un mismo pesaje pueden convivir big bags,
 * sacos y bolsas de hielo; cada tipo descuenta su propia tara × (cantidad con peso).
 */
export function totalesBigbags(bigbags: BigbagRow[]): {
  nBigbags: number; sumaHumedo: number; sumaSeco: number;
  bigBagHumedo: number; bigBagSeco: number; netoHumedo: number; netoSeco: number;
} {
  const sumaHumedo = round2(bigbags.reduce((a, b) => a + (Number(b.peso_humedo) || 0), 0));
  const sumaSeco = round2(bigbags.reduce((a, b) => a + (Number(b.peso_seco) || 0), 0));
  let bigBagHumedo = 0, bigBagSeco = 0;
  for (const t of TIPOS_PESAJE) {
    const hum = bigbags.filter((b) => b.peso_humedo != null && tipoValido(b.tipo) === t).length;
    const sec = bigbags.filter((b) => b.peso_seco != null && tipoValido(b.tipo) === t).length;
    bigBagHumedo += formulaBigbag(hum, t);
    bigBagSeco += formulaBigbag(sec, t);
  }
  bigBagHumedo = round2(bigBagHumedo); bigBagSeco = round2(bigBagSeco);
  return {
    nBigbags: bigbags.length, sumaHumedo, sumaSeco, bigBagHumedo, bigBagSeco,
    netoHumedo: round2(sumaHumedo + bigBagHumedo), netoSeco: round2(sumaSeco + bigBagSeco),
  };
}

/* ───────────── Catálogo de procedencias (editable) ───────────── */

const TABLE_PROC = 'recepciones_procedencias';

export interface ProcedenciaRow {
  id: string;
  nombre: string;
  orden: number;
  created_at: string;
}

export async function listProcedencias(): Promise<ProcedenciaRow[]> {
  const { data, error } = await supabase.from(TABLE_PROC).select('*')
    .order('orden', { ascending: true }).order('nombre', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProcedenciaRow[];
}

export async function crearProcedencia(input: { nombre: string; actor: string; actorName?: string | null }): Promise<ProcedenciaRow> {
  const nombre = input.nombre.trim().toUpperCase();
  if (!nombre) throw new Error('Indicá el nombre de la procedencia.');
  const { data, error } = await supabase.from(TABLE_PROC)
    .insert({ nombre, created_by: input.actor, actor_name: input.actorName ?? null }).select('*').single();
  if (error) throw (error.code === '23505' ? new Error('Esa procedencia ya existe.') : error);
  return data as ProcedenciaRow;
}

export async function renombrarProcedencia(id: string, nombre: string): Promise<void> {
  const n = nombre.trim().toUpperCase();
  if (!n) throw new Error('El nombre no puede quedar vacío.');
  const { error } = await supabase.from(TABLE_PROC).update({ nombre: n }).eq('id', id);
  if (error) throw (error.code === '23505' ? new Error('Esa procedencia ya existe.') : error);
}

export async function eliminarProcedencia(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE_PROC).delete().eq('id', id);
  if (error) throw error;
}

/** Procedencias para el combobox: las del catálogo + las ya usadas en bigbags/recepciones. */
export async function listProcedenciasConocidas(): Promise<string[]> {
  const [cat, bb, lab] = await Promise.all([
    supabase.from(TABLE_PROC).select('nombre'),
    supabase.from(TABLE_BB).select('procedencia'),
    supabase.from('recepciones_lab').select('procedencia'),
  ]);
  const set = new Set<string>();
  for (const r of (cat.data ?? []) as Array<{ nombre: string | null }>) {
    const p = (r.nombre ?? '').trim().toUpperCase();
    if (p) set.add(p);
  }
  for (const r of [...(bb.data ?? []), ...(lab.data ?? [])] as Array<{ procedencia: string | null }>) {
    const p = (r.procedencia ?? '').trim().toUpperCase();
    if (p) set.add(p);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'es'));
}

/** Bigbags ACTIVOS de la recepción en curso: el set de trabajo (sin guardar) + los de
 *  pesadas NO consumidas. Base para la Humedad Final por procedencia (sobrevive al
 *  «Guardar pesos», que mueve los bigbags a una pesada pero siguen contando). */
export async function listBigbagsActivos(): Promise<BigbagRow[]> {
  const pesadas = await listPesadas();
  const activas = pesadas.filter((p) => !p.consumida).map((p) => p.id);
  const trabajo = await listBigbags(null);
  let dePesadas: BigbagRow[] = [];
  if (activas.length) {
    const { data } = await supabase.from(TABLE_BB).select('*').in('pesada_id', activas)
      .order('numero', { ascending: true });
    dePesadas = (data ?? []) as BigbagRow[];
  }
  return [...trabajo, ...dePesadas];
}

/**
 * Sincroniza la Humedad Final POR PROCEDENCIA desde los pesos: agrupa los bigbags
 * activos por procedencia y, por cada una, calcula el neto húmedo y el peso seco
 * final (neto seco) y los deja en una fila AUTO de Humedad Final. Merma final =
 * neto húmedo − peso seco final. Las filas manuales (auto=false) no se tocan;
 * las AUTO cuya procedencia desaparece se borran.
 */
export async function sincronizarHumedadFinalPorProcedencia(input: { actor: string; actorName?: string | null }): Promise<void> {
  const bigbags = await listBigbagsActivos();
  const grupos = new Map<string, BigbagRow[]>();
  for (const b of bigbags) {
    // GT maneja un único centro de acopio (Peramanal): los bigbags SIN procedencia
    // se agrupan por defecto en PERAMANAL, así los pesos guardados siempre generan su
    // fila de Humedad Final (antes se saltaban y la tabla quedaba vacía).
    const key = (b.procedencia ?? '').trim().toUpperCase() || 'PERAMANAL';
    const arr = grupos.get(key) ?? [];
    arr.push(b);
    grupos.set(key, arr);
  }
  const { data: exist } = await supabase.from(TABLE_HFIN).select('id, procedencia').eq('auto', true);
  const byProc = new Map<string, string>();
  for (const r of (exist ?? []) as Array<{ id: string; procedencia: string | null }>) {
    byProc.set((r.procedencia ?? '').toUpperCase(), r.id);
  }
  const vistos = new Set<string>();
  for (const [proc, rows] of grupos) {
    vistos.add(proc);
    const t = totalesBigbags(rows);
    const patch = { neto_humedo: t.netoHumedo, peso_recogido: t.netoSeco, updated_at: new Date().toISOString() };
    const id = byProc.get(proc);
    if (id) {
      await supabase.from(TABLE_HFIN).update(patch).eq('id', id);
    } else {
      await supabase.from(TABLE_HFIN).insert({
        procedencia: proc, auto: true, ...patch,
        created_by: input.actor, actor_name: input.actorName ?? null,
      });
    }
  }
  for (const [proc, id] of byProc) {
    if (!vistos.has(proc)) await supabase.from(TABLE_HFIN).delete().eq('id', id);
  }
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
  tipo?: string | null;
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
  const tipo = tipoValido(trabajo[0]?.tipo);
  const t = totalesBigbags(trabajo);
  const { data, error } = await supabase.from(TABLE_PESADAS).insert({
    n_bigbags: t.nBigbags, suma_humedo: t.sumaHumedo, suma_seco: t.sumaSeco,
    big_bag_humedo: t.bigBagHumedo, big_bag_seco: t.bigBagSeco,
    neto_humedo: t.netoHumedo, neto_seco: t.netoSeco, tipo,
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
    neto_humedo: t.netoHumedo, neto_seco: t.netoSeco,
    tipo: tipoValido(bigbags[0]?.tipo), updated_at: new Date().toISOString(),
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
     Diferencia = Reportado − Peso KG total   (+ = «Kg a favor» verde; − = «Kg Faltante» rojo)
     No llegó   = Diferencia + Kg bolsas + Muestras lab
     %No llegó  = No llegó / Reportado × 100 */

const TABLE_CONCIL = 'recepciones_conciliaciones';

export interface ConciliacionCentro {
  nombre: string;
  kg: number | null;
  /** Categoría del centro: 'RESGUARDO' habilita el ingreso al inventario (sin tasa). */
  categoria?: string | null;
  /** Si es RESGUARDO: ¿esos KG entran al inventario? */
  entra_inventario?: boolean;
  /** Almacén destino del ingreso al inventario (cuando entra_inventario). */
  almacen?: string | null;
  /** Marca que el ingreso al inventario ya se aplicó (al cerrar la recepción) — evita duplicar. */
  inventario_aplicado?: boolean;
}

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
  // Diferencia = Reportado − Peso KG total (+ = «a favor»; − = «faltante»).
  const faltante = round2(reportado - num(c.peso_kg_total));
  // Kg No Llegó = diferencia (lo que llegó de más o de menos) + peso de bolsas + muestras de laboratorio.
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

/* ───────────── Totales (precio de compra: minas → recepcionada → costo final) ─────────────
   Por centro de costo: Total SnO2 (kg) × Precio/Tasa = Total Moneda.
   MINAS:        Total SnO2 = Σ kg · Total Moneda = Σ(kg×precio) + GASTOS · Precio = Moneda/SnO2.
   RECEPCIONADA: Total SnO2 = Pesos Kg (lo recepcionado) · Total Moneda = Moneda de MINAS ·
                 Tasa = Total Moneda / Pesos Kg.
   COSTO FINAL:  Total SnO2 = Pesos Kg + Humedad Prov + Humedad Final + Fe estéril ·
                 Total Moneda = Moneda de RECEPCIONADA (si el ajuste es 0) · Tasa = Moneda/SnO2. */

const TABLE_TOT = 'recepciones_totales';
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export interface TotalCentro { nombre: string; sno2: number | null; precio: number | null }

export interface TotalesDoc {
  id: string;
  numero: number;
  fecha: string;
  centros: TotalCentro[];
  gastos: number;
  pesos_kg: number;
  humedad_prov: number;
  humedad_final: number;
  fe_esteril: number;
  total_sno2_minas: number;
  total_moneda_minas: number;
  precio_minas: number;
  tasa_recep: number;
  total_moneda_recep: number;
  total_sno2_final: number;
  total_moneda_final: number;
  tasa_final: number;
  observacion?: string | null;
  created_by?: string | null;
  actor_name?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface TotalesCalc {
  totalSnO2Minas: number; totalMonedaMinas: number; precioMinas: number;
  tasaRecep: number; totalMonedaRecep: number;
  totalSnO2Final: number; totalMonedaFinal: number; tasaFinal: number;
}

/** Calcula los tres bloques (minas / recepcionada / costo final). */
export function calcTotales(d: {
  centros: TotalCentro[]; gastos: number | null; pesos_kg: number | null;
  humedad_prov: number | null; humedad_final: number | null; fe_esteril: number | null;
}): TotalesCalc {
  const totalSnO2Minas = round2((d.centros ?? []).reduce((a, c) => a + (Number(c.sno2) || 0), 0));
  const monedaCentros = (d.centros ?? []).reduce((a, c) => a + (Number(c.sno2) || 0) * (Number(c.precio) || 0), 0);
  const totalMonedaMinas = round2(monedaCentros + num(d.gastos));
  const precioMinas = totalSnO2Minas !== 0 ? round4(totalMonedaMinas / totalSnO2Minas) : 0;
  const pesos = num(d.pesos_kg);
  const totalMonedaRecep = totalMonedaMinas;
  const tasaRecep = pesos !== 0 ? round4(totalMonedaRecep / pesos) : 0;
  const totalSnO2Final = round2(pesos + num(d.humedad_prov) + num(d.humedad_final) + num(d.fe_esteril));
  // El ajuste de humedad/fe no aporta dinero: la moneda final es la de RECEPCIONADA.
  const totalMonedaFinal = totalMonedaRecep;
  const tasaFinal = totalSnO2Final !== 0 ? round4(totalMonedaFinal / totalSnO2Final) : 0;
  return { totalSnO2Minas, totalMonedaMinas, precioMinas, tasaRecep, totalMonedaRecep, totalSnO2Final, totalMonedaFinal, tasaFinal };
}

function normTot(row: Record<string, unknown>): TotalesDoc {
  const r = row as unknown as TotalesDoc;
  return { ...r, centros: Array.isArray(r.centros) ? r.centros : [] };
}

export async function listTotales(): Promise<TotalesDoc[]> {
  const { data, error } = await supabase.from(TABLE_TOT).select('*')
    .order('numero', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => normTot(r as Record<string, unknown>));
}

export async function crearTotales(input: { numero?: number | null; actor: string; actorName?: string | null }): Promise<TotalesDoc> {
  let numero = input.numero != null ? Math.max(1, Math.round(num(input.numero))) : 0;
  if (!numero) {
    const { data: rows } = await supabase.from(TABLE_TOT).select('numero');
    let max = 0;
    for (const r of (rows ?? []) as Array<{ numero: number | null }>) max = Math.max(max, num(r.numero));
    numero = max + 1;
  }
  const { data, error } = await supabase.from(TABLE_TOT).insert({
    numero, centros: [], gastos: 0, pesos_kg: 0, humedad_prov: 0, humedad_final: 0, fe_esteril: 0,
    created_by: input.actor, actor_name: input.actorName ?? null,
  }).select('*').single();
  if (error) throw error;
  return normTot(data as Record<string, unknown>);
}

export async function actualizarTotales(id: string, patch: {
  numero?: number; centros?: TotalCentro[]; gastos?: number | null; pesos_kg?: number | null;
  humedad_prov?: number | null; humedad_final?: number | null; fe_esteril?: number | null; observacion?: string | null;
}): Promise<void> {
  const { data: cur } = await supabase.from(TABLE_TOT).select('centros, gastos, pesos_kg, humedad_prov, humedad_final, fe_esteril').eq('id', id).single();
  const base = (cur ?? {}) as { centros: TotalCentro[]; gastos: number; pesos_kg: number; humedad_prov: number; humedad_final: number; fe_esteril: number };
  const merged = {
    centros: patch.centros !== undefined ? patch.centros : (Array.isArray(base.centros) ? base.centros : []),
    gastos: patch.gastos !== undefined ? num(patch.gastos) : num(base.gastos),
    pesos_kg: patch.pesos_kg !== undefined ? num(patch.pesos_kg) : num(base.pesos_kg),
    humedad_prov: patch.humedad_prov !== undefined ? num(patch.humedad_prov) : num(base.humedad_prov),
    humedad_final: patch.humedad_final !== undefined ? num(patch.humedad_final) : num(base.humedad_final),
    fe_esteril: patch.fe_esteril !== undefined ? num(patch.fe_esteril) : num(base.fe_esteril),
  };
  const c = calcTotales(merged);
  const upd: Record<string, unknown> = {
    ...merged,
    total_sno2_minas: c.totalSnO2Minas, total_moneda_minas: c.totalMonedaMinas, precio_minas: c.precioMinas,
    tasa_recep: c.tasaRecep, total_moneda_recep: c.totalMonedaRecep,
    total_sno2_final: c.totalSnO2Final, total_moneda_final: c.totalMonedaFinal, tasa_final: c.tasaFinal,
    updated_at: new Date().toISOString(),
  };
  if (patch.numero != null) upd.numero = Math.max(1, Math.round(num(patch.numero)));
  if (patch.observacion !== undefined) upd.observacion = patch.observacion?.trim() || null;
  const { error } = await supabase.from(TABLE_TOT).update(upd).eq('id', id);
  if (error) throw error;
}

export async function eliminarTotales(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE_TOT).delete().eq('id', id);
  if (error) throw error;
}

/* ───────────── Cierre de recepción (histórico: toma TODOS los datos) ─────────────
   Al cerrar una recepción: ingresa al inventario (SIN tasa) los saldos de centros
   marcados RESGUARDO + «entra al inventario», y guarda una foto completa de los
   datos (recepciones, análisis, humedad, conciliación y totales) con su N° y fecha. */

const TABLE_CIERRES = 'recepciones_cierres';

export interface CierreRecepcion {
  id: string;
  numero: number;
  fecha: string;
  snapshot: Record<string, unknown>;
  observacion?: string | null;
  created_by?: string | null;
  actor_name?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export async function listCierres(): Promise<CierreRecepcion[]> {
  const { data, error } = await supabase.from(TABLE_CIERRES).select('*')
    .order('numero', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CierreRecepcion[];
}

/** Producto Casiterita (mineral) para el ingreso por RESGUARDO. Único producto de
 *  casiterita: SKU 'CASITERITA' (el mismo que usa Producción al cerrar contratos).
 *  Se resuelve SIEMPRE por ese SKU para no duplicar (antes existía 'SNO2', ya fusionado);
 *  solo si faltara, cae al primer mineral por categoría. */
async function productoCasiterita(): Promise<{ id: string } | null> {
  const porSku = await supabase.from('productos').select('id').eq('sku', 'CASITERITA').maybeSingle();
  if (porSku.data) return porSku.data as { id: string };
  const { data } = await supabase.from('productos').select('id')
    .ilike('categoria', '%mineral%').order('created_at', { ascending: true }).limit(1).maybeSingle();
  return (data as { id: string } | null) ?? null;
}

/**
 * Cierra la recepción N°: guarda la foto de todos los datos e ingresa al inventario:
 *  - los centros RESGUARDO pendientes (SIN tasa), y
 *  - el NETO SECO de las pesadas disponibles (CON la tasa final de Totales) al almacén
 *    (y subalmacén) indicado. Idempotente: marca aplicado/consumida para no duplicar.
 */
export async function cerrarRecepcion(input: { numero: number; actor: string; actorName?: string | null; observacion?: string | null; almacen?: string | null; subalmacen?: string | null }): Promise<CierreRecepcion> {
  const numero = Math.max(1, Math.round(num(input.numero)));
  const [recs, anas, hp, hf, mins, todasConcil, todosTot, pesadas] = await Promise.all([
    listRecepciones(), listAnalisis(), listHumedadProv(), listHumedadFinal(), listMinerales(false), listConciliaciones(), listTotales(), listPesadas(),
  ]);
  const conciliaciones = todasConcil.filter((c) => c.numero === numero);
  // El documento de Totales lleva su propio correlativo (no está ligado al N° de
  // recepción), así que se toma el MÁS RECIENTE: listTotales viene ordenado por
  // numero desc y created_at desc, por lo que todosTot[0] es el último.
  const totalesUsado = todosTot[0] ?? null;
  const totales = totalesUsado ? [totalesUsado] : [];

  // ── Ingreso al inventario de los RESGUARDO pendientes (sin tasa) ──
  let cas: { id: string } | null = null;
  const ingresos: Array<{ centro: string; almacen: string; kg: number }> = [];
  for (const c of conciliaciones) {
    let cambiaron = false;
    const centros = c.centros.map((ce) => ({ ...ce }));
    for (const ce of centros) {
      const kg = Number(ce.kg) || 0;
      if ((ce.categoria ?? '') === 'RESGUARDO' && ce.entra_inventario && (ce.almacen ?? '').trim() && !ce.inventario_aplicado && kg > 0) {
        if (!cas) cas = await productoCasiterita();
        if (!cas) throw new Error('No se encontró el producto Casiterita en el inventario para el ingreso por RESGUARDO.');
        await registrarMovimiento({
          producto_id: cas.id, tipo: 'entrada', delta: kg, almacen: (ce.almacen as string).trim(),
          precio_unitario: null, actor: input.actor, actor_name: input.actorName ?? null,
          ref_tipo: 'recepcion_resguardo', ref_id: c.id,
        });
        ce.inventario_aplicado = true; cambiaron = true;
        ingresos.push({ centro: ce.nombre, almacen: (ce.almacen as string).trim(), kg });
      }
    }
    if (cambiaron) await actualizarConciliacion(c.id, { centros });
  }

  // ── Ingreso al inventario del NETO SECO (casiterita) con la TASA FINAL de Totales ──
  // Cantidad = suma del Neto seco de las pesadas DISPONIBLES; tasa = tasa_final de los
  // Totales N°. Se asigna al almacén (y subalmacén) indicado. Idempotente: las pesadas
  // usadas se marcan «consumida» para no volver a ingresarlas en otro cierre.
  const almacenBase = (input.almacen ?? '').trim();
  const subalmacen = (input.subalmacen ?? '').trim();
  const almacenFinal = subalmacen ? `${almacenBase} / ${subalmacen}` : almacenBase;
  // Tasa FINAL de Totales (44,86 $/Kg en el ejemplo). Si el valor guardado viniera en
  // 0 (doc viejo), se recalcula desde el documento con calcTotales.
  let tasaFinal = Number(totalesUsado?.tasa_final) || 0;
  if (!tasaFinal && totalesUsado) tasaFinal = calcTotales(totalesUsado).tasaFinal;
  const pesadasDisp = pesadas.filter((p) => !p.consumida && (Number(p.neto_seco) || 0) > 0);
  const netoSecoTotal = round2(pesadasDisp.reduce((a, p) => a + (Number(p.neto_seco) || 0), 0));
  let ingresoCasiterita: { almacen: string; kg: number; tasa: number } | null = null;
  if (almacenBase && netoSecoTotal > 0) {
    if (!cas) cas = await productoCasiterita();
    if (!cas) throw new Error('No se encontró el producto Casiterita en el inventario para el ingreso del neto seco.');
    await registrarMovimiento({
      producto_id: cas.id, tipo: 'entrada', delta: netoSecoTotal, almacen: almacenFinal,
      precio_unitario: tasaFinal > 0 ? tasaFinal : null, actor: input.actor, actor_name: input.actorName ?? null,
      ref_tipo: 'recepcion_cierre', ref_id: String(numero),
    });
    for (const p of pesadasDisp) await actualizarPesada(p.id, { consumida: true });
    ingresoCasiterita = { almacen: almacenFinal, kg: netoSecoTotal, tasa: tasaFinal };
  }

  // Foto de las pesadas (ya marcadas «consumida» arriba) y de TODOS los bigbags
  // (set de trabajo + los de cada pesada) para poder REABRIR el cierre con los pesos
  // intactos. Antes no se guardaban y una recepción reabierta perdía las pesadas.
  const [pesadasSnap, bigbagsSnapRes] = await Promise.all([
    listPesadas(),
    supabase.from(TABLE_BB).select('*'),
  ]);
  const bigbagsSnap = (bigbagsSnapRes.data ?? []) as BigbagRow[];

  const snapshot = {
    generado_at: new Date().toISOString(),
    recepciones: recs, analisis: anas, humedad_prov: hp, humedad_final: hf, minerales: mins,
    conciliaciones, totales, pesadas: pesadasSnap, bigbags: bigbagsSnap,
    ingresos_resguardo: ingresos, ingreso_casiterita: ingresoCasiterita,
  };
  const { data, error } = await supabase.from(TABLE_CIERRES).insert({
    numero, snapshot, observacion: input.observacion?.trim() || null,
    created_by: input.actor, actor_name: input.actorName ?? null,
  }).select('*').single();
  if (error) throw error;

  // Con la foto ya guardada en el histórico, se BORRAN TODOS los datos de trabajo de la
  // recepción para que la próxima arranque en blanco: recepciones (ítem/peso/procedencia),
  // pesos (bigbags/pesadas), conciliaciones, totales, análisis químico y humedades.
  // NO se tocan los minerales (catálogo/config) ni los cierres (histórico). La info queda
  // íntegra en el snapshot. Best-effort: el cierre ya está guardado y no se revierte.
  // OJO con el orden por FK: recepciones_bigbags.pesada_id → recepciones_pesadas, así que
  // los bigbags se borran ANTES que las pesadas (encadenado); el resto va en paralelo.
  await Promise.allSettled([
    supabase.from(TABLE).delete().not('id', 'is', null),
    supabase.from(TABLE_ANA).delete().not('id', 'is', null),
    supabase.from(TABLE_HPROV).delete().not('id', 'is', null),
    supabase.from(TABLE_HFIN).delete().not('id', 'is', null),
    supabase.from(TABLE_CONCIL).delete().not('id', 'is', null),
    supabase.from(TABLE_TOT).delete().not('id', 'is', null),
    supabase.from(TABLE_BB).delete().not('id', 'is', null)
      .then(() => supabase.from(TABLE_PESADAS).delete().not('id', 'is', null)),
  ]);

  return data as CierreRecepcion;
}

export async function eliminarCierre(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE_CIERRES).delete().eq('id', id);
  if (error) throw error;
}

/** Cuenta filas de una tabla (para el guard de reabrir). */
async function contarFilas(tabla: string): Promise<number> {
  const { count, error } = await supabase.from(tabla).select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

/**
 * REABRE un cierre para modificarlo: restaura la foto a la hoja de trabajo (recepciones,
 * análisis, humedades, conciliaciones, totales, pesadas y bigbags) REVIRTIENDO lo que ese
 * cierre ingresó al inventario (neto seco de casiterita + resguardos), y borra el cierre.
 * Luego se edita normal y se vuelve a cerrar (re-ingresa al inventario).
 *
 * Guard: la hoja de trabajo debe estar VACÍA (no se puede reabrir encima de una recepción
 * en curso — colisionarían los IDs y se perdería lo cargado). Cierres viejos sin pesadas en
 * la foto se reabren igual (sin esas pesadas), pero SÍ revierten su ingreso de inventario.
 */
export async function reabrirCierre(cierre: CierreRecepcion, input: { actor: string; actorName?: string | null }): Promise<void> {
  // ── Guard: la hoja de trabajo debe estar vacía ──
  const tablas = [TABLE, TABLE_ANA, TABLE_HPROV, TABLE_HFIN, TABLE_CONCIL, TABLE_TOT, TABLE_PESADAS, TABLE_BB];
  const counts = await Promise.all(tablas.map(contarFilas));
  if (counts.some((n) => n > 0)) {
    throw new Error('Hay una recepción en curso con datos cargados. Cerrala o vaciala antes de reabrir un histórico.');
  }

  const snap = cierre.snapshot as {
    recepciones?: RecepcionLab[]; analisis?: AnalisisRow[]; humedad_prov?: HumedadProvRow[];
    humedad_final?: HumedadFinalRow[]; conciliaciones?: Conciliacion[]; totales?: TotalesDoc[];
    pesadas?: PesadaRow[]; bigbags?: BigbagRow[];
    ingresos_resguardo?: Array<{ centro: string; almacen: string; kg: number }>;
    ingreso_casiterita?: { almacen: string; kg: number; tasa: number } | null;
  };

  // ── 1) Revertir el inventario que ingresó este cierre (salidas por el mismo Kg) ──
  let cas: { id: string } | null = null;
  const ic = snap.ingreso_casiterita;
  if (ic && (Number(ic.kg) || 0) > 0 && (ic.almacen ?? '').trim()) {
    cas = await productoCasiterita();
    if (!cas) throw new Error('No se encontró el producto Casiterita para revertir el ingreso del neto seco.');
    await registrarMovimiento({
      producto_id: cas.id, tipo: 'salida', delta: -(Number(ic.kg) || 0), almacen: ic.almacen.trim(),
      actor: input.actor, actor_name: input.actorName ?? null,
      ref_tipo: 'recepcion_reabrir', ref_id: String(cierre.numero),
      detalle: `Reversión por reapertura de la Recepción N° ${cierre.numero}`,
    });
  }
  for (const r of snap.ingresos_resguardo ?? []) {
    const kg = Number(r.kg) || 0;
    if (kg <= 0 || !(r.almacen ?? '').trim()) continue;
    if (!cas) cas = await productoCasiterita();
    if (!cas) throw new Error('No se encontró el producto Casiterita para revertir el ingreso por RESGUARDO.');
    await registrarMovimiento({
      producto_id: cas.id, tipo: 'salida', delta: -kg, almacen: r.almacen.trim(),
      actor: input.actor, actor_name: input.actorName ?? null,
      ref_tipo: 'recepcion_reabrir', ref_id: String(cierre.numero),
      detalle: `Reversión RESGUARDO (${r.centro}) por reapertura de la Recepción N° ${cierre.numero}`,
    });
  }

  // ── 2) Restaurar la hoja de trabajo desde la foto (re-inserta las filas con su ID) ──
  // Las conciliaciones vuelven con `inventario_aplicado=false` (ya se revirtió) para que
  // al re-cerrar se vuelva a ingresar. Las pesadas vuelven como DISPONIBLES (consumida=false).
  const concilRestore = (snap.conciliaciones ?? []).map((c) => ({
    ...c,
    centros: (Array.isArray(c.centros) ? c.centros : []).map((ce) => ({ ...ce, inventario_aplicado: false })),
  }));
  const pesadasRestore = (snap.pesadas ?? []).map((p) => ({ ...p, consumida: false }));

  const inserts: Array<Promise<unknown>> = [];
  if (snap.recepciones?.length) inserts.push(reInsert(TABLE, snap.recepciones));
  if (snap.analisis?.length) inserts.push(reInsert(TABLE_ANA, snap.analisis));
  if (snap.humedad_prov?.length) inserts.push(reInsert(TABLE_HPROV, snap.humedad_prov));
  if (snap.humedad_final?.length) inserts.push(reInsert(TABLE_HFIN, snap.humedad_final));
  if (concilRestore.length) inserts.push(reInsert(TABLE_CONCIL, concilRestore));
  if (snap.totales?.length) inserts.push(reInsert(TABLE_TOT, snap.totales));
  await Promise.all(inserts);
  // Pesadas antes que bigbags (FK bigbags.pesada_id → pesadas).
  if (pesadasRestore.length) await reInsert(TABLE_PESADAS, pesadasRestore);
  if (snap.bigbags?.length) await reInsert(TABLE_BB, snap.bigbags);

  // ── 3) Borrar el cierre: ya vive de nuevo en la hoja de trabajo ──
  await eliminarCierre(cierre.id);
}

/** Re-inserta filas de la foto tal cual (conservando su ID). */
async function reInsert(tabla: string, filas: readonly unknown[]): Promise<void> {
  if (!filas.length) return;
  const { error } = await supabase.from(tabla).insert(filas as never);
  if (error) throw error;
}

/* ───────────── Cálculos (Promedio por análisis · Promedio del lote) ───────────── */

// Las leyes de mineral se redondean a 3 decimales (se muestran con mín. 2, máx. 3).
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Promedio (A+B+C+…)/n de un elemento en una recepción. `n` = cantidad de lecturas (default 3). */
export function promElemento(analisis: AnalisisLab | null | undefined, key: string, abc: boolean, n = 3): number | null {
  const v = analisis?.[key];
  if (!abc) {
    if (v == null || String(v).trim() === '') return null;
    const x = Number(v);
    return !Number.isFinite(x) ? null : round3(x);
  }
  const e = (v && typeof v === 'object') ? v as AnalisisElemento : null;
  if (!e) return null;
  const cant = Math.min(8, Math.max(1, Math.round(n)));
  // OJO: solo cuentan las casillas REALMENTE con dato. Hay que descartar null/undefined
  // y string vacío ANTES de convertir a número, porque Number('') y Number(null) dan 0
  // (finito) y contarían la casilla vacía como un 0 → dividiría de más (ej. B=0,57, C=0,23
  // con A vacío daba 0,80/3=0,27 en vez de 0,80/2=0,40).
  const vals = LETRAS_LECTURA.slice(0, cant)
    .map((L) => e[L])
    .filter((raw) => raw != null && String(raw).trim() !== '' && Number.isFinite(Number(raw)))
    .map((raw) => Number(raw));
  if (!vals.length) return null;
  // Promedio SOLO de las casillas con dato: suma / cantidad de casillas llenas.
  const suma = vals.reduce((a, b) => a + b, 0);
  return round3(suma / vals.length);
}

/** Promedio del lote de un elemento: promedio de los Prom de todas las filas que lo tienen. */
export function promedioLote(filas: Array<{ analisis: AnalisisLab }>, key: string, abc: boolean, n = 3): number | null {
  const proms = filas
    .map((r) => promElemento(r.analisis, key, abc, n))
    .filter((x): x is number => x != null);
  if (!proms.length) return null;
  return round3(proms.reduce((a, b) => a + b, 0) / proms.length);
}
