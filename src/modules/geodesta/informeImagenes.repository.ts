/* ============================================================
   Golden Touch · Geodesta · Imágenes del informe

   Fotos de terreno y planos que se dibujan dentro del PDF. Viven en un
   almacén PRIVADO: no hay enlace público, cada vez que se muestra una se
   pide un enlace firmado que dura diez minutos. Solo JPG, PNG y WEBP:
   un PDF no se puede dibujar dentro del documento.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { comprimirImagen } from '@/shared/lib/comprimirImagen';
import type { ImagenGeodesta } from '@/shared/lib/types';

const TABLE = 'geodesta_imagenes';
const BUCKET = 'geodesta-imagenes';
/** Máximo del archivo que se SUBE (ya comprimido): protege el almacén. */
export const MAX_BYTES_IMAGEN = 10 * 1024 * 1024;
/** Tope del original ANTES de comprimir: solo protege la memoria al decodificar. */
export const MAX_BYTES_ORIGINAL_IMAGEN = 50 * 1024 * 1024;
export const ACEPTA_IMAGEN = 'image/jpeg,image/png,image/webp';

const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp'];
const EXT_POR_TIPO: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
};

const aMB = (bytes: number) => bytes / 1024 / 1024;
const MENSAJE_VACIO = 'La imagen está vacía (0 bytes). Revisá que no esté dañada.';

/** Ruta en el almacén: `informeId/uuid.ext`. La extensión sale del tipo, nunca del nombre. */
export function rutaImagen(informeId: string, tipo: string, uuid: string): string {
  return `${informeId}/${uuid}.${EXT_POR_TIPO[tipo] ?? 'bin'}`;
}

/**
 * Controles que se pueden hacer ANTES de comprimir: tipo, vacío y un tope duro
 * sobre el original. El límite de 10 MB se mide después (`errorImagenSubible`):
 * una foto de teléfono de 12 MB comprimida pesa unos cientos de kB.
 * `null` = está bien.
 */
export function errorArchivoImagen(file: File): string | null {
  if (!TIPOS_OK.includes(file.type)) {
    return 'Solo se aceptan imágenes JPG, PNG o WEBP.';
  }
  if (file.size === 0) return MENSAJE_VACIO;
  if (file.size > MAX_BYTES_ORIGINAL_IMAGEN) {
    return `La imagen pesa ${aMB(file.size).toFixed(1)} MB y el máximo antes de comprimir es ${aMB(MAX_BYTES_ORIGINAL_IMAGEN)} MB.`;
  }
  return null;
}

/** Control sobre el archivo que realmente se va a subir (ya comprimido). `null` = está bien. */
export function errorImagenSubible(file: File): string | null {
  if (file.size === 0) return MENSAJE_VACIO;
  if (file.size > MAX_BYTES_IMAGEN) {
    return `La imagen, tal como se va a guardar, pesa ${aMB(file.size).toFixed(1)} MB y el máximo es ${aMB(MAX_BYTES_IMAGEN)} MB.`;
  }
  return null;
}

export async function listImagenes(informeId: string): Promise<ImagenGeodesta[]> {
  const { data, error } = await supabase
    .from(TABLE).select('*').eq('informe_id', informeId).order('subido_en', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ImagenGeodesta[];
}

export async function subirImagen(informeId: string, file: File, actor: string): Promise<ImagenGeodesta> {
  const problema = errorArchivoImagen(file);
  if (problema) throw new Error(problema);

  // Se comprime primero y el límite de 10 MB se mide sobre el resultado, que es
  // lo que ocupa lugar en el almacén. El tipo y la ruta salen del archivo comprimido.
  const subir = await comprimirImagen(file);
  const problemaFinal = errorImagenSubible(subir);
  if (problemaFinal) throw new Error(problemaFinal);
  const path = rutaImagen(informeId, subir.type, crypto.randomUUID());

  const { error: upErr } = await supabase.storage.from(BUCKET)
    .upload(path, subir, { contentType: subir.type, upsert: false });
  if (upErr) throw upErr;

  const { data, error } = await supabase.from(TABLE).insert({
    informe_id: informeId,
    nombre: file.name,
    path,
    tipo: subir.type,
    bytes: subir.size,
    subido_por: actor,
  }).select('*').single();

  // Si la fila no se pudo escribir, el archivo huérfano se borra y se relanza el error original.
  if (error) {
    // La librería no lanza: devuelve `{ error }`.
    const { error: errLimpieza } = await supabase.storage.from(BUCKET).remove([path]);
    if (errLimpieza) console.warn('No se pudo limpiar el archivo huérfano:', path, errLimpieza);
    throw error;
  }
  return data as ImagenGeodesta;
}

export async function borrarImagen(img: ImagenGeodesta): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', img.id);
  if (error) throw error;
  // La librería NO lanza: devuelve `{ error }`, hay que leerlo.
  const { error: errAlmacen } = await supabase.storage.from(BUCKET).remove([img.path]);
  if (errAlmacen) throw errAlmacen;
}

/**
 * Borra del almacén todo lo que cuelga de un informe. Lista el BUCKET (no la
 * tabla): tras el borrado en cascada la tabla ya está vacía y los archivos
 * quedarían huérfanos en silencio.
 */
export async function borrarImagenesDeInforme(informeId: string): Promise<void> {
  const { data, error } = await supabase.storage.from(BUCKET).list(informeId, { limit: 1000 });
  if (error) throw error;
  const rutas = (data ?? []).map((f) => `${informeId}/${f.name}`);
  if (rutas.length === 0) return;
  const { error: errBorrado } = await supabase.storage.from(BUCKET).remove(rutas);
  if (errBorrado) throw errBorrado;
}

/** Enlace firmado de 10 minutos. Nunca `getPublicUrl`: el almacén es privado. */
export async function urlImagen(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
}
