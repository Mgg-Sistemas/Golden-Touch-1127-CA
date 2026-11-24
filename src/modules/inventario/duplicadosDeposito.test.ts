import { describe, it, expect } from 'vitest';
import {
  requiereValidacionDuplicados,
  filtrarParecidosDelDeposito,
  movimientoSumarStockDuplicado,
  ALMACENES_CON_DUPLICADOS,
} from './duplicadosDeposito';
import { ALMACEN_GENERAL, ALMACEN_MINA, ALMACEN_REUTILIZABLES, ALMACEN_DANADOS } from './depositos';

describe('validación de duplicados en depósitos propios', () => {
  it('pide confirmación solo en Mina, Reutilizables e Items Dañados', () => {
    expect(ALMACENES_CON_DUPLICADOS).toEqual([ALMACEN_MINA, ALMACEN_REUTILIZABLES, ALMACEN_DANADOS]);
    expect(requiereValidacionDuplicados(ALMACEN_MINA)).toBe(true);
    expect(requiereValidacionDuplicados(ALMACEN_REUTILIZABLES)).toBe(true);
    expect(requiereValidacionDuplicados(ALMACEN_DANADOS)).toBe(true);
    expect(requiereValidacionDuplicados(ALMACEN_GENERAL)).toBe(false);
    expect(requiereValidacionDuplicados('Depósito Herramientas')).toBe(false);
    expect(requiereValidacionDuplicados(null)).toBe(false);
    expect(requiereValidacionDuplicados('')).toBe(false);
  });

  it('tolera mayúsculas, acentos y guiones al reconocer el depósito', () => {
    expect(requiereValidacionDuplicados('deposito mina')).toBe(true);
    expect(requiereValidacionDuplicados('DEPOSITO ITEMS DAÑADOS')).toBe(true);
    expect(requiereValidacionDuplicados('deposito-reutilizables')).toBe(true);
  });

  it('solo ofrece parecidos del depósito donde se está creando', () => {
    const parecidos = [
      { sku: 'HER-077', almacen: ALMACEN_MINA },
      { sku: 'MAT-018', almacen: ALMACEN_GENERAL },
      { sku: 'INS-182', almacen: ALMACEN_MINA },
      { sku: 'ELE-056', almacen: ALMACEN_DANADOS },
      { sku: 'SIN-ALMACEN', almacen: null },
    ];
    expect(filtrarParecidosDelDeposito(parecidos, ALMACEN_MINA).map((p) => p.sku)).toEqual(['HER-077', 'INS-182']);
    expect(filtrarParecidosDelDeposito(parecidos, ALMACEN_DANADOS).map((p) => p.sku)).toEqual(['ELE-056']);
    expect(filtrarParecidosDelDeposito(parecidos, ALMACEN_GENERAL).map((p) => p.sku)).toEqual(['MAT-018']);
  });

  it('al decir que sí, suma stock sin revaluar el PMP ni crear ficha nueva', () => {
    const mov = movimientoSumarStockDuplicado({
      productoId: 'abc', almacen: ALMACEN_MINA, cantidad: 12,
      actor: 'u-1', actorName: 'María', detalle: 'Confirmado como el mismo producto',
    });
    expect(mov).toMatchObject({
      producto_id: 'abc', tipo: 'entrada', delta: 12, almacen: ALMACEN_MINA,
      actor: 'u-1', actor_name: 'María', detalle: 'Confirmado como el mismo producto',
    });
    expect(mov.precio_unitario).toBeUndefined();
  });
});
