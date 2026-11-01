import { describe, it, expect } from 'vitest';
import { esOrdenPropia, soloOrdenesPropias } from './visibilidadSolicitudes';

// Datos inventados.
const YO = 'maria.perez@goldentouch.com';

describe('esOrdenPropia', () => {
  it('es mía si soy el solicitante (sin distinguir mayúsculas ni espacios)', () => {
    expect(esOrdenPropia({ solicitante_email: YO }, YO)).toBe(true);
    expect(esOrdenPropia({ solicitante_email: 'Maria.Perez@GoldenTouch.com ' }, YO)).toBe(true);
    expect(esOrdenPropia({ solicitante_email: YO }, '  MARIA.PEREZ@goldentouch.com')).toBe(true);
  });

  it('respaldo: el evento «creada» del historial lo hice yo', () => {
    expect(esOrdenPropia({
      solicitante_email: 'otro@goldentouch.com',
      historial: [{ at: '2026-10-31T10:00:00Z', evento: 'creada', actor: 'MARIA.PEREZ@goldentouch.com' }],
    }, YO)).toBe(true);
  });

  it('no es mía si otro la creó, aunque yo aparezca en otros eventos', () => {
    expect(esOrdenPropia({
      solicitante_email: 'otro@goldentouch.com',
      historial: [
        { at: '2026-10-31T10:00:00Z', evento: 'creada', actor: 'otro@goldentouch.com' },
        { at: '2026-10-31T11:00:00Z', evento: 'aprobada', actor: YO },
      ],
    }, YO)).toBe(false);
  });

  it('sin mi correo nunca muestra nada', () => {
    expect(esOrdenPropia({ solicitante_email: '' }, '')).toBe(false);
    expect(esOrdenPropia({ solicitante_email: YO }, null)).toBe(false);
    expect(esOrdenPropia({ solicitante_email: null, historial: null }, undefined)).toBe(false);
  });

  it('historial vacío o raro no rompe', () => {
    expect(esOrdenPropia({ solicitante_email: 'otro@x.com', historial: [] }, YO)).toBe(false);
    expect(esOrdenPropia({ solicitante_email: 'otro@x.com', historial: null }, YO)).toBe(false);
  });
});

describe('soloOrdenesPropias', () => {
  it('deja solo las que creé', () => {
    const ordenes = [
      { id: '1', solicitante_email: YO },
      { id: '2', solicitante_email: 'otro@x.com' },
      { id: '3', solicitante_email: 'otro@x.com', historial: [{ at: '', evento: 'creada', actor: YO }] },
    ];
    expect(soloOrdenesPropias(ordenes, YO).map((o) => o.id)).toEqual(['1', '3']);
  });
});
