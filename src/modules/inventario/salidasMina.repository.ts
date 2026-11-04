/* ============================================================
   Golden Touch · Depósito Mina · Salidas desde el teléfono (base)

   · `deposito_mina_registrar_salida`: descuenta el stock del Depósito Mina
     (kardex) y guarda la salida, en una transacción.
   · `deposito_mina_retornar`: devuelve al stock una parte o todo lo que
     falta por retornar.
   Las fotos van al bucket privado `deposito-mina-salidas` (hasta 4).
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { comprimirImagen } from '@/shared/lib/comprimirImagen';
import type { SolicitudSalida } from '@/shared/lib/types';
import {
  MAX_FOTOS_SALIDA_MINA, errorFotosSalidaMina, type FotoSalidaMina, type RetornoSalidaMina, type SalidaMina,
} from './salidasMina';

const TABLE = 'deposito_mina_salidas';
const BUCKET = 'deposito-mina-salidas';

function normalizar(r: Record<string, unknown>): SalidaMina {
  const s = r as unknown as SalidaMina;
  return {
    ...s,
    cantidad: Number(s.cantidad) || 0,
    retornado: Number(s.retornado) || 0,
    fotos: Array.isArray(r.fotos) ? (r.fotos as FotoSalidaMina[]) : [],
    retornos: Array.isArray(r.retornos) ? (r.retornos as RetornoSalidaMina[]) : [],
  };
}

function err(e: { message?: string } | null, porDefecto: string): Error {
  const m = String(e?.message ?? '').trim();
  if (/permission denied|row-level security/i.test(m)) return new Error('No tienes permiso de escritura en Inventario.');
  return new Error(m || porDefecto);
}

export async function listSalidasMina(limite = 60): Promise<SalidaMina[]> {
  const { data, error } = await supabase.from(TABLE).select('*').order('created_at', { ascending: false }).limit(limite);
  if (error) throw err(error, 'No se pudieron leer las salidas.');
  return (data ?? []).map((r) => normalizar(r as Record<string, unknown>));
}

/** Histórico del teléfono (03/11/2026): las salidas de ese almacén entre dos fechas
 *  (límites ISO, ver limitesIsoRango), de la más reciente a la más vieja. Las viejas de la
 *  Mina no tienen almacén guardado: para la Mina también se traen las que lo tienen en null. */
export async function listSalidasMinaHistorico(f: { almacen: string; desdeIso: string; hastaIso: string; limite?: number }): Promise<SalidaMina[]> {
  let q = supabase.from(TABLE).select('*').gte('created_at', f.desdeIso).lt('created_at', f.hastaIso);
  q = f.almacen === 'Depósito Mina' ? q.or('almacen.eq."Depósito Mina",almacen.is.null') : q.eq('almacen', f.almacen);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(f.limite ?? 200);
  if (error) throw err(error, 'No se pudieron leer las salidas.');
  return (data ?? []).map((r) => normalizar(r as Record<string, unknown>));
}

/** Las salidas EJECUTADAS del módulo Salidas (PC) que registró ese usuario desde ese
 *  almacén, entre dos fechas (03/11/2026: en el histórico del teléfono cada quien ve
 *  también las suyas de la PC). El General viejo guardaba el almacén en null. */
export async function listMisSalidasPcEjecutadas(f: { almacen: string; actor: string; desdeIso: string; hastaIso: string; limite?: number }): Promise<SolicitudSalida[]> {
  let q = supabase.from('solicitudes_salida').select('*')
    .eq('scope', 'salida').eq('estado', 'ejecutada').ilike('actor', f.actor.trim())
    .gte('created_at', f.desdeIso).lt('created_at', f.hastaIso);
  q = f.almacen === 'General' ? q.or('almacen_origen.eq.General,almacen_origen.is.null') : q.eq('almacen_origen', f.almacen);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(f.limite ?? 200);
  if (error) throw err(error, 'No se pudieron leer las salidas del módulo Salidas.');
  return (data ?? []) as SolicitudSalida[];
}

/** Las que retornan y todavía no volvieron completas (todas, no solo las últimas) de ese almacén. */
export async function listPorRetornarMina(almacen = 'Depósito Mina'): Promise<SalidaMina[]> {
  const { data, error } = await supabase.from(TABLE).select('*').eq('estado', 'por_retornar').eq('almacen', almacen)
    .order('created_at', { ascending: true });
  if (error) throw err(error, 'No se pudieron leer las salidas por retornar.');
  return (data ?? []).map((r) => normalizar(r as Record<string, unknown>));
}

export async function registrarSalidaMina(d: {
  productoId: string; cantidad: number; motivo: string; autorizadoPor: string; retorna: boolean; actor: string; actorName: string | null;
  /** 'Depósito Mina' o 'General': el material tiene que ser de ese depósito. */
  almacen: string;
}): Promise<SalidaMina> {
  const { data, error } = await supabase.rpc('deposito_mina_registrar_salida', {
    p: { producto_id: d.productoId, cantidad: d.cantidad, motivo: d.motivo.trim(), autorizado_por: d.autorizadoPor.trim(), retorna: d.retorna, actor: d.actor, actor_name: d.actorName, almacen: d.almacen },
  });
  if (error) throw err(error, 'No se pudo registrar la salida.');
  return normalizar(data as Record<string, unknown>);
}

export async function retornarSalidaMina(id: string, cantidad: number, nota: string, actorName: string | null): Promise<SalidaMina> {
  const { data, error } = await supabase.rpc('deposito_mina_retornar', {
    p_id: id, p_cantidad: cantidad, p_nota: nota.trim() || null, p_actor_name: actorName,
  });
  if (error) throw err(error, 'No se pudo registrar el retorno.');
  return normalizar(data as Record<string, unknown>);
}

const seguro = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80);

/** Sube las fotos (comprimidas) y las anota en la salida. */
export async function subirFotosSalidaMina(s: SalidaMina, archivos: File[]): Promise<SalidaMina> {
  const mal = errorFotosSalidaMina(archivos, s.fotos.length);
  if (mal) throw new Error(mal);
  const candidatos = archivos.slice(0, MAX_FOTOS_SALIDA_MINA - s.fotos.length);
  const nuevas = await Promise.all(candidatos.map(async (original) => {
    const f = await comprimirImagen(original, { maximo: 1400, calidad: 0.78 }).catch(() => original);
    const path = `${s.id}/foto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${seguro(f.name)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, f, { upsert: false, contentType: f.type || 'image/jpeg' });
    if (error) throw new Error(`No se pudo subir «${original.name}»: ${error.message}`);
    return { path, filename: original.name };
  }));
  const fotos = [...s.fotos, ...nuevas].slice(0, MAX_FOTOS_SALIDA_MINA);
  const { data, error } = await supabase.from(TABLE).update({ fotos }).eq('id', s.id).select('*').single();
  if (error) throw err(error, 'No se pudieron anotar las fotos.');
  return normalizar(data as Record<string, unknown>);
}

/** URL firmada (10 min) de una foto. */
export async function urlFotoSalidaMina(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  if (error) throw new Error('No se pudo abrir la foto.');
  return data.signedUrl;
}

/** Baja las fotos guardadas de una salida como archivos, para pasarlas al menú de
 *  compartir de WhatsApp (histórico del teléfono, 03/11/2026). Una que no baje se salta. */
export async function descargarFotosSalidaMina(s: Pick<SalidaMina, 'fotos'>): Promise<File[]> {
  const archivos = await Promise.all(s.fotos.map(async (f) => {
    try {
      const resp = await fetch(await urlFotoSalidaMina(f.path));
      if (!resp.ok) return null;
      const blob = await resp.blob();
      const tipo = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg';
      return new File([blob], f.filename || f.path.split('/').pop() || 'foto.jpg', { type: tipo });
    } catch { return null; }
  }));
  return archivos.filter((f): f is File => !!f);
}

/** Salida con VARIOS materiales (04/11/2026): todos en una transacción
 *  (`deposito_mina_registrar_salidas`); si uno no alcanza, no se guarda ninguno. */
export async function registrarSalidasMina(d: {
  items: { productoId: string; cantidad: number }[];
  motivo: string; autorizadoPor: string; retorna: boolean; actor: string; actorName: string | null; almacen: string;
}): Promise<SalidaMina[]> {
  const { data, error } = await supabase.rpc('deposito_mina_registrar_salidas', {
    p: {
      items: d.items.map((it) => ({ producto_id: it.productoId, cantidad: it.cantidad })),
      motivo: d.motivo.trim(), autorizado_por: d.autorizadoPor.trim(), retorna: d.retorna,
      actor: d.actor, actor_name: d.actorName, almacen: d.almacen,
    },
  });
  if (error) throw err(error, 'No se pudo registrar la salida.');
  return ((data ?? []) as Record<string, unknown>[]).map(normalizar);
}

/** Las fotos de una salida de varios materiales: se suben UNA vez (en la primera) y
 *  las demás filas apuntan a los mismos archivos. */
export async function subirFotosSalidasMina(ss: SalidaMina[], archivos: File[]): Promise<SalidaMina[]> {
  if (!ss.length) return ss;
  const primera = await subirFotosSalidaMina(ss[0], archivos);
  const resto = ss.slice(1);
  if (!resto.length) return [primera];
  const { data, error } = await supabase.from(TABLE).update({ fotos: primera.fotos }).in('id', resto.map((s) => s.id)).select('*');
  if (error) throw err(error, 'No se pudieron anotar las fotos.');
  const porId = new Map(((data ?? []) as Record<string, unknown>[]).map((r) => [String(r.id), normalizar(r)]));
  return [primera, ...resto.map((s) => porId.get(s.id) ?? { ...s, fotos: primera.fotos })];
}
