/* ============================================================
   El TXT de «Confirmada pagar» se lee en un chat, no en el sistema.

   Eso lo vuelve un acuerdo con una persona del otro lado: cambia el formato y
   quien paga tiene que volver a aprender dónde mirar. Estos tests fijan la
   forma exacta, incluidos los emoji y los asteriscos de WhatsApp, para que un
   cambio accidental se note aquí y no en el teléfono de alguien.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import type { Orden, Proveedor } from '@/shared/lib/types';
import { esCuentaCredito, textoOrdenAprobacion, textoOrdenPagar } from './confirmadasPagarTxt';

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
        '💸 *ORDEN PARA PAGAR*',
        '',
        '🔹 *ORDEN:* OC-2026-0130',
        '🏭 *Proveedor:* MAXI SHOES',
        '📝 *Detalle:* Dotación de calzado para motorizado (delivery). Para: Héctor Alagal.',
        '💵 *Total:* $79,00',
        '💳 *Pago móvil:*',
        '* Banco: Banco de Venezuela (0102)',
        '* CI/RIF: P1131881',
        '* Tlf: 04249692172',
        '',
        '🏢 GOLDEN TOUCH 1127 C.A.',
      ].join('\n'),
    );
  });

  it('una compra a crédito lleva su propio título', () => {
    const credito = { ...ordenBase, estado: 'cuenta_abierta' } as unknown as Orden;
    expect(textoOrdenPagar(credito, proveedor).startsWith('🧾 *COMPRA A CRÉDITO*\n\n')).toBe(true);
  });

  it('no usa emojis que necesiten el selector invisible (WhatsApp lo pierde)', () => {
    const completa = { ...ordenBase, notas: 'x', estado: 'cuenta_abierta', abonado_total: 10 } as unknown as Orden;
    expect(textoOrdenPagar(completa, proveedor)).not.toContain('\uFE0F');
    expect(textoOrdenPagar(completa, proveedor)).not.toContain('🗒');
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
    expect(txt).toContain('📌 *Nota:* Retirar en tienda, preguntar por Luis.');
    // El orden importa: primero para qué se pide, después la aclaración, y
    // recién al final el dinero y por dónde se paga.
    expect(txt.indexOf('📝')).toBeLessThan(txt.indexOf('📌'));
    expect(txt.indexOf('📌')).toBeLessThan(txt.indexOf('💵'));
  });

  it('omite la nota cuando la orden no tiene ninguna', () => {
    expect(textoOrdenPagar(ordenBase, proveedor)).not.toContain('📌');
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

  // ── Compras a crédito (cuenta abierta) ──────────────────────────────
  // Mandar el total de un crédito es mandar el número equivocado: lo que se paga
  // es el saldo. Estos tests fijan que la resta salga y salga bien.
  it('en una cuenta abierta con abonos manda lo abonado y el saldo', () => {
    const credito = { ...ordenBase, estado: 'cuenta_abierta', total: 1391.25, abonado_total: 400 } as unknown as Orden;
    const txt = textoOrdenPagar(credito, proveedor);
    expect(txt).toContain('💵 *Total:* $1.391,25');
    expect(txt).toContain('💰 *Abonado:* $400,00');
    expect(txt).toContain('🧾 *Saldo a pagar:* $991,25');
  });

  it('en una cuenta abierta sin abonos avisa que es a crédito y no resta nada', () => {
    const credito = { ...ordenBase, estado: 'cuenta_abierta', total: 756.44, abonado_total: 0 } as unknown as Orden;
    const txt = textoOrdenPagar(credito, proveedor);
    expect(txt).toContain('💵 *Total:* $756,44');
    expect(txt).toContain('🧾 *A crédito:* cuenta abierta, sin abonos todavía');
    expect(txt).not.toContain('💰 *Abonado:*');
  });

  it('el saldo nunca sale en negativo, aunque lo abonado pase el total', () => {
    const credito = { ...ordenBase, estado: 'cuenta_abierta', total: 100, abonado_total: 130 } as unknown as Orden;
    expect(textoOrdenPagar(credito, proveedor)).toContain('🧾 *Saldo a pagar:* $0,00');
  });

  it('una orden que no es a crédito no habla de saldos', () => {
    const txt = textoOrdenPagar(ordenBase, proveedor);
    expect(txt).not.toContain('Saldo a pagar');
    expect(txt).not.toContain('Abonado');
  });

  it('en cuentas a crédito NO muestra método de pago (ni con datos ni sin indicar)', () => {
    const creditoConMetodo = {
      ...ordenBase,
      estado: 'cuenta_abierta',
      total: 1391.25,
      abonado_total: 400,
      metodo_pago: [
        { metodo: 'pago_movil', moneda: 'USD', monto: 79, datos: { banco: '0102', ci_rif: 'P1131881', telefono: '04249692172' } },
      ],
    } as unknown as Orden;
    const txt = textoOrdenPagar(creditoConMetodo, proveedor);
    expect(txt).not.toContain('💳');
    expect(txt).not.toContain('Pago móvil');
    expect(txt).not.toContain('Método de pago');

    const creditoSinAbonos = {
      ...ordenBase,
      condiciones_pago: 'credito',
      estado: 'cuenta_abierta',
      total: 1204.88,
      abonado_total: 0,
      metodo_pago: null,
    } as unknown as Orden;
    const txtSin = textoOrdenPagar(creditoSinAbonos, proveedor);
    expect(txtSin).not.toContain('💳');
    expect(txtSin).not.toContain('(sin indicar)');
  });

  it('esCuentaCredito detecta compras a credito por condicion, estado o abonos', () => {
    expect(esCuentaCredito({ condiciones_pago: 'credito' })).toBe(true);
    expect(esCuentaCredito({ estado: 'cuenta_abierta' })).toBe(true);
    expect(esCuentaCredito({ abonado_total: 50 })).toBe(true);
    expect(esCuentaCredito({ condiciones_pago: 'contado', estado: 'oc_aprobada', abonado_total: 0 })).toBe(false);
  });
});

describe('textoOrdenAprobacion (aviso al Gerente General)', () => {
  const pendiente = {
    ...ordenBase,
    estado: 'oc_creada',
    solicitante: 'JAIME CAMPO',
    unidad_solicitante: 'COCINA',
    metodo_pago: [],
    items: [
      { sku: 'A', nombre: 'HARINA', cantidad: 10, precio: 5, unidad: 'KG' },
      { sku: 'B', nombre: 'ACEITE', cantidad: 2, precio: 3, unidad: 'L', comprar: false },
    ],
  } as unknown as Orden;

  it('sale exactamente con el formato acordado', () => {
    expect(textoOrdenAprobacion(pendiente, proveedor)).toBe(
      [
        '⏳ *ORDEN PENDIENTE POR APROBACIÓN*',
        '',
        '🔹 *ORDEN:* OC-2026-0130',
        '🏭 *Proveedor:* MAXI SHOES',
        '👤 *Solicita:* JAIME CAMPO · COCINA',
        '📝 *Detalle:* Dotación de calzado para motorizado (delivery). Para: Héctor Alagal.',
        '📦 *Cantidad de productos:* 1',
        '💵 *Total:* $79,00',
        '',
        '🏢 GOLDEN TOUCH 1127 C.A.',
      ].join('\n'),
    );
  });

  it('no habla del método de pago: todavía no se indica en esta etapa', () => {
    expect(textoOrdenAprobacion(pendiente, proveedor)).not.toContain('💳');
  });

  it('marca URGENTE, lleva la nota y dice solo cuántos productos son, sin nombrarlos', () => {
    const muchos = {
      ...pendiente, urgente: true, notas: 'Aprobar hoy',
      items: Array.from({ length: 13 }, (_, i) => ({ sku: 'S' + i, nombre: 'P' + i, cantidad: 1, precio: 1 })),
    } as unknown as Orden;
    const txt = textoOrdenAprobacion(muchos, proveedor);
    expect(txt).toContain('🚨 *URGENTE*');
    expect(txt).toContain('📌 *Nota:* Aprobar hoy');
    expect(txt).toContain('📦 *Cantidad de productos:* 13');
    expect(txt).not.toContain('P0');
    expect(txt).not.toContain('más…');
  });

  it('un servicio se titula Control de Servicio y no usa selectores de emoji', () => {
    const txt = textoOrdenAprobacion({ ...pendiente, tipo: 'servicio' } as unknown as Orden, proveedor);
    expect(txt.startsWith('⏳ *CONTROL DE SERVICIO PENDIENTE POR APROBACIÓN*')).toBe(true);
    expect(txt).not.toContain('\uFE0F');
  });
});

describe('quién solicitó, quién autorizó y el analista a cargo', () => {
  const personas = new Map([
    ['gerente@gt.com', 'JESUS LOZADA'],
    ['analista@gt.com', 'MARIA PEREZ'],
    ['pide@gt.com', 'JAIME CAMPO'],
  ]);
  const confirmada = {
    ...ordenBase,
    estado: 'oc_aprobada',
    solicitante: null,
    solicitante_email: 'pide@gt.com',
    unidad_solicitante: 'COCINA',
    oc_aprobada_por: 'gerente@gt.com',
    oc_creada_por: 'analista@gt.com',
  } as unknown as Orden;

  it('la orden por pagar dice quién solicita, quién autorizó y el analista de compras, tras el proveedor', () => {
    const txt = textoOrdenPagar(confirmada, proveedor, personas);
    expect(txt).toContain('👤 *Solicita:* JAIME CAMPO · COCINA');
    expect(txt).toContain('✅ *Autorizó:* JESUS LOZADA');
    expect(txt).toContain('🛒 *Analista de compras:* MARIA PEREZ');
    expect(txt.indexOf('🏭')).toBeLessThan(txt.indexOf('👤'));
    expect(txt.indexOf('✅')).toBeLessThan(txt.indexOf('💵'));
  });

  it('sin el mapa de personas nunca muestra el correo con @, sino Nombre y Apellido', () => {
    const txt = textoOrdenPagar(confirmada, proveedor);
    expect(txt).toContain('✅ *Autorizó:* GERENTE');
    expect(txt).not.toContain('@');
    expect(txt).not.toContain('gt.com');
  });

  it('reconoce aprobadores institucionales automáticamente', () => {
    const conJesus = { ...confirmada, oc_aprobada_por: 'touchgolden1127@gmail.com' } as unknown as Orden;
    const txtJesus = textoOrdenPagar(conJesus, proveedor);
    expect(txtJesus).toContain('✅ *Autorizó:* JESUS LOZADA');
    expect(txtJesus).not.toContain('touchgolden1127@gmail.com');

    const conLeydis = { ...confirmada, oc_aprobada_por: 'jhzgcontabilidad@gmail.com' } as unknown as Orden;
    const txtLeydis = textoOrdenPagar(conLeydis, proveedor);
    expect(txtLeydis).toContain('✅ *Autorizó:* LEYDIS RENGEL');
    expect(txtLeydis).not.toContain('jhzgcontabilidad@gmail.com');
  });

  it('el aviso de aprobación lleva quién solicita y el analista, pero no «Autorizó» (aún no se aprueba)', () => {
    const txt = textoOrdenAprobacion({ ...confirmada, estado: 'oc_creada' } as unknown as Orden, proveedor, personas);
    expect(txt).toContain('👤 *Solicita:* JAIME CAMPO · COCINA');
    expect(txt).toContain('🛒 *Analista de compras:* MARIA PEREZ');
    expect(txt).not.toContain('Autorizó');
  });
});
