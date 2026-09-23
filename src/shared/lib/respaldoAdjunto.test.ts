import { describe, expect, it } from 'vitest';
import {
  TOPE_ADJUNTO_BYTES,
  avisoSiNoEntraEnCorreo,
  enMegas,
  nombreSqlRespaldo,
  nombreZipRespaldo,
  tamanoEnBase64,
} from './respaldoAdjunto';

describe('tamanoEnBase64', () => {
  it('base64 agranda un tercio', () => {
    expect(tamanoEnBase64(3)).toBe(4);
    expect(tamanoEnBase64(3000)).toBe(4000);
  });
  it('redondea hacia arriba, de a bloques de 4', () => {
    expect(tamanoEnBase64(1)).toBe(4);
    expect(tamanoEnBase64(4)).toBe(8);
  });
  it('nada pesa nada', () => {
    expect(tamanoEnBase64(0)).toBe(0);
  });
  it('reproduce el caso real que dio 413', () => {
    // 15.457.166 caracteres de volcado, enviados sin comprimir: 19,7 MB en
    // base64, más del doble de lo que admite un correo.
    expect(enMegas(tamanoEnBase64(15_457_166))).toBe('19.7 MB');
    expect(tamanoEnBase64(15_457_166)).toBeGreaterThan(2 * TOPE_ADJUNTO_BYTES);
  });
});

describe('nombres del adjunto', () => {
  it('el .sql de adentro lleva la fecha', () => {
    expect(nombreSqlRespaldo('2026-09-23', false)).toBe('gt-respaldo-2026-09-23.sql');
  });
  it('el automático se distingue del manual', () => {
    expect(nombreSqlRespaldo('2026-09-23', true)).toBe('gt-respaldo-auto-2026-09-23.sql');
    expect(nombreZipRespaldo('2026-09-23', true)).toBe('gt-respaldo-auto-2026-09-23.zip');
  });
  it('el adjunto es .zip, que es lo que Brevo acepta', () => {
    expect(nombreZipRespaldo('2026-09-23', false)).toMatch(/\.zip$/);
  });
});

describe('avisoSiNoEntraEnCorreo', () => {
  it('un respaldo chico pasa sin decir nada', () => {
    expect(avisoSiNoEntraEnCorreo(1024 * 1024)).toBeNull();
  });

  it('justo en el tope todavía entra', () => {
    // El mayor tamaño crudo cuyo base64 no supera el tope.
    const crudo = Math.floor((TOPE_ADJUNTO_BYTES / 4) * 3);
    expect(tamanoEnBase64(crudo)).toBeLessThanOrEqual(TOPE_ADJUNTO_BYTES);
    expect(avisoSiNoEntraEnCorreo(crudo)).toBeNull();
  });

  it('pasado el tope avisa, con el tamaño real', () => {
    const aviso = avisoSiNoEntraEnCorreo(20 * 1024 * 1024);
    expect(aviso).toMatch(/26\.7 MB/);
    expect(aviso).toMatch(/9\.0 MB/);
  });

  it('pasado el tope dice qué hacer, no solo que falló', () => {
    const aviso = avisoSiNoEntraEnCorreo(20 * 1024 * 1024) ?? '';
    expect(aviso).toMatch(/Descargar/);
    expect(aviso).toMatch(/Avisá/);
  });

  it('el volcado real de 15 MB SIN comprimir no habría entrado', () => {
    expect(avisoSiNoEntraEnCorreo(15_457_166)).not.toBeNull();
  });

  it('el mismo volcado comprimido ~10 veces sí entra', () => {
    expect(avisoSiNoEntraEnCorreo(Math.round(15_457_166 / 10))).toBeNull();
  });
});

describe('enMegas', () => {
  it('redondea a un decimal', () => {
    expect(enMegas(1024 * 1024)).toBe('1.0 MB');
    expect(enMegas(1536 * 1024)).toBe('1.5 MB');
  });
});
