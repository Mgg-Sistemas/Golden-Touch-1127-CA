let cachedDataUrl: string | null = null;

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
