/* ============================================================
   El TXT de «Confirmada pagar» se lee en un chat, no en el sistema.

   Eso lo vuelve un acuerdo con una persona del otro lado: cambia el formato y
   quien paga tiene que volver a aprender dónde mirar. Estos tests fijan la
   forma exacta, incluidos los emoji y los asteriscos de WhatsApp, para que un
   cambio accidental se note acá y no en el teléfono de alguien.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import type { Orden, Proveedor } from '@/shared/lib/types';
import { textoOrdenPagar } from './confirmadasPagarTxt';

const proveedor = { razon_social: 'MAXI SHOES' } as Proveedor;

const ordenBase = {
  oc_codigo: 'OC-2026-0130',
  total: 79,
  total_moneda: 'USD',
  finalidad: 'Dotación de calzado para motorizado (delivery). Para: Héctor Alagal.',
  metodo_pago: [
    { metodo: 'pago_movil', moneda: 'USD', monto: 79, datos: { banco: '0102', ci_rif: 'P1131881', telefono: '04249692172' } },
  ],
} as unknown as Orden;

describe('textoOrdenPagar', () => {
  it('sale exactamente con el formato acordado', () => {
    expect(textoOrdenPagar(ordenBase, proveedor)).toBe(
      [
        '🔹 *ORDEN:* OC-2026-0130',
        '🏭 *Proveedor:* MAXI SHOES',
        '📝 *Detalle:* Dotación de calzado para motorizado (delivery). Para: Héctor Alagal.',
        '💵 *Total:* $79,00',
        '💳 *Pago móvil:*',
        '* Banco: Banco de Venezuela (0102)',
        '* CI/RIF: P1131881',
        '* Tlf: 04249692172',
      ].join('\n'),
    );
  });

  it('con una sola pata NO repite el monto al lado del método', () => {
    // El total ya está arriba; repetirlo estorba.
    expect(textoOrdenPagar(ordenBase, proveedor)).toContain('💳 *Pago móvil:*\n');
  });

  it('con varias patas sí muestra cuánto va por cada una', () => {
    const partida = {
      ...ordenBase,
      total: 106,
      metodo_pago: [
        { metodo: 'divisas_efectivo', moneda: 'USD', monto: 100, datos: {} },
        { metodo: 'pago_movil', moneda: 'Bs', monto: 6, datos: { banco: '0134', ci_rif: 'V12345678', telefono: '04141234567' } },
      ],
    } as unknown as Orden;
    const txt = textoOrdenPagar(partida, proveedor);
    expect(txt).toContain('💳 *Divisas en efectivo:* USD 100,00');
    expect(txt).toContain('💳 *Pago móvil:* Bs 6,00');
    expect(txt).toContain('* Banco: Banesco (0134)');
  });

  it('lleva la nota cuando la orden la tiene, debajo del detalle', () => {
    const conNota = { ...ordenBase, notas: 'Retirar en tienda, preguntar por Luis.' } as unknown as Orden;
    const txt = textoOrdenPagar(conNota, proveedor);
    expect(txt).toContain('🗒 *Nota:* Retirar en tienda, preguntar por Luis.');
    // El orden importa: primero para qué se pide, después la aclaración, y
    // recién al final la plata y por dónde se paga.
    expect(txt.indexOf('📝')).toBeLessThan(txt.indexOf('🗒'));
    expect(txt.indexOf('🗒')).toBeLessThan(txt.indexOf('💵'));
  });

  it('omite la nota cuando la orden no tiene ninguna', () => {
    expect(textoOrdenPagar(ordenBase, proveedor)).not.toContain('🗒');
  });

  it('omite el detalle cuando la orden no tiene ninguno', () => {
    const sinDetalle = { ...ordenBase, finalidad: null, motivo: null, items: [] } as unknown as Orden;
    expect(textoOrdenPagar(sinDetalle, proveedor)).not.toContain('📝');
  });

  it('cae al motivo cuando no hay finalidad', () => {
    const conMotivo = { ...ordenBase, finalidad: null, motivo: 'Reposición de stock' } as unknown as Orden;
    expect(textoOrdenPagar(conMotivo, proveedor)).toContain('📝 *Detalle:* Reposición de stock');
  });

  it('avisa cuando todavía no se indicó el método de pago', () => {
    const sinMetodo = { ...ordenBase, metodo_pago: [] } as unknown as Orden;
    expect(textoOrdenPagar(sinMetodo, proveedor)).toContain('💳 *Método de pago:* (sin indicar)');
  });

  it('usa el total en divisa cuando la orden se paga en divisa', () => {
    const enDivisa = { ...ordenBase, pago_en_divisa: true, total: 3000, total_divisa: 79 } as unknown as Orden;
    expect(textoOrdenPagar(enDivisa, proveedor)).toContain('💵 *Total:* $79,00');
  });
});
