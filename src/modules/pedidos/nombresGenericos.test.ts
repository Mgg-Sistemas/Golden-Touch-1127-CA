import { describe, it, expect } from 'vitest';
import type { ItemOrden } from '@/shared/lib/types';
import {
  PREFIJO_SKU_GENERICO, agregarNombreGenerico, itemsParaSpGenerica, normalizarNombreGenerico,
  renglonGenerico, skuProvisionalGenerico, spConNombresGenericos,
} from './nombresGenericos';

describe('¿la SP va con nombres genéricos?', () => {
  it('solo con el flujo nuevo encendido y si quien la monta no es analista de compras ni admin', () => {
    expect(spConNombresGenericos({ revisionAlmacenActiva: true, rol: 'almacenista' })).toBe(true);
    expect(spConNombresGenericos({ revisionAlmacenActiva: true, rol: 'control_de_maquinaria' })).toBe(true);
    expect(spConNombresGenericos({ revisionAlmacenActiva: true, rol: null })).toBe(true);
    expect(spConNombresGenericos({ revisionAlmacenActiva: true, rol: 'analista_de_compras' })).toBe(false);
    expect(spConNombresGenericos({ revisionAlmacenActiva: true, rol: 'admin' })).toBe(false);
  });

  it('con el interruptor apagado todo sigue como antes', () => {
    expect(spConNombresGenericos({ revisionAlmacenActiva: false, rol: 'almacenista' })).toBe(false);
  });

  it('la solicitud de mercado de Cocina no cambia', () => {
    expect(spConNombresGenericos({ revisionAlmacenActiva: true, rol: 'cocina', mercado: true })).toBe(false);
  });
});

describe('renglones genéricos', () => {
  it('normaliza el nombre (mayúsculas, espacios simples)', () => {
    expect(normalizarNombreGenerico('  filtro   de aceite ')).toBe('FILTRO DE ACEITE');
  });

  it('el renglón no lleva producto y queda marcado', () => {
    const r = renglonGenerico({ nombre: 'filtro', cantidad: 3, unidad: '', sku: 'SPG-1' });
    expect(r).toEqual({ sku: 'SPG-1', nombre: 'FILTRO', cantidad: 3, precio: 0, unidad: 'und', comprar: true, nombre_generico: true });
    expect(r.productoId).toBeUndefined();
  });

  it('el sku provisional es único dentro de la solicitud', () => {
    let n = 0;
    const azar = () => [0.5, 0.5, 0.25][n++ % 3];
    const primero = skuProvisionalGenerico([], azar);
    const segundo = skuProvisionalGenerico([primero], azar);
    expect(primero.startsWith(PREFIJO_SKU_GENERICO)).toBe(true);
    expect(segundo).not.toBe(primero);
  });

  it('agregar el mismo nombre (aunque cambien acentos o mayúsculas) suma la cantidad', () => {
    const a = agregarNombreGenerico([], { nombre: 'Batería 12V', cantidad: 1, unidad: 'und' });
    expect(a.repetido).toBe(false);
    const b = agregarNombreGenerico(a.items, { nombre: 'BATERIA  12v', cantidad: 2 });
    expect(b.repetido).toBe(true);
    expect(b.items).toHaveLength(1);
    expect(b.items[0].cantidad).toBe(3);
  });

  it('un nombre vacío no agrega nada', () => {
    const items: ItemOrden[] = [];
    expect(agregarNombreGenerico(items, { nombre: '   ' }).items).toBe(items);
  });

  it('al guardar en modo genérico, ningún renglón sale casado a un producto', () => {
    const items: ItemOrden[] = [
      { sku: 'REP-010', nombre: 'Filtro de aire', cantidad: 1, precio: 0, unidad: 'und', productoId: 'p-1', marca: 'CAT' },
      renglonGenerico({ nombre: 'correa', sku: 'SPG-AAAAA' }),
    ];
    const r = itemsParaSpGenerica(items);
    expect(r.every((it) => !it.productoId && it.nombre_generico === true)).toBe(true);
    expect(r[0].sku.startsWith(PREFIJO_SKU_GENERICO)).toBe(true);
    expect(r[0]).toMatchObject({ nombre: 'FILTRO DE AIRE', marca: 'CAT' });
    expect(r[1]).toBe(items[1]);
  });
});
