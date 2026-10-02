import { describe, expect, it } from 'vitest';
import {
  MAX_BYTES_IMAGEN, MAX_BYTES_ORIGINAL_IMAGEN, errorArchivoImagen,
  errorImagenSubible, rutaImagen,
} from './informeImagenes.repository';

function archivo(nombre: string, tipo: string, bytes: number): File {
  const f = new File([new Uint8Array(1)], nombre, { type: tipo });
  Object.defineProperty(f, 'size', { value: bytes });
  return f;
}

describe('errorArchivoImagen', () => {
  it('acepta JPG, PNG y WEBP', () => {
    expect(errorArchivoImagen(archivo('a.jpg', 'image/jpeg', 10))).toBeNull();
    expect(errorArchivoImagen(archivo('a.png', 'image/png', 10))).toBeNull();
    expect(errorArchivoImagen(archivo('a.webp', 'image/webp', 10))).toBeNull();
  });
  it('rechaza el PDF: una imagen se dibuja, un PDF no', () => {
    expect(errorArchivoImagen(archivo('a.pdf', 'application/pdf', 10))).toMatch(/JPG|PNG|WEBP/i);
  });
  it('rechaza un archivo de 0 bytes', () => {
    expect(errorArchivoImagen(archivo('a.jpg', 'image/jpeg', 0))).toMatch(/vac/i);
  });
  it('acepta un original de 12 MB: el límite de 10 se mide después de comprimir', () => {
    expect(errorArchivoImagen(archivo('a.jpg', 'image/jpeg', 12 * 1024 * 1024))).toBeNull();
  });
  it('rechaza por encima del tope previo, con su propio mensaje', () => {
    const e = errorArchivoImagen(archivo('a.jpg', 'image/jpeg', MAX_BYTES_ORIGINAL_IMAGEN + 1));
    expect(e).toBeTruthy();
    expect(e).not.toMatch(/10 MB/);
  });
});

describe('errorImagenSubible', () => {
  it('rechaza lo que pase de 10 MB ya comprimido', () => {
    expect(errorImagenSubible(archivo('a.jpg', 'image/jpeg', MAX_BYTES_IMAGEN + 1))).toBeTruthy();
  });
  it('acepta justo el máximo', () => {
    expect(errorImagenSubible(archivo('a.jpg', 'image/jpeg', MAX_BYTES_IMAGEN))).toBeNull();
  });
  it('rechaza 0 bytes', () => {
    expect(errorImagenSubible(archivo('a.jpg', 'image/jpeg', 0))).toBeTruthy();
  });
});

describe('rutaImagen', () => {
  it('la extensión sale del tipo, nunca del nombre del archivo', () => {
    expect(rutaImagen('inf1', 'image/jpeg', 'u1')).toBe('inf1/u1.jpg');
    expect(rutaImagen('inf1', 'image/png', 'u1')).toBe('inf1/u1.png');
    expect(rutaImagen('inf1', 'image/webp', 'u1')).toBe('inf1/u1.webp');
  });
  it('un tipo desconocido cae a bin, no revienta', () => {
    expect(rutaImagen('inf1', 'application/zip', 'u1')).toBe('inf1/u1.bin');
    expect(rutaImagen('inf1', '', 'u1')).toBe('inf1/u1.bin');
  });
  it('la ruta tiene una sola barra y respeta el id del informe', () => {
    const r = rutaImagen('abc-123', 'image/png', 'u9');
    expect(r.split('/')).toHaveLength(2);
    expect(r.startsWith('abc-123/')).toBe(true);
  });
});
