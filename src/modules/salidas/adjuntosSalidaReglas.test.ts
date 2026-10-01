import { describe, expect, it } from 'vitest';
import {
  MAX_ADJUNTOS_SALIDA, TOPE_ADJUNTO_BYTES,
  cuposLibres, enMegas, errorArchivoAdjunto, errorCupo, esImagenAdjunto, esPdfAdjunto, nombreSeguroAdjunto,
} from './adjuntosSalidaReglas';

const archivo = (name: string, type: string, size = 1000) => ({ name, type, size });

describe('errorArchivoAdjunto · qué se puede subir', () => {
  it('acepta fotos y PDF', () => {
    expect(errorArchivoAdjunto(archivo('foto.jpg', 'image/jpeg'))).toBeNull();
    expect(errorArchivoAdjunto(archivo('guia.pdf', 'application/pdf'))).toBeNull();
    expect(errorArchivoAdjunto(archivo('IMG_0001.HEIC', 'image/heic'))).toBeNull();
  });

  it('si el navegador no dice el tipo, decide por la extensión', () => {
    expect(errorArchivoAdjunto(archivo('foto.PNG', ''))).toBeNull();
    expect(errorArchivoAdjunto(archivo('guia.pdf', ''))).toBeNull();
  });

  it('rechaza lo que no es foto ni PDF', () => {
    expect(errorArchivoAdjunto(archivo('video.mp4', 'video/mp4'))).toContain('no es una imagen ni un PDF');
    expect(errorArchivoAdjunto(archivo('planilla.xlsx', 'application/vnd.ms-excel'))).toContain('no es una imagen ni un PDF');
  });

  it('rechaza lo que pesa más de 10 MB, y dice cuánto pesa', () => {
    const e = errorArchivoAdjunto(archivo('foto.jpg', 'image/jpeg', TOPE_ADJUNTO_BYTES + 1));
    expect(e).toContain('10,0 MB');
    expect(errorArchivoAdjunto(archivo('foto.jpg', 'image/jpeg', TOPE_ADJUNTO_BYTES))).toBeNull();
  });

  it('rechaza un archivo vacío', () => {
    expect(errorArchivoAdjunto(archivo('foto.jpg', 'image/jpeg', 0))).toContain('vacío');
  });
});

describe('el tope de 4 por solicitud', () => {
  it('cuenta los cupos que quedan', () => {
    expect(cuposLibres(0)).toBe(MAX_ADJUNTOS_SALIDA);
    expect(cuposLibres(3)).toBe(1);
    expect(cuposLibres(4)).toBe(0);
    expect(cuposLibres(9)).toBe(0);
  });

  it('deja pasar lo que entra', () => {
    expect(errorCupo(0, 4)).toBeNull();
    expect(errorCupo(2, 2)).toBeNull();
  });

  it('avisa cuando ya está lleno', () => {
    expect(errorCupo(4, 1)).toContain('ya tiene 4 adjuntos');
  });

  it('avisa cuántos entran cuando se eligieron de más', () => {
    expect(errorCupo(3, 2)).toContain('entra 1 archivo más');
    expect(errorCupo(1, 5)).toContain('entran 3 archivos más');
  });
});

describe('esImagenAdjunto / esPdfAdjunto', () => {
  it('reconoce por tipo y por nombre', () => {
    expect(esImagenAdjunto('image/webp', null)).toBe(true);
    expect(esImagenAdjunto(null, 'x.jpeg')).toBe(true);
    expect(esImagenAdjunto('application/pdf', 'x.pdf')).toBe(false);
    expect(esPdfAdjunto(null, 'GUIA.PDF')).toBe(true);
    expect(esPdfAdjunto('image/png', 'x.png')).toBe(false);
  });
});

describe('nombreSeguroAdjunto · el nombre en el almacén', () => {
  it('saca espacios, acentos y símbolos', () => {
    expect(nombreSeguroAdjunto('Guía de despacho (1).pdf')).toBe('Guia_de_despacho_1_.pdf');
  });

  it('nunca queda vacío', () => {
    expect(nombreSeguroAdjunto('¿¿¿')).toBe('archivo');
  });
});

describe('enMegas', () => {
  it('escribe con coma, a un decimal', () => {
    expect(enMegas(2.35 * 1024 * 1024)).toBe('2,4 MB');
  });
});
