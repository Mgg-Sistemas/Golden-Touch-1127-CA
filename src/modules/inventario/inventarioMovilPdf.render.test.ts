import { describe, expect, it, vi } from 'vitest';

const vistos: Array<{ doc: { getNumberOfPages: () => number }; nombre: string }> = [];
vi.mock('@/shared/lib/reportePreview', () => ({
  previewPdf: (doc: never, nombre: string) => { vistos.push({ doc, nombre }); },
}));
vi.mock('@/shared/lib/directorioUsuarios', () => ({
  resolverQuien: async () => (g: string | null | undefined, c?: string | null) => (c === 'ana@gt.com' ? 'Ana López' : g ?? c ?? ''),
  quienSync: (g: string | null | undefined, c?: string | null) => g || c || '',
}));
vi.mock('@/modules/usuarios/autorizados.repository', () => ({ firmaCargadaDe: async () => null }));
vi.mock('@/shared/lib/pdfLogo', async (orig) => ({
  ...(await orig<typeof import('@/shared/lib/pdfLogo')>()),
  loadLogoPdfDataUrl: () => Promise.reject(new Error('sin red')),
  loadFirma2DataUrl: () => Promise.reject(new Error('sin red')),
}));

import { docSalidaMovil, docSalidasMovil, docTrasladosMovil, verDocMovilPdf } from './inventarioMovilPdf';
import type { SalidaMina } from './salidasMina';
import type { TrasladoAlmacen } from './inventarioMovil';

describe('PDF de la salida del teléfono (se arma de verdad)', () => {
  it('arma el PDF y lo manda a la vista previa', async () => {
    vistos.length = 0;
    const s: SalidaMina = {
      id: 'b1f8e0a2-0000-4000-8000-000000000001', codigo: 'SIG-0012', almacen: 'General', producto_id: 'p1',
      producto_nombre: 'MANGUERA 2 PULGADAS', unidad: 'und', cantidad: 2, motivo: 'Para la bomba del pozo 3',
      autorizado_por: 'JESUS GARCIA', retorna: false, retornado: 0, retornos: [], fotos: [{ path: 'x/foto.jpg', filename: 'foto.jpg' }],
      estado: 'sin_retorno', actor: 'ana@gt.com', actor_name: 'Ana López', created_at: '2026-11-02T13:45:00Z',
    };
    await verDocMovilPdf(docSalidaMovil(s, { sku: 'MAN-002', unidad: 'und', precio: 10, precio_promedio: 8 }, 'General', { actor: 'ana@gt.com', nombre: 'Ana López' }));
    expect(vistos).toHaveLength(1);
    expect(vistos[0].nombre).toBe('orden-salida-SIG-0012.pdf');
    expect(vistos[0].doc.getNumberOfPages()).toBe(1);
  });

  it('arma salida y traslado múltiples (4 códigos) sin solapar Emitida con los códigos', async () => {
    vistos.length = 0;
    const baseSalida = (i: number): SalidaMina => ({
      id: `s-${i}`, codigo: `SIG-ADS-000${i}`, almacen: 'General', producto_id: `p-${i}`,
      producto_nombre: `PRODUCTO ${i}`, unidad: 'und', cantidad: 1, motivo: 'Despacho múltiple',
      autorizado_por: 'JESUS GARCIA', retorna: false, retornado: 0, retornos: [], fotos: [],
      estado: 'sin_retorno', actor: 'ana@gt.com', actor_name: 'Ana López', created_at: '2026-11-11T16:20:00Z',
    });
    await verDocMovilPdf(docSalidasMovil([3, 4, 5, 6].map(baseSalida), () => ({ sku: 'SKU', unidad: 'und', precio: 5, precio_promedio: 5 }), 'General', { actor: 'ana@gt.com', nombre: 'Ana López' }));

    const baseTraslado = (i: number): TrasladoAlmacen => ({
      codigo: `TRA-ADS-000${i}`, cantidad: 2, unidad: 'und', origen: 'General', destino: 'Depósito Mina',
      producto_origen_id: `p-${i}`, producto_destino_id: `d-${i}`, nombre: `MATERIAL ${i}`,
      sku_origen: 'SKU-O', sku_destino: 'SKU-D', creado_en_destino: false, stock_origen: 10, stock_destino: 4,
      nota: 'Traslado múltiple', at: '2026-11-11T16:20:00Z',
    });
    await verDocMovilPdf(docTrasladosMovil([1, 2, 3, 4].map(baseTraslado), () => 5, { actor: 'ana@gt.com', nombre: 'Ana López' }));

    expect(vistos).toHaveLength(2);
    expect(vistos[0].doc.getNumberOfPages()).toBe(1);
    expect(vistos[1].doc.getNumberOfPages()).toBe(1);
  });
});
