import { describe, it, expect } from 'vitest';
import { datosWhatsappPedirCompra } from './PedirCompraModal';
import { textoCompraRepuestosWhatsapp } from './maquinariaWhatsapp';
import type { RepuestoOrden } from './flota';

const rep = (p: Partial<RepuestoOrden> & Pick<RepuestoOrden, 'nombre' | 'a_comprar'>): RepuestoOrden => ({
  producto_id: null, unidad: 'und', almacen: null, cantidad: p.a_comprar, stock_al_crear: 0, desde_inventario: 0, origen: 'compra',
  ...p,
} as RepuestoOrden);

const orden = {
  codigo: 'OS-2026-0012',
  repuestos: [
    rep({ nombre: 'MANGUERA HIDRAULICA 3/4', a_comprar: 2 }),
    rep({ nombre: 'FILTRO DE ACEITE', a_comprar: 1, producto_id: 'p-1', cantidad: 3, desde_inventario: 2, origen: 'parcial' }),
    rep({ nombre: 'ACEITE 15W40', a_comprar: 0, producto_id: 'p-2', cantidad: 20, desde_inventario: 20, origen: 'stock' }),
  ],
};

describe('datosWhatsappPedirCompra', () => {
  it('el equipo es el nombre del equipo, no «Orden OS-…»; la orden va como referencia', () => {
    const d = datosWhatsappPedirCompra(orden, 'EXCAVADORA VOLVO EC240', 'SS-2026-0300');
    expect(d.equipo).toBe('EXCAVADORA VOLVO EC240');
    expect(d.ordenServicio).toBe('OS-2026-0012');
    expect(d.solicitudServicio).toBe('SS-2026-0300');
    const txt = textoCompraRepuestosWhatsapp({ ...d, fecha: '2026-10-26T13:00:00Z' });
    expect(txt).toContain('EQUIPO DESTINO:* EXCAVADORA VOLVO EC240');
    expect(txt).toContain('*Orden de Servicio:* OS-2026-0012');
    expect(txt).toContain('*Solicitud de Servicio:* SS-2026-0300');
    expect(txt).not.toContain('Orden OS-2026-0012');
  });

  it('lista lo que realmente va a Compras: todo lo que tenga algo a comprar, con esa cantidad', () => {
    const d = datosWhatsappPedirCompra(orden, 'CAM-05', 'SS-1');
    expect(d.piezas).toEqual([
      { nombre: 'MANGUERA HIDRAULICA 3/4', cantidad: 2, unidad: 'und' },
      { nombre: 'FILTRO DE ACEITE', cantidad: 1, unidad: 'und' },
    ]);
  });

  it('sin nombre de equipo cae a «Equipo de la orden …» (nunca manda vacío)', () => {
    expect(datosWhatsappPedirCompra(orden, null, 'SS-1').equipo).toBe('Equipo de la orden OS-2026-0012');
    expect(datosWhatsappPedirCompra(orden, '   ', 'SS-1').equipo).toBe('Equipo de la orden OS-2026-0012');
  });
});
