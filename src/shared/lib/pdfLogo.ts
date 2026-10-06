import type { jsPDF } from 'jspdf';
import { identidadEmpresa } from './empresa';

let cachedDataUrl: string | null = null;
let cachedPdfDataUrl: string | null = null;

/**
 * Logo de los DOCUMENTOS PDF (05/10/2026): «Logo Golden Touch.jpg», el
 * horizontal con el nombre y el RIF. Solo los PDF: la pantalla, el carnet y
 * el Excel siguen con LOGO.jpg.
 *
 * Es casi tres veces más ancho que alto, así que NO se dibuja en el cuadrado
 * del logo anterior (saldría aplastado): `dibujarLogoPdf` lo pone a su
 * proporción y `anchoLogoPdf` dice cuánto ocupa, para correr el título.
 */
export const LOGO_PDF_PROPORCION = 1696 / 608;
/** Alto del logo respecto del cuadrado que ocupaba el anterior. */
const LOGO_PDF_ALTO = 0.7;

export function anchoLogoPdf(caja: number): number {
  return caja * LOGO_PDF_ALTO * LOGO_PDF_PROPORCION;
}

/** Dibuja el logo de PDF centrado en el alto de `caja`, a su proporción. Nunca falla. */
export function dibujarLogoPdf(doc: jsPDF, dataUrl: string, x: number, y: number, caja: number): void {
  const h = caja * LOGO_PDF_ALTO;
  try { doc.addImage(dataUrl, 'JPEG', x, y + (caja - h) / 2, h * LOGO_PDF_PROPORCION, h); } catch { /* el logo es opcional */ }
}

const cacheLogoEmpresa = new Map<string, Promise<string>>();

/**
 * Logo de PDF de la empresa de una nómina: GT → el de siempre; MTO → «Logo MTO.png»
 * (Minería Tin Oxide). El de MTO viene con mucho margen blanco: se recorta al
 * dibujo y se centra en un lienzo con la MISMA proporción que el de GT, así
 * `dibujarLogoPdf` / `anchoLogoPdf` sirven igual para los dos sin tocar nada.
 */
export async function loadLogoPdfEmpresa(empresa?: string | null): Promise<string> {
  if (empresa !== 'MTO') return loadLogoPdfDataUrl();
  const archivo = identidadEmpresa('MTO').logoPdf;
  if (!cacheLogoEmpresa.has(archivo)) {
    const p = cargarLogoRecortado(archivo);
    cacheLogoEmpresa.set(archivo, p);
    p.catch(() => cacheLogoEmpresa.delete(archivo));
  }
  return cacheLogoEmpresa.get(archivo)!;
}

async function cargarLogoRecortado(archivo: string): Promise<string> {
  const resp = await fetch(`${import.meta.env.BASE_URL}${encodeURIComponent(archivo)}`);
  if (!resp.ok) throw new Error(`No se pudo cargar el logo (${resp.status})`);
  const objectUrl = URL.createObjectURL(await resp.blob());
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No se pudo decodificar el logo'));
      el.src = objectUrl;
    });
    const w = img.naturalWidth, h = img.naturalHeight;
    const src = document.createElement('canvas');
    src.width = w; src.height = h;
    const sctx = src.getContext('2d');
    if (!sctx) throw new Error('Canvas 2D no disponible');
    sctx.fillStyle = '#FFFFFF'; sctx.fillRect(0, 0, w, h);
    sctx.drawImage(img, 0, 0);
    // Caja del dibujo: todo lo que no es (casi) blanco.
    const px = sctx.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const i = (y * w + x) * 4;
        if (px[i] < 235 || px[i + 1] < 235 || px[i + 2] < 235) {
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < x0 || y1 < y0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    // Lienzo de salida a la proporción del logo de GT, con el dibujo centrado.
    const OUT_W = 1000, OUT_H = Math.round(OUT_W / LOGO_PDF_PROPORCION);
    const escala = Math.min(OUT_W / cw, OUT_H / ch);
    const dw = cw * escala, dh = ch * escala;
    const out = document.createElement('canvas');
    out.width = OUT_W; out.height = OUT_H;
    const octx = out.getContext('2d');
    if (!octx) throw new Error('Canvas 2D no disponible');
    octx.fillStyle = '#FFFFFF'; octx.fillRect(0, 0, OUT_W, OUT_H);
    // Pegado a la izquierda (como el de GT), centrado en alto.
    octx.drawImage(src, x0, y0, cw, ch, 0, (OUT_H - dh) / 2, dw, dh);
    return out.toDataURL('image/jpeg', 0.9);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function loadLogoPdfDataUrl(): Promise<string> {
  if (cachedPdfDataUrl) return cachedPdfDataUrl;
  const resp = await fetch(`${import.meta.env.BASE_URL}${encodeURIComponent('Logo Golden Touch.jpg')}`);
  if (!resp.ok) throw new Error(`No se pudo cargar el logo (${resp.status})`);
  const objectUrl = URL.createObjectURL(await resp.blob());
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No se pudo decodificar el logo'));
      el.src = objectUrl;
    });
    // El original pesa ~320 KB; a 1000 px de ancho se ve igual de nítido
    // impreso y no engorda cada PDF.
    const ancho = Math.min(1000, img.naturalWidth || 1000);
    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = Math.round(ancho / LOGO_PDF_PROPORCION);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D no disponible');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    cachedPdfDataUrl = canvas.toDataURL('image/jpeg', 0.9);
    return cachedPdfDataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
let cachedFirmaDataUrl: string | null | undefined; // undefined = aún no intentado; null = no existe
let cachedFirma2: { dataUrl: string; w: number; h: number } | null | undefined;

/**
 * Devuelve el logo (GOLDEN TOUCH) como data URL (JPEG) para embeberlo en PDFs
 * generados con jsPDF. Cachea el resultado para no refetchar. Se dibuja sobre
 * fondo blanco para aplanar cualquier transparencia.
 */
export async function loadLogoDataUrl(): Promise<string> {
  if (cachedDataUrl) return cachedDataUrl;
  const url = `${import.meta.env.BASE_URL}LOGO.jpg`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`No se pudo cargar el logo (${resp.status})`);
  const blob = await resp.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No se pudo decodificar el logo'));
      el.src = objectUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 500;
    canvas.height = img.naturalHeight || 500;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D no disponible');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    cachedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
    return cachedDataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Firma de LEYDIS RENGEL (autorizadora de salidas/traslados) desde `public/firma2.jpeg`,
 * como data URL JPEG + dimensiones naturales (para mantener la proporción al estamparla
 * sobre la línea de «Autorizado por» en la Orden de Salida). Devuelve `null` si no existe.
 */
/** Firma de LEYDIS RENGEL (`public/firma2.jpeg`) como PNG con fondo transparente, con su
 *  ancho/alto naturales. Estamparla con formato 'PNG'. */
export async function loadFirma2DataUrl(): Promise<{ dataUrl: string; w: number; h: number } | null> {
  if (cachedFirma2 !== undefined) return cachedFirma2;
  try {
    const url = `${import.meta.env.BASE_URL}firma2.jpeg`;
    const resp = await fetch(url);
    if (!resp.ok) { cachedFirma2 = null; return null; }
    const blob = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('No se pudo decodificar la firma2'));
        el.src = objectUrl;
      });
      const w = img.naturalWidth || 600;
      const h = img.naturalHeight || 250;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { cachedFirma2 = null; return null; }
      ctx.drawImage(img, 0, 0, w, h);
      // El JPEG trae fondo blanco: se vuelve TRANSPARENTE (los píxeles casi blancos quedan
      // con alfa 0) y se exporta como PNG, para que la firma no tape lo que tenga debajo
      // (líneas, texto) y el trazo se vea limpio. Los consumidores la estampan como 'PNG'.
      const px = ctx.getImageData(0, 0, w, h);
      const d = px.data;
      for (let i = 0; i < d.length; i += 4) {
        const min = Math.min(d[i], d[i + 1], d[i + 2]);
        if (min >= 235) d[i + 3] = 0;                       // blanco → transparente
        else if (min >= 200) d[i + 3] = Math.round(((235 - min) / 35) * 255); // borde suave
      }
      ctx.putImageData(px, 0, 0);
      cachedFirma2 = { dataUrl: canvas.toDataURL('image/png'), w, h };
      return cachedFirma2;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    cachedFirma2 = null;
    return null;
  }
}

/**
 * Firma del Gerente General (manuscrita) como data URL PNG, para estamparla en
 * los PDFs de Orden de Compra una vez aprobada. Conserva la transparencia (no se
 * aplana sobre blanco) para que el trazo se vea limpio sobre el documento.
 *
 * Devuelve `null` si el archivo `public/FIRMA.png` no existe, de modo que el PDF
 * siga generándose sin firma cuando aún no se haya cargado.
 */
export async function loadFirmaDataUrl(): Promise<string | null> {
  if (cachedFirmaDataUrl !== undefined) return cachedFirmaDataUrl;
  try {
    const url = `${import.meta.env.BASE_URL}firma.png`;
    const resp = await fetch(url);
    if (!resp.ok) { cachedFirmaDataUrl = null; return null; }
    const blob = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('No se pudo decodificar la firma'));
        el.src = objectUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 600;
      canvas.height = img.naturalHeight || 250;
      const ctx = canvas.getContext('2d');
      if (!ctx) { cachedFirmaDataUrl = null; return null; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      cachedFirmaDataUrl = canvas.toDataURL('image/png');
      return cachedFirmaDataUrl;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    cachedFirmaDataUrl = null;
    return null;
  }
}
