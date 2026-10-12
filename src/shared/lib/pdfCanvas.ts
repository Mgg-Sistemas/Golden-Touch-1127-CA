/**
 * Vista previa de PDF en teléfonos (12/10/2026).
 *
 * Chrome en Android no muestra un PDF dentro de un iframe (la vista previa quedaba
 * en blanco): ahí las páginas se dibujan en <canvas> con pdf.js. pdf.js se carga
 * solo cuando hace falta, así el escritorio no baja nada de más.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';

/** true si el navegador no tiene visor de PDF propio (Chrome en Android, entre otros). */
export function navegadorSinVisorPdf(): boolean {
  const nav = navigator as Navigator & { pdfViewerEnabled?: boolean };
  return nav.pdfViewerEnabled === false || /Android/i.test(nav.userAgent);
}

let workerListo = false;

async function cargarPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  if (!workerListo) {
    // Como worker de Vite (sale como .js): el .mjs suelto podría servirse con un tipo MIME
    // que el navegador rechaza para un worker.
    const { default: PdfWorker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?worker');
    pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
    workerListo = true;
  }
  return pdfjs;
}

/**
 * Dibuja todas las páginas del PDF en `cont`, una debajo de otra, al ancho de la pantalla.
 * `alCerrar` registra la limpieza: si se cierra la vista previa a mitad, deja de dibujar y suelta el documento.
 */
export async function dibujarPdfEnCanvas(datos: ArrayBuffer, cont: HTMLElement, alCerrar: (fn: () => void) => void): Promise<void> {
  const aviso = document.createElement('div');
  aviso.textContent = 'Cargando vista previa…';
  aviso.style.cssText = 'color:#e6edf3;font:600 .9rem system-ui;text-align:center;padding:1.5rem 1rem;';
  cont.appendChild(aviso);

  let pdf: PDFDocumentProxy | null = null;
  let cerrado = false;
  alCerrar(() => { cerrado = true; void pdf?.destroy(); });
  try {
    const pdfjs = await cargarPdfjs();
    pdf = await pdfjs.getDocument({ data: new Uint8Array(datos) }).promise;
    if (cerrado) { void pdf.destroy(); return; }
    aviso.remove();
    const ancho = Math.max(240, Math.min((cont.clientWidth || window.innerWidth) - 16, 1000));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (let n = 1; n <= pdf.numPages && !cerrado; n++) {
      const pagina = await pdf.getPage(n);
      const base = pagina.getViewport({ scale: 1 });
      const vista = pagina.getViewport({ scale: (ancho / base.width) * dpr });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(vista.width);
      canvas.height = Math.floor(vista.height);
      canvas.setAttribute('aria-label', `Página ${n} de ${pdf.numPages}`);
      canvas.style.cssText = `display:block;width:${ancho}px;max-width:100%;height:auto;margin:8px auto;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.5);`;
      cont.appendChild(canvas);
      const ctx = canvas.getContext('2d');
      if (!ctx) break;
      await pagina.render({ canvasContext: ctx, viewport: vista }).promise;
    }
  } catch {
    if (cerrado) return;
    aviso.textContent = 'No se pudo mostrar la vista previa en este teléfono. Usa «⬇ Descargar» para verlo.';
  }
}
