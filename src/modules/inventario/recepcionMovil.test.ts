import { describe, expect, it } from 'vitest';
import type { ItemOrden } from '@/shared/lib/types';
import { cantidadesRecibidas, docRecepcion, errorRecepcion, esParcial, mensajeRecepcion, type PorRecepcionar } from './recepcionMovil';

const p: PorRecepcionar = {
  pedido_id: 'd1', orden_id: 'o1', sp: 'SP-2026-0428', oc: 'OC-2026-0191', proveedor: 'HIERROS SAN FELIX', proveedor_rif: null,
  solicitante: 'FREDDY TORRES', unidad_solicitante: 'ELECTRICIDAD', analista: 'NAZARET SALAZAR', delivery: 'CARLOS PÉREZ',
  entregado_en: '2026-11-04T15:00:00Z', almacen_entrega: 'Los Pinos', nota_entrega: null,
  fotos_recibo: [], fotos_entrega: [{ path: 'd1/entrega-1.jpg', filename: '1.jpg' }],
  items: [
    { sku: 'TUB-1', nombre: 'TUBO 2"', cantidad: 10, precio: 5, unidad: 'UND', productoId: 'p1' },
    { sku: 'COD-1', nombre: 'CODO 2"', cantidad: 4, precio: 1, unidad: 'UND', productoId: 'p2' },
  ] as ItemOrden[],
  total: 54, almacen_destino: 'General', urgente: false,
};

describe('Inventario (teléfono) · recepción de lo que entrega el delivery', () => {
  it('vacío = llegó todo; lo escrito no pasa de lo pedido', () => {
    expect(cantidadesRecibidas(p, ['', ''])).toEqual([10, 4]);
    expect(cantidadesRecibidas(p, ['8', ''])).toEqual([8, 4]);
    expect(esParcial(p, ['', ''])).toBe(false);
    expect(esParcial(p, ['8', ''])).toBe(true);
  });
  it('valida lo que se escribe', () => {
    expect(errorRecepcion(p, ['', ''])).toBeNull();
    expect(errorRecepcion(p, ['12', ''])).toBe('De TUBO 2" se pidieron 10: no se puede recibir más.');
    expect(errorRecepcion(p, ['0', '0'])).toBe('No llegó nada: si la orden no vino, no la recepciones.');
    expect(errorRecepcion(p, ['abc', ''])).toBe('Revisa la cantidad de TUBO 2".');
  });
  it('el WhatsApp y el PDF', () => {
    const t = mensajeRecepcion(p, ['8', ''], 'ISNER ORENCE', '2026-11-04T16:00:00Z');
    expect(t).toContain('📥 *RECEPCIÓN EN ALMACÉN*');
    expect(t).toContain('🔖 *OC:* OC-2026-0191 · SP-2026-0428');
    expect(t).toContain('🛵 *Delivery:* CARLOS PÉREZ');
    expect(t).toContain('1. TUBO 2" — *8 UND* de 10 ⚠');
    expect(t).toContain('⚠ *Llegó incompleta*');
    expect(t).toContain('👷 *Recepcionó:* ISNER ORENCE');
    const d = docRecepcion(p, ['8', ''], { actor: 'isner@gt.com', nombre: 'ISNER ORENCE' }, '2026-11-04T16:00:00Z');
    expect(d.opciones.titulo).toBe('ORDEN DE ENTRADA');
    expect(d.sol.items?.map((i) => i.cantidad)).toEqual([8, 4]);
  });
});
