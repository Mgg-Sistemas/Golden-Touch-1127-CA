import { describe, expect, it } from 'vitest';
import { limpiarPixelesFirma } from './limpiarFirma';

describe('limpiarPixelesFirma · eliminación de fondo y recorte de firma', () => {
  it('elimina el fondo de papel gris o con sombras y preserva el trazo de tinta', () => {
    const w = 120, h = 60;
    const d = new Uint8ClampedArray(w * h * 4);

    // Fondo simulado de foto con luz tenue (papel ~175 con leve gradiente)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const bg = Math.round(170 + (15 * x) / w);
        d[idx] = bg;
        d[idx + 1] = bg;
        d[idx + 2] = bg;
        d[idx + 3] = 255;
      }
    }

    // Trazo de firma simulado en el centro (tinta más oscura ~75)
    for (let x = 40; x <= 80; x++) {
      for (let y = 25; y <= 30; y++) {
        const idx = (y * w + x) * 4;
        d[idx] = 75;
        d[idx + 1] = 75;
        d[idx + 2] = 85;
        d[idx + 3] = 255;
      }
    }

    const bb = limpiarPixelesFirma(d, w, h);

    // El papel de fondo debe ser transparente (alfa = 0)
    const idxFondo = (10 * w + 10) * 4;
    expect(d[idxFondo + 3]).toBe(0);

    // La tinta debe ser opaca (alfa = 255) y más oscura que el original
    const idxTinta = (27 * w + 60) * 4;
    expect(d[idxTinta + 3]).toBe(255);
    expect(d[idxTinta]).toBeLessThanOrEqual(75);

    // La caja delimitadora debe contener el trazo
    expect(bb.inkCount).toBeGreaterThan(0);
    expect(bb.xMin).toBeLessThanOrEqual(40);
    expect(bb.xMax).toBeGreaterThanOrEqual(80);
    expect(bb.yMin).toBeLessThanOrEqual(25);
    expect(bb.yMax).toBeGreaterThanOrEqual(30);
  });

  it('suprime sombras y artefactos en el borde exterior del recorte de la foto', () => {
    const w = 80, h = 40;
    const d = new Uint8ClampedArray(w * h * 4);

    // Fondo claro 220
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 220; d[i + 1] = 220; d[i + 2] = 220; d[i + 3] = 255;
    }

    // Artefacto oscuro en el borde derecho (x = 79, x = 78) típico de sombra de tarjeta
    for (let y = 0; y < h; y++) {
      for (let x = w - 2; x < w; x++) {
        const idx = (y * w + x) * 4;
        d[idx] = 60; d[idx + 1] = 60; d[idx + 2] = 60; d[idx + 3] = 255;
      }
    }

    // Trazo en x = 30..40, y = 15..20
    for (let x = 30; x <= 40; x++) {
      for (let y = 15; y <= 20; y++) {
        const idx = (y * w + x) * 4;
        d[idx] = 50; d[idx + 1] = 50; d[idx + 2] = 50; d[idx + 3] = 255;
      }
    }

    const bb = limpiarPixelesFirma(d, w, h);

    // Los píxeles del borde derecho deben haber sido suprimidos (alfa = 0)
    const idxBorde = (20 * w + (w - 1)) * 4;
    expect(d[idxBorde + 3]).toBe(0);

    // La caja no debe estirarse hasta el borde derecho
    expect(bb.xMax).toBeLessThan(w - 2);
  });

  it('maneja imágenes que ya son transparentes (firma.png)', () => {
    const w = 50, h = 30;
    const d = new Uint8ClampedArray(w * h * 4);

    // Todo transparente por defecto
    for (let i = 0; i < d.length; i += 4) {
      d[i + 3] = 0;
    }

    // Trazo de tinta opaco en el centro
    for (let x = 20; x <= 30; x++) {
      for (let y = 10; y <= 15; y++) {
        const idx = (y * w + x) * 4;
        d[idx] = 20; d[idx + 1] = 20; d[idx + 2] = 20; d[idx + 3] = 255;
      }
    }

    const bb = limpiarPixelesFirma(d, w, h);
    expect(bb.inkCount).toBeGreaterThan(0);
    expect(bb.xMin).toBe(20);
    expect(bb.xMax).toBe(30);
    expect(bb.yMin).toBe(10);
    expect(bb.yMax).toBe(15);
  });
});
