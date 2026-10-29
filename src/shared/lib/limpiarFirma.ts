/* ============================================================
   Golden Touch · Limpieza y optimización de firmas manuscritas
   ============================================================
   Convierte fotos o escaneos de firmas (incluso tomadas con celular
   sobre papel con sombras o iluminación tenue) en trazos limpios
   sobre fondo 100% transparente (PNG), recortando los márgenes
   vacíos para que la firma se estampe proporcionada y nítida.
   ============================================================ */

export interface ResultadoFirma {
  dataUrl: string;
  w: number;
  h: number;
}

export interface BoundingBoxFirma {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  inkCount: number;
}

/**
 * Procesa directamente el buffer RGBA de píxeles:
 * - Detecta el nivel de brillo del papel (incluso con sombras o degradados de luz).
 * - Vuelve transparente (alfa = 0) todo el fondo del papel con bordes suaves.
 * - Suprime artefactos en los bordes del recorte (3 px del perímetro).
 * - Realza el contraste del trazo (tinta negra/azul profunda sin ruido).
 * - Calcula la caja delimitadora (bounding box) real del trazo.
 */
export function limpiarPixelesFirma(
  d: Uint8ClampedArray,
  w: number,
  h: number,
): BoundingBoxFirma {
  const totalPix = w * h;
  const lum = new Float32Array(totalPix);

  let transparentes = 0;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    if (d[i + 3] < 30) {
      transparentes++;
      lum[p] = -1;
    } else {
      lum[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }
  }

  const yaEsTransparente = transparentes > totalPix * 0.25;

  let xMin = w, xMax = 0, yMin = h, yMax = 0;
  let inkCount = 0;

  if (yaEsTransparente) {
    // Si ya viene con fondo transparente (p. ej. firma.png), solo recortamos y limpiamos
    // posibles píxeles casi blancos residuales.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        const idx = p * 4;
        if (d[idx + 3] < 20) {
          d[idx + 3] = 0;
          continue;
        }
        const minColor = Math.min(d[idx], d[idx + 1], d[idx + 2]);
        if (minColor >= 238) {
          d[idx + 3] = 0;
          continue;
        }
        if (d[idx + 3] > 40) {
          inkCount++;
          if (x < xMin) xMin = x;
          if (x > xMax) xMax = x;
          if (y < yMin) yMin = y;
          if (y > yMax) yMax = y;
        }
      }
    }
    return {
      xMin: inkCount > 0 ? xMin : 0,
      yMin: inkCount > 0 ? yMin : 0,
      xMax: inkCount > 0 ? xMax : w - 1,
      yMax: inkCount > 0 ? yMax : h - 1,
      inkCount,
    };
  }

  // Cuadrícula para estimación adaptativa de fondo por bloques
  const BLOCK = Math.max(16, Math.min(32, Math.floor(Math.min(w, h) / 6)));
  const cols = Math.ceil(w / BLOCK);
  const rows = Math.ceil(h / BLOCK);
  const bgGrid = new Float32Array(cols * rows);

  // Estimador global por si algún bloque queda sin muestras
  const todosLums: number[] = [];
  const pasoMuestreo = Math.max(1, Math.floor(totalPix / 2000));
  for (let p = 0; p < totalPix; p += pasoMuestreo) {
    if (lum[p] >= 0) todosLums.push(lum[p]);
  }
  todosLums.sort((a, b) => a - b);
  const bgGlobal = todosLums.length > 0
    ? todosLums[Math.min(todosLums.length - 1, Math.floor(todosLums.length * 0.9))]
    : 240;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = c * BLOCK, x1 = Math.min(w, x0 + BLOCK);
      const y0 = r * BLOCK, y1 = Math.min(h, y0 + BLOCK);
      const vals: number[] = [];

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          // Excluir 3 píxeles del perímetro exterior (donde suelen haber sombras de corte)
          if (x >= 3 && x < w - 3 && y >= 3 && y < h - 3) {
            const v = lum[y * w + x];
            if (v >= 0) vals.push(v);
          }
        }
      }

      if (vals.length > 10) {
        vals.sort((a, b) => a - b);
        // El percentil 90 representa confiablemente el papel de ese bloque
        const p90 = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.90))];
        bgGrid[r * cols + c] = Math.max(p90, bgGlobal - 55);
      } else {
        bgGrid[r * cols + c] = bgGlobal;
      }
    }
  }

  // Aplicar extracción de tinta con interpolación bilineal
  for (let y = 0; y < h; y++) {
    const rFloat = (y - BLOCK / 2) / BLOCK;
    const r0 = Math.max(0, Math.min(rows - 1, Math.floor(rFloat)));
    const r1 = Math.max(0, Math.min(rows - 1, r0 + 1));
    const ry = rFloat - r0;

    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const idx = p * 4;

      // Suprimir los 3 píxeles del contorno exterior para evitar bordes oscuros de recorte
      if (x < 3 || x >= w - 3 || y < 3 || y >= h - 3) {
        d[idx + 3] = 0;
        continue;
      }

      const cFloat = (x - BLOCK / 2) / BLOCK;
      const c0 = Math.max(0, Math.min(cols - 1, Math.floor(cFloat)));
      const c1 = Math.max(0, Math.min(cols - 1, c0 + 1));
      const cx = cFloat - c0;

      const b00 = bgGrid[r0 * cols + c0];
      const b10 = bgGrid[r0 * cols + c1];
      const b01 = bgGrid[r1 * cols + c0];
      const b11 = bgGrid[r1 * cols + c1];
      const bTop = b00 * (1 - cx) + b10 * cx;
      const bBot = b01 * (1 - cx) + b11 * cx;
      const bg = bTop * (1 - ry) + bBot * ry;

      const pLum = lum[p];
      const delta = bg - pLum;

      // Delta <= 13: papel de fondo -> transparente
      // Delta >= 32: trazo de tinta pleno -> opaco con contraste realzado
      // Entre 13 y 32: borde suave (anti-aliasing)
      if (delta <= 13) {
        d[idx + 3] = 0;
      } else if (delta >= 32) {
        d[idx + 3] = 255;
        // Realzar el trazo hacia tinta oscura nítida (conservando tono si era azul)
        const darkMult = Math.max(0.18, 1 - (delta / Math.max(30, bg * 0.72)));
        d[idx] = Math.round(d[idx] * darkMult);
        d[idx + 1] = Math.round(d[idx + 1] * darkMult);
        d[idx + 2] = Math.round(d[idx + 2] * darkMult);

        inkCount++;
        if (x < xMin) xMin = x;
        if (x > xMax) xMax = x;
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
      } else {
        const alpha = Math.round(((delta - 13) / (32 - 13)) * 255);
        d[idx + 3] = alpha;

        const darkMult = Math.max(0.35, 1 - (delta / Math.max(30, bg * 0.8)));
        d[idx] = Math.round(d[idx] * darkMult);
        d[idx + 1] = Math.round(d[idx + 1] * darkMult);
        d[idx + 2] = Math.round(d[idx + 2] * darkMult);

        if (alpha > 45) {
          inkCount++;
          if (x < xMin) xMin = x;
          if (x > xMax) xMax = x;
          if (y < yMin) yMin = y;
          if (y > yMax) yMax = y;
        }
      }
    }
  }

  return {
    xMin: inkCount > 0 ? xMin : 0,
    yMin: inkCount > 0 ? yMin : 0,
    xMax: inkCount > 0 ? xMax : w - 1,
    yMax: inkCount > 0 ? yMax : h - 1,
    inkCount,
  };
}

/**
 * Procesa un canvas o imagen cargada, elimina el fondo, recorta márgenes vacíos
 * y devuelve el resultado con ancho y alto reales listos para usar en PDFs o HTML.
 */
export function recortarYLimpiarCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): ResultadoFirma {
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);

  const bb = limpiarPixelesFirma(imgData.data, w, h);
  ctx.putImageData(imgData, 0, 0);

  // Si no se detectó tinta (imagen en blanco), se devuelve el canvas tal cual
  if (bb.inkCount === 0) {
    return { dataUrl: canvas.toDataURL('image/png'), w, h };
  }

  // Recortar al bounding box agregando 4 px de margen protector
  const pad = 4;
  const x0 = Math.max(0, bb.xMin - pad);
  const y0 = Math.max(0, bb.yMin - pad);
  const x1 = Math.min(w, bb.xMax + pad + 1);
  const y1 = Math.min(h, bb.yMax + pad + 1);
  const trimW = Math.max(1, x1 - x0);
  const trimH = Math.max(1, y1 - y0);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = trimW;
  outCanvas.height = trimH;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) {
    return { dataUrl: canvas.toDataURL('image/png'), w, h };
  }

  outCtx.drawImage(canvas, x0, y0, trimW, trimH, 0, 0, trimW, trimH);
  return {
    dataUrl: outCanvas.toDataURL('image/png'),
    w: trimW,
    h: trimH,
  };
}

/**
 * Cache en memoria para no reprocesar la misma firma múltiples veces.
 */
const cacheFirmasLimpias = new Map<string, Promise<ResultadoFirma>>();

/**
 * Limpia y recorta una firma dada como data URL (útil para firmas que ya
 * vienen de la base de datos o de assets estáticos).
 */
export async function limpiarFirmaDataUrl(dataUrl: string, maxW = 700): Promise<ResultadoFirma> {
  const clave = `${dataUrl.slice(0, 80)}_${dataUrl.length}`;
  const enCurso = cacheFirmasLimpias.get(clave);
  if (enCurso) return enCurso;

  const promesa = (async () => {
    return new Promise<ResultadoFirma>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const escala = Math.min(1, maxW / (img.naturalWidth || maxW));
          const w = Math.max(1, Math.round((img.naturalWidth || 600) * escala));
          const h = Math.max(1, Math.round((img.naturalHeight || 250) * escala));

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve({ dataUrl, w: img.naturalWidth || 600, h: img.naturalHeight || 250 });
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          const res = recortarYLimpiarCanvas(canvas, ctx);
          resolve(res);
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error('No se pudo decodificar la imagen de la firma'));
      img.src = dataUrl;
    });
  })();

  cacheFirmasLimpias.set(clave, promesa);
  return promesa;
}

/**
 * Procesa un archivo de imagen subido por el usuario (File):
 * valida tamaño/tipo, quita el fondo, recorta márgenes y lo devuelve como PNG transparente.
 */
export async function procesarArchivoFirma(file: File, maxW = 700): Promise<ResultadoFirma> {
  if (!file.type.startsWith('image/')) {
    throw new Error('La firma debe ser una imagen (PNG, JPG o WEBP).');
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('La imagen es muy grande (máx. 8 MB).');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No se pudo leer la imagen de la firma.'));
      el.src = objectUrl;
    });

    const escala = Math.min(1, maxW / (img.naturalWidth || maxW));
    const w = Math.max(1, Math.round((img.naturalWidth || 600) * escala));
    const h = Math.max(1, Math.round((img.naturalHeight || 250) * escala));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('El navegador no permite procesar imágenes.');

    ctx.drawImage(img, 0, 0, w, h);
    return recortarYLimpiarCanvas(canvas, ctx);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
