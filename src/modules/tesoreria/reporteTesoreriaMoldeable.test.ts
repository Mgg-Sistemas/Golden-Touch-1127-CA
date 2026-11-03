import { describe, it, expect } from 'vitest';
import type { MovimientoCaja } from '@/shared/lib/types';
import type { DatosPendientesPorPagar } from './pendientesPorPagar';
import type { CuentaPorPagar } from './cuentasPorPagar.repository';
import type { CuentaPorCobrar } from './cuentasPorCobrar.repository';
import {
  convertirMonto,
  normalizarMovimientosTesoreria,
  normalizarPendientesPorPagar,
  normalizarCreditosCartera,
  filtrarFilasTesoreria,
  procesarFilasReporteTesoreria,
  resumenTesoreria,
  obtenerMetricasFichaTesoreria,
  type ContextoTasas,
  type FilaReporteTesoreria,
} from './reporteTesoreriaMoldeable';

const CTX: ContextoTasas = { tasaBcvHoy: 40, tasaFecha: '2026-11-01' };

/** Movimiento de caja mínimo para fixtures (campos opcionales por `extra`). */
function mkMov(extra: Partial<MovimientoCaja>): MovimientoCaja {
  return {
    id: 'm1',
    caja_id: 'c1',
    tipo: 'salida',
    monto: 0,
    moneda: 'USD',
    saldo_antes: 0,
    saldo_despues: 0,
    actor: 'tester',
    at: '2026-11-01T10:00:00Z',
    ...extra,
  } as MovimientoCaja;
}

describe('convertirMonto', () => {
  it('USD → usd nominal y bs = usd × tasa', () => {
    expect(convertirMonto(100, 'USD', 40)).toEqual({ usd: 100, bs: 4000, tasa: 40 });
  });
  it('Bs → bs nominal y usd = bs ÷ tasa', () => {
    expect(convertirMonto(4000, 'Bs', 40)).toEqual({ usd: 100, bs: 4000, tasa: 40 });
  });
  it('USDT se valora 1:1 con el dólar', () => {
    expect(convertirMonto(50, 'USDT', 40)).toEqual({ usd: 50, bs: 2000, tasa: 40 });
  });
  it('COP con tasa por unidad convierte vía Bs', () => {
    expect(convertirMonto(1000, 'COP', 40, 0.2)).toEqual({ usd: 5, bs: 200, tasa: 40 });
  });
  it('COP sin tasa por unidad queda sin equivalencia', () => {
    expect(convertirMonto(1000, 'COP', 40)).toEqual({ usd: 0, bs: 0, tasa: 40 });
  });
  it('tasa 0 no divide (usd queda en 0)', () => {
    expect(convertirMonto(4000, 'Bs', 0)).toEqual({ usd: 0, bs: 4000, tasa: 0 });
  });
});

describe('normalizarMovimientosTesoreria', () => {
  it('mapea tipos del libro al flujo de tesorería', () => {
    const movs = [
      mkMov({ id: 'a', tipo: 'ingreso', monto: 100, moneda: 'USD' }),
      mkMov({ id: 'b', tipo: 'salida', monto: 2000, moneda: 'Bs' }),
      mkMov({ id: 'c', tipo: 'traslado_salida', monto: 10, moneda: 'USD' }),
      mkMov({ id: 'd', tipo: 'ajuste', monto: 5, moneda: 'USD', saldo_antes: 0, saldo_despues: 5 }),
    ];
    const filas = normalizarMovimientosTesoreria(movs, CTX);
    expect(filas.map((f) => f.tipo_movimiento)).toEqual(['ingreso', 'egreso', 'traslado', 'ingreso']);
  });

  it('convierte montos según la moneda y guarda la tasa aplicada', () => {
    const [ing, egr] = normalizarMovimientosTesoreria(
      [
        mkMov({ id: 'a', tipo: 'ingreso', monto: 100, moneda: 'USD' }),
        mkMov({ id: 'b', tipo: 'salida', monto: 2000, moneda: 'Bs' }),
      ],
      CTX,
    );
    expect([ing.monto_usd, ing.monto_bs]).toEqual([100, 4000]);
    expect([egr.monto_usd, egr.monto_bs]).toEqual([50, 2000]);
    expect(egr.tasa_bcv_aplicada).toBe(40);
  });

  it('usa la tasa histórica por fecha cuando la base lo pide', () => {
    const ctx: ContextoTasas = { tasaBcvHoy: 40, tasaFecha: '2026-11-02', tasasPorFecha: new Map([['2026-11-01', 36]]) };
    const [f] = normalizarMovimientosTesoreria(
      [mkMov({ id: 'a', tipo: 'salida', monto: 36, moneda: 'USD' })],
      ctx,
      'historica',
    );
    expect(f.monto_bs).toBe(1296); // 36 × 36
    expect(f.tasa_bcv_aplicada).toBe(36);
  });

  it('deriva la categoría: subcategoría de gasto > categoría base', () => {
    const [f] = normalizarMovimientosTesoreria(
      [mkMov({ id: 'a', tipo: 'salida', monto: 10, moneda: 'USD', gasto_categoria: 'Fletes', categoria: 'gasto' })],
      CTX,
    );
    expect(f.categoria).toBe('Fletes');
  });

  it('el ajuste lleva categoría propia «Ajuste»', () => {
    const [f] = normalizarMovimientosTesoreria(
      [mkMov({ id: 'a', tipo: 'ajuste', monto: 5, moneda: 'USD', saldo_antes: 10, saldo_despues: 5 })],
      CTX,
    );
    expect(f.categoria).toBe('Ajuste');
    expect(f.tipo_movimiento).toBe('egreso'); // bajó el saldo
  });
});

describe('normalizarPendientesPorPagar', () => {
  const datos: DatosPendientesPorPagar = {
    segmentos: [
      {
        clave: 'oc',
        titulo: 'ÓRDENES DE COMPRA (OC)',
        subUsd: 100,
        subBs: 4000,
        filas: [
          {
            codigo: 'OC-2026-0181', proveedor: 'Repuestos CA', estado: 'Lista para pagar',
            listaParaPagar: true,
            pagos: [{ metodo: 'transferencia', texto: 'Transferencia — BDV 0102', registrado: false }],
            usd: 100, bs: 4000,
          },
        ],
      },
    ],
    credito: null,
    tasa: 40,
    tasaFecha: '2026-11-01',
    totUsd: 100,
    totBs: 4000,
    totCant: 1,
    preparacion: { porMetodoMoneda: [], totalesPorMoneda: [], sinMetodo: { usd: 0, bs: 0, nOrdenes: 0 } },
    generadoEn: '2026-11-01T12:00:00Z',
  };

  it('aplana los segmentos a filas de egreso con su método de pago', () => {
    const filas = normalizarPendientesPorPagar(datos);
    expect(filas).toHaveLength(1);
    const f = filas[0];
    expect(f.ambito).toBe('por_pagar');
    expect(f.tipo_movimiento).toBe('egreso');
    expect(f.codigo).toBe('OC-2026-0181');
    expect(f.contraparte).toBe('Repuestos CA');
    expect([f.monto_usd, f.monto_bs]).toEqual([100, 4000]);
    expect(f.metodo_pago).toContain('Transferencia');
    expect(f.origen_documento).toBe('Orden de compra');
  });
});

describe('normalizarCreditosCartera', () => {
  const cxp: CuentaPorPagar[] = [
    { id: 'p1', tipo: 'proveedor', contraparte: 'Proveedor A', monto: 100, abonado: 40, moneda: 'USD', estado: 'abierta', created_at: '2026-11-01T00:00:00Z' },
    { id: 'p2', tipo: 'proveedor', contraparte: 'Proveedor B', monto: 50, abonado: 50, moneda: 'USD', estado: 'saldada', created_at: '2026-11-01T00:00:00Z' },
  ];
  const cxc: CuentaPorCobrar[] = [
    { id: 'c1', tipo: 'cliente', contraparte: 'Cliente X', monto: 200, cobrado: 20, moneda: 'USD', estado: 'abierta', created_at: '2026-11-01T00:00:00Z' },
  ];

  it('CxP abiertas son egreso con saldo monto − abonado; las saldadas se ignoran', () => {
    const filas = normalizarCreditosCartera(cxp, [], CTX);
    expect(filas).toHaveLength(1);
    expect(filas[0].tipo_movimiento).toBe('egreso');
    expect(filas[0].monto_original).toBe(60); // 100 − 40
    expect(filas[0].monto_usd).toBe(60);
  });

  it('CxC abiertas son ingreso con saldo monto − cobrado', () => {
    const filas = normalizarCreditosCartera([], cxc, CTX);
    expect(filas).toHaveLength(1);
    expect(filas[0].tipo_movimiento).toBe('ingreso');
    expect(filas[0].monto_original).toBe(180); // 200 − 20
  });
});

describe('filtrarFilasTesoreria', () => {
  const filas = normalizarMovimientosTesoreria(
    [
      mkMov({ id: 'a', tipo: 'salida', monto: 10, moneda: 'USD', caja: { nombre: 'BDV', moneda: 'USD' } }),
      mkMov({ id: 'b', tipo: 'ingreso', monto: 20, moneda: 'Bs', caja: { nombre: 'Banesco', moneda: 'Bs' } }),
    ],
    CTX,
  );

  it('filtra por caja', () => {
    expect(filtrarFilasTesoreria(filas, { cajasSel: ['BDV'] }).map((f) => f.id)).toEqual(['a']);
  });
  it('filtra por moneda', () => {
    expect(filtrarFilasTesoreria(filas, { monedasSel: ['Bs'] }).map((f) => f.id)).toEqual(['b']);
  });
  it('filtra por tipo de movimiento', () => {
    expect(filtrarFilasTesoreria(filas, { tiposSel: ['ingreso'] }).map((f) => f.id)).toEqual(['b']);
  });
  it('sin filtros devuelve todo', () => {
    expect(filtrarFilasTesoreria(filas, {})).toHaveLength(2);
  });
});

describe('resumenTesoreria', () => {
  const filas = normalizarMovimientosTesoreria(
    [
      mkMov({ id: 'a', tipo: 'ingreso', monto: 100, moneda: 'USD' }),
      mkMov({ id: 'b', tipo: 'salida', monto: 30, moneda: 'USD', gasto_categoria: 'Fletes', beneficiario: 'Transporte A' }),
      mkMov({ id: 'c', tipo: 'salida', monto: 20, moneda: 'USD', gasto_categoria: 'Alimentación', beneficiario: 'Comedor B' }),
      mkMov({ id: 'd', tipo: 'traslado_salida', monto: 999, moneda: 'USD' }),
    ],
    CTX,
  );

  it('suma egresos e ingresos y calcula el saldo neto, sin contar traslados', () => {
    const r = resumenTesoreria(filas, 40);
    expect(r.totalIngresosUsd).toBe(100);
    expect(r.totalEgresosUsd).toBe(50);
    expect(r.saldoNetoUsd).toBe(50);
    expect(r.totalOperaciones).toBe(4);
  });

  it('top categorías y proveedores salen solo de egresos y ordenados', () => {
    const r = resumenTesoreria(filas, 40);
    expect(r.topCategorias[0]).toMatchObject({ nombre: 'Fletes', montoUsd: 30, porcentaje: 60 });
    expect(r.topProveedores[0].nombre).toBe('Transporte A');
    expect(r.topCategorias.find((t) => t.nombre === 'Ingreso')).toBeUndefined();
  });
});

describe('procesarFilasReporteTesoreria', () => {
  const detalle = normalizarMovimientosTesoreria(
    [
      mkMov({ id: 'a', tipo: 'salida', monto: 30, moneda: 'USD', gasto_categoria: 'Fletes' }),
      mkMov({ id: 'b', tipo: 'salida', monto: 10, moneda: 'USD', gasto_categoria: 'Fletes' }),
      mkMov({ id: 'c', tipo: 'salida', monto: 60, moneda: 'USD', gasto_categoria: 'Nómina' }),
    ],
    CTX,
  );

  it('detallado conserva una fila por registro con su % del total', () => {
    const { filas } = procesarFilasReporteTesoreria(detalle, 'detallado');
    expect(filas).toHaveLength(3);
    const c = filas.find((f) => f.id === 'c')!;
    expect(c.pct_del_total).toBe(60); // 60 de 100
    expect(c.total_operaciones).toBe(1);
  });

  it('agrupa por categoría sumando montos y operaciones', () => {
    const { filas } = procesarFilasReporteTesoreria(detalle, 'categoria_gasto');
    expect(filas).toHaveLength(2);
    const fletes = filas.find((f) => f.categoria === 'Fletes')!;
    expect(fletes.monto_usd).toBe(40);
    expect(fletes.total_operaciones).toBe(2);
    expect(fletes.pct_del_total).toBe(40);
  });

  it('ordena los grupos por USD descendente por defecto', () => {
    const { filas } = procesarFilasReporteTesoreria(detalle, 'categoria_gasto');
    expect(filas[0].categoria).toBe('Nómina'); // 60 > 40
  });

  it('el resumen siempre sale del detalle, no de los grupos', () => {
    const { resumen } = procesarFilasReporteTesoreria(detalle, 'categoria_gasto');
    expect(resumen.totalEgresosUsd).toBe(100);
    expect(resumen.totalOperaciones).toBe(3);
  });

  it('el % del total es relativo al propio tipo de flujo (egresos no diluidos por ingresos)', () => {
    const detalleMix = normalizarMovimientosTesoreria(
      [
        mkMov({ id: 'a', tipo: 'salida', monto: 30, moneda: 'USD', gasto_categoria: 'Fletes' }),
        mkMov({ id: 'b', tipo: 'salida', monto: 10, moneda: 'USD', gasto_categoria: 'Nómina' }),
        mkMov({ id: 'c', tipo: 'ingreso', monto: 100, moneda: 'USD' }),
      ],
      CTX,
    );
    const { filas } = procesarFilasReporteTesoreria(detalleMix, 'categoria_gasto');
    // Egresos: Fletes 30 y Nómina 10 sobre total egresos 40 → 75% y 25%.
    expect(filas.find((f) => f.categoria === 'Fletes')!.pct_del_total).toBe(75);
    expect(filas.find((f) => f.categoria === 'Nómina')!.pct_del_total).toBe(25);
    // El ingreso se mide sobre el total de ingresos (100), no sobre el gran total.
    expect(filas.find((f) => f.categoria === 'Ingreso')!.pct_del_total).toBe(100);
  });
});

describe('obtenerMetricasFichaTesoreria', () => {
  const fila: FilaReporteTesoreria = {
    id: 'g', ambito: 'movimientos', fecha: '2026-11-01', moneda_original: 'USD',
    monto_original: 100, tipo_movimiento: 'egreso', categoria: 'Fletes', contraparte: 'Proveedor',
    concepto: '', origen_documento: 'Movimiento de caja',
    tasa_bcv_aplicada: 40, monto_usd: 100, monto_bs: 4000,
    total_operaciones: 3, pct_del_total: 25,
  };
  const cols = ['monto_usd', 'monto_bs', 'pct_total'];

  it('con ambos toggles muestra USD y Bs, y nunca más de 4 recuadros', () => {
    const m = obtenerMetricasFichaTesoreria(fila, cols, { mostrarUsd: true, mostrarBs: true });
    expect(m.length).toBeLessThanOrEqual(4);
    expect(m.some((x) => x.clave === 'monto_usd')).toBe(true);
    expect(m.some((x) => x.clave === 'monto_bs')).toBe(true);
  });

  it('al desmarcar el toggle de USD, no aparece el recuadro de dólares', () => {
    const m = obtenerMetricasFichaTesoreria(fila, cols, { mostrarUsd: false, mostrarBs: true });
    expect(m.some((x) => x.clave === 'monto_usd')).toBe(false);
    expect(m.some((x) => x.clave === 'monto_bs')).toBe(true);
  });

  it('siempre devuelve al menos un recuadro de respaldo', () => {
    const m = obtenerMetricasFichaTesoreria(fila, [], { mostrarUsd: false, mostrarBs: false });
    expect(m.length).toBeGreaterThanOrEqual(1);
  });
});
