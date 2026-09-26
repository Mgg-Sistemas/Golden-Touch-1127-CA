import { describe, it, expect } from 'vitest';
import { convieneAchicar, medidasAchicadas, nombreJpg, UMBRAL_BYTES } from './comprimirImagen';

describe('convieneAchicar', () => {
  it('solo fotos pesadas', () => {
    expect(convieneAchicar('image/jpeg', 5 * 1024 * 1024)).toBe(true);
    expect(convieneAchicar('image/png', UMBRAL_BYTES + 1)).toBe(true);
    expect(convieneAchicar('image/jpeg', UMBRAL_BYTES)).toBe(false);
  });
  it('ni PDF, ni GIF, ni SVG', () => {
    expect(convieneAchicar('application/pdf', 9_000_000)).toBe(false);
    expect(convieneAchicar('image/gif', 9_000_000)).toBe(false);
    expect(convieneAchicar('image/svg+xml', 9_000_000)).toBe(false);
  });
});

describe('medidasAchicadas', () => {
  it('reduce el lado mayor a 1600 manteniendo la proporción', () => {
    expect(medidasAchicadas(4000, 3000)).toEqual({ ancho: 1600, alto: 1200 });
    expect(medidasAchicadas(3000, 4000)).toEqual({ ancho: 1200, alto: 1600 });
  });
  it('nunca agranda una foto chica', () => {
    expect(medidasAchicadas(800, 600)).toEqual({ ancho: 800, alto: 600 });
  });
});

describe('nombreJpg', () => {
  it('cambia la extensión', () => {
    expect(nombreJpg('IMG_0001.HEIC')).toBe('IMG_0001.jpg');
    expect(nombreJpg('Screenshot.png')).toBe('Screenshot.jpg');
    expect(nombreJpg('sinextension')).toBe('sinextension.jpg');
  });
});
