import { describe, expect, it } from 'vitest';
import { datosAlmacenMovimiento } from './movimientoAlmacen';
import { ALMACEN_DANADOS, ALMACEN_MINA, ALMACEN_REUTILIZABLES } from './depositos';
import type { Existencia, Producto } from '@/shared/lib/types';

function producto(almacen: string): Pick<Producto, 'almacen' | 'stock' | 'precio'> {
  return { almacen, stock: 18, precio: 0.4 };
}
function existencia(almacen: string, stock = 18): Existencia {
  return { producto_id: 'p-1', almacen, stock, costo_promedio: 0.4 } as Existencia;
}

describe('almacén y stock del movimiento manual', () => {
  it('INS-180 sale de Mina con 18 UND y costo 0,40, no de General con 0', () => {
    expect(datosAlmacenMovimiento(producto(ALMACEN_MINA), [existencia(ALMACEN_MINA)])).toEqual({
      almacen: ALMACEN_MINA, nombre: ALMACEN_MINA, stock: 18, costo: 0.4,
    });
  });

  it.each([ALMACEN_MINA, ALMACEN_REUTILIZABLES, ALMACEN_DANADOS])(
    'si falta la fila cargada usa el stock del producto en %s sin cambiar de depósito',
    (almacen) => {
      expect(datosAlmacenMovimiento(producto(almacen), [])).toEqual({
        almacen, nombre: almacen, stock: 18, costo: 0.4,
      });
    },
  );

  it('un depósito propio nunca toma el stock de otra existencia', () => {
    const datos = datosAlmacenMovimiento(producto(ALMACEN_MINA), [existencia('General', 99)]);
    expect(datos.almacen).toBe(ALMACEN_MINA);
    expect(datos.stock).toBe(18);
    expect(datos.costo).toBe(0.4);
  });

  it('General conserva la existencia disponible y su etiqueta visible', () => {
    expect(datosAlmacenMovimiento(producto('General'), [existencia('General', 7)])).toEqual({
      almacen: 'General', nombre: 'Inventario General', stock: 7, costo: 0.4,
    });
  });
});
