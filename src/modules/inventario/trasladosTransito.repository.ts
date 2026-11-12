/* ============================================================
   Traslados con RECEPCIÓN (12/11/2026) · base de datos.
   RPC traslado_transito_enviar / _recibir / _anular. Las fotos van al bucket
   de las salidas del depósito, bajo traslados/<carpeta>/…
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { comprimirImagen } from '@/shared/lib/comprimirImagen';
import { MAX_FOTOS_TRASLADO, errorFotosTraslado, type FotoTraslado, type TrasladoTransito } from './trasladosTransito';

const TABLE = 'traslados_transito';
const BUCKET = 'deposito-mina-salidas';
export const MSG_FALTA_SQL_TRASLADOS =
  'Falta aplicar en Supabase el SQL 2026-11-12-traslados-transito-recepcion.sql (recepción de traslados).';

const faltaSql = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202' || e.code === '42883'
    || /does not exist|Could not find the (table|function)/i.test(e.message ?? ''));

function err(e: { code?: string; message?: string }, d: string): Error {
  if (faltaSql(e)) return new Error(MSG_FALTA_SQL_TRASLADOS);
  return new Error(e.message || d);
}

function normalizar(r: Record<string, unknown>): TrasladoTransito {
  const t = r as unknown as TrasladoTransito;
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    ...t,
    items: arr(r.items),
    fotos_envio: arr(r.fotos_envio),
    fotos_recepcion: arr(r.fotos_recepcion),
    resultado: Array.isArray(r.resultado) ? (r.resultado as TrasladoTransito['resultado']) : null,
  };
}

const seguro = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80);

/** Sube las fotos (achicadas) a traslados/<carpeta>/… y devuelve sus rutas. */
export async function subirFotosTraslado(carpeta: string, archivos: File[]): Promise<FotoTraslado[]> {
  const mal = errorFotosTraslado(archivos);
  if (mal) throw new Error(mal);
  return Promise.all(archivos.slice(0, MAX_FOTOS_TRASLADO).map(async (original) => {
    const f = await comprimirImagen(original, { maximo: 1400, calidad: 0.78 }).catch(() => original);
    const path = `traslados/${carpeta}/foto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${seguro(f.name)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, f, { upsert: false, contentType: f.type || 'image/jpeg' });
    if (error) throw new Error(`No se pudo subir «${original.name}»: ${error.message}`);
    return { path, filename: original.name };
  }));
}

export async function urlFotoTraslado(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  if (error) throw new Error('No se pudo abrir la foto.');
  return data.signedUrl;
}

/** Las fotos guardadas como archivos, para el menú de compartir (WhatsApp). */
export async function descargarFotosTraslado(fotos: FotoTraslado[]): Promise<File[]> {
  const archivos = await Promise.all(fotos.map(async (f) => {
    try {
      const resp = await fetch(await urlFotoTraslado(f.path));
      if (!resp.ok) return null;
      const blob = await resp.blob();
      return new File([blob], f.filename || 'foto.jpg', { type: blob.type?.startsWith('image/') ? blob.type : 'image/jpeg' });
    } catch { return null; }
  }));
  return archivos.filter((f): f is File => !!f);
}

const carpetaNueva = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

/** Envía el traslado: sale del origen y queda en tránsito con sus fotos. */
export async function enviarTrasladoTransito(input: {
  destino: string; items: { producto_id: string; cantidad: number }[]; nota?: string | null; fotos: File[]; actorName: string | null;
}): Promise<TrasladoTransito> {
  const fotos = input.fotos.length ? await subirFotosTraslado(carpetaNueva(), input.fotos) : [];
  const { data, error } = await supabase.rpc('traslado_transito_enviar', {
    p: { destino: input.destino, items: input.items, nota: input.nota ?? null, fotos, actor_name: input.actorName },
  });
  if (error) {
    if (fotos.length) await supabase.storage.from(BUCKET).remove(fotos.map((f) => f.path)).catch(() => { /* se limpia después */ });
    throw err(error, 'No se pudo enviar el traslado.');
  }
  return normalizar(data as Record<string, unknown>);
}

/** Recibe el traslado en el destino: entra al stock con las fotos de la recepción. */
export async function recibirTrasladoTransito(t: TrasladoTransito, input: { nota?: string | null; fotos: File[]; actorName: string | null }): Promise<TrasladoTransito> {
  const fotos = input.fotos.length ? await subirFotosTraslado(`${t.id}-recepcion`, input.fotos) : [];
  const { data, error } = await supabase.rpc('traslado_transito_recibir', {
    p_id: t.id, p: { nota: input.nota ?? null, fotos, actor_name: input.actorName },
  });
  if (error) {
    if (fotos.length) await supabase.storage.from(BUCKET).remove(fotos.map((f) => f.path)).catch(() => { /* se limpia después */ });
    throw err(error, 'No se pudo recibir el traslado.');
  }
  return normalizar(data as Record<string, unknown>);
}

export async function anularTrasladoTransito(id: string, motivo: string, actorName: string | null): Promise<TrasladoTransito> {
  const { data, error } = await supabase.rpc('traslado_transito_anular', { p_id: id, p_motivo: motivo, p_actor_name: actorName });
  if (error) throw err(error, 'No se pudo anular el traslado.');
  return normalizar(data as Record<string, unknown>);
}

/** Traslados en tránsito que llegan a (destino) o salieron de (origen) un depósito. */
export async function listTrasladosEnTransito(f: { destino?: string; origen?: string }): Promise<TrasladoTransito[]> {
  let q = supabase.from(TABLE).select('*').eq('estado', 'en_transito').order('created_at', { ascending: true });
  if (f.destino) q = q.eq('destino', f.destino);
  if (f.origen) q = q.eq('origen', f.origen);
  const { data, error } = await q;
  if (error) {
    if (faltaSql(error)) return [];
    throw err(error, 'No se pudieron leer los traslados.');
  }
  return ((data ?? []) as Record<string, unknown>[]).map(normalizar);
}
