let cachedDataUrl: string | null = null;
let cachedFirmaDataUrl: string | null | undefined; // undefined = aún no intentado; null = no existe

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
