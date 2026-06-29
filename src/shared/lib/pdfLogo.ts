let cachedDataUrl: string | null = null;
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
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      cachedFirma2 = { dataUrl: canvas.toDataURL('image/jpeg', 0.92), w, h };
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
