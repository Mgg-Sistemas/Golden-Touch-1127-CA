/* ============================================================
   Golden Touch · RRHH · Minutas · adjuntos

   Fotos y escaneos de la minuta firmada. Viven en un almacén PRIVADO:
   no hay enlace público, cada vez que se abre uno se pide un enlace
   firmado que dura diez minutos. Mismo esquema que la documentación
   del personal (`personal-documentos`).
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { comprimirImagen } from '@/shared/lib/comprimirImagen';
import type { MinutaAdjunto } from '@/shared/lib/types';

const TABLE = 'minuta_adjuntos';
const BUCKET = 'minutas-adjuntos';
export const MAX_BYTES_ADJUNTO = 10 * 1024 * 1024;
export const ACEPTA_ADJUNTO = 'image/jpeg,image/png,image/webp,application/pdf';

const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/** Explica por qué no se puede subir ese archivo. `null` = está bien. */
export function errorArchivoAdjunto(file: File): string | null {
  if (!TIPOS_OK.includes(file.type)) {
    return 'Solo se aceptan imágenes JPG, PNG o WEBP, y archivos PDF.';
  }
  // Un archivo de 0 bytes es un archivo corrupto o vacío: no tiene nada que guardar.
  if (file.size === 0) {
    return 'El archivo está vacío (0 bytes). Revisá que no esté dañado.';
  }
  if (file.size > MAX_BYTES_ADJUNTO) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `El archivo pesa ${mb} MB y el máximo es 10 MB.`;
  }
  return null;
}

export async function listAdjuntos(minutaId: string): Promise<MinutaAdjunto[]> {
  const { data, error } = await supabase
    .from(TABLE).select('*').eq('minuta_id', minutaId).order('subido_en', { ascending: true });
  if (error) throw error;
  return (data ?? []) as MinutaAdjunto[];
}

export async function subirAdjunto(minutaId: string, file: File, actor: string): Promise<MinutaAdjunto> {
  const problema = errorArchivoAdjunto(file);
  if (problema) throw new Error(problema);

  // Se comprime ANTES de validar el tamaño final: una foto de 8 MB pasa a ~300 kB.
  const subir = await comprimirImagen(file);
  const ext = (subir.name.split('.').pop() ?? 'bin').toLowerCase();
  const path = `${minutaId}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage.from(BUCKET)
    .upload(path, subir, { contentType: subir.type, upsert: false });
  if (upErr) throw upErr;

  const { data, error } = await supabase.from(TABLE).insert({
    minuta_id: minutaId,
    nombre: file.name,
    path,
    tipo: subir.type,
    bytes: subir.size,
    subido_por: actor,
  }).select('*').single();

  // Si la fila no se pudo escribir, el archivo huérfano se borra: no se deja basura.
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw error;
  }
  return data as MinutaAdjunto;
}

export async function borrarAdjunto(a: MinutaAdjunto): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', a.id);
  if (error) throw error;
  await supabase.storage.from(BUCKET).remove([a.path]).catch(() => {});
}

export async function urlAdjunto(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
}
