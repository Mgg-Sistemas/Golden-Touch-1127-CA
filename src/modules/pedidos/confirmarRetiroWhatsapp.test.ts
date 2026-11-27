/* ============================================================
   27/11/2026 · Aviso de WhatsApp al confirmar el retiro de una OC.

   El texto es un acuerdo con quien lo lee en el grupo de Delivery: se fija
   el encabezado en grande (negrita + separadores), el formato heredado de
   delivery.ts, que los productos NUNCA se enumeran (se manda al sistema) y
   que en carga pesada NO se escribe la palabra «SUBELO».
   ============================================================ */
import { describe, expect, it } from 'vitest';
import type { Orden, Proveedor } from '@/shared/lib/types';
import { mensajeConfirmarRetiroWhatsapp } from './confirmarRetiroWhatsapp';

const proveedor = {
  razon_social: 'FERRETERIA EL TORNO',
  direccion: 'Av. Principal 123',
} as Proveedor;

const personas = new Map<string, string>([
  ['marianatovar@gmail.com', 'MARIANA TOVAR'],
  ['comprasanalista9@gmail.com', 'KELVIN PEÑA'],
  ['analistadecomprasgt@gmail.com', 'JOSE LIENDRO'],
]);

const base = {
  codigo: 'OC-2026-0001',
  oc_codigo: 'OC-2026-0001',
  proveedor_id: 'prov-1',
  items: [
    { sku: 'REP-252', nombre: 'CORREA B63', cantidad: 5, precio: 10, unidad: 'UND' },
    { sku: 'INS-001', nombre: 'ACEITE 15W40', cantidad: 2, precio: 11.28, unidad: 'L' },
    { sku: 'INS-002', nombre: 'NO SE COMPRA', cantidad: 9, precio: 1, unidad: 'UND', comprar: false },
  ],
  total: 72.56,
  total_moneda: 'USD',
  urgente: true,
  finalidad: 'Mantenimiento',
  notas: 'Retirar temprano',
  solicitante: 'MARIA TOVAR',
  solicitante_email: 'marianatovar@gmail.com',
  unidad_solicitante: 'Produccion',
  oc_creada_por: 'comprasanalista9@gmail.com',
  almacen_destino: 'General',
  sede_entrega: 'los_pinos',
  modalidad_entrega: 'delivery',
  retiro_confirmado_en: '2026-11-27T13:30:00Z',
  retiro_confirmado_por: 'analistadecomprasgt@gmail.com',
} as unknown as Orden;

const mensaje = (o: Orden, modalidad: 'delivery' | 'carga_pesada' | 'proveedor' = 'delivery') =>
  mensajeConfirmarRetiroWhatsapp(o, proveedor, modalidad, undefined, personas);

describe('mensajeConfirmarRetiroWhatsapp', () => {
  it('sale con el encabezado en grande y el formato acordado', () => {
    expect(mensaje(base)).toBe([
      '*CONFIRMAR RETIRO POR SISTEMAS - DELIVERY*',
      '━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      '🔹 *ORDEN:* OC-2026-0001',
      '🏭 *Proveedor:* FERRETERIA EL TORNO',
      '📍 *Dirección:* Av. Principal 123',
      '🚨 *Requerimiento:* URGENTE',
      '🚚 *Entrega:* Delivery',
      '👤 *Solicita:* MARIA TOVAR · Produccion',
      '🛒 *Analista encargado:* KELVIN PEÑA',
      '🏬 *Entregar en:* General',
      '📍 *Dirección de recepción:* Almacén Los Pinos',
      '📝 *Detalle:* Mantenimiento',
      '📌 *Nota:* Retirar temprano',
      '💵 *Total:* $72,56',
      '',
      '📦 *Productos:* NO se muestran aquí · para verlos, *revise el sistema*.',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━',
      '✅ *Retiro confirmado:* JOSE LIENDRO · 🕒 27/11/2026, 09:30 a. m.',
      '🏢 *GOLDEN TOUCH 1127 C.A.* · Delivery',
    ].join('\n'));
  });

  it('nunca enumera productos y manda expresamente a revisar el sistema', () => {
    const t = mensaje(base);
    expect(t).toContain('📦 *Productos:* NO se muestran aquí · para verlos, *revise el sistema*.');
    expect(t).not.toContain('CORREA B63');
    expect(t).not.toContain('ACEITE 15W40');
    expect(t).not.toContain('• ');
    expect(t.toUpperCase()).not.toContain('SUBELO');
  });

  it('en carga pesada destaca CARGA PESADA y NO incluye la palabra SUBELO', () => {
    const t = mensaje(base, 'carga_pesada');
    expect(t).toContain('🚚 *Entrega:* Carga pesada');
    expect(t).toContain('🚛 *CARGA PESADA*');
    expect(t.toUpperCase()).not.toContain('SUBELO');
  });

  it('a domicilio y en delivery no dice carga pesada', () => {
    expect(mensaje(base, 'proveedor')).toContain('🚚 *Entrega:* Con entrega a domicilio');
    expect(mensaje(base, 'proveedor')).not.toContain('CARGA PESADA');
    expect(mensaje(base)).not.toContain('CARGA PESADA');
  });

  it('al reabrir una OC ya confirmada usa quien confirmó y no el usuario actual', () => {
    const t = mensajeConfirmarRetiroWhatsapp(
      { ...base, retiro_confirmado_por: 'sistema' },
      proveedor,
      'delivery',
      'otro@gmail.com',
      personas,
    );
    expect(t).toContain('✅ *Retiro confirmado:* SISTEMA');
    expect(t).not.toContain('otro@gmail.com');
  });

  it('maneja orden sin proveedor, nota ni items y sin emojis con selector', () => {
    const t = mensajeConfirmarRetiroWhatsapp(
      { ...base, proveedor_id: null, items: [], notas: null, finalidad: null, urgente: false },
      null,
      'delivery',
      'analistadecomprasgt@gmail.com',
      personas,
    );
    expect(t).toContain('🏭 *Proveedor:* —');
    expect(t).toContain('🟢 *Requerimiento:* Normal');
    expect(t).not.toContain('📦 *Productos (');
    expect(t).toContain('📦 *Productos:* NO se muestran aquí · para verlos, *revise el sistema*.');
    expect(t).toContain('✅ *Retiro confirmado:* JOSE LIENDRO');
    expect(t).not.toContain('\uFE0F');
    expect(t).not.toContain('@');
  });
});
