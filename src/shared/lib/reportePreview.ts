import type { jsPDF as JsPDFType } from 'jspdf';
import type { WorkBook } from 'xlsx-js-style';

/**
 * Vista previa de reportes antes de descargar.
 *
 * Los generadores de reportes (PDF/Excel) son funciones planas (no componentes
 * React), así que el overlay se arma con DOM vanilla y se inyecta en el body.
 * El usuario ve el reporte y SOLO descarga si quiere (botón ⬇ Descargar).
 *
 *  · `previewPdf(doc, filename)`   → reemplaza `doc.save(filename)`
 *  · `previewExcel(wb, filename)`  → reemplaza `XLSX.writeFile(wb, filename)`
 *
 * Las vistas de PDF y de archivos (PDF/imagen) traen además 🖨 Imprimir, que abre
 * el diálogo de impresión del navegador con el documento, sin descargarlo.
 */

interface OverlayUI {
  body: HTMLDivElement;
  btnDl: HTMLButtonElement;
  /** Oculto por defecto: cada visor lo muestra si sabe imprimir su contenido. */
  btnPrint: HTMLButtonElement;
  onClose: (fn: () => void) => void;
}

function buildOverlay(filename: string): OverlayUI {
  const root = document.createElement('div');
  root.style.cssText =
    'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.85);display:flex;flex-direction:column;';

  const bar = document.createElement('div');
  // flex-wrap: en un teléfono los botones no caben en una fila y «Cerrar» quedaba
  // fuera de la pantalla; ahora pasan a la fila de abajo.
  bar.style.cssText =
    'display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;padding:.6rem .9rem;background:#1c2128;border-bottom:1px solid #30363d;';

  const title = document.createElement('div');
  title.style.cssText = 'margin-right:auto;color:#e6edf3;font:600 .95rem system-ui;display:flex;gap:.5rem;align-items:center;min-width:0;flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  title.textContent = `Vista previa · ${filename}`;

  const btnDl = document.createElement('button');
  btnDl.type = 'button';
  btnDl.textContent = '⬇ Descargar';
  btnDl.style.cssText =
    'background:#ff8a00;color:#111;border:0;border-radius:6px;padding:.5rem .9rem;font:600 .9rem system-ui;cursor:pointer;';

  const btnPrint = document.createElement('button');
  btnPrint.type = 'button';
  btnPrint.textContent = '🖨 Imprimir';
  btnPrint.title = 'Imprimir';
  btnPrint.style.cssText =
    'display:none;background:transparent;color:#e6edf3;border:1px solid #30363d;border-radius:6px;padding:.5rem .9rem;font:600 .9rem system-ui;cursor:pointer;';

  const btnClose = document.createElement('button');
  btnClose.type = 'button';
  btnClose.textContent = '✕ Cerrar';
  btnClose.style.cssText =
    'background:transparent;color:#e6edf3;border:1px solid #ff8a00;border-radius:6px;padding:.5rem .9rem;font:600 .9rem system-ui;cursor:pointer;flex:0 0 auto;';

  const body = document.createElement('div');
  body.style.cssText = 'flex:1;overflow:auto;background:#0d1117;';

  bar.append(title, btnPrint, btnDl, btnClose);
  root.append(bar, body);
  document.body.appendChild(root);

  const closers: Array<() => void> = [() => root.remove()];
  const close = () => closers.forEach((fn) => { try { fn(); } catch { /* noop */ } });
  btnClose.onclick = close;
  // Cerrar con Escape mientras la preview esté abierta.
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  closers.push(() => document.removeEventListener('keydown', onKey));

  return { body, btnDl, btnPrint, onClose: (fn) => closers.push(fn) };
}

/**
 * Imprime un documento del MISMO origen (URL de un blob) desde un iframe oculto.
 * Si el navegador no deja imprimir el iframe, lo abre en una pestaña para imprimir desde ahí.
 */
function imprimirUrlLocal(url: string, ui: OverlayUI): void {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };
  frame.src = url;
  document.body.appendChild(frame);
  ui.onClose(() => frame.remove());
}

/** Página mínima con la imagen a hoja completa, para imprimirla sin la interfaz. */
function htmlImagen(src: string, titulo: string): string {
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(titulo)}</title>` +
    '<style>@page{margin:10mm}html,body{margin:0}img{display:block;max-width:100%;max-height:100vh;margin:0 auto;object-fit:contain}</style>' +
    `</head><body><img src="${esc(src)}"></body></html>`;
}

/** Muestra el PDF (jsPDF) en un visor embebido; descarga solo si el usuario lo pide. */
export function previewPdf(doc: JsPDFType, filename: string): void {
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const ui = buildOverlay(filename);
  const iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.title = filename;
  iframe.style.cssText = 'width:100%;height:100%;border:0;background:#fff;';
  ui.body.appendChild(iframe);
  ui.btnDl.onclick = () => doc.save(filename);
  ui.btnPrint.style.display = '';
  ui.btnPrint.onclick = () => imprimirUrlLocal(url, ui);
  ui.onClose(() => URL.revokeObjectURL(url));
}

/**
 * Vista previa de un ARCHIVO ya subido (factura, comprobante, oferta…) a partir de
 * su URL firmada. Lo muestra DENTRO del sistema (overlay), no en una pestaña nueva:
 *  · PDF / imagen → visor embebido (iframe).
 *  · botón ⬇ Descargar (baja el archivo), 🖨 Imprimir y ↗ Abrir en pestaña (fallback).
 * Reemplaza a `window.open(url, '_blank')`.
 */
export function previewArchivo(url: string, filename = 'archivo'): void {
  const ui = buildOverlay(filename);
  const esImagen = /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(url) || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(filename);
  if (esImagen) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:1rem;overflow:auto;';
    const img = document.createElement('img');
    img.src = url;
    img.alt = filename;
    img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;background:#fff;';
    wrap.appendChild(img);
    ui.body.appendChild(wrap);
  } else {
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.title = filename;
    iframe.style.cssText = 'width:100%;height:100%;border:0;background:#fff;';
    ui.body.appendChild(iframe);
  }
  // ↗ Abrir en pestaña, junto al ⬇ Descargar (por si el visor embebido falla).
  const btnTab = document.createElement('a');
  btnTab.textContent = '↗ Abrir en pestaña';
  btnTab.href = url; btnTab.target = '_blank'; btnTab.rel = 'noopener noreferrer';
  btnTab.style.cssText = 'text-decoration:none;background:transparent;color:#e6edf3;border:1px solid #30363d;border-radius:6px;padding:.5rem .9rem;font:600 .9rem system-ui;cursor:pointer;';
  ui.btnDl.insertAdjacentElement('beforebegin', btnTab);
  // 🖨 Imprimir: la URL firmada es de otro origen y su iframe no se deja imprimir,
  // así que se baja el archivo y se imprime la copia local (blob). Una imagen va
  // dentro de una página mínima, para que salga sola en la hoja.
  ui.btnPrint.style.display = '';
  ui.btnPrint.onclick = async () => {
    const texto = ui.btnPrint.textContent;
    ui.btnPrint.disabled = true;
    ui.btnPrint.textContent = '🖨 Preparando…';
    try {
      const bajado = await (await fetch(url)).blob();
      const imagen = esImagen || bajado.type.startsWith('image/');
      // Storage a veces lo sirve como octet-stream: así el iframe lo descargaría en vez de mostrarlo.
      const blob = imagen || bajado.type === 'application/pdf' ? bajado : new Blob([bajado], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      ui.onClose(() => URL.revokeObjectURL(blobUrl));
      if (imagen) {
        const pagina = URL.createObjectURL(new Blob([htmlImagen(blobUrl, filename)], { type: 'text/html' }));
        ui.onClose(() => URL.revokeObjectURL(pagina));
        imprimirUrlLocal(pagina, ui);
      } else {
        imprimirUrlLocal(blobUrl, ui);
      }
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      ui.btnPrint.disabled = false;
      ui.btnPrint.textContent = texto;
    }
  };
  // ⬇ Descargar: baja el blob para forzar la descarga con el nombre correcto.
  ui.btnDl.onclick = async () => {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };
}

/** Muestra una vista previa (primera hoja como tabla) del Excel; descarga solo si el usuario lo pide. */
export async function previewExcel(wbInput: WorkBook | unknown, filename: string): Promise<void> {
  // Los generadores castean su instancia de xlsx-js-style a un tipo local, por lo que
  // el `wb` llega como `unknown`; acá lo normalizamos a WorkBook (mismo objeto real).
  const wb = wbInput as WorkBook;
  const XLSX = await import('xlsx-js-style');
  const ui = buildOverlay(filename);
  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:1rem;background:#fff;color:#111;overflow:auto;';
  const primera = wb.SheetNames[0];
  const otras = wb.SheetNames.length > 1 ? ` (+${wb.SheetNames.length - 1} hoja(s) más en el archivo)` : '';
  const html = primera ? XLSX.utils.sheet_to_html(wb.Sheets[primera]) : '<p>(vacío)</p>';
  wrap.innerHTML =
    `<div style="font:600 .9rem system-ui;margin-bottom:.6rem;color:#444">Hoja: ${primera ?? '—'}${otras}</div>` + html;
  // Bordes legibles para la tabla generada por XLSX.
  wrap.querySelectorAll('table').forEach((t) => {
    (t as HTMLTableElement).style.cssText = 'border-collapse:collapse;font:.82rem system-ui;width:100%;';
    t.querySelectorAll('td,th').forEach((c) => {
      (c as HTMLElement).style.cssText = 'border:1px solid #ccc;padding:.25rem .5rem;';
    });
  });
  ui.body.appendChild(wrap);
  ui.btnDl.onclick = () => XLSX.writeFile(wb, filename);
}
