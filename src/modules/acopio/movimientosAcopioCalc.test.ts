import { describe, expect, it } from 'vitest';
import type { CajaCierre, CajaMovimiento, ContratoAcopio } from '@/shared/lib/types';
import { construirMovimientosAcopio } from './movimientosAcopioCalc';

/* Las tarjetas del Centro de Acopio replican la cabecera del Excel «CAJA PERAMANAL»:
   F3 = (G3 + H3 + I3) / E3  y  L3 = D3 − G3 − H3 − I3 − J3 − K3.
   La inversión (K) sale del saldo pero NO entra en la tasa ni en Gastos GT. */

const caja = { id: 'caja-1', estado: 'abierta', fecha_inicio: '2026-06-27', saldo_inicial_kg: 0 } as unknown as CajaCierre;

function mov(p: Partial<CajaMovimiento>): CajaMovimiento {
  return {
    id: p.id ?? Math.random().toString(36).slice(2), fecha: p.fecha ?? '2026-07-01', descripcion: p.descripcion ?? 'x',
    usd_entregado: 0, kg_cerrados: 0, facturados: 0, gastos: 0, nominas: 0, traslado: 0, inversion: 0, kg_recibidos: 0,
    orden: 0, caja_id: 'caja-1', created_at: '2026-07-01T00:00:00Z', ...p,
  } as CajaMovimiento;
}
const contratoMinero = {
  id: 'c-1', seq: 50, fecha: '2026-07-02', estado: 'cerrado', tipo: 'minero', kg_seco_limpio: 100, tasa: 8.4,
} as unknown as ContratoAcopio;

describe('construirMovimientosAcopio · columnas del Excel', () => {
  it('la inversión sale del saldo pero no entra en la tasa ni en Gastos GT', () => {
    const { resumen } = construirMovimientosAcopio({
      caja,
      contratos: [contratoMinero],
      cajaMovs: [
        mov({ fecha: '2026-07-01', usd_entregado: 5000 }),
        mov({ fecha: '2026-07-03', gastos: 300 }),
        mov({ fecha: '2026-07-04', nominas: 100 }),
        mov({ fecha: '2026-07-05', traslado: 50 }),
        mov({ fecha: '2026-07-06', inversion: 1000 }),
        mov({ fecha: '2026-07-07', kg_recibidos: 40 }),
      ],
    });
    expect(resumen.usdEntregado).toBe(5000);         // D
    expect(resumen.kgCerrados).toBe(100);            // E
    expect(resumen.facturado).toBe(840);             // G = 100 kg × 8,4
    expect(resumen.gastos).toBe(300);                // H
    expect(resumen.nominas).toBe(100);               // I
    expect(resumen.traslado).toBe(50);               // J
    expect(resumen.inversion).toBe(1000);            // K
    expect(resumen.saldoUsd).toBeCloseTo(5000 - 840 - 300 - 100 - 50 - 1000, 2); // L
    expect(resumen.kgRecibidos).toBe(40);            // M
    expect(resumen.saldoKg).toBe(60);                // N = E − M
    expect(resumen.tasa).toBeCloseTo((840 + 300 + 100) / 100, 6); // F: sin inversión ni traslado
  });

  it('cada fila lleva su inversión y el saldo corrido la descuenta', () => {
    const { filas } = construirMovimientosAcopio({
      caja, contratos: [],
      cajaMovs: [mov({ fecha: '2026-07-01', usd_entregado: 2000 }), mov({ fecha: '2026-07-02', inversion: 1500 })],
    });
    expect(filas[1].inversion).toBe(1500);
    expect(filas[0].inversion).toBeNull();
    expect(filas[1].saldoUsd).toBe(500);
  });
});
