import { describe, expect, it } from 'vitest';
import {
  BYTES_MAXIMOS_FOTO_DELIVERY, mimeFotoDelivery, necesitaConversionFotoDelivery, superaLimiteFotoDelivery,
} from './fotoDelivery';

describe('Delivery · fotos compatibles con el bucket', () => {
  it('respeta los MIME que acepta storage', () => {
    for (const mime of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']) {
      expect(mimeFotoDelivery(mime)).toBe(mime);
      expect(necesitaConversionFotoDelivery({ type: mime })).toBe(false);
    }
    expect(mimeFotoDelivery('IMAGE/JPEG')).toBe('image/jpeg');
    expect(mimeFotoDelivery('image/jpeg; charset=binary')).toBe('image/jpeg');
  });

  it('convierte a JPEG lo que storage rechazaría con 415', () => {
    for (const mime of ['image/gif', 'image/bmp', 'application/octet-stream', '', null, undefined]) {
      expect(mimeFotoDelivery(mime)).toBe('image/jpeg');
      expect(necesitaConversionFotoDelivery({ type: mime ?? '' })).toBe(true);
    }
  });

  it('detecta fotos por encima del límite de 10 MB (storage responde 413)', () => {
    expect(BYTES_MAXIMOS_FOTO_DELIVERY).toBe(10 * 1024 * 1024);
    expect(superaLimiteFotoDelivery(10 * 1024 * 1024)).toBe(false);
    expect(superaLimiteFotoDelivery(10 * 1024 * 1024 + 1)).toBe(true);
  });
});
