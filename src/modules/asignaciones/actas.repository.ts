/* ============================================================
   Golden Touch · Asignaciones · Actas de entrega y catálogo de firmantes

   Una fila por entrega (`asignaciones_actas`): número NNN-AAAA, quién
   suscribe por la empresa (copia fija de nombre, cédula y cargo, para que
   el acta no cambie si se corrige el catálogo), a quién, las fotos del
   anexo y el escaneo del acta firmada. Los ítems son las filas de
   `asignaciones` con ese `acta_id`.

   Quien suscribe sale de un catálogo editable (`asignaciones_firmantes`):
   se escribe la primera vez y desde ahí se elige.

   Los archivos van al bucket privado `asignaciones-actas`. Se borran DESDE
   LA APP: Supabase no deja borrar storage.objects desde SQL.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { MAX_FOTOS_ACTA, errorFotosActa, nombreArchivoSeguro } from './actas';

const TABLE = 'asignaciones_actas';
const FIRMANTES = 'asignaciones_firmantes';
const BUCKET = 'asignaciones-actas';

export interface FotoActa { path: string; filename: string }

export interface ActaAsignacion {
  id: string;
  numero: string;
  fecha: string;
  personal_id: string;
  firmante_id?: string | null;
  entrega_nombre?: string | null;
  entrega_cedula?: string | null;
  entrega_cargo?: string | null;
  observaciones?: string | null;
  fotos: FotoActa[];
  firmada_path?: string | null;
  firmada_nombre?: string | null;
  firmada_at?: string | null;
  firmada_por?: string | null;
  creado_por?: string | null;
  actor_name?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface Firmante {
  id: string;
  nombre: string;
  cedula?: string | null;
  cargo?: string | null;
  activo: boolean;
}

/** Lo que se escribe de quien suscribe (puede venir del catálogo o ser nuevo). */
export interface DatosFirmante { nombre: string; cedula: string; cargo: string }

function err(e: unknown, fallback: string): Error {
  const o = (e ?? {}) as { code?: string; message?: string };
  if (o.code === '23505') return new Error(/firmantes/.test(o.message ?? '') ? 'Ya hay un firmante con ese nombre en el catálogo.' : 'Ya existe un acta con ese número.');
  return e instanceof Error ? e : new Error(o.message || fallback);
}

function normalizar(r: Record<string, unknown>): ActaAsignacion {
  return { ...(r as unknown as ActaAsignacion), fotos: Array.isArray(r.fotos) ? (r.fotos as FotoActa[]) : [] };
}

export async function listActas(): Promise<ActaAsignacion[]> {
  const { data, error } = await supabase.from(TABLE).select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw err(error, 'No se pudieron leer las actas.');
  return ((data ?? []) as Record<string, unknown>[]).map(normalizar);
}

/* ───────────── Catálogo de firmantes (editable) ───────────── */

export async function listFirmantes(): Promise<Firmante[]> {
  const { data, error } = await supabase.from(FIRMANTES).select('id, nombre, cedula, cargo, activo').order('nombre');
  if (error) throw err(error, 'No se pudo leer el catálogo de firmantes.');
  return (data ?? []) as Firmante[];
}

export async function guardarFirmante(id: string | null, d: DatosFirmante & { activo?: boolean }, actor: string): Promise<Firmante> {
  const fila = {
    nombre: d.nombre.trim().toUpperCase(),
    cedula: d.cedula.trim().toUpperCase() || null,
    cargo: d.cargo.trim() || null,
    ...(d.activo !== undefined ? { activo: d.activo } : {}),
  };
  if (!fila.nombre) throw new Error('Escribe el nombre de quien suscribe.');
  const q = id
    ? supabase.from(FIRMANTES).update({ ...fila, updated_at: new Date().toISOString() }).eq('id', id)
    : supabase.from(FIRMANTES).insert({ ...fila, created_by: actor });
  const { data, error } = await q.select('id, nombre, cedula, cargo, activo').single();
  if (error) throw err(error, 'No se pudo guardar el firmante.');
  return data as Firmante;
}

export async function eliminarFirmante(id: string): Promise<void> {
  const { error } = await supabase.from(FIRMANTES).delete().eq('id', id);
  if (error) throw err(error, 'No se pudo eliminar el firmante.');
}

/**
 * El firmante para el acta: si el nombre ya está en el catálogo se usa (y se
 * completan cédula o cargo que falten); si es nuevo, entra al catálogo.
 * Nombre vacío = el acta sale con la línea en blanco para escribirlo a mano.
 */
export async function firmanteParaActa(d: DatosFirmante, catalogo: readonly Firmante[], actor: string): Promise<Firmante | null> {
  const nombre = d.nombre.trim();
  if (!nombre) return null;
  const existente = catalogo.find((f) => f.nombre.trim().toLowerCase() === nombre.toLowerCase());
  if (!existente) return guardarFirmante(null, d, actor);
  const faltaCedula = !existente.cedula && d.cedula.trim();
  const faltaCargo = !existente.cargo && d.cargo.trim();
  if (faltaCedula || faltaCargo) {
    return guardarFirmante(existente.id, {
      nombre: existente.nombre, cedula: existente.cedula || d.cedula, cargo: existente.cargo || d.cargo,
    }, actor);
  }
  return existente;
}

/* ───────────── Actas ───────────── */

export async function crearActa(input: {
  numero: string; fecha: string; personal_id: string; entrega: DatosFirmante; firmanteId: string | null; observaciones?: string | null;
}, a: { actor: string; actorName?: string | null }): Promise<ActaAsignacion> {
  const { data, error } = await supabase.from(TABLE).insert({
    numero: input.numero.trim(),
    fecha: input.fecha,
    personal_id: input.personal_id,
    firmante_id: input.firmanteId,
    entrega_nombre: input.entrega.nombre.trim().toUpperCase() || null,
    entrega_cedula: input.entrega.cedula.trim().toUpperCase() || null,
    entrega_cargo: input.entrega.cargo.trim() || null,
    observaciones: (input.observaciones ?? '').trim() || null,
    creado_por: a.actor,
    actor_name: a.actorName ?? null,
  }).select('*').single();
  if (error) throw err(error, 'No se pudo crear el acta.');
  return normalizar(data as Record<string, unknown>);
}

/** Cambia quién suscribe (copia fija) o la observación del acta. */
export async function actualizarActa(id: string, patch: { entrega?: DatosFirmante; firmanteId?: string | null; observaciones?: string | null }): Promise<ActaAsignacion> {
  const fila: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.entrega) {
    fila.entrega_nombre = patch.entrega.nombre.trim().toUpperCase() || null;
    fila.entrega_cedula = patch.entrega.cedula.trim().toUpperCase() || null;
    fila.entrega_cargo = patch.entrega.cargo.trim() || null;
    fila.firmante_id = patch.firmanteId ?? null;
  }
  if (patch.observaciones !== undefined) fila.observaciones = (patch.observaciones ?? '').trim() || null;
  const { data, error } = await supabase.from(TABLE).update(fila).eq('id', id).select('*').single();
  if (error) throw err(error, 'No se pudo guardar el acta.');
  return normalizar(data as Record<string, unknown>);
}

/** Borra el acta y sus archivos (los archivos primero no: si la fila no se borra, quedan). */
export async function eliminarActa(acta: ActaAsignacion): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', acta.id);
  if (error) throw err(error, 'No se pudo eliminar el acta.');
  const paths = [...acta.fotos.map((f) => f.path), acta.firmada_path ?? ''].filter(Boolean);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths).catch(() => undefined);
}

/** Si al acta no le queda ningún ítem (se eliminó el último), se va con sus archivos. */
export async function eliminarActaSiVacia(actaId: string): Promise<boolean> {
  const { count } = await supabase.from('asignaciones').select('id', { count: 'exact', head: true }).eq('acta_id', actaId);
  if ((count ?? 0) > 0) return false;
  const { data } = await supabase.from(TABLE).select('*').eq('id', actaId).maybeSingle();
  if (!data) return false;
  await eliminarActa(normalizar(data as Record<string, unknown>));
  return true;
}

/* ───────────── Anexo fotográfico ───────────── */

export async function subirFotosActa(acta: ActaAsignacion, archivos: File[]): Promise<ActaAsignacion> {
  const mal = errorFotosActa(archivos, acta.fotos.length);
  if (mal) throw new Error(mal);
  const nuevas: FotoActa[] = [];
  for (const f of archivos.slice(0, MAX_FOTOS_ACTA - acta.fotos.length)) {
    const path = `${acta.id}/foto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${nombreArchivoSeguro(f.name)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, f, { upsert: false, contentType: f.type || 'image/jpeg' });
    if (error) throw new Error(`No se pudo subir «${f.name}»: ${error.message}`);
    nuevas.push({ path, filename: f.name });
  }
  const fotos = [...acta.fotos, ...nuevas].slice(0, MAX_FOTOS_ACTA);
  const { data, error } = await supabase.from(TABLE).update({ fotos, updated_at: new Date().toISOString() }).eq('id', acta.id).select('*').single();
  if (error) throw err(error, 'No se pudieron anotar las fotos.');
  return normalizar(data as Record<string, unknown>);
}

export async function quitarFotoActa(acta: ActaAsignacion, path: string): Promise<ActaAsignacion> {
  const fotos = acta.fotos.filter((f) => f.path !== path);
  const { data, error } = await supabase.from(TABLE).update({ fotos, updated_at: new Date().toISOString() }).eq('id', acta.id).select('*').single();
  if (error) throw err(error, 'No se pudo quitar la foto.');
  await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
  return normalizar(data as Record<string, unknown>);
}

/** URL firmada (10 min) de una foto o del acta firmada. */
export async function urlArchivoActa(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  if (error) throw new Error('No se pudo abrir el archivo.');
  return data.signedUrl;
}

/** El archivo como data URL, para meterlo en el PDF (el anexo fotográfico). */
export async function dataUrlArchivoActa(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error('No se pudo descargar la foto.');
  return new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('No se pudo leer la foto.'));
    fr.readAsDataURL(data);
  });
}

/* ───────────── El acta firmada ───────────── */

export async function subirActaFirmada(acta: ActaAsignacion, file: File, actor: string): Promise<ActaAsignacion> {
  const esPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
  if (!esPdf && !(file.type || '').startsWith('image/')) throw new Error('El acta firmada tiene que ser un PDF o una imagen.');
  if (file.size > 10 * 1024 * 1024) throw new Error('El archivo pesa más de 10 MB.');
  const path = `${acta.id}/firmada-${Date.now()}-${nombreArchivoSeguro(file.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type || (esPdf ? 'application/pdf' : 'image/jpeg') });
  if (error) throw new Error(`No se pudo subir el acta firmada: ${error.message}`);
  const { data, error: e2 } = await supabase.from(TABLE).update({
    firmada_path: path, firmada_nombre: file.name, firmada_at: new Date().toISOString(), firmada_por: actor, updated_at: new Date().toISOString(),
  }).eq('id', acta.id).select('*').single();
  if (e2) { await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined); throw err(e2, 'No se pudo anotar el acta firmada.'); }
  if (acta.firmada_path) await supabase.storage.from(BUCKET).remove([acta.firmada_path]).catch(() => undefined);
  return normalizar(data as Record<string, unknown>);
}

export async function quitarActaFirmada(acta: ActaAsignacion): Promise<ActaAsignacion> {
  const { data, error } = await supabase.from(TABLE).update({
    firmada_path: null, firmada_nombre: null, firmada_at: null, firmada_por: null, updated_at: new Date().toISOString(),
  }).eq('id', acta.id).select('*').single();
  if (error) throw err(error, 'No se pudo quitar el acta firmada.');
  if (acta.firmada_path) await supabase.storage.from(BUCKET).remove([acta.firmada_path]).catch(() => undefined);
  return normalizar(data as Record<string, unknown>);
}
