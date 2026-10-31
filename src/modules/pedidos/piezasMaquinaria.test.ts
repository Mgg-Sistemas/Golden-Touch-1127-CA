import { describe, it, expect } from 'vitest';
import type { ItemOrden } from '@/shared/lib/types';
import {
  aplicarVinculos, asignarProducto, esNombreGenerico, esPiezaMaquinaria, etiquetaRenglonPorAsignar,
  piezasSinProducto, productoUsadoEnOtroRenglon, requiereAsignarProducto,
} from './piezasMaquinaria';

const pieza = (sku: string, nombre: string, extra: Partial<ItemOrden> = {}): ItemOrden => ({
  sku, nombre, cantidad: 1, precio: 0, unidad: 'und', comprar: true,
  pieza_maquinaria: true, categoria_servicio: 'REPUESTOS', equipo_id: 'eq-1', equipo_nombre: 'CAT D9R', orden_servicio: 'OS-2026-0001',
  ...extra,
});

const filtro = { id: 'p-filtro', sku: 'REP-010', nombre: 'FILTRO DE AIRE CAT 6I-2501', unidad: 'und' };

describe('piezas de Maquinaria en la cotización', () => {
  it('solo cuentan como pendientes las piezas de Maquinaria que se compran y no tienen producto', () => {
    const items = [
      pieza('SRV-A', 'FILTRO DE AIRE'),
      pieza('REP-003', 'BATERÍA', { productoId: 'p-bat' }),
      pieza('SRV-B', 'CORREA', { comprar: false }),
      { sku: 'GEN-1', nombre: 'TORNILLO', cantidad: 1, precio: 0 } as ItemOrden,
    ];
    expect(piezasSinProducto(items).map((i) => i.sku)).toEqual(['SRV-A']);
    expect(esPiezaMaquinaria(items[3])).toBe(false);
  });

  it('asignar producto: cambia sku/nombre/unidad, guarda el nombre general y marca el repuesto del equipo', () => {
    const [it] = asignarProducto([pieza('SRV-A', 'FILTRO DE AIRE', { unidad: '' })], 'SRV-A', filtro);
    expect(it).toMatchObject({
      productoId: 'p-filtro', sku: 'REP-010', nombre: 'FILTRO DE AIRE CAT 6I-2501', unidad: 'und',
      nombre_solicitado: 'FILTRO DE AIRE', insumo_producto_id: 'p-filtro', insumo_nombre: 'FILTRO DE AIRE CAT 6I-2501',
      equipo_id: 'eq-1', pieza_maquinaria: true,
    });
  });

  it('al cambiar de producto se conserva el nombre general original', () => {
    const una = asignarProducto([pieza('SRV-A', 'FILTRO DE AIRE')], 'SRV-A', filtro);
    const dos = asignarProducto(una, 'REP-010', { id: 'p-otro', sku: 'REP-011', nombre: 'FILTRO DE AIRE DONALDSON' });
    expect(dos[0].nombre_solicitado).toBe('FILTRO DE AIRE');
    expect(dos[0].sku).toBe('REP-011');
  });

  it('las variantes de marca (mismo sku) reciben el mismo producto; los demás renglones no', () => {
    const items = [pieza('SRV-A', 'FILTRO DE AIRE', { marca: 'CAT' }), pieza('SRV-A', 'FILTRO DE AIRE', { marca: 'FLEETGUARD' }), pieza('SRV-B', 'CORREA')];
    const r = asignarProducto(items, 'SRV-A', filtro);
    expect(r.map((i) => i.sku)).toEqual(['REP-010', 'REP-010', 'SRV-B']);
    expect(r[2].productoId).toBeUndefined();
  });

  it('no se puede poner el mismo producto en dos piezas distintas (quedarían como alternativas)', () => {
    const items = [pieza('REP-010', 'FILTRO', { productoId: 'p-filtro' }), pieza('SRV-B', 'OTRO FILTRO')];
    expect(productoUsadoEnOtroRenglon(items, 'SRV-B', 'p-filtro')).toBe(true);
    expect(productoUsadoEnOtroRenglon(items, 'REP-010', 'p-filtro')).toBe(false);
  });

  it('aplicarVinculos deja en la solicitud los productos elegidos (por el sku original) y no toca lo demás', () => {
    const orden = [pieza('SRV-A', 'FILTRO DE AIRE'), pieza('SRV-B', 'CORREA'), { sku: 'GEN-1', nombre: 'X', cantidad: 1, precio: 0 } as ItemOrden];
    const r = aplicarVinculos(orden, new Map([['SRV-A', filtro], ['GEN-1', filtro]]));
    expect(r[0].productoId).toBe('p-filtro');
    expect(r[1]).toBe(orden[1]);
    expect(r[2]).toBe(orden[2]);
  });

  it('aplicarVinculos sin cambios devuelve el mismo arreglo (no se reescribe la orden)', () => {
    const orden = [pieza('REP-010', 'FILTRO DE AIRE CAT 6I-2501', { productoId: 'p-filtro' })];
    expect(aplicarVinculos(orden, new Map([['REP-010', filtro]]))).toBe(orden);
    expect(aplicarVinculos(orden, new Map())).toBe(orden);
  });

  it('aplicarVinculos no repite un producto que ya tiene otra pieza', () => {
    const orden = [pieza('REP-010', 'FILTRO', { productoId: 'p-filtro' }), pieza('SRV-B', 'OTRO')];
    const r = aplicarVinculos(orden, new Map([['SRV-B', filtro]]));
    expect(r[1].productoId).toBeUndefined();
  });
});

describe('renglones con nombre genérico de una Solicitud de Pedido (31/10/2026)', () => {
  const generico = (sku: string, nombre: string, extra: Partial<ItemOrden> = {}): ItemOrden => ({
    sku, nombre, cantidad: 2, precio: 0, unidad: 'und', comprar: true, nombre_generico: true, ...extra,
  });

  it('requieren producto igual que las piezas de Maquinaria; los renglones comunes no', () => {
    expect(requiereAsignarProducto(generico('SPG-1', 'FILTRO'))).toBe(true);
    expect(requiereAsignarProducto(pieza('SRV-A', 'FILTRO'))).toBe(true);
    expect(requiereAsignarProducto({ sku: 'GEN-1', nombre: 'X', cantidad: 1, precio: 0 } as ItemOrden)).toBe(false);
    expect(esNombreGenerico(generico('SPG-1', 'FILTRO'))).toBe(true);
    expect(esPiezaMaquinaria(generico('SPG-1', 'FILTRO'))).toBe(false);
  });

  it('cuentan como pendientes mientras no tengan producto (y solo si se compran)', () => {
    const items = [
      generico('SPG-1', 'FILTRO'),
      generico('SPG-2', 'CORREA', { comprar: false }),
      generico('REP-010', 'FILTRO DE AIRE CAT', { productoId: 'p-filtro' }),
    ];
    expect(piezasSinProducto(items).map((i) => i.sku)).toEqual(['SPG-1']);
  });

  it('al asignar producto toman el del inventario, guardan el nombre genérico y NO quedan como repuesto de equipo', () => {
    const [it] = asignarProducto([generico('SPG-1', 'FILTRO DE AIRE')], 'SPG-1', filtro);
    expect(it).toMatchObject({ productoId: 'p-filtro', sku: 'REP-010', nombre: filtro.nombre, nombre_solicitado: 'FILTRO DE AIRE', nombre_generico: true });
    expect(it.insumo_producto_id).toBeUndefined();
    expect(it.insumo_nombre).toBeUndefined();
  });

  it('aplicarVinculos deja el producto elegido en la solicitud genérica', () => {
    const orden = [generico('SPG-1', 'FILTRO DE AIRE'), generico('SPG-2', 'CORREA')];
    const r = aplicarVinculos(orden, new Map([['SPG-1', filtro]]));
    expect(r[0]).toMatchObject({ productoId: 'p-filtro', sku: 'REP-010' });
    expect(r[1]).toBe(orden[1]);
  });

  it('rótulo de la celda según el origen', () => {
    expect(etiquetaRenglonPorAsignar(generico('SPG-1', 'X'))).toBe('📝 Nombre genérico de la solicitud');
    expect(etiquetaRenglonPorAsignar(pieza('SRV-A', 'X'))).toBe('🚜 Repuesto de Maquinaria');
  });
});
