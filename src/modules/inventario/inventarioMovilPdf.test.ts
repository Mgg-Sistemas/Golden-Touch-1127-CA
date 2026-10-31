import { describe, expect, it } from 'vitest';
import type { SalidaMina } from './salidasMina';
import type { TrasladoAlmacen } from './inventarioMovil';
import {
  codigoEntradaMovil, costoProducto, docEntradaMovil, docRetornoMovil, docSalidaMovil, docTrasladoMovil,
} from './inventarioMovilPdf';

const salida = (x: Partial<SalidaMina> = {}): SalidaMina => ({
  id: 's1', codigo: 'SDM-0001', almacen: 'Depósito Mina', producto_id: 'p1', producto_nombre: 'MANGUERA 2 PULGADAS', unidad: 'und',
  cantidad: 2, motivo: 'Para la bomba del pozo 3', autorizado_por: 'JESUS GARCIA', retorna: true, retornado: 0, retornos: [], fotos: [],
  estado: 'por_retornar', actor: 'pedro@gt.com', actor_name: 'Pedro Pérez', created_at: '2026-10-30T13:45:00Z', ...x,
});

const traslado: TrasladoAlmacen = {
  codigo: 'TRA-0007', cantidad: 3, unidad: 'lt', origen: 'General', destino: 'Depósito Mina',
  producto_origen_id: 'p1', producto_destino_id: 'p2', nombre: 'ACEITE 15W40', sku_origen: 'LUB-001', sku_destino: 'LUB-090',
  creado_en_destino: true, stock_origen: 7, stock_destino: 3, nota: 'Para el cargador', at: '2026-10-30T15:00:00Z',
};

const quien = { actor: 'ana@gt.com', nombre: 'Ana López' };

describe('Inventario · PDF de la vista de teléfono (formato Orden de Salida/Traslado)', () => {
  it('costo: PMP primero, si no el precio, si no 0', () => {
    expect(costoProducto({ precio: 5, precio_promedio: 4 })).toBe(4);
    expect(costoProducto({ precio: 5, precio_promedio: 0 })).toBe(5);
    expect(costoProducto({ precio: 0, precio_promedio: null })).toBe(0);
    expect(costoProducto(null)).toBe(0);
  });

  it('salida: código, depósito, renglón, motivo y quién autorizó (sin firma ajena)', () => {
    const d = docSalidaMovil(salida(), { sku: 'MAN-002', unidad: 'und', precio: 10, precio_promedio: 8 }, 'Depósito Mina', quien);
    expect(d.sol.scope).toBe('salida');
    expect(d.sol.codigo).toBe('SDM-0001');
    expect(d.sol.estado).toBe('ejecutada');
    expect(d.sol.almacen_origen).toBe('Depósito Mina');
    expect(d.sol.solicitante).toBe('Pedro Pérez');
    expect(d.actor).toBe('pedro@gt.com');
    expect(d.sol.items).toEqual([{
      producto_id: 'p1', producto_nombre: 'MANGUERA 2 PULGADAS', producto_sku: 'MAN-002', unidad: 'und', cantidad: 2, precio_unit: 8,
    }]);
    expect(d.sol.motivo).toContain('Para la bomba del pozo 3');
    expect(d.sol.motivo).toContain('Retorna: SÍ');
    expect(d.opciones).toEqual({ autorizadoPor: 'JESUS GARCIA' });
    expect(d.opciones.titulo).toBeUndefined();
  });

  it('salida del Inventario General: «General» se imprime como Inventario General', () => {
    const d = docSalidaMovil(salida({ almacen: null, codigo: 'SIG-0003', retorna: false }), null, 'General', quien);
    expect(d.sol.almacen_origen).toBe('Inventario General');
    expect(d.sol.motivo).toContain('Retorna: NO');
    expect(d.sol.items?.[0].precio_unit).toBe(0);
  });

  it('traslado: origen, destino, N° TRA y aviso de producto creado', () => {
    const d = docTrasladoMovil(traslado, 2.5, quien);
    expect(d.sol.scope).toBe('traslado');
    expect(d.sol.codigo).toBe('TRA-0007');
    expect(d.sol.almacen_origen).toBe('Inventario General');
    expect(d.sol.almacen_destino).toBe('Depósito Mina');
    expect(d.sol.solicitante).toBe('Ana López');
    expect(d.sol.items?.[0]).toMatchObject({ producto_nombre: 'ACEITE 15W40', producto_sku: 'LUB-001', unidad: 'lt', cantidad: 3, precio_unit: 2.5 });
    expect(d.sol.motivo).toContain('Para el cargador');
    expect(d.sol.motivo).toContain('LUB-090');
    expect(d.opciones.autorizadoPor).toBeNull();
  });

  it('entrada: mismo formato con título ORDEN DE ENTRADA', () => {
    const d = docEntradaMovil({
      movId: 'ab12cd34-0000-4000-8000-000000000000', at: '2026-10-30T16:00:00Z', almacen: 'Depósito Reutilizables',
      producto: { id: 'p9', sku: 'HER-041', nombre: 'MARTILLO', unidad: 'und', precio: 12, precio_promedio: null },
      cantidad: 4, precioUnit: null, nota: ' llegó en la gandola ',
    }, quien);
    expect(d.sol.codigo).toBe('ENT-AB12CD34');
    expect(d.sol.almacen_origen).toBe('Depósito Reutilizables');
    expect(d.sol.motivo).toBe('llegó en la gandola');
    expect(d.sol.items?.[0]).toMatchObject({ producto_sku: 'HER-041', cantidad: 4, precio_unit: 12 });
    expect(d.opciones).toMatchObject({ titulo: 'ORDEN DE ENTRADA', rotuloAlmacen: 'Almacén de entrada', autorizadoPor: null });
  });

  it('N° de la entrada', () => {
    expect(codigoEntradaMovil('0f9e8d7c-1111')).toBe('ENT-0F9E8D7C');
  });

  it('retorno: formato de entrada con el N° de la salida y lo que falta', () => {
    const parcial = docRetornoMovil(salida({ retornado: 1.5 }), 1.5, 'volvió bien', '2026-10-30T18:00:00Z', quien);
    expect(parcial.sol.codigo).toBe('SDM-0001');
    expect(parcial.sol.items?.[0].cantidad).toBe(1.5);
    expect(parcial.sol.motivo).toContain('Falta por retornar: 0,5 und');
    expect(parcial.sol.motivo).toContain('volvió bien');
    expect(parcial.opciones).toMatchObject({ titulo: 'ORDEN DE ENTRADA', subtitulo: 'Retorno de material' });
    const completo = docRetornoMovil(salida({ retornado: 2 }), 0.5, null, '2026-10-30T18:00:00Z', quien);
    expect(completo.sol.motivo).toContain('Retornó completo');
  });
});
