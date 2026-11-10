import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }));
vi.mock('./movimientos.repository', () => ({ registrarMovimiento: vi.fn() }));

import { errorRenglonesMaterial, mensajeEnvioMaterial, resumenMaterial, type ProductoParaMgg } from './materialInter.repository';

const P = (o: Partial<ProductoParaMgg> = {}): ProductoParaMgg => ({
  id: 'p1', sku: 'EPP-012', nombre: 'MASCARILLA 3M 8210', unidad: 'CAJA', categoria: 'EPP', stock: 8, costo: 29, ...o,
});

describe('Puente de material a MGG (10/11/2026)', () => {
  it('valida renglones: vacío, cantidad, tope de stock y repetidos', () => {
    expect(errorRenglonesMaterial([])).toBe('Agrega al menos un producto.');
    expect(errorRenglonesMaterial([{ producto: P(), cantidad: 0 }])).toContain('Escribe cuánto');
    expect(errorRenglonesMaterial([{ producto: P(), cantidad: 9 }])).toContain('solo hay 8 CAJA');
    expect(errorRenglonesMaterial([{ producto: P(), cantidad: 2 }, { producto: P(), cantidad: 1 }])).toContain('repetido');
    expect(errorRenglonesMaterial([{ producto: P(), cantidad: 8 }])).toBeNull();
  });
  it('resumen y WhatsApp', () => {
    const items = [
      { sku: 'EPP-012', nombre: 'MASCARILLA 3M 8210', unidad: 'CAJA', cantidad: 2, costo_unitario: 29 },
      { sku: 'EPP-007', nombre: 'GUANTES DE PUNTO', unidad: 'DOCENA', cantidad: 5, costo_unitario: 5 },
    ];
    expect(resumenMaterial(items)).toBe('2 CAJA MASCARILLA 3M 8210 y 1 producto(s) más');
    const t = mensajeEnvioMaterial({ items, total_usd: 83, motivo: 'Para la mina', created_at: '2026-11-10T14:00:00Z' }, 'ANGÉLICA');
    expect(t).toContain('ENVÍO DE MATERIAL A MGG LOS PINOS');
    expect(t).toContain('• 5 DOCENA GUANTES DE PUNTO');
    expect(t).toContain('$ 83,00');
    expect(t).toContain('ANGÉLICA');
  });
});
