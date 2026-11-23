import { beforeEach, describe, expect, it, vi } from 'vitest';

type Resp = { data: unknown; error: unknown };
const cola: Resp[] = [];
const llamadas: { tabla: string; metodos: unknown[][] }[] = [];

function consulta(tabla: string, resp: Resp) {
  const registro = { tabla, metodos: [] as unknown[][] };
  llamadas.push(registro);
  const q: Record<string, unknown> = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') return (ok: (v: Resp) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(resp).then(ok, ko);
      return (...args: unknown[]) => { registro.metodos.push([prop, ...args]); return q; };
    },
  });
  return q;
}

const mockInvoke = vi.fn(async () => ({ data: { ok: true, usd: 918.77, eur: 1009.07, fecha: '2026-11-20' }, error: null }));

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    from: (tabla: string) => consulta(tabla, cola.shift() ?? { data: [], error: null }),
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...(args as [])),
    },
  },
}));

import {
  bustTasasCache,
  getTasaHoy,
  getTasaUsdDeFecha,
  hoyVE,
  round2,
  setTasaManual,
} from './tasas.repository';

describe('tasas.repository - Prioridad de resolución y soporte feriado bancario', () => {
  beforeEach(() => {
    cola.length = 0;
    llamadas.length = 0;
    mockInvoke.mockClear();
    bustTasasCache();
  });

  it('Prioridad 1: la corrección manual de hoy o fecha siguiente manda sobre cualquier API o snapshot', async () => {
    const hoy = hoyVE();
    // Simular tasa_cambio con tasa oficial vieja y tasa manual para hoy
    cola.push({
      data: [
        { fecha: hoy, moneda: 'USD', tasa: 950.00, fuente: 'manual' },
        { fecha: hoy, moneda: 'USD', tasa: 918.77, fuente: 'bcv' },
        { fecha: hoy, moneda: 'EUR', tasa: 1050.00, fuente: 'manual' },
      ],
      error: null,
    });

    const res = await getTasaHoy();
    expect(res.usd).toBe(950);
    expect(res.eur).toBe(1050);
    expect(res.fuente).toBe('manual');
    expect(res.fecha).toBe(hoy);
    // Edge function no debió llamarse
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('Prioridad 1 (mañana manual): corrección manual para el día siguiente en feriado bancario', async () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const manana = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(d);

    cola.push({
      data: [
        { fecha: manana, moneda: 'USD', tasa: 965.50, fuente: 'manual' },
        { fecha: '2026-11-20', moneda: 'USD', tasa: 918.77, fuente: 'bcv' },
      ],
      error: null,
    });

    const res = await getTasaHoy();
    expect(res.usd).toBe(965.5);
    expect(res.fecha).toBe(manana);
    expect(res.fuente).toBe('manual');
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('Prioridad 2: si es feriado bancario (sin tasa de hoy), toma la tasa del día siguiente si está disponible', async () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const manana = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(d);

    // En feriado bancario, tasa_cambio no tiene fila de hoy, pero ya tiene la de mañana del BCV
    cola.push({
      data: [
        { fecha: manana, moneda: 'USD', tasa: 928.40, fuente: 'bcv' },
        { fecha: manana, moneda: 'EUR', tasa: 1015.20, fuente: 'bcv' },
        { fecha: '2026-11-20', moneda: 'USD', tasa: 918.77, fuente: 'bcv' },
      ],
      error: null,
    });

    const res = await getTasaHoy();
    expect(res.usd).toBe(928.4);
    expect(res.eur).toBe(1015.2);
    expect(res.fecha).toBe(manana);
    expect(res.fuente).toBe('bcv');
  });

  it('setTasaManual actualiza tasa_cambio y snapshot en config para fecha >= hoy', async () => {
    const hoy = hoyVE();
    // 1: upsert tasa_cambio
    cola.push({ data: null, error: null });
    // 2: leerSnapshot
    cola.push({ data: { value: { usd: 918.77, eur: 1009.07, fecha: '2026-11-20' } }, error: null });
    // 3: upsert config
    cola.push({ data: null, error: null });

    await setTasaManual({ moneda: 'USD', tasa: 955.20, fecha: hoy });

    // Verificar llamadas
    expect(llamadas.some((l) => l.tabla === 'tasa_cambio')).toBe(true);
    expect(llamadas.some((l) => l.tabla === 'config')).toBe(true);
  });

  it('getTasaUsdDeFecha en día feriado/sin tasa exacta devuelve la tasa vigente resuelta', async () => {
    const hoy = hoyVE();
    // 1: getTasaUsdDeFecha busca exacto para hoy -> no encuentra
    cola.push({ data: [], error: null });
    // 2: llama a getTasaHoy() -> busca en tasa_cambio
    cola.push({
      data: [{ fecha: hoy, moneda: 'USD', tasa: 940.00, fuente: 'manual' }],
      error: null,
    });

    const tasa = await getTasaUsdDeFecha(hoy);
    expect(tasa).toBe(940);
  });

  it('round2 redondea centavos correctamente', () => {
    expect(round2(918.7662)).toBe(918.77);
    expect(round2(918.764)).toBe(918.76);
  });
});
