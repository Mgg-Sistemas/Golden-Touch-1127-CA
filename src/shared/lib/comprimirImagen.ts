/* ============================================================
   Golden Touch · Comprimir imágenes antes de subirlas

   Las fotos de teléfono llegan de 4 MB y se guardan tal cual, llenando
   el almacén y haciendo lenta la galería. Acá se reducen a un lado
   máximo y se reexportan en JPEG.

   REGLA DE ORO: si algo falla —el navegador bloquea canvas, el formato
   es raro, la imagen no carga— se devuelve el archivo ORIGINAL. Nunca
   se bloquea una carga por no haber podido comprimir.
   ============================================================ */

/** Lado más largo al que se reduce la imagen. */
const MAX_LADO = 1600;
/** Calidad del JPEG resultante (0 a 1). */
const CALIDAD = 0.8;

export async function comprimirImagen(
  file: File,
  maxLado: number = MAX_LADO,
  calidad: number = CALIDAD,
): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
    // Ya es chica: recomprimirla solo la empeoraría.
    if (escala >= 1) { bitmap.close?.(); return file; }

    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);
    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close?.(); return file; }
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', calidad));
    if (!blob || blob.size >= file.size) return file; // no mejoró: queda el original

    const nombre = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], nombre, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file; // sin canvas (modo privado, navegador viejo): se sube el original
  }
}
