/* ============================================================
   Golden Touch · Adjuntos (fotos y PDF) de un registro

   Nació para las solicitudes de salida, traslado y salida temporal, y el
   mismo mecanismo sirve para otros módulos (los movimientos de tanque del
   surtidor de combustible): cada uno tiene su bucket privado y su tabla,
   con la misma forma. `crearRepoAdjuntos` arma las funciones para un
   bucket + tabla; abajo quedan las de salidas con sus nombres de siempre.

   El archivo va a una carpeta con el id del registro; la fila va a la
   tabla. Hasta 4 por registro (la regla está en adjuntosSalidaReglas.ts y
   también en la base). Los registros se crean primero y los archivos se
   suben después, porque la carpeta lleva el id.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import {
  errorArchivoAdjunto, errorCupo, nombreSeguroAdjunto, type ModuloAdjuntoSalida,
} from './adjuntosSalidaReglas';

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

export interface RepoAdjuntos {
  /** Nombre de la tabla, para el realtime del componente. */
  tabla: string;
  list(modulo: ModuloAdjuntoSalida, refId: string): Promise<AdjuntoSalida[]>;
  agregar(modulo: ModuloAdjuntoSalida, refId: string, file: File, actor?: string | null): Promise<AdjuntoSalida>;
  subir(modulo: ModuloAdjuntoSalida, refId: string, files: File[], actor?: string | null): Promise<{ subidos: number; fallos: string[] }>;
  eliminar(adjunto: AdjuntoSalida): Promise<void>;
  url(path: string): Promise<string>;
  /** Cuántos adjuntos tiene cada registro (para el 📎 n de una lista). */
  contar(modulo: ModuloAdjuntoSalida, refIds: string[]): Promise<Map<string, number>>;
}

export function crearRepoAdjuntos(bucket: string, tabla: string): RepoAdjuntos {
  async function list(modulo: ModuloAdjuntoSalida, refId: string): Promise<AdjuntoSalida[]> {
    if (!refId) return [];
    const { data, error } = await supabase.from(tabla).select('*')
      .eq('modulo', modulo).eq('ref_id', refId).order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as AdjuntoSalida[];
  }

  /** Sube UN archivo y lo registra. Comprueba tipo, peso y cupo antes de tocar el almacén. */
  async function agregar(modulo: ModuloAdjuntoSalida, refId: string, file: File, actor?: string | null): Promise<AdjuntoSalida> {
    const malo = errorArchivoAdjunto(file);
    if (malo) throw new Error(malo);
    const actuales = await list(modulo, refId);
    const sinCupo = errorCupo(actuales.length, 1);
    if (sinCupo) throw new Error(sinCupo);

    // Prefijo único por archivo: dos fotos con el mismo nombre no se pisan.
    const path = `${refId}/${Date.now().toString(36)}-${nombreSeguroAdjunto(file.name)}`;
    const { error: upErr } = await supabase.storage.from(bucket)
      .upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (upErr) throw upErr;

    const { data, error } = await supabase.from(tabla)
      .insert({ modulo, ref_id: refId, path, nombre: file.name, content_type: file.type || null, tamano: file.size, created_by: actor ?? null })
      .select('*').single();
    if (error) {
      // Si la base lo rechazó (p. ej. el tope de 4 con dos personas a la vez), el archivo
      // no puede quedar huérfano en el almacén.
      await supabase.storage.from(bucket).remove([path]).catch(() => {});
      throw error;
    }
    return data as AdjuntoSalida;
  }

  /** Sube varios, de a uno; no corta en el primer error. */
  async function subir(modulo: ModuloAdjuntoSalida, refId: string, files: File[], actor?: string | null) {
    let subidos = 0;
    const fallos: string[] = [];
    for (const f of files) {
      try { await agregar(modulo, refId, f, actor); subidos++; }
      catch (e) { fallos.push(e instanceof Error ? e.message : `«${f.name}» no se pudo subir.`); }
    }
    return { subidos, fallos };
  }

  /** Borra el registro y después el archivo. Si el archivo no se pudo borrar, el registro ya no está. */
  async function eliminar(adjunto: AdjuntoSalida): Promise<void> {
    const { error } = await supabase.from(tabla).delete().eq('id', adjunto.id);
    if (error) throw error;
    await supabase.storage.from(bucket).remove([adjunto.path]).catch(() => {});
  }

  /** URL firmada (10 min) para ver o descargar el adjunto. */
  async function url(path: string): Promise<string> {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 10);
    if (error || !data) throw error ?? new Error('No se pudo generar el enlace del adjunto');
    return data.signedUrl;
  }

  async function contar(modulo: ModuloAdjuntoSalida, refIds: string[]): Promise<Map<string, number>> {
    const m = new Map<string, number>();
    if (!refIds.length) return m;
    const { data, error } = await supabase.from(tabla).select('ref_id').eq('modulo', modulo).in('ref_id', refIds);
    if (error) throw error;
    for (const r of (data ?? []) as { ref_id: string }[]) m.set(r.ref_id, (m.get(r.ref_id) ?? 0) + 1);
    return m;
  }

  return { tabla, list, agregar, subir, eliminar, url, contar };
}

/* ───────────── Salidas (bucket y tabla originales) ───────────── */

export const adjuntosSalidasRepo = crearRepoAdjuntos('salidas-adjuntos', 'salidas_adjuntos');

/** Los adjuntos de una solicitud, en el orden en que se subieron. */
export const listAdjuntosSalida = adjuntosSalidasRepo.list;
export const agregarAdjuntoSalida = adjuntosSalidasRepo.agregar;
export const subirAdjuntosSalida = adjuntosSalidasRepo.subir;
export const eliminarAdjuntoSalida = adjuntosSalidasRepo.eliminar;
export const urlAdjuntoSalida = adjuntosSalidasRepo.url;
