import { describe, expect, it } from 'vitest';
import { enrutarSolicitudInicial } from './pedidos.repository';

describe('enrutarSolicitudInicial · SP por Almacén salvo Compras Fijas y servicios', () => {
  const fechaFija = '2026-11-19T14:00:00.000Z';

  it('envía toda Solicitud de Pedido normal (sin compra_fija_id) primero a revisión de Almacén', () => {
    const r = enrutarSolicitudInicial(
      {
        tipo: 'producto',
        compra_fija_id: null,
        solicitante_email: 'solicitante@goldentouch.com',
      },
      fechaFija,
    );

    expect(r.estado).toBe('revision_almacen');
    expect(r.aprobada_en).toBeUndefined();
    expect(r.aprobada_por).toBeUndefined();
    expect(r.historial).toHaveLength(2);
    expect(r.historial[0].evento).toBe('creada');
    expect(r.historial[1].evento).toBe('enviada_revision_almacen');
  });

  it('envía también a Almacén cuando tipo no viene definido (default producto) y compra_fija_id está vacío', () => {
    const r = enrutarSolicitudInicial(
      {
        compra_fija_id: '   ',
        solicitante_email: 'compras@goldentouch.com',
      },
      fechaFija,
    );

    expect(r.estado).toBe('revision_almacen');
  });

  it('envía directo a Compras (aprobada para cotizar) ÚNICAMENTE cuando proviene de una Compra Fija', () => {
    const r = enrutarSolicitudInicial(
      {
        tipo: 'producto',
        compra_fija_id: 'cf-uuid-mercado-001',
        solicitante_email: 'compras@goldentouch.com',
      },
      fechaFija,
    );

    expect(r.estado).toBe('aprobada');
    expect(r.aprobada_en).toBe(fechaFija);
    expect(r.aprobada_por).toBe('compras@goldentouch.com');
    expect(r.historial).toHaveLength(2);
    expect(r.historial[1].evento).toBe('aprobada');
    expect(r.historial[1].motivo).toContain('Compra fija');
  });

  it('mantiene las Solicitudes de Servicio (SS) en estado pendiente del flujo de servicios', () => {
    const r = enrutarSolicitudInicial(
      {
        tipo: 'servicio',
        compra_fija_id: null,
        solicitante_email: 'transporte@goldentouch.com',
      },
      fechaFija,
    );

    expect(r.estado).toBe('pendiente');
    expect(r.aprobada_en).toBeUndefined();
    expect(r.historial).toHaveLength(1);
    expect(r.historial[0].evento).toBe('creada');
  });

  it('no manda a Almacén una SP de productos que lleva un renglón de servicio (cambio de aceite)', () => {
    const r = enrutarSolicitudInicial(
      {
        tipo: 'producto',
        compra_fija_id: null,
        solicitante_email: 'maquinaria@goldentouch.com',
        items: [
          { nombre: 'FILTRO', cantidad: 2, precio: 0, es_servicio: false },
          { nombre: 'CAMBIO DE ACEITE', cantidad: 1, precio: 0, es_servicio: true },
        ],
      },
      fechaFija,
    );

    expect(r.estado).toBe('pendiente');
    expect(r.aprobada_en).toBeUndefined();
    expect(r.historial).toHaveLength(1);
    expect(r.historial[0].evento).toBe('creada');
    expect(r.historial.some((e) => e.evento === 'enviada_revision_almacen')).toBe(false);
  });

  it('aplica el mismo guard aunque el tipo no venga definido', () => {
    const r = enrutarSolicitudInicial(
      {
        compra_fija_id: null,
        solicitante_email: 'solicitante@goldentouch.com',
        items: [{ nombre: 'CAMBIO DE ACEITE', cantidad: 1, precio: 0, es_servicio: true }],
      },
      fechaFija,
    );

    expect(r.estado).toBe('pendiente');
  });

  it('sigue mandando a Almacén una SP de productos sin renglones de servicio (control negativo)', () => {
    const r = enrutarSolicitudInicial(
      {
        tipo: 'producto',
        compra_fija_id: null,
        solicitante_email: 'solicitante@goldentouch.com',
        items: [
          { nombre: 'FILTRO', cantidad: 2, precio: 0, es_servicio: false },
          { nombre: 'ACEITE 68', cantidad: 4, precio: 0 },
        ],
      },
      fechaFija,
    );

    expect(r.estado).toBe('revision_almacen');
    expect(r.historial[1].evento).toBe('enviada_revision_almacen');
  });
});
