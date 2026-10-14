import { describe, it, expect } from 'vitest';
import {
  alertasDocumentos, diasHasta, errorViajeRealizado, estadoChofer, estadoVence, peorEstadoDocumentos,
  progresoParadas, totalViajes, textoViajes, diaVE, horaVE, fechaCorta,
} from './choferes';

const HOY = '2026-10-12';

describe('vigencia de documentos del chofer', () => {
  it('vigente, por vencer (≤ 30 días) y vencido', () => {
    expect(estadoVence('2027-01-01', HOY)).toBe('vigente');
    expect(estadoVence('2026-11-11', HOY)).toBe('por_vencer');
    expect(estadoVence('2026-10-12', HOY)).toBe('por_vencer'); // vence hoy: todavía vale, pero avisa
    expect(estadoVence('2026-10-11', HOY)).toBe('vencido');
    expect(estadoVence(null, HOY)).toBe('sin_dato');
    expect(diasHasta('2026-10-15', HOY)).toBe(3);
    expect(diasHasta('2026-10-10', HOY)).toBe(-2);
  });

  it('las alertas juntan solo lo vencido y lo por vencer; el peor estado manda', () => {
    const c = { licencia_vence: '2026-10-01', certificado_medico_vence: '2026-10-30', seguro_vence: '2027-05-01' };
    const a = alertasDocumentos(c, HOY);
    expect(a.map((x) => `${x.label}:${x.estado}`)).toEqual(['Licencia:vencido', 'Certificado médico:por_vencer']);
    expect(peorEstadoDocumentos(c, HOY)).toBe('vencido');
    expect(peorEstadoDocumentos({ licencia_vence: '2027-01-01' }, HOY)).toBe('sin_dato');
    expect(peorEstadoDocumentos({ licencia_vence: '2027-01-01', certificado_medico_vence: '2027-01-01', seguro_vence: '2027-01-01' }, HOY)).toBe('vigente');
  });
});

describe('estado del chofer hoy', () => {
  it('en ruta manda sobre descanso; inactivo manda sobre todo', () => {
    expect(estadoChofer({ activo: true, enRuta: false, deDescanso: false })).toBe('disponible');
    expect(estadoChofer({ activo: true, enRuta: false, deDescanso: true })).toBe('descanso');
    expect(estadoChofer({ activo: true, enRuta: true, deDescanso: true })).toBe('en_ruta');
    expect(estadoChofer({ activo: false, enRuta: true, deDescanso: false })).toBe('inactivo');
  });

  it('cuenta las paradas cumplidas', () => {
    expect(progresoParadas([{ lugar: 'A', hecha_at: '2026-10-12T10:00:00Z' }, { lugar: 'B' }])).toEqual({ hechas: 1, total: 2 });
    expect(progresoParadas(null)).toEqual({ hechas: 0, total: 0 });
  });
});

describe('cargar un viaje ya realizado (viaje pasado)', () => {
  const ahora = '2026-10-12T15:00';
  it('acepta salida y llegada pasadas con km coherentes', () => {
    expect(errorViajeRealizado({ salida: '2026-10-05T06:30', llegada: '2026-10-05T18:10', kmSalida: 120500, kmLlegada: 120980, ahora })).toBeNull();
    expect(errorViajeRealizado({ salida: '2026-10-05T06:30', llegada: '2026-10-05T18:10', kmSalida: null, kmLlegada: null, ahora })).toBeNull();
  });
  it('exige la llegada y no la deja antes de la salida ni en el futuro', () => {
    expect(errorViajeRealizado({ salida: '2026-10-05T06:30', llegada: '', kmSalida: null, kmLlegada: null, ahora })).toMatch(/llegada/);
    expect(errorViajeRealizado({ salida: '2026-10-05T06:30', llegada: '2026-10-05T06:00', kmSalida: null, kmLlegada: null, ahora })).toMatch(/antes de la salida/);
    expect(errorViajeRealizado({ salida: '2026-10-12T06:30', llegada: '2026-10-12T19:00', kmSalida: null, kmLlegada: null, ahora })).toMatch(/futuro/);
    expect(errorViajeRealizado({ salida: '', llegada: '2026-10-05T18:10', kmSalida: null, kmLlegada: null, ahora })).toMatch(/salida/);
  });
  it('el kilometraje de llegada no baja del de salida', () => {
    expect(errorViajeRealizado({ salida: '2026-10-05T06:30', llegada: '2026-10-05T18:10', kmSalida: 1000, kmLlegada: 900, ahora })).toMatch(/kilometraje/i);
  });
});

describe('viajes de camión y de volqueta (14/10/2026)', () => {
  it('suma la cantidad de viajes de cada registro y no cuenta los cancelados', () => {
    expect(totalViajes([{ cantidad_viajes: 12 }, { cantidad_viajes: 3 }, { cantidad_viajes: 5, estado: 'cancelado' }, {}])).toBe(16);
    expect(textoViajes(1)).toBe('1 viaje');
    expect(textoViajes(20)).toBe('20 viajes');
  });

  it('lleva la fecha y la hora a Venezuela', () => {
    // Mediodía de Venezuela: mismo día en cualquier huso.
    expect(diaVE('2026-10-12T16:00:00.000Z')).toBe('2026-10-12');
    // 02:00 UTC del 13 = 22:00 del 12 en Venezuela.
    expect(diaVE('2026-10-13T02:00:00.000Z')).toBe('2026-10-12');
    expect(horaVE('2026-10-13T02:30:00.000Z')).toBe('22:30');
    expect(fechaCorta('2026-10-02')).toBe('02/10/2026');
    expect(diaVE(null)).toBe('');
  });
});
