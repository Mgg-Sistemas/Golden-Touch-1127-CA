import { describe, it, expect } from 'vitest';
import { desenlaceCompra } from './SeguimientoCompraModal';

/**
 * El tablero agrupa cancelada / rechazada / desistida / reasignada en una sola columna;
 * el seguimiento tiene que decir el estado REAL de Pedidos (26/10/2026).
 */
describe('desenlaceCompra', () => {
  it('compras en curso o terminadas bien no tienen desenlace', () => {
    for (const e of ['pendiente', 'aprobada', 'oc_creada', 'oc_aprobada', 'confirmada_metodo', 'pagada', 'por_recibir', 'recibida', 'finalizada']) {
      expect(desenlaceCompra(e)).toBeNull();
    }
  });

  it('cancelada y rechazada son finales: la orden de servicio quedó anulada', () => {
    const c = desenlaceCompra('cancelada');
    expect(c).toMatchObject({ label: 'Cancelada', terminal: true });
    expect(c?.texto).toContain('anulada');
    const r = desenlaceCompra('rechazada');
    expect(r).toMatchObject({ label: 'Rechazada', terminal: true });
    expect(r?.texto).toContain('Compras rechazó');
  });

  it('proveedor desistió NO es final: Compras vuelve a cotizar y la orden sigue esperando', () => {
    const d = desenlaceCompra('desistida_proveedor');
    expect(d).toMatchObject({ label: 'Proveedor desistió', terminal: false });
    expect(d?.texto).toContain('vuelve a cotizar');
    expect(d?.texto).not.toContain('anulada');
  });

  it('reasignada (hija devuelta a la madre) tampoco es final', () => {
    expect(desenlaceCompra('reasignada')).toMatchObject({ label: 'Reasignada', terminal: false });
  });

  it('un estado desconocido en esa columna muestra su etiqueta y se trata como final', () => {
    expect(desenlaceCompra('anulada')).toMatchObject({ label: 'Anulada', terminal: true });
    expect(desenlaceCompra(null)?.terminal).toBe(true);
  });
});
