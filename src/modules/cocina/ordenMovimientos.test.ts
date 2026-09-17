import { describe, it, expect } from 'vitest';
import { ordenarPorServicio, type CocinaMovimiento } from './cocina.repository';

/** Movimiento mínimo: solo importan la fecha del servicio y el tipo de comida. */
function mov(id: string, at: string, tipo: CocinaMovimiento['tipo_comida']): CocinaMovimiento {
  return {
    id, codigo: id.toUpperCase(), tipo_comida: tipo, platos: 1, items: [],
    valor_total: 0, at, created_at: at,
  };
}
const ids = (ms: CocinaMovimiento[]) => ordenarPorServicio(ms).map((m) => m.id);

describe('ordenarPorServicio · del más nuevo al más viejo', () => {
  it('pone primero el día más reciente, sin importar el orden de carga', () => {
    const movs = [
      mov('29', '2026-09-29T14:00:00.000Z', 'almuerzo'),
      mov('01', '2026-10-01T14:00:00.000Z', 'almuerzo'),
      mov('30', '2026-09-30T14:00:00.000Z', 'almuerzo'),
    ];
    expect(ids(movs)).toEqual(['01', '30', '29']);
  });

  it('dentro del mismo día baja de la cena al desayuno', () => {
    const movs = [
      mov('des', '2026-09-30T12:00:00.000Z', 'desayuno'),
      mov('cen', '2026-09-30T23:00:00.000Z', 'cena'),
      mov('alm', '2026-09-30T16:00:00.000Z', 'almuerzo'),
    ];
    expect(ids(movs)).toEqual(['cen', 'alm', 'des']);
  });

  it('a igual día y comida, primero el cargado más tarde', () => {
    const movs = [
      mov('temprano', '2026-09-30T13:00:00.000Z', 'almuerzo'),
      mov('tarde', '2026-09-30T17:00:00.000Z', 'almuerzo'),
    ];
    expect(ids(movs)).toEqual(['tarde', 'temprano']);
  });

  it('el día se lee en hora de Caracas: la cena de las 9 PM no salta al día siguiente', () => {
    // 2026-10-01T01:30Z = 30/09 9:30 PM en Caracas → mismo día que el desayuno del 30.
    const movs = [
      mov('des-01', '2026-10-01T12:00:00.000Z', 'desayuno'),
      mov('cena-30', '2026-10-01T01:30:00.000Z', 'cena'),
      mov('des-30', '2026-09-30T12:00:00.000Z', 'desayuno'),
    ];
    expect(ids(movs)).toEqual(['des-01', 'cena-30', 'des-30']);
  });

  it('no modifica el arreglo recibido', () => {
    const movs = [
      mov('a', '2026-09-29T14:00:00.000Z', 'almuerzo'),
      mov('b', '2026-09-30T14:00:00.000Z', 'almuerzo'),
    ];
    ordenarPorServicio(movs);
    expect(movs.map((m) => m.id)).toEqual(['a', 'b']);
  });
});
