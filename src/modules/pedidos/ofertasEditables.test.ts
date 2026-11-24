import { describe, expect, it } from 'vitest';
import { esOfertaEditable } from './ofertasEditables';

describe('edición de cotizaciones desde la comparativa', () => {
  it('corrige tanto la pendiente como la descartada', () => {
    expect(esOfertaEditable('pendiente')).toBe(true);
    expect(esOfertaEditable('descartada')).toBe(true);
  });

  it('no toca la aceptada (ya generó la OC)', () => {
    expect(esOfertaEditable('aceptada')).toBe(false);
  });

  it('estados vacíos o desconocidos no son editables', () => {
    for (const estado of [null, undefined, '', 'otro', 'PENDIENTE']) {
      expect(esOfertaEditable(estado), String(estado)).toBe(false);
    }
  });
});
