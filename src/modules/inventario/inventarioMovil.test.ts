import { describe, expect, it } from 'vitest';
import { mensajeEntrada, mensajeProductoNuevo, mensajeTraslado, nombreDepositoChat, type TrasladoAlmacen } from './inventarioMovil';

const SIN_SELECTOR = /️/;

describe('Inventario · avisos de WhatsApp del teléfono', () => {
  it('nombre del depósito en el chat', () => {
    expect(nombreDepositoChat('General')).toBe('Inventario General');
    expect(nombreDepositoChat('Depósito Mina')).toBe('Depósito Mina');
  });

  it('producto nuevo', () => {
    const t = mensajeProductoNuevo({
      deposito: 'Inventario General', sku: 'HER-041', nombre: 'MARTILLO', categoria: 'HERRAMIENTAS',
      unidad: 'und', cantidad: 3, costo: 12.5, ubicacion: 'ESTANTE 2',
    }, 'ANA PÉREZ', '2026-10-29T16:00:00Z');
    expect(t).toContain('🆕 *PRODUCTO NUEVO · INVENTARIO GENERAL*');
    expect(t).toContain('🔖 *SKU:* HER-041');
    expect(t).toContain('🔢 *Cantidad inicial:* 3 und');
    expect(t).toContain('💵 *Costo c/u:* $12,5');
    expect(t).toContain('📍 *Ubicación:* ESTANTE 2');
    expect(t).toContain('👷 *Registrado por:* ANA PÉREZ');
    expect(t).toContain('🏢 GOLDEN TOUCH 1127 C.A. · Inventario General');
    expect(t).not.toMatch(SIN_SELECTOR);
  });

  it('entrada con lo que queda', () => {
    const t = mensajeEntrada({ deposito: 'Depósito Mina', sku: 'MAT-036', nombre: 'ACEITE', unidad: 'lt', cantidad: 2, queda: 8, nota: 'llegó en la gandola' });
    expect(t).toContain('📥 *ENTRADA · DEPÓSITO MINA*');
    expect(t).toContain('➕ *Entró:* 2 lt');
    expect(t).toContain('📊 *Queda en existencia:* 8 lt');
    expect(t).toContain('📝 *Nota:* llegó en la gandola');
  });

  it('traslado: de dónde a dónde y cómo quedan los dos', () => {
    const tr: TrasladoAlmacen = {
      codigo: 'TRA-0001', cantidad: 2, unidad: 'lt', origen: 'General', destino: 'Depósito Mina',
      producto_origen_id: 'a', producto_destino_id: 'b', nombre: 'ACEITE 15/40', sku_origen: 'MAT-036', sku_destino: 'MAT-131',
      creado_en_destino: true, stock_origen: 4, stock_destino: 2, nota: null, at: '2026-10-29T16:00:00Z',
    };
    const t = mensajeTraslado(tr, 'ANA');
    expect(t).toContain('🔁 *TRASLADO ENTRE ALMACENES*');
    expect(t).toContain('🔖 *N°:* TRA-0001');
    expect(t).toContain('📤 *Sale de:* Inventario General (MAT-036)');
    expect(t).toContain('📥 *Entra a:* Depósito Mina (MAT-131) · producto nuevo en ese almacén');
    expect(t).toContain('📊 *Queda en Inventario General:* 4 lt');
    expect(t).toContain('📊 *Queda en Depósito Mina:* 2 lt');
    expect(t).not.toContain('Nota');
    expect(t).not.toMatch(SIN_SELECTOR);
  });
});
