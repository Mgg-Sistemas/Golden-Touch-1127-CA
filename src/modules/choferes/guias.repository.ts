import { supabase } from '@/shared/lib/supabase';
import { todasLasFilas } from '@/shared/lib/todasLasFilas';
import { mensajeErrorDocumento, nombreSeguro } from './archivosChofer';
import { validarArchivoGuia, type Guia } from './guias';

export const T_GUIAS = 'choferes_guias';
/** Mismo bucket privado de los documentos de Choferes, bajo la carpeta guias/. */
const BUCKET = 'choferes-documentos';

export interface GuiaInput {
  fecha: string;
  numero?: string | null;
  descripcion?: string | null;
  conductor_id?: string | null;
  vehiculo_id?: string | null;
  nota?: string | null;
}

const limpio = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim() || null;

function err(e: unknown, respaldo: string): Error {
  const o = (e ?? {}) as { code?: string; message?: string };
  if (o.code === '42501' || /row-level security|permission denied/i.test(String(o.message ?? ''))) {
    return new Error('Tu usuario no tiene permiso de escritura en Choferes / Conductores.');
  }
  return new Error(respaldo);
}

function fila(g: GuiaInput) {
  if (!g.fecha) throw new Error('Pon la fecha de la guía.');
  return {
    fecha: g.fecha, numero: limpio(g.numero)?.toUpperCase() ?? null, descripcion: limpio(g.descripcion),
    conductor_id: g.conductor_id || null, vehiculo_id: g.vehiculo_id || null, nota: limpio(g.nota),
  };
}

export async function listGuias(): Promise<Guia[]> {
  try {
    return await todasLasFilas<Guia>((d, h) =>
      supabase.from(T_GUIAS).select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false }).order('id').range(d, h));
  } catch (e) { throw err(e, 'No se pudieron cargar las guías.'); }
}

/** Sube el PDF y registra la guía. Si la fila falla, el archivo se quita. */
export async function subirGuia(g: GuiaInput, file: File, o: { actor: string; actorName: string | null }): Promise<Guia> {
  const falla = validarArchivoGuia(file);
  if (falla) throw new Error(falla);
  const datos = fila(g);
  const rand = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const base = nombreSeguro(file.name);
  const path = `guias/${datos.fecha.slice(0, 7)}/${rand}_${/\.pdf$/i.test(base) ? base : `${base}.pdf`}`;
  const { error: errSubir } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: 'application/pdf', upsert: false });
  if (errSubir) throw new Error(mensajeErrorDocumento(errSubir));
  const nombre = /\.pdf$/i.test(file.name) ? file.name : `${file.name}.pdf`;
  const { data, error } = await supabase.from(T_GUIAS).insert({
    ...datos, path, nombre, tamano: file.size ?? null, subido_por: o.actor, subido_por_nombre: o.actorName,
  }).select('*').single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
    throw err(error, mensajeErrorDocumento(error));
  }
  return data as Guia;
}

/** Corrige los datos de la guía (el PDF no cambia). */
export async function editarGuia(id: string, g: GuiaInput): Promise<void> {
  const { error } = await supabase.from(T_GUIAS).update(fila(g)).eq('id', id);
  if (error) throw err(error, 'No se pudo guardar la guía.');
}

export async function urlGuia(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  if (error) throw err(error, 'No se pudo abrir la guía.');
  return data.signedUrl;
}

/** Quita la guía: primero el PDF (desde la base no se borran archivos), luego la fila. */
export async function eliminarGuia(g: Pick<Guia, 'id' | 'path'>): Promise<void> {
  await supabase.storage.from(BUCKET).remove([g.path]).catch(() => undefined);
  const { data, error } = await supabase.from(T_GUIAS).delete().eq('id', g.id).select('id');
  if (error) throw err(error, 'No se pudo eliminar la guía.');
  if (!data?.length) throw new Error('No se pudo eliminar: sin permiso o ya no existía.');
}
