import type { Existencia, Producto } from '@/shared/lib/types';

export interface DatosAlmacenMovimiento {
  almacen: string;
  nombre: string;
  stock: number;
  costo: number;
}

/** Stock y costo que debe usar un movimiento manual.
 *
 *  En Mina/Reutilizables/Items Dañados el producto tiene depósito fijo: NUNCA se
 *  mueve contra General ni contra otro depósito aunque haya existencias viejas.
 *  Si la lista de existencias todavía no trae la fila, `productos.stock/precio`
 *  es el respaldo (la RPC vuelve a validar contra la base al guardar).
 */
export function datosAlmacenMovimiento(
  producto: Pick<Producto, 'almacen' | 'stock' | 'precio'>,
  existencias: Existencia[],
): DatosAlmacenMovimiento {
  const conStock = existencias
    .filter((e) => Number(e.stock) > 0)
    .sort((a, b) => Number(b.stock) - Number(a.stock));
  const depositoPropio = Boolean(producto.almacen && producto.almacen !== 'General');
  const almacen = depositoPropio
    ? producto.almacen!
    : (conStock[0]?.almacen || producto.almacen || 'General');
  const ex = existencias.find((e) => e.almacen === almacen);
  const esAlmacenDelProducto = almacen === (producto.almacen || 'General');
  return {
    almacen,
    nombre: almacen === 'General' ? 'Inventario General' : almacen,
    stock: ex
      ? (Number(ex.stock) || 0)
      : (esAlmacenDelProducto ? (Number(producto.stock) || 0) : 0),
    costo: ex
      ? (Number(ex.costo_promedio) || 0)
      : (esAlmacenDelProducto ? (Number(producto.precio) || 0) : 0),
  };
}
