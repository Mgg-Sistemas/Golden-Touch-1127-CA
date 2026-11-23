/* ============================================================
   Golden Touch · Delivery · preparar la foto antes de subirla (23/11/2026)

   El bucket `delivery-fotos` solo acepta JPEG, PNG, WEBP, HEIC y HEIF y hasta
   10 MB. La app, en cambio, dejaba pasar GIF/BMP/`application/octet-stream` y
   fotos gigantes: Storage respondía 415 `invalid_mime_type` o 413
   `EntityTooLarge` y el motorizado veía «No se pudo subir ...» sin entender por
   qué. Acá se normaliza TODO lo que se va a subir al bucket:

   · formato no soportado → se convierte a JPEG (primer cuadro si es GIF);
   · más de 10 MB → se re-comprime a 1280 px y luego a 900 px;
   · si aun así no sirve → error claro, antes de gastar datos en subirla.
   ============================================================ */
import { cargarImagenDesdeBlob, comprimirImagen, nombreJpg } from '@/shared/lib/comprimirImagen';

/** Tipos que acepta el bucket `delivery-fotos` (política de storage). */
export const MIME_FOTOS_DELIVERY = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;
export type MimeFotoDelivery = typeof MIME_FOTOS_DELIVERY[number];

/** Límite del bucket (10 MB, mismo valor que el `file_size_limit` de Supabase). */
export const BYTES_MAXIMOS_FOTO_DELIVERY = 10 * 1024 * 1024;

const mimeLimpio = (tipo?: string | null): string => String(tipo ?? '').toLowerCase().split(';')[0].trim();

/** MIME con el que se puede subir al bucket; cualquier otro se manda a JPEG. */
export function mimeFotoDelivery(tipo?: string | null): MimeFotoDelivery {
  const t = mimeLimpio(tipo);
  return (MIME_FOTOS_DELIVERY as readonly string[]).includes(t) ? t as MimeFotoDelivery : 'image/jpeg';
}

/** ¿Hay que convertir esta foto a JPEG antes de subirla? */
export function necesitaConversionFotoDelivery(foto: Pick<File, 'type'>): boolean {
  return mimeFotoDelivery(foto.type) !== mimeLimpio(foto.type);
}

export function superaLimiteFotoDelivery(bytes: number): boolean {
  return bytes > BYTES_MAXIMOS_FOTO_DELIVERY;
}

/** Dibuja la foto en un canvas y devuelve un JPEG; `null` si el navegador no la entiende. */
async function aJpeg(foto: File, lado: number, calidad: number): Promise<File | null> {
  if (typeof document === 'undefined') return null;
  try {
    const img = await cargarImagenDesdeBlob(foto);
    const escala = Math.min(1, lado / Math.max(img.width, img.height, 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * escala));
    canvas.height = Math.max(1, Math.round(img.height * escala));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    if ('close' in img && typeof img.close === 'function') img.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', calidad));
    if (!blob?.size) return null;
    return new File([blob], nombreJpg(foto.name), { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return null;
  }
}

/**
 * Deja la foto lista para `storage.from('delivery-fotos').upload(...)`.
 * Lanza un error entendible si no se puede convertir o si no baja de 10 MB.
 */
export async function prepararFotoDelivery(original: File): Promise<File> {
  // El helper del sistema ya achica JPEG/PNG/WEBP grandes y respeta EXIF.
  let foto = await comprimirImagen(original).catch(() => original);

  if (necesitaConversionFotoDelivery(foto)) {
    const jpeg = await aJpeg(foto, 1600, 0.82);
    if (!jpeg) {
      throw new Error(`La foto «${original.name}» no se pudo convertir a JPEG. Probá con otra foto.`);
    }
    foto = jpeg;
  }

  if (superaLimiteFotoDelivery(foto.size)) {
    for (const [lado, calidad] of [[1280, 0.75], [900, 0.6]] as const) {
      if (!superaLimiteFotoDelivery(foto.size)) break;
      const jpeg = await aJpeg(foto, lado, calidad);
      if (jpeg) foto = jpeg;
    }
  }
  if (superaLimiteFotoDelivery(foto.size)) {
    const mb = (foto.size / 1024 / 1024).toFixed(1);
    throw new Error(`La foto «${original.name}» pesa ${mb} MB y supera el límite de 10 MB. Probá con otra foto.`);
  }
  return foto;
}
