import { describe, expect, it } from 'vitest';
import { diaVE, mensajeStockMina, stockPorPeriodo, type ProductoStock } from './stockMinaWhatsapp';

const productos: ProductoStock[] = [
  { id: 'a', nombre: 'MANGUERA 2"', categoria: 'FERRETERIA', unidad: 'und', stock: 10 },
  { id: 'b', nombre: 'CEMENTO', categoria: 'CONSTRUCCION', unidad: 'saco', stock: 0 },
  { id: 'c', nombre: 'CLAVOS', categoria: 'FERRETERIA', unidad: 'kg', stock: 0 },
];

describe('Depósito Mina · stock por período', () => {
  it('el día se toma en hora de Venezuela', () => {
    expect(diaVE('2026-11-01T02:00:00Z')).toBe('2026-10-31');
    expect(diaVE('2026-11-01T05:00:00Z')).toBe('2026-11-01');
  });

  it('reconstruye el cierre restando lo movido después del «hasta»', () => {
    const movs = [
      { producto_id: 'a', delta: 8, at: '2026-10-05T14:00:00Z' },  // en el período
      { producto_id: 'a', delta: -3, at: '2026-10-20T14:00:00Z' }, // en el período
      { producto_id: 'a', delta: 5, at: '2026-11-02T14:00:00Z' },  // después
      { producto_id: 'a', delta: 99, at: '2026-09-30T14:00:00Z' }, // antes: no cuenta
    ];
    const [f] = stockPorPeriodo(productos, movs, '2026-10-01', '2026-10-31');
    expect(f).toMatchObject({ id: 'a', cierre: 5, entradas: 8, salidas: 3, inicio: 0 });
  });

  it('deja fuera lo que está en cero y quieto, pero no lo que se agotó en el período', () => {
    const movs = [{ producto_id: 'b', delta: -4, at: '2026-10-10T14:00:00Z' }];
    const filas = stockPorPeriodo(productos, movs, '2026-10-01', '2026-10-31');
    expect(filas.map((f) => f.id)).toEqual(['b', 'a']); // CONSTRUCCION antes que FERRETERIA
    expect(filas[0]).toMatchObject({ cierre: 0, salidas: 4, inicio: 4 });
  });

  it('mensaje: período, categorías, entradas/salidas y totales', () => {
    const movs = [{ producto_id: 'a', delta: 2, at: '2026-10-10T14:00:00Z' }];
    const t = mensajeStockMina(stockPorPeriodo(productos, movs, '2026-10-01', '2026-10-29'), '2026-10-01', '2026-10-29',
      { quien: 'ANA', cuando: '2026-10-29T16:00:00Z' });
    expect(t).toContain('📦 *STOCK · DEPÓSITO MINA*');
    expect(t).toContain('📅 *Período:* 01/10/2026 al 29/10/2026');
    expect(t).toContain('🏷 *FERRETERIA*');
    expect(t).toContain('• MANGUERA 2": *10 und* (📥 +2)');
    expect(t).toContain('🔢 *Productos con existencia:* 1');
    expect(t).toContain('👷 *Generado por:* ANA');
    expect(t).not.toContain('CLAVOS');
    expect(t).not.toContain('️');
  });

  it('mensaje sin nada que mostrar', () => {
    const t = mensajeStockMina([], '2026-10-29', '2026-10-29');
    expect(t).toContain('📅 *Fecha:* 29/10/2026');
    expect(t).toContain('Sin existencias ni movimientos en esas fechas.');
  });
});
