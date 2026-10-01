import { describe, expect, it } from 'vitest';
import { errorArchivoAdjunto, MAX_BYTES_ADJUNTO } from './minutaAdjuntos.repository';

function archivo(nombre: string, tipo: string, bytes: number): File {
  return new File([new Uint8Array(Math.min(bytes, 1024))], nombre, { type: tipo });
  // El tamaño real se simula con Object.defineProperty abajo cuando hace falta.
}
function conTamano(f: File, bytes: number): File {
  Object.defineProperty(f, 'size', { value: bytes });
  return f;
}

describe('errorArchivoAdjunto', () => {
  it('acepta JPG, PNG, WEBP y PDF', () => {
    expect(errorArchivoAdjunto(archivo('a.jpg', 'image/jpeg', 10))).toBeNull();
    expect(errorArchivoAdjunto(archivo('a.png', 'image/png', 10))).toBeNull();
    expect(errorArchivoAdjunto(archivo('a.webp', 'image/webp', 10))).toBeNull();
    expect(errorArchivoAdjunto(archivo('a.pdf', 'application/pdf', 10))).toBeNull();
  });
  it('rechaza lo que no sea imagen ni PDF, diciendo qué se acepta', () => {
    const e = errorArchivoAdjunto(archivo('a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 10));
    expect(e).toMatch(/JPG|PNG|WEBP|PDF/i);
  });
  it('rechaza lo que pase del máximo, diciendo cuánto pesa', () => {
    const grande = conTamano(archivo('a.jpg', 'image/jpeg', 10), MAX_BYTES_ADJUNTO + 1);
    expect(errorArchivoAdjunto(grande)).toMatch(/10 MB/);
  });
  it('acepta un archivo justo en el máximo', () => {
    const justo = conTamano(archivo('a.jpg', 'image/jpeg', 10), MAX_BYTES_ADJUNTO);
    expect(errorArchivoAdjunto(justo)).toBeNull();
  });
  it('rechaza un archivo vacío (0 bytes), aunque el tipo sea válido', () => {
    const e = errorArchivoAdjunto(archivo('a.pdf', 'application/pdf', 0));
    expect(e).not.toBeNull();
    expect(e).toMatch(/vac/i);
  });
  it('un tipo inválido se reporta como tipo aunque además esté vacío', () => {
    const e = errorArchivoAdjunto(archivo('a.docx', 'application/msword', 0));
    expect(e).toMatch(/JPG|PNG|WEBP|PDF/i);
  });
});
