import { describe, expect, it } from 'vitest';
import type { EstadoSolicitudSalida, EventoHistorial, SolicitudSalida } from '@/shared/lib/types';
import {
  accionDe, actoresDeAccion, diaVE, filtrarHistorico, recortarColumna, TOPE_COLUMNA,
} from './historicoSolicitudes';

function sol(p: Partial<SolicitudSalida> & { codigo: string; estado: EstadoSolicitudSalida }): SolicitudSalida {
  return {
    id: p.codigo,
    scope: 'salida',
    tipo: 'material',
    solicitante: 'ISNER ORENCE',
    historial: [],
    created_at: '2026-09-01T12:00:00.000Z',
    ...p,
  } as SolicitudSalida;
}
const ev = (evento: string, actor: string, at: string, motivo?: string): EventoHistorial =>
  ({ evento, actor, at, ...(motivo ? { motivo } : null) });

describe('accionDe', () => {
  it('toma del historial el evento que explica el estado', () => {
    const s = sol({
      codigo: 'SAL-038', estado: 'ejecutada',
      historial: [
        ev('creada', 'obrero@gt.com', '2026-09-10T14:00:00.000Z'),
        ev('aprobada', 'jefe@gt.com', '2026-09-11T09:00:00.000Z'),
        ev('ejecutada', 'isner@gt.com', '2026-09-11T18:46:00.000Z'),
      ],
    });
    expect(accionDe(s)).toMatchObject({ evento: 'ejecutada', actor: 'isner@gt.com', at: '2026-09-11T18:46:00.000Z' });
  });

  it('ignora lo que pasó después de la acción (una nota editada no es quién ejecutó)', () => {
    const s = sol({
      codigo: 'SAL-037', estado: 'ejecutada',
      historial: [
        ev('ejecutada', 'isner@gt.com', '2026-09-11T18:26:00.000Z'),
        ev('nota_editada', 'otro@gt.com', '2026-09-12T08:00:00.000Z'),
      ],
    });
    expect(accionDe(s).actor).toBe('isner@gt.com');
  });

  it('si se aprobó dos veces, manda la última', () => {
    const s = sol({
      codigo: 'SAL-040', estado: 'aprobada',
      historial: [
        ev('aprobada', 'uno@gt.com', '2026-09-01T10:00:00.000Z'),
        ev('editada', 'uno@gt.com', '2026-09-02T10:00:00.000Z'),
        ev('aprobada', 'dos@gt.com', '2026-09-03T10:00:00.000Z'),
      ],
    });
    expect(accionDe(s).actor).toBe('dos@gt.com');
  });

  it('guarda el motivo de la cancelación', () => {
    const s = sol({
      codigo: 'SAL-041', estado: 'cancelada',
      historial: [ev('cancelada', 'ana@gt.com', '2026-09-21T17:49:00.000Z', 'Se pidió de más')],
    });
    expect(accionDe(s)).toMatchObject({ actor: 'ana@gt.com', motivo: 'Se pidió de más' });
  });

  it('solicitud vieja sin historial: cae a la columna ejecutada_por', () => {
    const s = sol({
      codigo: 'SAL-002', estado: 'ejecutada', historial: [],
      ejecutada_por: 'viejo@gt.com', ejecutada_en: '2026-07-21T17:38:00.000Z',
    });
    expect(accionDe(s)).toMatchObject({ actor: 'viejo@gt.com', at: '2026-07-21T17:38:00.000Z' });
  });

  it('sin nada: la acción es la creación, por el actor de la solicitud', () => {
    const s = sol({ codigo: 'SAL-003', estado: 'por_aprobar', actor: 'obrero@gt.com' });
    expect(accionDe(s)).toMatchObject({ evento: 'creada', actor: 'obrero@gt.com', at: '2026-09-01T12:00:00.000Z' });
  });
});

describe('diaVE', () => {
  it('las 21:00 de Caracas siguen siendo ese día, no el siguiente', () => {
    // 2026-09-21 21:00 en Caracas = 2026-09-22 01:00 UTC.
    expect(diaVE('2026-09-22T01:00:00.000Z')).toBe('2026-09-21');
  });
  it('vacío o basura no rompe', () => {
    expect(diaVE(null)).toBe('');
    expect(diaVE('no es fecha')).toBe('');
  });
});

describe('recortarColumna', () => {
  const n = (i: number) => `SAL-${i}`;
  it('con 10 o menos no oculta nada', () => {
    const r = recortarColumna(Array.from({ length: 10 }, (_, i) => n(i)));
    expect(r.visibles).toHaveLength(10);
    expect(r.ocultas).toBe(0);
  });
  it('con 51 muestra las 10 primeras y cuenta 41 en el histórico', () => {
    const r = recortarColumna(Array.from({ length: 51 }, (_, i) => n(i)));
    expect(r.visibles).toHaveLength(TOPE_COLUMNA);
    expect(r.visibles[0]).toBe('SAL-0');
    expect(r.ocultas).toBe(41);
  });
});

describe('filtrarHistorico', () => {
  const datos = [
    sol({
      codigo: 'SAL-038', estado: 'ejecutada', producto_nombre: 'ROLLO DE CABLE N12',
      historial: [ev('ejecutada', 'isner@gt.com', '2026-09-11T18:46:00.000Z')],
    }),
    sol({
      codigo: 'SAL-041', estado: 'cancelada', producto_nombre: 'ACEITE 15W 40',
      historial: [ev('cancelada', 'ana@gt.com', '2026-09-21T17:49:00.000Z')],
    }),
    sol({
      codigo: 'SAL-023', estado: 'ejecutada', producto_nombre: 'BOLSAS PLÁSTICAS',
      historial: [ev('ejecutada', 'ana@gt.com', '2026-09-02T19:14:00.000Z')],
    }),
  ];

  it('sin filtros devuelve todo, en el mismo orden', () => {
    expect(filtrarHistorico(datos, {}).map((s) => s.codigo)).toEqual(['SAL-038', 'SAL-041', 'SAL-023']);
  });
  it('por estado', () => {
    expect(filtrarHistorico(datos, { estado: 'cancelada' }).map((s) => s.codigo)).toEqual(['SAL-041']);
  });
  it('por quién hizo la acción', () => {
    expect(filtrarHistorico(datos, { actor: 'ANA@gt.com' }).map((s) => s.codigo)).toEqual(['SAL-041', 'SAL-023']);
  });
  it('por rango de días de la acción', () => {
    const r = filtrarHistorico(datos, { desde: '2026-09-10', hasta: '2026-09-21' });
    expect(r.map((s) => s.codigo)).toEqual(['SAL-038', 'SAL-041']);
  });
  it('el texto busca sin acentos y encuentra el material', () => {
    expect(filtrarHistorico(datos, { texto: 'plasticas' }).map((s) => s.codigo)).toEqual(['SAL-023']);
  });
  it('el texto también busca por código', () => {
    expect(filtrarHistorico(datos, { texto: 'sal-041' }).map((s) => s.codigo)).toEqual(['SAL-041']);
  });
  it('los filtros se suman', () => {
    expect(filtrarHistorico(datos, { actor: 'ana@gt.com', estado: 'ejecutada' }).map((s) => s.codigo)).toEqual(['SAL-023']);
  });
});

describe('actoresDeAccion', () => {
  it('lista a cada uno una vez, con su nombre, ordenados', () => {
    const datos = [
      sol({ codigo: 'a', estado: 'ejecutada', historial: [ev('ejecutada', 'isner@gt.com', '2026-09-11T18:46:00.000Z')] }),
      sol({ codigo: 'b', estado: 'ejecutada', historial: [ev('ejecutada', 'ISNER@gt.com', '2026-09-12T18:46:00.000Z')] }),
      sol({ codigo: 'c', estado: 'cancelada', historial: [ev('cancelada', 'ana@gt.com', '2026-09-21T17:49:00.000Z')] }),
    ];
    const nombres: Record<string, string> = { 'isner@gt.com': 'ISNER ORENCE', 'ana@gt.com': 'ANA PÉREZ' };
    expect(actoresDeAccion(datos, (e) => nombres[(e ?? '').toLowerCase()] ?? '')).toEqual([
      { email: 'ana@gt.com', nombre: 'ANA PÉREZ' },
      { email: 'isner@gt.com', nombre: 'ISNER ORENCE' },
    ]);
  });
});
