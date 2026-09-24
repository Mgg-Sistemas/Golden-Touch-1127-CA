/* ============================================================
   Golden Touch · RRHH · Documentación del trabajador

   RIF, cédula y CV, en PDF o en imagen (foto del documento, que es como
   llegan casi siempre). Los archivos viven en un almacén PRIVADO: no hay
   enlace público, cada vez que se abre uno se pide un enlace firmado que
   dura diez minutos.

   Un documento por tipo y por persona: cargar otro REEMPLAZA al anterior,
   que es lo que uno espera de «el RIF de Fulano».
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { PersonalDocumento, TipoDocumento } from '@/shared/lib/types';

const TABLE = 'personal_documentos';
const BUCKET = 'personal-documentos';
const MAX_BYTES = 10 * 1024 * 1024;

/** Los tres documentos, en el orden en que se piden. */
export const TIPOS_DOCUMENTO: { tipo: TipoDocumento; label: string; icono: string; ayuda: string }[] = [
  { tipo: 'rif', label: 'RIF', icono: '🆔', ayuda: 'Registro de Información Fiscal' },
  { tipo: 'ci', label: 'Cédula', icono: '🪪', ayuda: 'Cédula de identidad (ambas caras si es foto)' },
  { tipo: 'cv', label: 'CV', icono: '📄', ayuda: 'Currículum / síntesis curricular' },
];

export const LABEL_DOCUMENTO: Record<TipoDocumento, string> = {
  rif: 'RIF', ci: 'Cédula', cv: 'CV', otro: 'Documento',
};

/** Mínimo del nombre de un documento, para que no quede uno sin forma de distinguirlo. */
export const NOMBRE_DOC_MIN = 3;
export const NOMBRE_DOC_MAX = 80;

/** Qué está mal con el nombre de un documento, o `null` si está bien. */
export function errorNombreDocumento(nombre: string): string | null {
  const n = (nombre ?? '').trim();
  if (n.length < NOMBRE_DOC_MIN) {
    return `El nombre necesita al menos ${NOMBRE_DOC_MIN} caracteres: es lo único que distingue un documento de otro.`;
  }
  if (n.length > NOMBRE_DOC_MAX) return `El nombre no puede pasar de ${NOMBRE_DOC_MAX} caracteres.`;
  return null;
}

/**
 * Nombre que se propone al cargar un documento libre: el del archivo sin la
 * extensión. Casi siempre hay que corregirlo —«Captura de pantalla 2026-09-24
 * a la(s) 2.41.57 p. m..png» no le dice nada a nadie— pero es mejor punto de
 * partida que un campo vacío.
 */
export function nombreSugerido(nombreArchivo: string): string {
  return (nombreArchivo ?? '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, NOMBRE_DOC_MAX);
}

/** Lo que el sistema acepta, escrito una sola vez (vale para el input y para validar). */
export const ACEPTA_DOCUMENTO = 'application/pdf,image/*';

/** Explica por qué no se puede subir ese archivo. `null` = está bien. */
export function errorArchivoDocumento(file: File): string | null {
  const esPdf = file.type === 'application/pdf';
  const esImagen = file.type.startsWith('image/');
  if (!esPdf && !esImagen) return 'El documento tiene que ser un PDF o una imagen.';
  if (file.size > MAX_BYTES) return 'El archivo no puede superar 10 MB.';
  if (file.size === 0) return 'Ese archivo está vacío.';
  return null;
}

/** Los documentos cargados de una persona. */
export async function listDocumentosPersonal(personalId: string): Promise<PersonalDocumento[]> {
  const { data, error } = await supabase
    .from(TABLE).select('*').eq('personal_id', personalId).order('tipo');
  if (error) throw error;
  return (data ?? []) as PersonalDocumento[];
}

/** Todos los documentos de varias personas, para marcar la lista de un vistazo. */
export async function listDocumentosDeTodos(): Promise<PersonalDocumento[]> {
  const { data, error } = await supabase.from(TABLE).select('*');
  if (error) throw error;
  return (data ?? []) as PersonalDocumento[];
}

/** Sube (o reemplaza) un documento. Devuelve el renglón ya guardado. */
export async function subirDocumentoPersonal(
  personalId: string, tipo: TipoDocumento, file: File, anterior?: PersonalDocumento | null,
  /** Nombre a mostrar. Si no viene, el del archivo. Obligatorio para `otro`. */
  nombre?: string,
): Promise<PersonalDocumento> {
  const problema = errorArchivoDocumento(file);
  if (problema) throw new Error(problema);
  const visible = (nombre ?? file.name).trim();
  if (tipo === 'otro') {
    const malNombre = errorNombreDocumento(visible);
    if (malNombre) throw new Error(malNombre);
  }

  const safe = file.name.replace(/[^\w.-]+/g, '_').slice(-80);
  const path = `${personalId}/${tipo}-${Date.now()}-${safe}`;
  const { error: upErr } = await supabase.storage.from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw upErr;

  const fila = {
    personal_id: personalId, tipo, path, nombre: visible,
    mime: file.type, tamano: file.size,
    created_by: (await supabase.auth.getUser()).data.user?.email ?? null,
  };
  // Ya no se puede usar `upsert`: el índice único (personal_id, tipo) pasó a ser
  // PARCIAL —no aplica a los libres, de los que hay varios— y PostgREST no sabe
  // expresar el WHERE de un índice parcial. Así que se decide acá: si ya había
  // uno de ese tipo se ACTUALIZA ese renglón; si no, se inserta.
  const { data, error } = anterior?.id
    ? await supabase.from(TABLE).update(fila).eq('id', anterior.id).select('*').single()
    : await supabase.from(TABLE).insert(fila).select('*').single();
  if (error) {
    // El renglón no quedó: el archivo subido no le sirve a nadie, se limpia.
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw error;
  }

  // El anterior se borra DESPUÉS de que el nuevo quedó enlazado: al revés, si
  // fallara la subida la persona se queda sin ninguno.
  if (anterior?.path && anterior.path !== path) {
    await supabase.storage.from(BUCKET).remove([anterior.path]).catch(() => {});
  }
  return data as PersonalDocumento;
}

/**
 * Le cambia el nombre a un documento. El archivo no se toca: lo que cambia es
 * cómo se llama en la pantalla, que es lo que se lee.
 */
export async function renombrarDocumentoPersonal(doc: PersonalDocumento, nombre: string): Promise<PersonalDocumento> {
  const malNombre = errorNombreDocumento(nombre);
  if (malNombre) throw new Error(malNombre);
  const { data, error } = await supabase.from(TABLE)
    .update({ nombre: nombre.trim() }).eq('id', doc.id).select('*').single();
  if (error) throw error;
  return data as PersonalDocumento;
}

/** Quita un documento (borra el renglón y el archivo). */
export async function borrarDocumentoPersonal(doc: PersonalDocumento): Promise<void> {
  const { data, error } = await supabase.from(TABLE).delete().eq('id', doc.id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No se pudo quitar: sin permiso o ya no existía.');
  if (doc.path) await supabase.storage.from(BUCKET).remove([doc.path]).catch(() => {});
}

/** Enlace firmado (10 min) para ver o descargar un documento. */
export async function urlDocumentoPersonal(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error || !data) throw error ?? new Error('No se pudo generar el enlace del documento');
  return data.signedUrl;
}
