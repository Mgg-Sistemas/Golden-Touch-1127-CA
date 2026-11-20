import { describe, expect, it } from 'vitest';
import type { ContextoCompras } from './comprasMoldeable';
import type { EventoHistorial, ItemOrden, Orden } from '@/shared/lib/types';
import {
  evaluarCreditoOrden,
  sumarDiasCredito,
  diasEntreFechas,
  listarAlertasCreditosPorVencer,
} from './creditoPlazo';
import { puedeEditarOrdenCompleta, puedeEditarPreciosOrden } from './pedidos.repository';
import { extraerCuentasCreditoCompras, normalizarCuentasCreditoFilas } from './comprasMoldeable';

describe('Edición completa de órdenes de servicio (OS)', () => {
  it('permite editar servicio en cualquier estado activo (incluso aprobada y pagada)', () => {
    const osAprobada: Partial<Orden> = { tipo: 'servicio', estado: 'aprobada', total: 100, items: [] };
    const osPagada: Partial<Orden> = { tipo: 'servicio', estado: 'pagada', total: 200, items: [] };
    const osCuentaAbierta: Partial<Orden> = { tipo: 'servicio', estado: 'cuenta_abierta', total: 300, items: [] };
    const osCancelada: Partial<Orden> = { tipo: 'servicio', estado: 'cancelada', total: 400, items: [] };

    expect(puedeEditarOrdenCompleta(osAprobada as Orden)).toBe(true);
    expect(puedeEditarOrdenCompleta(osPagada as Orden)).toBe(true);
    expect(puedeEditarOrdenCompleta(osCuentaAbierta as Orden)).toBe(true);
    expect(puedeEditarOrdenCompleta(osCancelada as Orden)).toBe(false);

    expect(puedeEditarPreciosOrden(osAprobada as Orden)).toBe(true);
    expect(puedeEditarPreciosOrden(osPagada as Orden)).toBe(true);
    expect(puedeEditarPreciosOrden(osCancelada as Orden)).toBe(false);
  });

  it('no permite editar orden de compra de materiales cuando ya fue pagada o cerrada', () => {
    const ocPagada: Partial<Orden> = { tipo: 'producto', estado: 'pagada', items: [] };
    const ocCuentaAbierta: Partial<Orden> = { tipo: 'producto', estado: 'cuenta_abierta', items: [] };

    expect(puedeEditarOrdenCompleta(ocPagada as Orden)).toBe(false);
    expect(puedeEditarOrdenCompleta(ocCuentaAbierta as Orden)).toBe(false);
  });
});

describe('Plazo, vencimiento y alertas de cuentas a crédito (OC y OS)', () => {
  const HOY = '2026-11-20';

  it('calcula correctamente suma de días y diferencias entre fechas', () => {
    expect(sumarDiasCredito('2026-11-20', 7)).toBe('2026-11-27');
    expect(sumarDiasCredito('2026-11-20', 15)).toBe('2026-12-05');
    expect(diasEntreFechas('2026-11-20', '2026-11-22')).toBe(2);
    expect(diasEntreFechas('2026-11-20', '2026-11-21')).toBe(1);
    expect(diasEntreFechas('2026-11-20', '2026-11-20')).toBe(0);
    expect(diasEntreFechas('2026-11-20', '2026-11-19')).toBe(-1);
  });

  it('dispara alerta a 2 días de vencer', () => {
    const vencimiento = '2026-11-22'; // Faltan 2 días desde 2026-11-20
    const orden: Partial<Orden> = {
      id: 'ord-1',
      codigo: 'OC-2026-001',
      tipo: 'producto',
      estado: 'cuenta_abierta',
      condiciones_pago: 'credito',
      total: 500,
      abonado_total: 100,
      historial: [
        {
          at: '2026-11-07T12:00:00Z',
          actor: 'analista',
          credito_plazo: {
            modo: 'dias',
            dias: 15,
            fecha_vencimiento: vencimiento,
          },
        } as unknown as EventoHistorial,
      ],
    };

    const ev = evaluarCreditoOrden(orden as Orden, HOY);
    expect(ev.esCredito).toBe(true);
    expect(ev.saldoPendiente).toBe(400);
    expect(ev.diasRestantes).toBe(2);
    expect(ev.nivel).toBe('por_vencer');
    expect(ev.disparaAlerta).toBe(true);
    expect(ev.mensajeAlerta).toContain('Faltan 2 días para el vencimiento');
  });

  it('dispara alerta a 1 día de vencer y el día de vencimiento (HOY)', () => {
    const ordenMañana: Partial<Orden> = {
      id: 'ord-2',
      codigo: 'OS-2026-002',
      tipo: 'servicio',
      estado: 'cuenta_abierta',
      condiciones_pago: 'credito',
      total: 300,
      abonado_total: 0,
      historial: [
        {
          at: '2026-11-06T12:00:00Z',
          actor: 'analista',
          credito_plazo: { modo: 'dias', dias: 15, fecha_vencimiento: '2026-11-21' },
        } as unknown as EventoHistorial,
      ],
    };
    const ev1 = evaluarCreditoOrden(ordenMañana as Orden, HOY);
    expect(ev1.diasRestantes).toBe(1);
    expect(ev1.disparaAlerta).toBe(true);
    expect(ev1.mensajeAlerta).toContain('Falta 1 día para el vencimiento');

    const ordenHoy: Partial<Orden> = {
      ...ordenMañana,
      id: 'ord-3',
      historial: [
        {
          at: '2026-11-05T12:00:00Z',
          actor: 'analista',
          credito_plazo: { modo: 'dias', dias: 15, fecha_vencimiento: '2026-11-20' },
        } as unknown as EventoHistorial,
      ],
    };
    const ev0 = evaluarCreditoOrden(ordenHoy as Orden, HOY);
    expect(ev0.diasRestantes).toBe(0);
    expect(ev0.nivel).toBe('hoy');
    expect(ev0.disparaAlerta).toBe(true);
    expect(ev0.mensajeAlerta).toContain('Crédito vence HOY');
  });

  it('no dispara alerta cuando el crédito tiene más de 2 días de margen', () => {
    const orden: Partial<Orden> = {
      id: 'ord-4',
      codigo: 'OC-2026-004',
      estado: 'cuenta_abierta',
      total: 1000,
      abonado_total: 0,
      historial: [
        {
          at: '2026-11-18T12:00:00Z',
          actor: 'analista',
          credito_plazo: { modo: 'dias', dias: 15, fecha_vencimiento: '2026-12-03' },
        } as unknown as EventoHistorial,
      ],
    };
    const ev = evaluarCreditoOrden(orden as Orden, HOY);
    expect(ev.diasRestantes).toBe(13);
    expect(ev.nivel).toBe('en_plazo');
    expect(ev.disparaAlerta).toBe(false);
  });

  it('no dispara alerta si el saldo ya fue pagado en su totalidad', () => {
    const ordenPagada: Partial<Orden> = {
      id: 'ord-5',
      codigo: 'OC-2026-005',
      estado: 'cuenta_abierta',
      total: 500,
      abonado_total: 500,
      historial: [
        {
          at: '2026-11-05T12:00:00Z',
          actor: 'analista',
          credito_plazo: { modo: 'dias', dias: 15, fecha_vencimiento: '2026-11-20' },
        } as unknown as EventoHistorial,
      ],
    };
    const ev = evaluarCreditoOrden(ordenPagada as Orden, HOY);
    expect(ev.saldoPendiente).toBe(0);
    expect(ev.disparaAlerta).toBe(false);
  });

  it('maneja la modalidad primero se recibe y luego se paga', () => {
    // Caso 1: pendiente de recepción
    const pendienteRecibir: Partial<Orden> = {
      id: 'ord-rec-1',
      codigo: 'OC-2026-010',
      estado: 'cuenta_abierta',
      total: 800,
      abonado_total: 0,
      recibida_en: null,
      historial: [
        {
          at: '2026-11-10T12:00:00Z',
          actor: 'analista',
          credito_plazo: { modo: 'recibe_primero', dias: 10, primero_recibe: true },
        } as unknown as EventoHistorial,
      ],
    };
    const ev1 = evaluarCreditoOrden(pendienteRecibir as Orden, HOY);
    expect(ev1.primeroRecibe).toBe(true);
    expect(ev1.yaRecibida).toBe(false);
    expect(ev1.fechaVencimiento).toBeNull();
    expect(ev1.etiquetaCorta).toContain('Primero se recibe y luego se paga (pendiente recepción)');

    // Caso 2: ya recibida en almacén el 2026-11-12 con 10 días de crédito -> vence 2026-11-22 (a 2 días de HOY)
    const yaRecibida: Partial<Orden> = {
      ...pendienteRecibir,
      id: 'ord-rec-2',
      recibida_en: '2026-11-12T14:30:00Z',
    };
    const ev2 = evaluarCreditoOrden(yaRecibida as Orden, HOY);
    expect(ev2.yaRecibida).toBe(true);
    expect(ev2.fechaVencimiento).toBe('2026-11-22');
    expect(ev2.diasRestantes).toBe(2);
    expect(ev2.disparaAlerta).toBe(true);
    expect(ev2.etiquetaCorta).toContain('recibida 12/11/2026');
  });

  it('filtra y ordena correctamente en listarAlertasCreditosPorVencer', () => {
    const ordenes: Partial<Orden>[] = [
      {
        id: 'o-vencida',
        estado: 'cuenta_abierta',
        total: 100,
        abonado_total: 0,
        historial: [
          {
            at: 'x',
            actor: 'y',
            credito_plazo: { modo: 'dias', dias: 5, fecha_vencimiento: '2026-11-18' },
          } as unknown as EventoHistorial,
        ],
      },
      {
        id: 'o-hoy',
        estado: 'cuenta_abierta',
        total: 200,
        abonado_total: 0,
        historial: [
          {
            at: 'x',
            actor: 'y',
            credito_plazo: { modo: 'dias', dias: 5, fecha_vencimiento: '2026-11-20' },
          } as unknown as EventoHistorial,
        ],
      },
      {
        id: 'o-lejos',
        estado: 'cuenta_abierta',
        total: 300,
        abonado_total: 0,
        historial: [
          {
            at: 'x',
            actor: 'y',
            credito_plazo: { modo: 'dias', dias: 30, fecha_vencimiento: '2026-12-15' },
          } as unknown as EventoHistorial,
        ],
      },
      {
        id: 'o-pagada',
        estado: 'pagada',
        total: 100,
        abonado_total: 100,
      },
    ];

    const alertas = listarAlertasCreditosPorVencer(ordenes as Orden[], HOY);
    expect(alertas.length).toBe(2);
    expect(alertas[0].orden.id).toBe('o-vencida'); // más urgente primero
    expect(alertas[1].orden.id).toBe('o-hoy');
  });
});

describe('Reporte dinámico de compras · Ámbito de cuentas a crédito', () => {
  const ctx: ContextoCompras = {
    tasaBcv: 50,
    nombreProveedor: new Map([['p1', 'Distribuidora Central']]),
    categoriasPorSku: new Map(),
  };

  it('extraerCuentasCreditoCompras filtra solo OC y OS con cuenta abierta y saldo pendiente', () => {
    const ordenes: Partial<Orden>[] = [
      { id: 'oc-1', codigo: 'OC-001', tipo: 'producto', estado: 'cuenta_abierta', total: 500, abonado_total: 100, proveedor_id: 'p1' },
      { id: 'os-2', codigo: 'OS-002', tipo: 'servicio', estado: 'cuenta_abierta', total: 300, abonado_total: 0, proveedor_id: 'p1' },
      { id: 'oc-3', codigo: 'OC-003', tipo: 'producto', estado: 'aprobada', total: 200, abonado_total: 0, proveedor_id: 'p1' },
      { id: 'oc-4', codigo: 'OC-004', tipo: 'producto', estado: 'cancelada', total: 400, abonado_total: 0, proveedor_id: 'p1' },
      { id: 'oc-5', codigo: 'OC-005', tipo: 'producto', estado: 'cuenta_abierta', total: 100, abonado_total: 100, proveedor_id: 'p1' }, // saldo 0
    ];

    const extraidas = extraerCuentasCreditoCompras(ordenes as Orden[], ctx);
    expect(extraidas.length).toBe(2);
    expect(extraidas.map((x) => x.id)).toEqual(['cred-ord-oc-1', 'cred-ord-os-2']);
    expect(extraidas[0].saldoUsd).toBe(400);
    expect(extraidas[1].saldoUsd).toBe(300);
  });

  it('normalizarCuentasCreditoFilas mapea cuentas a crédito en filas de reporte', () => {
    const item: ItemOrden = {
      sku: 'FIL-001',
      nombre: 'Filtros de aceite',
      cantidad: 4,
      precio: 150,
    };
    const ordenes: Partial<Orden>[] = [
      {
        id: 'oc-1',
        codigo: 'OC-001',
        tipo: 'producto',
        estado: 'cuenta_abierta',
        total: 600,
        abonado_total: 200,
        created_at: '2026-11-10T10:00:00Z',
        proveedor_id: 'p1',
        items: [item],
      },
    ];

    const extraidas = extraerCuentasCreditoCompras(ordenes as Orden[], ctx);
    const filas = normalizarCuentasCreditoFilas(extraidas);
    expect(filas.length).toBe(1);
    expect(filas[0].codigo).toBe('OC-001');
    expect(filas[0].monto_usd).toBe(600);
    expect(filas[0].pagado_usd).toBe(200);
    expect(filas[0].saldo_pendiente_usd).toBe(400);
    expect(filas[0].proveedor).toBe('Distribuidora Central');
  });
});
