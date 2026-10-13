/* ============================================================
   Golden Touch · Choferes / Conductores · Archivos del conductor
   (traído de MGG el 13/10/2026)

   Licencia, certificado médico, seguro y otros papeles: solo PDF o imagen
   (llegan escaneados o fotografiados con el teléfono), hasta 10 MB.
   ============================================================ */

export const MAX_BYTES_DOCUMENTO = 10 * 1024 * 1024;

export interface ArchivoSubido {
  name: string;
  type: string;
  size: number;
}

export function esPdf(file: Pick<ArchivoSubido, 'name' | 'type'>): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name ?? '');
}

export function esImagen(file: Pick<ArchivoSubido, 'name' | 'type'>): boolean {
  if ((file.type ?? '').startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name ?? '');
}

/** Lo que impide subir el archivo. `null` = se puede. */
export function validarArchivoDocumento(file: ArchivoSubido | null | undefined): string | null {
  if (!file) return 'Elige un archivo.';
  if (!file.name?.trim()) return 'El archivo no tiene nombre.';
  if (!esPdf(file) && !esImagen(file)) {
    return 'El documento tiene que ser un PDF o una imagen (JPG, PNG, HEIC…).';
  }
  if (Number(file.size) <= 0) return 'El archivo está vacío.';
  if (Number(file.size) > MAX_BYTES_DOCUMENTO) {
    return `El archivo pesa ${megas(file.size)} y el tope es 10 MB. Si es una foto, sácala con menos resolución o pásala a PDF.`;
  }
  return null;
}

/** «850 KB», «2,4 MB». */
export function megas(bytes: unknown): string {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(Math.round((b / (1024 * 1024)) * 10) / 10).toLocaleString('es-VE')} MB`;
}

/** El nombre, limpio de lo que rompe una ruta de Storage. */
export function nombreSeguro(nombre: string): string {
  const limpio = String(nombre ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_');
  return limpio.replace(/^_+|_+$/g, '') || 'documento';
}

/** El error de la subida en palabras. */
export function mensajeErrorDocumento(e: unknown): string {
  const err = (e ?? {}) as { code?: unknown; message?: unknown };
  const code = String(err.code ?? '');
  const msg = String(err.message ?? (typeof e === 'string' ? e : '')).trim();
  if (code === '23505' || /duplicate key/i.test(msg)) return 'Ya hay un documento con ese nombre.';
  if (code === '23514' || /violates check constraint/i.test(msg)) return 'La base no aceptó el documento: falta el nombre o el tipo no es válido.';
  if (code === '42501' || /row-level security|permission denied|Unauthorized/i.test(msg)) return 'Tu usuario no tiene permiso para cargar documentos de Choferes.';
  if (/payload too large|exceeded the maximum/i.test(msg)) return 'El archivo es demasiado grande.';
  if (/failed to fetch|network/i.test(msg)) return 'Se cortó la conexión mientras subía el archivo. Prueba de nuevo.';
  return msg ? `No se pudo subir el documento: ${msg}` : 'No se pudo subir el documento.';
}
