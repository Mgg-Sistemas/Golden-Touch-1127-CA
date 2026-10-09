import { describe, expect, it } from 'vitest';
import { diasEntre, filasAusencias, rangoDelMes, totalesAusencias, type AusenciaBase } from './ausenciasReporte';

const personas = [
  { id: 'a', nombre: 'MARÍA', apellido: 'GÓMEZ', cedula: '111', cargo: 'COCINERA', departamento: 'COCINA' },
  { id: 'b', nombre: 'ANA', apellido: 'PÉREZ', cedula: '222', cargo: 'OPERADORA', departamento: 'MINA' },
];
const items: AusenciaBase[] = [
  { id: '1', personal_id: 'a', desde: '2026-09-28', hasta: '2026-10-03', estado: 'Plan' },
  { id: '2', personal_id: 'b', desde: '2026-10-10', hasta: '2026-10-24', dias: 15, estado: 'Procesada', monto: 300, cruce: true },
  { id: '3', personal_id: 'a', desde: '2026-11-01', hasta: '2026-11-05', estado: 'Pendiente', monto: 100 },
  { id: '4', personal_id: 'b', desde: '2026-10-01', hasta: '2026-10-02', estado: 'Manual' },
];

describe('reporte de vacaciones y descansos', () => {
  it('cuenta los días con los dos extremos incluidos', () => {
    expect(diasEntre('2026-09-28', '2026-10-03')).toBe(6);
    expect(diasEntre('2026-10-03', '2026-09-28')).toBe(0);
  });

  it('entra lo que se cruza con el rango, ordenado por nombre y fecha', () => {
    const f = filasAusencias(items, personas, rangoDelMes(2026, 9));
    expect(f.map((x) => x.id)).toEqual(['4', '2', '1']);
    expect(f.find((x) => x.id === '1')!.diasTotal).toBe(6);
    expect(f.find((x) => x.id === '2')!.diasTotal).toBe(15);
  });

  it('filtra por persona y por texto sin acentos', () => {
    expect(filasAusencias(items, personas, { personalId: 'a' }).map((x) => x.id)).toEqual(['1', '3']);
    expect(filasAusencias(items, personas, { texto: 'maria gomez' }).map((x) => x.id)).toEqual(['1', '3']);
    expect(filasAusencias(items, personas, { texto: 'mina' }).map((x) => x.id)).toEqual(['4', '2']);
  });

  it('totales: registros, personas, días, monto, estados y cruces', () => {
    const t = totalesAusencias(filasAusencias(items, personas, {}));
    expect(t).toEqual({ registros: 4, personas: 2, dias: 6 + 15 + 5 + 2, monto: 400, procesadas: 1, pendientes: 1, cruces: 1 });
  });

  it('rango del mes', () => {
    expect(rangoDelMes(2026, 1)).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
    expect(rangoDelMes(2026, 11)).toEqual({ desde: '2026-12-01', hasta: '2026-12-31' });
  });
});
