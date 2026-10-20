import { beforeEach, describe, expect, it, vi } from 'vitest';

const orden: string[] = [];
let respuestaFila: { data: unknown; error: unknown } = { data: [{ id: 'a-1' }], error: null };
const remove = vi.fn(async () => { orden.push('archivo'); return { data: null, error: null }; });

function consulta(tabla: string) {
  const q: Record<string, unknown> = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => { orden.push(`fila:${tabla}`); return Promise.resolve(respuestaFila).then(ok, ko); };
      return () => q;
    },
  });
  return q;
}

vi.mock('@/shared/lib/supabase', () => ({
  supabase: { from: (t: string) => consulta(t), storage: { from: () => ({ remove }) } },
}));

import { eliminarAdjuntoDirecto, type AdjuntoDirecto } from './adjuntosDirectos.repository';

// Datos inventados.
const adjunto: AdjuntoDirecto = { id: 'a-1', modulo: 'compra', ref_id: 'c-1', path: 'c-1/abc-factura.pdf', nombre: 'factura.pdf', content_type: 'application/pdf', created_at: '2026-10-20T00:00:00Z', created_by: null };

beforeEach(() => { orden.length = 0; remove.mockClear(); respuestaFila = { data: [{ id: 'a-1' }], error: null }; });

describe('eliminar una factura de compra o servicio directo', () => {
  it('primero el registro, después el archivo', async () => {
    await eliminarAdjuntoDirecto(adjunto);
    expect(orden).toEqual(['fila:adjuntos_directos', 'archivo']);
    expect(remove).toHaveBeenCalledWith(['c-1/abc-factura.pdf']);
  });

  it('si la base no deja borrar el registro, el archivo queda', async () => {
    respuestaFila = { data: null, error: { code: 'P0001', message: 'RET_ADJUNTO_REGISTRADO: esta factura ya está registrada en Retenciones' } };
    await expect(eliminarAdjuntoDirecto(adjunto)).rejects.toThrow('ya está registrada en Retenciones');
    expect(remove).not.toHaveBeenCalled();
  });

  it('sin filas borradas (sin permiso o ya no existe), el archivo queda', async () => {
    respuestaFila = { data: [], error: null };
    await expect(eliminarAdjuntoDirecto(adjunto)).rejects.toThrow('sin permiso');
    expect(remove).not.toHaveBeenCalled();
  });

  it('si falla borrar el archivo, el registro ya no está y no se reporta error', async () => {
    remove.mockImplementationOnce(async () => { throw new Error('red'); });
    await expect(eliminarAdjuntoDirecto(adjunto)).resolves.toBeUndefined();
  });
});
