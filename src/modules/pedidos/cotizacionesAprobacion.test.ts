/* ============================================================
   Cotizaciones en el WhatsApp de «OC pendiente por aprobar».
   Fijan el formato que lee el Gerente General: todas las cotizaciones
   numeradas en $ y Bs, la elegida (✅) y el analista que la escogió.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import type { OfertaProveedor, Orden, Proveedor } from '@/shared/lib/types';
import { lineasCotizacionesAprobacion, totalOfertaConImpuestos, montoDosMonedas } from './cotizacionesAprobacion';
import { textoOrdenAprobacion } from './confirmadasPagarTxt';

const PROVS: Record<string, string> = {
  pA: 'AGRODEPORTES GORGONES',
  pB: 'MATERIALES AGROINDUSTRIALES,C.A.',
  pC: 'HIERROS SAN FELIX',
};
const nombreProveedor = (id: string) => PROVS[id];

function oferta(p: Partial<OfertaProveedor>): OfertaProveedor {
  return {
    id: 'of-' + p.proveedor_id, orden_id: 'o1', items: [], precio_total: 0, estado: 'pendiente',
    registrada_por_email: 'analista1mgg@gmail.com', registrada_en: '2026-10-27T00:00:00Z', ...p,
  } as OfertaProveedor;
}

// Datos reales de SP-2026-0361 / OC-2026-0180 (base 30/10/2026).
const ofA = oferta({
  proveedor_id: 'pA', precio_total: 960, iva_aplicado: true, iva_monto: 153.6, estado: 'aceptada',
  registrada_en: '2026-10-27T22:06:55Z', decidida_por_email: 'analista1mgg@gmail.com',
});
const ofB = oferta({
  proveedor_id: 'pB', precio_total: 1200, precio_divisa: 1200, iva_aplicado: true, iva_monto: 192, estado: 'descartada',
  registrada_en: '2026-10-30T14:40:42Z', decidida_por_email: 'analista1mgg@gmail.com',
});
const orden = {
  codigo: 'SP-2026-0361', oc_codigo: 'OC-2026-0180', estado: 'oc_creada', proveedor_id: 'pA',
  total: 1113.6, total_moneda: null, pago_en_divisa: false, total_divisa: null,
  oc_creada_por: 'analista1mgg@gmail.com', solicitante: 'JAIME CAMPO', unidad_solicitante: 'TALLER',
  items: [{ sku: 'REPU-002', nombre: 'ESPADA', cantidad: 4, precio: 240 }],
  historial: [{ at: '2026-10-30T14:46:21Z', actor: 'analista1mgg@gmail.com', evento: 'oc_creada' }],
} as unknown as Orden;

describe('montoDosMonedas y total de la oferta', () => {
  it('$ primero y Bs a la tasa; sin tasa solo la moneda propia', () => {
    expect(montoDosMonedas(100, 'USD', 40)).toBe('$100,00 · Bs 4.000,00');
    expect(montoDosMonedas(4000, 'Bs', 40)).toBe('$100,00 · Bs 4.000,00');
    expect(montoDosMonedas(100, 'USD', null)).toBe('$100,00');
    expect(montoDosMonedas(4000, 'Bs', 0)).toBe('Bs 4.000,00');
  });

  it('total = base − descuento + IVA + IGTF (los impuestos no aplicados no suman)', () => {
    expect(totalOfertaConImpuestos(oferta({
      proveedor_id: 'pC', precio_total: 1000, descuento_obtenido: 50,
      iva_aplicado: true, iva_monto: 160, igtf_aplicado: true, igtf_monto: 30,
    }))).toBe(1140);
    expect(totalOfertaConImpuestos(oferta({ proveedor_id: 'pC', precio_total: 500, iva_aplicado: false, iva_monto: 80 }))).toBe(500);
  });
});

describe('textoOrdenAprobacion con cotizaciones', () => {
  it('sale exactamente con el formato acordado (caso real SP-2026-0361, 2 cotizaciones)', () => {
    const txt = textoOrdenAprobacion(orden, { razon_social: 'AGRODEPORTES GORGONES' } as Proveedor, undefined, {
      ofertas: [ofB, ofA], nombreProveedor, tasaUsd: 36.5,
    });
    expect(txt).toBe([
      '⏳ *ORDEN PENDIENTE POR APROBACIÓN*',
      '',
      '🔹 *ORDEN:* OC-2026-0180',
      '🏭 *Proveedor:* AGRODEPORTES GORGONES',
      '👤 *Solicita:* JAIME CAMPO · TALLER',
      '🛒 *Analista encargado:* JAVIER LEIVA',
      '📦 *Cantidad de productos:* 1',
      '',
      '📊 *COTIZACIONES RECIBIDAS (2):*',
      '✅ *COTIZACIÓN 1:* AGRODEPORTES GORGONES · $1.113,60 · Bs 40.646,40',
      '🔸 *COTIZACIÓN 2:* MATERIALES AGROINDUSTRIALES,C.A. · $1.392,00 · Bs 50.808,00',
      '💱 *Tasa BCV:* 36,50',
      '👤 El analista *JAVIER LEIVA* escogió la *COTIZACIÓN 1* (AGRODEPORTES GORGONES)',
      '',
      '💵 *Total:* $1.113,60',
      '',
      '🏢 GOLDEN TOUCH 1127 C.A.',
    ].join('\n'));
    expect(txt).not.toContain('@');
    expect(txt).not.toContain('️');
  });

  it('sin cotizaciones el aviso queda igual que antes', () => {
    const sin = textoOrdenAprobacion(orden, null);
    expect(textoOrdenAprobacion(orden, null, undefined, { ofertas: [], nombreProveedor, tasaUsd: 36.5 })).toBe(sin);
    expect(sin).not.toContain('COTIZACIÓN');
  });
});

describe('lineasCotizacionesAprobacion', () => {
  it('una sola cotización: numerada 1, elegida y con el analista', () => {
    const L = lineasCotizacionesAprobacion(orden, [ofA], { nombreProveedor, tasaUsd: 36.5 });
    expect(L).toEqual([
      '📊 *COTIZACIONES RECIBIDAS (1):*',
      '✅ *COTIZACIÓN 1:* AGRODEPORTES GORGONES · $1.113,60 · Bs 40.646,40',
      '💱 *Tasa BCV:* 36,50',
      '👤 El analista *JAVIER LEIVA* escogió la *COTIZACIÓN 1* (AGRODEPORTES GORGONES)',
    ]);
  });

  it('tres cotizaciones en el orden en que se cargaron; la elegida puede ser la del medio', () => {
    const o3 = { ...orden, proveedor_id: 'pC', total: 1335.13 } as unknown as Orden;
    const L = lineasCotizacionesAprobacion(o3, [
      oferta({ proveedor_id: 'pB', precio_total: 1554, iva_aplicado: true, iva_monto: 248.64, registrada_en: '2026-10-13T18:34:00Z', estado: 'descartada' }),
      oferta({ proveedor_id: 'pA', precio_total: 1130.5, iva_aplicado: true, iva_monto: 180.88, registrada_en: '2026-10-13T16:40:00Z', estado: 'descartada' }),
      oferta({ proveedor_id: 'pC', precio_total: 1181.94, iva_aplicado: true, iva_monto: 153.19, registrada_en: '2026-10-13T18:40:00Z', estado: 'aceptada', decidida_por_email: 'comprasanalista9@gmail.com' }),
    ], { nombreProveedor, tasaUsd: 40 });
    expect(L).toEqual([
      '📊 *COTIZACIONES RECIBIDAS (3):*',
      '🔸 *COTIZACIÓN 1:* AGRODEPORTES GORGONES · $1.311,38 · Bs 52.455,20',
      '🔸 *COTIZACIÓN 2:* MATERIALES AGROINDUSTRIALES,C.A. · $1.802,64 · Bs 72.105,60',
      '✅ *COTIZACIÓN 3:* HIERROS SAN FELIX · $1.335,13 · Bs 53.405,20',
      '💱 *Tasa BCV:* 40,00',
      '👤 El analista *KELVIN PEÑA* escogió la *COTIZACIÓN 3* (HIERROS SAN FELIX)',
    ]);
  });

  it('orden en Bs: el monto propio es Bs y el equivalente en $', () => {
    const oBs = { ...orden, total_moneda: 'Bs', total: 4000 } as unknown as Orden;
    const L = lineasCotizacionesAprobacion(oBs, [
      { ...ofA, precio_total: 4000, iva_aplicado: false },
      { ...ofB, precio_total: 5000, precio_divisa: null, iva_aplicado: false },
    ], { nombreProveedor, tasaUsd: 40 });
    expect(L[1]).toBe('✅ *COTIZACIÓN 1:* AGRODEPORTES GORGONES · $100,00 · Bs 4.000,00');
    expect(L[2]).toBe('🔸 *COTIZACIÓN 2:* MATERIALES AGROINDUSTRIALES,C.A. · $125,00 · Bs 5.000,00');
  });

  it('OC en divisa: la elegida usa el total en divisa y lo dice', () => {
    const oDiv = { ...orden, pago_en_divisa: true, total_divisa: 1000, total: 1113.6 } as unknown as Orden;
    const L = lineasCotizacionesAprobacion(oDiv, [ofA], { nombreProveedor, tasaUsd: null });
    expect(L[1]).toBe('✅ *COTIZACIÓN 1:* AGRODEPORTES GORGONES · $1.000,00 (pago en divisa)');
    expect(L.some((l) => l.startsWith('💱'))).toBe(false);
  });

  it('sin quien decidió en la oferta usa el actor de «oc_creada»; sin ningún dato no inventa analista', () => {
    const sinDecidio = { ...ofA, decidida_por_email: null };
    const conHist = lineasCotizacionesAprobacion(
      { ...orden, oc_creada_por: null, historial: [{ at: 'x', actor: 'asistentecomprasgt2@gmail.com', evento: 'oc_creada' }] } as unknown as Orden,
      [sinDecidio], { nombreProveedor },
    );
    expect(conHist.at(-1)).toBe('👤 El analista *NAZARET SALAZAR* escogió la *COTIZACIÓN 1* (AGRODEPORTES GORGONES)');

    const nada = lineasCotizacionesAprobacion(
      { ...orden, oc_creada_por: null, historial: [] } as unknown as Orden, [sinDecidio], { nombreProveedor },
    );
    expect(nada.at(-1)).toBe('👤 Se escogió la *COTIZACIÓN 1* (AGRODEPORTES GORGONES)');
  });

  it('sin oferta aceptada marca la del proveedor de la OC', () => {
    const L = lineasCotizacionesAprobacion(orden, [{ ...ofA, estado: 'pendiente' }, ofB], { nombreProveedor, tasaUsd: null });
    expect(L[1].startsWith('✅ *COTIZACIÓN 1:*')).toBe(true);
    expect(L[2].startsWith('🔸 *COTIZACIÓN 2:*')).toBe(true);
  });
});
