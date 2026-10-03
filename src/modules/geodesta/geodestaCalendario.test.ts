import { describe, expect, it } from 'vitest';
import {
  CELDAS_REJILLA, actividadesDelDia, deHoy, limitesDelMes, proximosDias,
  rejillaDelMes, sinMarcar, tramoEnElMes,
} from './geodestaCalendario';

const act = (desde: string, hasta: string, estado = 'planificada') => ({ desde, hasta, estado });

describe('limitesDelMes', () => {
  it('da el primero y el último del mes', () => {
    expect(limitesDelMes(2026, 10)).toEqual({ ini: '2026-10-01', fin: '2026-10-31' });
    expect(limitesDelMes(2026, 2)).toEqual({ ini: '2026-02-01', fin: '2026-02-28' });
  });
});

describe('rejillaDelMes', () => {
  it('siempre son seis semanas completas: la pantalla no salta de alto', () => {
    expect(rejillaDelMes(2026, 10, '2026-10-03')).toHaveLength(CELDAS_REJILLA);
    expect(rejillaDelMes(2026, 2, '2026-10-03')).toHaveLength(CELDAS_REJILLA);
  });
  it('arranca en domingo', () => {
    const r = rejillaDelMes(2026, 10, '2026-10-03');
    expect(r[0].diaSemana).toBe(0);
    expect(r[r.length - 1].diaSemana).toBe(6);
  });
  it('los días de relleno vienen marcados y NO se pueden tocar', () => {
    // Review Focus 2: tocar un relleno abriría un día de otro mes.
    const r = rejillaDelMes(2026, 10, '2026-10-03');
    const relleno = r.filter((c) => !c.delMes);
    expect(relleno.length).toBeGreaterThan(0);
    relleno.forEach((c) => expect(c.fecha.slice(5, 7)).not.toBe('10'));
    expect(r.filter((c) => c.delMes)).toHaveLength(31);
  });
  it('marca el día de hoy, y solo uno', () => {
    const r = rejillaDelMes(2026, 10, '2026-10-03');
    expect(r.filter((c) => c.esHoy)).toHaveLength(1);
    expect(r.find((c) => c.esHoy)?.fecha).toBe('2026-10-03');
  });
  it('si hoy cae en otro mes, ninguna celda queda marcada', () => {
    expect(rejillaDelMes(2026, 10, '2027-05-05').some((c) => c.esHoy)).toBe(false);
  });
  it('las fechas van en orden y sin huecos', () => {
    const r = rejillaDelMes(2026, 12, '2026-10-03');
    for (let i = 1; i < r.length; i++) expect(r[i].fecha > r[i - 1].fecha).toBe(true);
  });
  it('un mes que arranca en domingo no mete una semana vacía adelante', () => {
    // 2026-11-01 fue domingo
    const r = rejillaDelMes(2026, 11, '2026-10-03');
    expect(r[0].fecha).toBe('2026-11-01');
    expect(r[0].delMes).toBe(true);
  });
});

describe('actividadesDelDia', () => {
  const lista = [act('2026-10-01', '2026-10-03'), act('2026-10-05', '2026-10-05'), act('2026-10-10', '2026-10-20')];
  it('una actividad de varios días aparece en TODOS sus días', () => {
    ['2026-10-01', '2026-10-02', '2026-10-03'].forEach((d) => {
      expect(actividadesDelDia(lista, d)).toHaveLength(1);
    });
  });
  it('los extremos cuentan', () => {
    expect(actividadesDelDia(lista, '2026-10-01')).toHaveLength(1);
    expect(actividadesDelDia(lista, '2026-10-03')).toHaveLength(1);
    expect(actividadesDelDia(lista, '2026-10-04')).toHaveLength(0);
  });
  it('un día suelto aparece en su día', () => {
    expect(actividadesDelDia(lista, '2026-10-05')).toHaveLength(1);
  });
});

describe('tramoEnElMes', () => {
  const { ini, fin } = limitesDelMes(2026, 10);
  it('una actividad entera dentro del mes no se corta', () => {
    expect(tramoEnElMes(act('2026-10-05', '2026-10-08'), ini, fin))
      .toEqual({ col0: 4, col1: 7, cortaIzq: false, cortaDer: false });
  });
  it('una actividad de UN SOLO día ocupa una columna, no cero', () => {
    // Review Focus 3: con la aritmética ingenua la barra queda de ancho cero.
    const t = tramoEnElMes(act('2026-10-05', '2026-10-05'), ini, fin);
    expect(t).toEqual({ col0: 4, col1: 4, cortaIzq: false, cortaDer: false });
    expect(t!.col1 - t!.col0 + 1).toBe(1);
  });
  it('la que viene del mes pasado arranca en el día 1 y se marca', () => {
    // Review Focus 1.
    expect(tramoEnElMes(act('2026-09-28', '2026-10-03'), ini, fin))
      .toEqual({ col0: 0, col1: 2, cortaIzq: true, cortaDer: false });
  });
  it('la que sigue el mes que viene termina en el último día y se marca', () => {
    expect(tramoEnElMes(act('2026-10-29', '2026-11-04'), ini, fin))
      .toEqual({ col0: 28, col1: 30, cortaIzq: false, cortaDer: true });
  });
  it('la que tapa el mes entero se corta de los dos lados', () => {
    expect(tramoEnElMes(act('2026-09-01', '2026-11-30'), ini, fin))
      .toEqual({ col0: 0, col1: 30, cortaIzq: true, cortaDer: true });
  });
  it('la que no toca el mes devuelve null', () => {
    expect(tramoEnElMes(act('2026-08-01', '2026-08-05'), ini, fin)).toBeNull();
    expect(tramoEnElMes(act('2026-11-01', '2026-11-05'), ini, fin)).toBeNull();
  });
  it('NUNCA devuelve columnas fuera del mes', () => {
    for (const a of [act('2026-01-01', '2027-12-31'), act('2026-09-30', '2026-10-01'), act('2026-10-31', '2026-12-01')]) {
      const t = tramoEnElMes(a, ini, fin);
      if (!t) continue;
      expect(t.col0).toBeGreaterThanOrEqual(0);
      expect(t.col1).toBeLessThanOrEqual(30);
      expect(t.col1).toBeGreaterThanOrEqual(t.col0);
    }
  });
});

describe('deHoy', () => {
  it('trae lo que toca hoy, incluido lo que viene de antes', () => {
    const r = deHoy([act('2026-10-01', '2026-10-05'), act('2026-10-03', '2026-10-03'), act('2026-10-09', '2026-10-09')], '2026-10-03');
    expect(r).toHaveLength(2);
  });
});

describe('proximosDias', () => {
  it('trae lo que arranca en los próximos siete días, sin repetir lo de hoy', () => {
    const lista = [
      act('2026-10-03', '2026-10-03'),  // hoy: no va
      act('2026-10-04', '2026-10-04'),
      act('2026-10-10', '2026-10-10'),
      act('2026-10-11', '2026-10-11'),  // fuera de los 7
      act('2026-10-01', '2026-10-09'),  // arrancó antes: no va
    ];
    expect(proximosDias(lista, '2026-10-03').map((a) => a.desde)).toEqual(['2026-10-04', '2026-10-10']);
  });
});

describe('sinMarcar', () => {
  it('lo que ya pasó y sigue en planificada, lo más viejo primero', () => {
    const lista = [
      act('2026-09-20', '2026-09-21'),
      act('2026-09-01', '2026-09-02'),
      act('2026-09-10', '2026-09-11', 'cumplida'),
      act('2026-10-03', '2026-10-03'),            // es hoy: todavía no venció
      act('2026-10-20', '2026-10-21'),            // futura
    ];
    expect(sinMarcar(lista, '2026-10-03').map((a) => a.desde)).toEqual(['2026-09-01', '2026-09-20']);
  });
  it('lo marcado como no_se_hizo tampoco aparece', () => {
    expect(sinMarcar([act('2026-09-01', '2026-09-02', 'no_se_hizo')], '2026-10-03')).toHaveLength(0);
  });
  it('una actividad que termina hoy no está vencida', () => {
    expect(sinMarcar([act('2026-10-01', '2026-10-03')], '2026-10-03')).toHaveLength(0);
  });
});
