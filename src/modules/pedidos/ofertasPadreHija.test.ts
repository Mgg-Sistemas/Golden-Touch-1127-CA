import { describe, expect, it } from 'vitest';
import type { OfertaProveedor, Orden } from '@/shared/lib/types';
import { esCotizacionDeEstaOc, idOrdenCotizaciones, ofertaElegidaDe } from './ofertasPadreHija';
import { lineasCotizacionesAprobacion } from './cotizacionesAprobacion';
import { textoOrdenPagar } from './confirmadasPagarTxt';

const of = (proveedor_id: string, estado: OfertaProveedor['estado'], registrada_en: string): OfertaProveedor => ({
  id: `of-${proveedor_id}`, orden_id: 'madre', proveedor_id, estado, registrada_en,
  items: [], precio_total: 100, registrada_por_email: 'analista@gmail.com',
} as unknown as OfertaProveedor);

const hija = { id: 'hija-1', op_padre_id: 'madre', proveedor_id: 'pB' } as unknown as Orden;
const madre = { id: 'madre', op_padre_id: null, proveedor_id: null } as unknown as Orden;

describe('cotizaciones en reparto multiproveedor', () => {
  it('las hijas leen las ofertas de la madre, no las suyas', () => {
    expect(idOrdenCotizaciones(hija)).toBe('madre');
    expect(idOrdenCotizaciones(madre)).toBe('madre');
    expect(idOrdenCotizaciones({ ...madre, op_padre_id: null })).toBe('madre');
  });

  it('en una hija la elegida es la de su proveedor, aunque varias estén aceptadas', () => {
    const ofertas = [
      of('pA', 'aceptada', '2026-11-01T10:00:00Z'),
      of('pB', 'aceptada', '2026-11-01T11:00:00Z'),
      of('pC', 'descartada', '2026-11-01T12:00:00Z'),
    ];
    expect(ofertaElegidaDe(hija, ofertas)?.proveedor_id).toBe('pB');
    expect(esCotizacionDeEstaOc(hija, ofertas[1])).toBe(true);
    expect(esCotizacionDeEstaOc(hija, ofertas[0])).toBe(false);
    expect(ofertaElegidaDe(madre, ofertas)?.proveedor_id).toBe('pA');
  });

  it('el WhatsApp de pago lista las N cotizaciones y marca solo la de la hija', () => {
    const o = {
      ...hija,
      codigo: 'SP-2026-0400-1', oc_codigo: 'OC-2026-0200-1', estado: 'pagar',
      total: 120, total_moneda: 'USD', total_divisa: null, pago_en_divisa: false,
    } as unknown as Orden;
    const ofertas = [
      of('pA', 'aceptada', '2026-11-01T10:00:00Z'),
      of('pB', 'aceptada', '2026-11-01T11:00:00Z'),
      of('pC', 'descartada', '2026-11-01T12:00:00Z'),
    ];
    const L = lineasCotizacionesAprobacion(o, ofertas, { nombreProveedor: (id) => id.toUpperCase() });
    expect(L[0]).toBe('📊 *COTIZACIONES RECIBIDAS (3):*');
    expect(L.slice(1, 4).filter((x) => x.startsWith('✅'))).toHaveLength(1);
    expect(L[2]).toContain('✅ *COTIZACIÓN 2:* PB');
    expect(L[1]).toContain('🔸 *COTIZACIÓN 1:* PA');
    expect(L[3]).toContain('🔸 *COTIZACIÓN 3:* PC');

    const txt = textoOrdenPagar(o, { razon_social: 'PB' } as never, undefined, 40, {
      ofertas, nombreProveedor: (id) => id.toUpperCase(),
    });
    expect(txt).toContain('📊 *COTIZACIONES RECIBIDAS (3):*');
    expect(txt).toContain('✅ *COTIZACIÓN 2:* PB');
    expect(txt.indexOf('COTIZACIONES')).toBeLessThan(txt.indexOf('💵 *Total:*'));
  });
});
