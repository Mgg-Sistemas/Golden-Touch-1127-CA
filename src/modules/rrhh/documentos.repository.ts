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
  rif: 'RIF', ci: 'Cédula', cv: 'CV',
};

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
): Promise<PersonalDocumento> {
  const problema = errorArchivoDocumento(file);
  if (problema) throw new Error(problema);

  const safe = file.name.replace(/[^\w.-]+/g, '_').slice(-80);
  const path = `${personalId}/${tipo}-${Date.now()}-${safe}`;
  const { error: upErr } = await supabase.storage.from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw upErr;

  const { data, error } = await supabase.from(TABLE)
    .upsert({
      personal_id: personalId, tipo, path, nombre: file.name,
      mime: file.type, tamano: file.size,
      created_by: (await supabase.auth.getUser()).data.user?.email ?? null,
    }, { onConflict: 'personal_id,tipo' })
    .select('*').single();
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
