/* ============================================================
   Golden Touch · RRHH · Personal (ficha)
   "Usuarios" son los del login; "Personal" engloba a TODO el personal
   a pagar (tengan o no usuario). El sueldo base es MENSUAL (USD).
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { Personal } from '@/shared/lib/types';

const TABLE = 'personal';

/** Lista el personal, ordenado por departamento y nombre. */
export async function listPersonal(soloActivos = false): Promise<Personal[]> {
  let q = supabase.from(TABLE).select('*').order('departamento', { ascending: true, nullsFirst: false }).order('nombre', { ascending: true });
  if (soloActivos) q = q.eq('activo', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Personal[];
}

export interface PersonalInput {
  nombre: string;
  apellido?: string;
  cedula?: string | null;
  rif?: string | null;
  cargo?: string | null;
  departamento?: string | null;
  sueldo_base?: number;
  fecha_ingreso?: string | null;
  telefono?: string | null;
  contacto_emergencia?: string | null;
  telefono_emergencia?: string | null;
}

function payload(input: PersonalInput) {
  return {
    nombre: input.nombre.trim(),
    apellido: (input.apellido ?? '').trim(),
    cedula: input.cedula?.trim() || null,
    rif: input.rif?.trim() || null,
    cargo: input.cargo?.trim() || null,
    departamento: input.departamento?.trim() || null,
    sueldo_base: Math.round((Number(input.sueldo_base) || 0) * 100) / 100,
    fecha_ingreso: input.fecha_ingreso || null,
    telefono: input.telefono?.trim() || null,
    contacto_emergencia: input.contacto_emergencia?.trim() || null,
    telefono_emergencia: input.telefono_emergencia?.trim() || null,
  };
}

/**
 * Traduce el rechazo de la base cuando la cédula o el RIF ya están cargados en
 * otra persona. La regla vive en la BASE (índices únicos sobre el valor
 * normalizado), no solo en la pantalla: así no hay camino por el que se cuele
 * un duplicado, ni siquiera dos usuarios guardando al mismo tiempo. Pero el
 * mensaje de Postgres no le dice nada a nadie, así que se reemplaza.
 */
function errorDuplicado(error: { code?: string; message?: string } | null): Error | null {
  if (!error || error.code !== '23505') return null;
  const m = String(error.message ?? '');
  if (m.includes('personal_cedula_uk')) {
    return new Error('Ya hay una persona registrada con esa cédula. Buscala en la lista en vez de cargarla de nuevo (si está inactiva, activala).');
  }
  if (m.includes('personal_rif_uk')) {
    return new Error('Ya hay una persona registrada con ese RIF.');
  }
  return null;
}

export async function crearPersonal(input: PersonalInput, actorEmail?: string): Promise<Personal> {
  if (!input.nombre.trim()) throw new Error('Indicá el nombre.');
  const { data, error } = await supabase.from(TABLE).insert({ ...payload(input), created_by: actorEmail ?? null }).select('*').single();
  if (error) throw errorDuplicado(error) ?? error;
  return data as Personal;
}

export async function actualizarPersonal(id: string, patch: PersonalInput): Promise<Personal> {
  if (!patch.nombre.trim()) throw new Error('Indicá el nombre.');
  const { data, error } = await supabase.from(TABLE).update(payload(patch)).eq('id', id).select('*').single();
  if (error) throw errorDuplicado(error) ?? error;
  return data as Personal;
}

/** Solo el sueldo base (para "guardar sueldos" desde la carga de nómina). */
export async function guardarSueldoBase(id: string, sueldoBase: number): Promise<void> {
  const { error } = await supabase.from(TABLE).update({ sueldo_base: Math.round((Number(sueldoBase) || 0) * 100) / 100 }).eq('id', id);
  if (error) throw error;
}

/** Activa o desactiva (no borra: conserva el histórico de pagos). */
export async function setPersonalActivo(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from(TABLE).update({ activo }).eq('id', id);
  if (error) throw error;
}

/** Elimina definitivamente una persona del personal. */
export async function eliminarPersonal(id: string): Promise<void> {
  const { data, error } = await supabase.from(TABLE).delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No se pudo eliminar: sin permiso o ya no existía.');
}

/* ───────── Foto de la persona (para el carnet) ───────── */
const FOTOS_BUCKET = 'personal-fotos';
const MAX_FOTO_BYTES = 5 * 1024 * 1024;

/** Sube (o reemplaza) la foto de una persona y guarda su path en `personal.foto_path`.
 *  Borra la foto anterior si existía. Devuelve el nuevo path. */
export async function subirFotoPersonal(id: string, file: File, fotoAnterior?: string | null): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('La foto debe ser una imagen.');
  if (file.size > MAX_FOTO_BYTES) throw new Error('La foto no puede superar 5 MB.');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${id}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(FOTOS_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  const { error: updErr } = await supabase.from(TABLE).update({ foto_path: path }).eq('id', id);
  if (updErr) throw updErr;
  if (fotoAnterior) await supabase.storage.from(FOTOS_BUCKET).remove([fotoAnterior]).catch(() => {});
  return path;
}

/** Quita la foto de una persona (borra el archivo y limpia `foto_path`). */
export async function borrarFotoPersonal(id: string, fotoPath: string): Promise<void> {
  const { error } = await supabase.from(TABLE).update({ foto_path: null }).eq('id', id);
  if (error) throw error;
  if (fotoPath) await supabase.storage.from(FOTOS_BUCKET).remove([fotoPath]).catch(() => {});
}

/** URL firmada (5 min) para ver/descargar la foto de una persona. */
export async function getFotoPersonalUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(FOTOS_BUCKET).createSignedUrl(path, 300);
  if (error || !data) throw error ?? new Error('No se pudo generar el enlace de la foto');
  return data.signedUrl;
}

/* ───────── Documento del RIF (PDF o imagen) ───────── */
const DOCS_BUCKET = 'personal-documentos';
const MAX_DOC_BYTES = 10 * 1024 * 1024;

/** Sube (o reemplaza) el PDF del RIF y lo enlaza a la persona. Devuelve el path. */
export async function subirRifPersonal(
  id: string, file: File, anterior?: string | null,
): Promise<{ path: string; nombre: string }> {
  const esPdf = file.type === 'application/pdf';
  if (!esPdf && !file.type.startsWith('image/')) throw new Error('El RIF debe ser un PDF o una imagen.');
  if (file.size > MAX_DOC_BYTES) throw new Error('El archivo no puede superar 10 MB.');
  const safe = file.name.replace(/[^\w.-]+/g, '_');
  const path = `${id}/rif-${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from(DOCS_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  const { error: updErr } = await supabase.from(TABLE).update({ rif_path: path, rif_nombre: file.name }).eq('id', id);
  if (updErr) throw updErr;
  // El anterior se borra DESPUÉS de que el nuevo quedó enlazado: si se borrara
  // antes y fallara la subida, la persona se queda sin ninguno.
  if (anterior) await supabase.storage.from(DOCS_BUCKET).remove([anterior]).catch(() => {});
  return { path, nombre: file.name };
}

/** Quita el documento del RIF (borra el archivo y limpia la ficha). */
export async function borrarRifPersonal(id: string, path: string): Promise<void> {
  const { error } = await supabase.from(TABLE).update({ rif_path: null, rif_nombre: null }).eq('id', id);
  if (error) throw error;
  if (path) await supabase.storage.from(DOCS_BUCKET).remove([path]).catch(() => {});
}

/** URL firmada (10 min) para ver el documento del RIF. */
export async function urlRifPersonal(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(path, 600);
  if (error || !data) throw error ?? new Error('No se pudo generar el enlace del RIF');
  return data.signedUrl;
}

/** Descarga la foto y la convierte a data URL (para dibujarla en el carnet sin CORS). */
export async function fotoPersonalDataUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(FOTOS_BUCKET).download(path);
  if (error || !data) throw error ?? new Error('No se pudo descargar la foto');
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(data);
  });
}
