import { describe, expect, test } from 'vitest';
import type { Orden } from '@/shared/lib/types';
import type { CompraDirecta } from './compras.repository';
import type { ServicioDirecto } from './serviciosDirectos.repository';
import {
  clasificarEstadoOrden,
  clasificarEstadoDirectaServicio,
  montoUsdBs,
  normalizarDepartamento,
  normalizarOrdenes,
  normalizarDirectas,
  normalizarServicios,
  normalizarItemsOrdenes,
  SIN_DEPARTAMENTO,
  SIN_CATEGORIA_INV,
  type ContextoCompras,
} from './comprasMoldeable';

/* ───────────── Fábricas de fixtures ───────────── */

function ctxFix(over: Partial<ContextoCompras> = {}): ContextoCompras {
  return {
    tasaBcv: 40,
    categoriasPorSku: new Map(),
    nombreProveedor: new Map(),
    ...over,
  };
}

let seq = 0;
function ordenFix(over: Partial<Orden> = {}): Orden {
  seq += 1;
  return {
    id: `ord-${seq}`, codigo: `OC-${seq}`, estado: 'pagada',
    proveedor_id: null, unidad_solicitante: null, items: [],
    total: 0, total_moneda: 'USD', created_at: '2026-11-05T10:00:00Z',
    ...over,
  } as unknown as Orden;
}
function directaFix(over: Partial<CompraDirecta> = {}): CompraDirecta {
  seq += 1;
  return {
    id: `cd-${seq}`, codigo: `CD-${seq}`, estado: 'finalizada',
    gasto: 0, moneda: 'USD', gasto_categoria: null, items: [],
    created_at: '2026-11-05T10:00:00Z',
    ...over,
  } as unknown as CompraDirecta;
}
function servicioFix(over: Partial<ServicioDirecto> = {}): ServicioDirecto {
  seq += 1;
  return {
    id: `sd-${seq}`, codigo: `SD-${seq}`, estado: 'finalizada',
    gasto: 0, moneda: 'USD', unidad_solicitante: null, abonado_total: 0, items: [],
    created_at: '2026-11-05T10:00:00Z',
    ...over,
  } as unknown as ServicioDirecto;
}

describe('comprasMoldeable · fundamentos (T1)', () => {
  test('clasificarEstadoOrden mapea finalizadas, pendientes y excluidas', () => {
    expect(clasificarEstadoOrden('pagada')).toBe('finalizada');
    expect(clasificarEstadoOrden('recibida')).toBe('finalizada');
    expect(clasificarEstadoOrden('por_recibir')).toBe('finalizada');
    expect(clasificarEstadoOrden('oc_emitida')).toBe('pendiente');
    expect(clasificarEstadoOrden('cuenta_abierta')).toBe('pendiente');
    expect(clasificarEstadoOrden('oc_creada')).toBe('pendiente');
    expect(clasificarEstadoOrden('cancelada')).toBe('excluida');
    expect(clasificarEstadoOrden('rechazada')).toBe('excluida');
    expect(clasificarEstadoOrden('pendiente')).toBe('excluida'); // solicitud, no compra
  });

  test('clasificarEstadoDirectaServicio excluye en_proceso', () => {
    expect(clasificarEstadoDirectaServicio('finalizada')).toBe('finalizada');
    expect(clasificarEstadoDirectaServicio('por_pagar')).toBe('pendiente');
    expect(clasificarEstadoDirectaServicio('en_proceso')).toBe('excluida');
  });

  test('montoUsdBs no divide por cero sin tasa', () => {
    expect(montoUsdBs(1200, 'Bs', 0)).toEqual({ usd: 0, bs: 1200 });
    expect(montoUsdBs(100, 'USD', 40)).toEqual({ usd: 100, bs: 4000 });
    expect(montoUsdBs(4000, 'Bs', 40)).toEqual({ usd: 100, bs: 4000 });
    expect(montoUsdBs(100, 'USDT', 40)).toEqual({ usd: 100, bs: 4000 });
    expect(montoUsdBs(100, 'USD', 0)).toEqual({ usd: 100, bs: 0 });
  });

  test('normalizarDepartamento colapsa espacios y nombra el vacío', () => {
    expect(normalizarDepartamento('  Taller   Mecánico ')).toBe('Taller Mecánico');
    expect(normalizarDepartamento('   ')).toBe(SIN_DEPARTAMENTO);
    expect(normalizarDepartamento(null)).toBe(SIN_DEPARTAMENTO);
    expect(normalizarDepartamento(undefined)).toBe(SIN_DEPARTAMENTO);
  });
});

describe('comprasMoldeable · normalización de las 3 fuentes (T2)', () => {
  test('normalizarOrdenes descarta excluidas y convierte moneda', () => {
    const filas = normalizarOrdenes([
      ordenFix({ estado: 'pagada', total: 100, total_moneda: 'USD', unidad_solicitante: 'Mina', pagada_en: '2026-11-02' }),
      ordenFix({ estado: 'cancelada', total: 999, total_moneda: 'USD' }),
    ], ctxFix({ tasaBcv: 40 }));
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      tipo_compra: 'orden', clase_estado: 'finalizada',
      monto_usd: 100, monto_bs: 4000, pagado_usd: 100, departamento: 'Mina',
    });
  });

  test('normalizarOrdenes a crédito usa abonado_total como pagado', () => {
    const filas = normalizarOrdenes([
      ordenFix({ estado: 'cuenta_abierta', total: 200, total_moneda: 'USD', abonado_total: 50 }),
    ], ctxFix({ tasaBcv: 40 }));
    expect(filas[0]).toMatchObject({ clase_estado: 'pendiente', pagado_usd: 50 });
  });

  test('normalizarDirectas pone bucket de depto y categoría de gasto, excluye en_proceso', () => {
    const filas = normalizarDirectas([
      directaFix({ estado: 'finalizada', gasto: 50, moneda: 'USD', gasto_categoria: 'Papelería', pagada_at: '2026-11-03' }),
      directaFix({ estado: 'en_proceso', gasto: null }),
    ], ctxFix({ tasaBcv: 40 }));
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      tipo_compra: 'directa', departamento: SIN_DEPARTAMENTO, categoria_gasto: 'Papelería', pagado_usd: 50,
    });
  });

  test('normalizarServicios usa unidad_solicitante y abonado_total', () => {
    const filas = normalizarServicios([
      servicioFix({ estado: 'por_pagar', gasto: 200, moneda: 'USD', unidad_solicitante: 'Planta', abonado_total: 80 }),
    ], ctxFix({ tasaBcv: 40 }));
    expect(filas[0]).toMatchObject({
      tipo_compra: 'servicio', clase_estado: 'pendiente', departamento: 'Planta', pagado_usd: 80,
    });
  });
});

describe('comprasMoldeable · ámbito ítems (T3)', () => {
  test('normalizarItemsOrdenes explota por ítem y cruza categoría', () => {
    const ctx = ctxFix({ tasaBcv: 40, categoriasPorSku: new Map([['SKU-1', 'Ferretería']]) });
    const filas = normalizarItemsOrdenes([
      ordenFix({ estado: 'pagada', total_moneda: 'USD', items: [
        { sku: 'SKU-1', nombre: 'Tornillo', cantidad: 10, precio: 2 },
        { sku: 'SKU-9', nombre: 'Flete', cantidad: 1, precio: 5 },
      ] } as Partial<Orden>),
    ], ctx);
    expect(filas).toHaveLength(2);
    expect(filas[0]).toMatchObject({
      ambito: 'items', categoria: 'Ferretería', nombre_item: 'Tornillo', cantidad: 10, monto_usd: 20, monto_bs: 800,
    });
    expect(filas[1].categoria).toBe(SIN_CATEGORIA_INV); // sku desconocido
  });

  test('normalizarItemsOrdenes descarta órdenes excluidas', () => {
    const filas = normalizarItemsOrdenes([
      ordenFix({ estado: 'cancelada', items: [{ sku: 'SKU-1', nombre: 'X', cantidad: 1, precio: 1 }] } as Partial<Orden>),
    ], ctxFix());
    expect(filas).toHaveLength(0);
  });
});
