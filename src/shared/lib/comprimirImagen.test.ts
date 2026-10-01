import { describe, expect, it, vi } from 'vitest';
import { comprimirImagen } from './comprimirImagen';

function archivo(nombre: string, tipo: string, bytes = 10): File {
  return new File([new Uint8Array(bytes)], nombre, { type: tipo });
}

describe('comprimirImagen', () => {
  it('un PDF se devuelve tal cual, sin tocar', async () => {
    const pdf = archivo('acta.pdf', 'application/pdf');
    await expect(comprimirImagen(pdf)).resolves.toBe(pdf);
  });

  it('si el navegador no puede procesar la imagen, devuelve el original en vez de fallar', async () => {
    // En Node no hay canvas ni createImageBitmap: es exactamente el caso
    // «modo privado / navegador que bloquea canvas». No debe lanzar.
    const jpg = archivo('foto.jpg', 'image/jpeg');
    await expect(comprimirImagen(jpg)).resolves.toBe(jpg);
  });

  it('un WEBP se reexporta siempre a JPEG, aunque sea chico y el JPEG no achique', async () => {
    vi.stubGlobal('createImageBitmap', async () => ({ width: 100, height: 100, close: () => {} }));
    const ctx = { drawImage: () => {} };
    const canvas = {
      width: 0, height: 0, getContext: () => ctx,
      // El JPEG pesa MAS que el original: con otro formato se devolveria el original.
      toBlob: (cb: (b: Blob | null) => void) => cb(new Blob([new Uint8Array(500)], { type: 'image/jpeg' })),
    };
    vi.stubGlobal('document', { createElement: () => canvas });
    try {
      const webp = archivo('foto.webp', 'image/webp', 50);
      const r = await comprimirImagen(webp);
      expect(r.type).toBe('image/jpeg');
      expect(r.name).toBe('foto.jpg');
      // Un JPEG chico, en cambio, se devuelve tal cual.
      const jpg = archivo('foto.jpg', 'image/jpeg', 50);
      await expect(comprimirImagen(jpg)).resolves.toBe(jpg);
    } finally { vi.unstubAllGlobals(); }
  });

  it('un archivo que no es imagen ni PDF también pasa sin tocar', async () => {
    const txt = archivo('nota.txt', 'text/plain');
    await expect(comprimirImagen(txt)).resolves.toBe(txt);
  });
});
