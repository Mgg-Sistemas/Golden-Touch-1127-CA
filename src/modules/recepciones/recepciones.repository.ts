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

/* ───────────── Cálculos (Promedio por análisis · Promedio del lote) ───────────── */

/** Elementos del análisis, en el orden de la hoja. `abc:false` = valor único (UCV). */
export const ELEMENTOS_LAB: { key: string; label: string; sub?: string; abc: boolean; color: string }[] = [
  { key: 'sn',  label: 'Sn (Estaño)',     sub: 'Laboratorio Mineral Group', abc: true,  color: '#f6c344' },
  { key: 'ucv', label: 'UCV',             abc: false, color: '#f0b429' },
  { key: 'fe',  label: 'Fe (Hierro)',     abc: true,  color: '#f6d2a2' },
  { key: 'ti',  label: 'Ti (Titanio)',    abc: true,  color: '#aed4f0' },
  { key: 'ta',  label: 'Ta (Tántalo)',    abc: true,  color: '#cdc1e8' },
  { key: 'nb',  label: 'Nb (Niobio)',     abc: true,  color: '#aeddb0' },
  { key: 'v',   label: 'V (Vanadio)',     abc: true,  color: '#d4a0ba' },
  { key: 'zr',  label: 'Zr (Circonio)',   abc: true,  color: '#7fa9b0' },
  { key: 'bal', label: 'Bal (estéril)',   abc: true,  color: '#f0a868' },
  { key: 'mn',  label: 'Mn (Manganeso)',  abc: true,  color: '#f0c419' },
  { key: 'hf',  label: 'Hf (hafnio)',     abc: true,  color: '#7fb6e0' },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Promedio (A+B+C)/3 de un elemento en una recepción. Promedia solo los valores cargados. */
export function promElemento(analisis: AnalisisLab | null | undefined, key: string, abc: boolean): number | null {
  const v = analisis?.[key];
  if (!abc) {
    const n = Number(v);
    return v == null || !Number.isFinite(n) ? null : round2(n);
  }
  const e = (v && typeof v === 'object') ? v as AnalisisElemento : null;
  if (!e) return null;
  const vals = [e.a, e.b, e.c].map((x) => Number(x)).filter((x) => Number.isFinite(x));
  if (!vals.length) return null;
  // (A+B+C)/3 — siempre dividido entre 3 (las celdas vacías cuentan como 0 si hay alguna cargada).
  const suma = vals.reduce((a, b) => a + b, 0);
  return round2(suma / 3);
}

/** Promedio del lote de un elemento: promedio de los Prom de todas las recepciones que lo tienen. */
export function promedioLote(recepciones: RecepcionLab[], key: string, abc: boolean): number | null {
  const proms = recepciones
    .map((r) => promElemento(r.analisis, key, abc))
    .filter((x): x is number => x != null);
  if (!proms.length) return null;
  return round2(proms.reduce((a, b) => a + b, 0) / proms.length);
}
