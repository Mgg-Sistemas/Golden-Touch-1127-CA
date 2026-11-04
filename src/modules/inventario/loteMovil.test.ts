import { describe, expect, it } from 'vitest';
import { errorItemsLote, mensajeSalidasMina, rangoCodigos, type SalidaMina } from './salidasMina';
import { mensajeTraslados, type TrasladoAlmacen } from './inventarioMovil';
import { docSalidasMovil, docTrasladosMovil } from './inventarioMovilPdf';

const salida = (x: Partial<SalidaMina> = {}): SalidaMina => ({
  id: 's1', codigo: 'SIG-0001', almacen: 'General', producto_id: 'p1', producto_nombre: 'MANGUERA 2 PULGADAS', unidad: 'und',
  cantidad: 2, motivo: 'Para la bomba del pozo 3', autorizado_por: 'JESUS GARCIA', retorna: false, retornado: 0, retornos: [], fotos: [],
  estado: 'sin_retorno', actor: 'pedro@gt.com', actor_name: 'Pedro Pérez', created_at: '2026-11-04T13:45:00Z', ...x,
});
const traslado = (x: Partial<TrasladoAlmacen> = {}): TrasladoAlmacen => ({
  codigo: 'TRA-0007', cantidad: 3, unidad: 'lt', origen: 'General', destino: 'Depósito Mina',
  producto_origen_id: 'p1', producto_destino_id: 'p2', nombre: 'ACEITE 15W40', sku_origen: 'LUB-001', sku_destino: 'LUB-090',
  creado_en_destino: false, stock_origen: 7, stock_destino: 3, nota: 'Para el cargador', at: '2026-11-04T15:00:00Z', ...x,
});
const quien = { actor: 'ana@gt.com', nombre: 'Ana López' };

describe('Inventario · varios productos en una salida o un traslado del teléfono', () => {
  it('valida cada renglón: cantidad y stock', () => {
    expect(errorItemsLote([])).toBe('Agrega al menos un producto.');
    expect(errorItemsLote([{ nombre: 'A', cantidad: 0, stock: 5 }])).toBe('Escribe la cantidad de A.');
    expect(errorItemsLote([{ nombre: 'A', cantidad: 2, stock: 5 }, { nombre: 'B', cantidad: 9, stock: 4, unidad: 'kg' }])).toBe('No alcanza B: hay 4 kg.');
    expect(errorItemsLote([{ nombre: 'A', cantidad: 2, stock: 5 }, { nombre: 'B', cantidad: 4, stock: 4 }])).toBeNull();
  });

  it('lista los N° y los resume cuando son muchos', () => {
    expect(rangoCodigos(['SIG-1', 'SIG-2'])).toBe('SIG-1, SIG-2');
    expect(rangoCodigos(['A', 'B', 'C', 'D', 'E'])).toBe('A … E (5)');
  });

  it('la salida de varios materiales sale en un solo aviso; con uno, el de siempre', () => {
    const una = mensajeSalidasMina([salida()], 'Ana López');
    expect(una).toContain('📦 *Material:* MANGUERA 2 PULGADAS');
    const t = mensajeSalidasMina([salida(), salida({ id: 's2', codigo: 'SIG-0002', producto_id: 'p2', producto_nombre: 'CODO 2"', cantidad: 4 })], 'Ana López');
    expect(t).toContain('🔖 *N°:* SIG-0001, SIG-0002');
    expect(t).toContain('📦 *Materiales (2):*');
    expect(t).toContain('1. MANGUERA 2 PULGADAS — *2 und*');
    expect(t).toContain('2. CODO 2" — *4 und*');
    expect(t).toContain('📝 *Motivo:* Para la bomba del pozo 3');
    expect(t).toContain('❌ *Retorna:* NO');
  });

  it('el traslado de varios productos dice cómo queda cada uno en los dos almacenes', () => {
    const t = mensajeTraslados([traslado(), traslado({ codigo: 'TRA-0008', nombre: 'GRASA', unidad: 'kg', cantidad: 1, stock_origen: 2, stock_destino: 1, creado_en_destino: true })], 'Ana López');
    expect(t).toContain('🔖 *N°:* TRA-0007, TRA-0008');
    expect(t).toContain('📦 *Productos (2):*');
    expect(t).toContain('2. GRASA — *1 kg* · nuevo en ese almacén');
    expect(t).toContain('📊 Queda: Inventario General 7 lt · Depósito Mina 3 lt');
  });

  it('un solo PDF con un renglón por producto', () => {
    const prods: Record<string, { sku: string; unidad: string; precio: number; precio_promedio: number }> = {
      p1: { sku: 'MAN-1', unidad: 'und', precio: 10, precio_promedio: 0 },
      p2: { sku: 'COD-1', unidad: 'und', precio: 3, precio_promedio: 0 },
    };
    const d = docSalidasMovil([salida(), salida({ id: 's2', codigo: 'SIG-0002', producto_id: 'p2', producto_nombre: 'CODO', cantidad: 4 })], (id) => prods[id], 'General', quien);
    expect(d.sol.codigo).toBe('SIG-0001, SIG-0002');
    expect(d.sol.items?.map((i) => [i.producto_sku, i.cantidad, i.precio_unit])).toEqual([['MAN-1', 2, 10], ['COD-1', 4, 3]]);
    const tr = docTrasladosMovil([traslado(), traslado({ codigo: 'TRA-0008', producto_origen_id: 'p2', nombre: 'GRASA', creado_en_destino: true, sku_destino: 'GRA-9' })], (id) => (id === 'p1' ? 5 : 2), quien);
    expect(tr.sol.items).toHaveLength(2);
    expect(tr.sol.motivo).toContain('Se crearon en Depósito Mina: GRASA (GRA-9)');
  });
});
