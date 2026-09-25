/* ============================================================
   Golden Touch · Salidas · Adjuntos (fotos y PDF) de una solicitud

   Vale para las tres: salida, traslado y salida temporal. El archivo va al
   bucket privado `salidas-adjuntos`, en una carpeta con el id de la
   solicitud; el registro va a `salidas_adjuntos`. Hasta 4 por solicitud
   (la regla está en adjuntosSalida.ts y también en la base).

   Las solicitudes se crean primero y los archivos se suben después, porque
   la carpeta lleva el id: el formulario de alta junta los archivos y los
   manda con `subirAdjuntosSalida` en cuanto tiene la solicitud creada.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import {
  errorArchivoAdjunto, errorCupo, nombreSeguroAdjunto, type ModuloAdjuntoSalida,
} from './adjuntosSalidaReglas';

const BUCKET = 'salidas-adjuntos';
const TABLE = 'salidas_adjuntos';

export interface AdjuntoSalida {
  id: string;
  modulo: ModuloAdjuntoSalida;
  ref_id: string;
  /** Ruta dentro del bucket; no es una URL (el almacén es privado). */
  path: string;
  /** El nombre con el que llegó el archivo, para mostrarlo. */
  nombre: string;
  content_type: string | null;
  tamano: number | null;
  created_at: string;
  created_by: string | null;
}

/** Los adjuntos de una solicitud, en el orden en que se subieron. */
export async function listAdjuntosSalida(modulo: ModuloAdjuntoSalida, refId: string): Promise<AdjuntoSalida[]> {
  if (!refId) return [];
  const { data, error } = await supabase.from(TABLE).select('*')
    .eq('modulo', modulo).eq('ref_id', refId).order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AdjuntoSalida[];
}

/**
 * Sube UN archivo y lo registra. Comprueba tipo, peso y cupo antes de tocar
 * el almacén, para no dejar un archivo subido sin registro si algo falla.
 */
export async function agregarAdjuntoSalida(
  modulo: ModuloAdjuntoSalida, refId: string, file: File, actor?: string | null,
): Promise<AdjuntoSalida> {
  const malo = errorArchivoAdjunto(file);
  if (malo) throw new Error(malo);
  const actuales = await listAdjuntosSalida(modulo, refId);
  const sinCupo = errorCupo(actuales.length, 1);
  if (sinCupo) throw new Error(sinCupo);

  // Prefijo único por archivo: dos fotos con el mismo nombre no se pisan.
  const path = `${refId}/${Date.now().toString(36)}-${nombreSeguroAdjunto(file.name)}`;
  const { error: upErr } = await supabase.storage.from(BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (upErr) throw upErr;

  const { data, error } = await supabase.from(TABLE)
    .insert({ modulo, ref_id: refId, path, nombre: file.name, content_type: file.type || null, tamano: file.size, created_by: actor ?? null })
    .select('*').single();
  if (error) {
    // Si la base lo rechazó (p. ej. el tope de 4 con dos personas a la vez), el archivo
    // no puede quedar huérfano en el almacén.
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw error;
  }
  return data as AdjuntoSalida;
}

/**
 * Sube varios, de a uno, y devuelve cuántos entraron y qué falló de los que no.
 * No corta en el primer error: si la foto 2 pesa de más, la 3 igual se sube.
 */
export async function subirAdjuntosSalida(
  modulo: ModuloAdjuntoSalida, refId: string, files: File[], actor?: string | null,
): Promise<{ subidos: number; fallos: string[] }> {
  let subidos = 0;
  const fallos: string[] = [];
  for (const f of files) {
    try { await agregarAdjuntoSalida(modulo, refId, f, actor); subidos++; }
    catch (e) { fallos.push(e instanceof Error ? e.message : `«${f.name}» no se pudo subir.`); }
  }
  return { subidos, fallos };
}

/** Borra el registro y después el archivo. Si el archivo no se pudo borrar, el registro ya no está: no se ve más. */
export async function eliminarAdjuntoSalida(adjunto: AdjuntoSalida): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', adjunto.id);
  if (error) throw error;
  await supabase.storage.from(BUCKET).remove([adjunto.path]).catch(() => {});
}

/** URL firmada (10 min) para ver o descargar el adjunto. */
export async function urlAdjuntoSalida(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  if (error || !data) throw error ?? new Error('No se pudo generar el enlace del adjunto');
  return data.signedUrl;
}
