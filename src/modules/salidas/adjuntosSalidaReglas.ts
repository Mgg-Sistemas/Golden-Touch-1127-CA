/* ============================================================
   Golden Touch · Salidas · Adjuntos de una solicitud (reglas puras)

   Una solicitud de salida, de traslado o de salida temporal puede llevar
   hasta CUATRO archivos: fotos del material, del vehículo, de la guía, o un
   PDF. Acá están las reglas que se comprueban antes de subir nada, para
   avisar en castellano en la pantalla. El tope de 4 también lo hace cumplir
   la base (trigger `salidas_adjuntos_tope`), así que dos personas subiendo a
   la vez tampoco lo pasan.

   POR QUÉ 10 MB. Una foto de teléfono pesa entre 2 y 5 MB; un PDF escaneado
   de una guía, menos. Con 10 MB entra cualquiera de esos y no entra un video
   por error. Es el mismo límite del bucket.
   ============================================================ */

/** Cuántos archivos admite una solicitud. */
export const MAX_ADJUNTOS_SALIDA = 4;

/** Peso máximo de cada archivo, igual al límite del bucket. */
export const TOPE_ADJUNTO_BYTES = 10 * 1024 * 1024;

/** A qué tipo de solicitud pertenece el adjunto. */
export type ModuloAdjuntoSalida = 'salida' | 'traslado' | 'salida_temporal';

/** Lo mínimo de un archivo que hace falta para decidir si sirve. */
export interface ArchivoCandidato {
  name: string;
  type: string;
  size: number;
}

const RX_IMAGEN_POR_NOMBRE = /\.(png|jpe?g|webp|gif|heic|heif)$/i;

/** ¿Es una imagen? Por el tipo, y si el navegador no lo dice, por la extensión. */
export function esImagenAdjunto(contentType?: string | null, nombre?: string | null): boolean {
  if ((contentType ?? '').startsWith('image/')) return true;
  return RX_IMAGEN_POR_NOMBRE.test(nombre ?? '');
}

/** ¿Es un PDF? Igual: por el tipo o, si falta, por la extensión. */
export function esPdfAdjunto(contentType?: string | null, nombre?: string | null): boolean {
  if (contentType === 'application/pdf') return true;
  return /\.pdf$/i.test(nombre ?? '');
}

/** Qué está mal con un archivo, o `null` si se puede subir. */
export function errorArchivoAdjunto(f: ArchivoCandidato): string | null {
  if (!esImagenAdjunto(f.type, f.name) && !esPdfAdjunto(f.type, f.name)) {
    return `«${f.name}» no es una imagen ni un PDF.`;
  }
  if (f.size > TOPE_ADJUNTO_BYTES) {
    return `«${f.name}» pesa ${enMegas(f.size)}; el máximo por archivo es ${enMegas(TOPE_ADJUNTO_BYTES)}.`;
  }
  if (f.size === 0) return `«${f.name}» está vacío.`;
  return null;
}

/** Cuántos archivos más se pueden agregar, teniendo `actuales`. Nunca negativo. */
export function cuposLibres(actuales: number): number {
  return Math.max(0, MAX_ADJUNTOS_SALIDA - Math.max(0, actuales));
}

/** Aviso si con `nuevos` archivos más se pasa el tope; `null` si entran. */
export function errorCupo(actuales: number, nuevos: number): string | null {
  const libres = cuposLibres(actuales);
  if (nuevos <= libres) return null;
  if (libres === 0) return `Esta solicitud ya tiene ${MAX_ADJUNTOS_SALIDA} adjuntos, que es el máximo. Borrá uno para subir otro.`;
  return `Solo ${libres === 1 ? 'entra 1 archivo más' : `entran ${libres} archivos más`} (máximo ${MAX_ADJUNTOS_SALIDA} por solicitud).`;
}

/**
 * Nombre con el que se guarda en el almacén: sin espacios ni caracteres que
 * las URL no aguantan. El nombre original queda aparte, para mostrarlo.
 */
export function nombreSeguroAdjunto(nombre: string): string {
  const limpio = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');
  return limpio || 'archivo';
}

/** «2,3 MB» para los avisos. */
export function enMegas(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
