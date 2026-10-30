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
