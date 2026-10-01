import { describe, expect, it } from 'vitest';
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

  it('un archivo que no es imagen ni PDF también pasa sin tocar', async () => {
    const txt = archivo('nota.txt', 'text/plain');
    await expect(comprimirImagen(txt)).resolves.toBe(txt);
  });
});
