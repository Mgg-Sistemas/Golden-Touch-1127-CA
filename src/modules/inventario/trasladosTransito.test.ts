import { describe, expect, it } from 'vitest';
import { ALMACEN_MINA, DEPOSITOS_FIJOS } from './depositos';
import {
  errorFotosTraslado, mensajeEnvioTraslado, mensajeRecepcionTraslado, textoTraslado, usaRecepcion, type TrasladoTransito,
} from './trasladosTransito';

const GENERAL = DEPOSITOS_FIJOS.general.almacen;

const t: TrasladoTransito = {
  id: 't1', codigo: 'TRM-00001', origen: GENERAL, destino: ALMACEN_MINA,
  items: [
    { producto_id: 'p1', nombre: 'CLAVO 3"', sku: 'FER-001', unidad: 'KG', cantidad: 10, codigo: 'TRA-ANG-0007' },
    { producto_id: 'p2', nombre: 'ACEITE 15W40', sku: 'LUB-002', unidad: 'GALON', cantidad: 2.5, codigo: 'TRA-ANG-0008' },
  ],
  nota: 'Para la cuadrilla', fotos_envio: [{ path: 'traslados/a/1.jpg', filename: '1.jpg' }],
  enviado_por: 'ana@x.com', enviado_por_nombre: 'Ana', created_at: '2026-11-12T14:00:00Z',
  estado: 'en_transito', recibido_por: null, recibido_por_nombre: null, recibido_en: null,
  nota_recepcion: null, fotos_recepcion: [], resultado: null,
};

describe('traslados con recepción', () => {
  it('solo de Los Pinos a la Mina pasa por recepción', () => {
    expect(usaRecepcion(GENERAL, ALMACEN_MINA)).toBe(true);
    expect(usaRecepcion(ALMACEN_MINA, GENERAL)).toBe(false);
    expect(usaRecepcion(GENERAL, 'Depósito Reutilizables')).toBe(false);
  });

  it('el aviso del envío dice que va en camino, con productos, fotos y nota', () => {
    const m = mensajeEnvioTraslado(t, 'Ana');
    expect(m).toContain('TRASLADO EN CAMINO');
    expect(m).toContain('TRM-00001');
    expect(m).toContain('pendiente por recibir');
    expect(m).toContain('1. CLAVO 3" — *10 KG* (TRA-ANG-0007)');
    expect(m).toContain('2,5 GALON');
    expect(m).toContain('Fotos del envío:* 1');
    expect(m).toContain('Para la cuadrilla');
  });

  it('el aviso de la recepción trae cómo quedó en la Mina y quién recibió', () => {
    const r: TrasladoTransito = {
      ...t, estado: 'recibido', recibido_por_nombre: 'Luis', recibido_en: '2026-11-12T18:00:00Z',
      nota_recepcion: 'Completo', fotos_recepcion: [{ path: 'traslados/b/2.jpg', filename: '2.jpg' }],
      resultado: [{ codigo: 'TRA-ANG-0007', producto_destino_id: 'd1', sku_destino: 'FER-010', creado_en_destino: true, stock_destino: 12 }],
    };
    const m = mensajeRecepcionTraslado(r);
    expect(m).toContain('TRASLADO RECIBIDO');
    expect(m).toContain('queda 12 KG (nuevo en el depósito)');
    expect(m).toContain('Nota de la recepción:* Completo');
    expect(m).toContain('Recibió:* Luis');
  });

  it('fotos: máximo 4 y solo imágenes; se busca por producto o código', () => {
    expect(errorFotosTraslado([{ name: 'a.pdf', type: 'application/pdf' }])).toMatch(/no es una imagen/);
    expect(errorFotosTraslado([{ name: 'a.jpg', type: 'image/jpeg' }], 4)).toMatch(/hasta 4/);
    expect(errorFotosTraslado([{ name: 'a.jpg', type: 'image/jpeg' }])).toBeNull();
    expect(textoTraslado(t)).toContain('aceite');
    expect(textoTraslado(t)).toContain('tra-ang-0008');
  });
});
