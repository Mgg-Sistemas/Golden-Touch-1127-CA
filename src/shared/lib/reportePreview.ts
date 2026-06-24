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
 */

interface OverlayUI {
  body: HTMLDivElement;
  btnDl: HTMLButtonElement;
  onClose: (fn: () => void) => void;
}

function buildOverlay(filename: string): OverlayUI {
  const root = document.createElement('div');
  root.style.cssText =
    'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.85);display:flex;flex-direction:column;';

  const bar = document.createElement('div');
  bar.style.cssText =
    'display:flex;gap:.5rem;align-items:center;padding:.6rem .9rem;background:#1c2128;border-bottom:1px solid #30363d;';

  const title = document.createElement('div');
  title.style.cssText = 'margin-right:auto;color:#e6edf3;font:600 .95rem system-ui;display:flex;gap:.5rem;align-items:center;';
  title.textContent = `Vista previa · ${filename}`;

  const btnDl = document.createElement('button');
  btnDl.type = 'button';
  btnDl.textContent = '⬇ Descargar';
  btnDl.style.cssText =
    'background:#ff8a00;color:#111;border:0;border-radius:6px;padding:.5rem .9rem;font:600 .9rem system-ui;cursor:pointer;';

  const btnClose = document.createElement('button');
  btnClose.type = 'button';
  btnClose.textContent = '✕ Cerrar';
  btnClose.style.cssText =
    'background:transparent;color:#e6edf3;border:1px solid #30363d;border-radius:6px;padding:.5rem .9rem;font:600 .9rem system-ui;cursor:pointer;';

  const body = document.createElement('div');
  body.style.cssText = 'flex:1;overflow:auto;background:#0d1117;';

  bar.append(title, btnDl, btnClose);
  root.append(bar, body);
  document.body.appendChild(root);

  const closers: Array<() => void> = [() => root.remove()];
  const close = () => closers.forEach((fn) => { try { fn(); } catch { /* noop */ } });
  btnClose.onclick = close;
  // Cerrar con Escape mientras la preview esté abierta.
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  closers.push(() => document.removeEventListener('keydown', onKey));

  return { body, btnDl, onClose: (fn) => closers.push(fn) };
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
  ui.onClose(() => URL.revokeObjectURL(url));
}

/**
 * Vista previa de un ARCHIVO ya subido (factura, comprobante, oferta…) a partir de
 * su URL firmada. Lo muestra DENTRO del sistema (overlay), no en una pestaña nueva:
 *  · PDF / imagen → visor embebido (iframe).
 *  · botón ⬇ Descargar (baja el archivo) y ↗ Abrir en pestaña (fallback).
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
