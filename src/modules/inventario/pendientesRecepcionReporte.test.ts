import { describe, expect, it } from 'vitest';
import type { Orden } from '@/shared/lib/types';
import type { CompraDirecta } from '@/modules/pedidos/compras.repository';
import {
  AVISO_WHATSAPP_POR_DEFECTO,
  CAMPOS_POR_DEFECTO_PENDIENTES,
  agruparPendientesRecepcion,
  calcularResumenPendientes,
  construirWhatsappPendientesRecepcion,
  normalizarPendientesRecepcion,
  obtenerFilasSeleccionadasPendientes,
} from './pendientesRecepcionReporte';

function crearOrdenBase(overrides: Partial<Orden> = {}): Orden {
  return {
    id: 'ord-1',
    codigo: 'SP-2026-0500',
    oc_codigo: 'OC-2026-0255',
    tipo: 'producto',
    estado: 'pagada',
    solicitante: 'JAVIER LEIVA',
    solicitante_email: 'analista1mgg@gmail.com',
    unidad_solicitante: 'MANTENIMIENTO',
    almacen_destino: 'General',
    proveedor_id: 'prov-1',
    items: [
      { sku: 'REP-01', nombre: 'ESTOPERA DE CAJA', cantidad: 2, precio: 45, unidad: 'UND' },
    ],
    total: 90,
    condiciones_pago: 'contado',
    created_at: '2026-11-15T12:00:00Z',
    oc_creada_en: '2026-11-16T14:17:00Z',
    oc_creada_por: 'comprasanalista9@gmail.com',
    pagada_en: '2026-11-17T18:30:00Z',
    recibida_en: null,
    historial: [],
    ...overrides,
  } as unknown as Orden;
}

describe('pendientesRecepcionReporte · motor dinámico y mensajes', () => {
  it('resuelve analista encargado sin @, fecha montada y fecha de pago de Tesorería', () => {
    const provs = new Map([['prov-1', 'REPUESTOS GUAYANA C.A.']]);
    const ocPagada = crearOrdenBase();
    const csSinPago = crearOrdenBase({
      id: 'ord-2',
      codigo: 'SS-2026-0012',
      oc_codigo: 'CS-2026-0012',
      tipo: 'servicio',
      estado: 'por_recibir',
      condiciones_pago: 'contra_entrega',
      oc_creada_por: null,
      oc_emitida_por: null,
      pagada_en: null,
      oc_creada_en: '2026-08-10T13:00:00Z',
      historial: [{ at: '2026-08-10T13:00:00Z', actor: 'asistentecomprasgt2@gmail.com', evento: 'oc_creada' }],
      total: 6000,
    });
    const directa: CompraDirecta = {
      id: 'cd-1',
      codigo: 'CD-2026-0044',
      producto_id: 'p1',
      producto_nombre: 'ACEITE 15W40',
      producto_sku: 'ACE-15',
      almacen: 'Depósito Mina',
      cantidad: 5,
      items: [{ producto_id: 'p1', producto_nombre: 'ACEITE 15W40', producto_sku: 'ACE-15', cantidad: 5, gasto: 100 }],
      proveedor_id: null,
      proveedor_nombre: 'LUBRICANTES SUR',
      nota: null,
      estado: 'finalizada',
      gasto: 100,
      moneda: 'USD',
      caja_id: 'c1',
      caja_mov_id: 'm1',
      pago_legs: null,
      adjunto_path: null,
      adjunto_nombre: null,
      mov_id: null,
      gasto_categoria: null,
      gasto_subcategoria: null,
      pagada_at: '2026-11-18T14:00:00Z',
      pagada_por: 'tesoreria@gt.com',
      pagada_por_name: 'MARIANA TOVAR',
      enviada_pagar_at: '2026-11-18T13:10:00Z',
      actor: 'analista1mgg@gmail.com',
      actor_name: null,
      created_at: '2026-11-18T13:00:00Z',
      aprobada_at: null,
      aprobada_por: null,
      finalizada_at: null,
      updated_at: '2026-11-18T14:00:00Z',
    };

    const filas = normalizarPendientesRecepcion({
      ordenesPendientes: [ocPagada, csSinPago],
      comprasPendientes: [directa],
      proveedoresMap: provs,
      ahoraMs: Date.parse('2026-11-18T20:00:00Z'),
    });

    expect(filas).toHaveLength(3);

    // 1) OC pagada: analista KELVIN PEÑA (sin @), fecha montada 16-11-2026, pago 17-11-2026
    expect(filas[0].analista).toBe('KELVIN PEÑA');
    expect(filas[0].analista).not.toContain('@');
    expect(filas[0].fechaMontadaFmt).toBe('16-11-2026');
    expect(filas[0].fechaPagoFmt).toBe('17-11-2026');
    expect(filas[0].tienePagoTesoreria).toBe(true);
    expect(filas[0].proveedor).toBe('REPUESTOS GUAYANA C.A.');

    // 2) CS contra entrega sin pago aún: analista NAZARET SALAZAR desde historial
    expect(filas[1].origen).toBe('cs');
    expect(filas[1].analista).toBe('NAZARET SALAZAR');
    expect(filas[1].tienePagoTesoreria).toBe(false);
    expect(filas[1].fechaPagoFmt).toBe('Contra entrega (sin pago)');

    // 3) Compra directa: analista JAVIER LEIVA
    expect(filas[2].origen).toBe('directa');
    expect(filas[2].analista).toBe('JAVIER LEIVA');
    expect(filas[2].fechaMontadaFmt).toBe('18-11-2026');
    expect(filas[2].fechaPagoFmt).toBe('18-11-2026');
  });

  it('filtra dinámicamente, agrupa por analista y genera WhatsApp con NO HA LLEGADO A ALMACEN DAR STATUS', () => {
    const f1 = crearOrdenBase({ id: 'o1', oc_codigo: 'OC-2026-0209', total: 2231.4, oc_creada_por: 'comprasanalista9@gmail.com' });
    const f2 = crearOrdenBase({ id: 'o2', oc_codigo: 'OC-2026-0252', total: 387.31, oc_creada_por: 'analista1mgg@gmail.com' });
    const f3 = crearOrdenBase({ id: 'o3', oc_codigo: 'CS-2026-0042', tipo: 'servicio', total: 235, oc_creada_por: 'analista1mgg@gmail.com' });

    const normalizadas = normalizarPendientesRecepcion({
      ordenesPendientes: [f1, f2, f3],
      ahoraMs: Date.parse('2026-11-18T20:00:00Z'),
    });

    // Excluir o1 por checkbox
    const seleccionadas = obtenerFilasSeleccionadasPendientes(
      normalizadas,
      {
        busqueda: '',
        origenes: [],
        estados: [],
        analista: '',
        almacen: '',
        solicitante: '',
        criterioFecha: 'todas',
        desde: '',
        hasta: '',
        uidsExcluidos: ['orden:o1'],
      },
      'monto_desc',
    );

    expect(seleccionadas.map((x) => x.codigo)).toEqual(['OC-2026-0252', 'CS-2026-0042']);

    const resumen = calcularResumenPendientes(seleccionadas);
    expect(resumen.totalOrdenes).toBe(2);
    expect(resumen.totalOc).toBe(1);
    expect(resumen.totalCs).toBe(1);
    expect(resumen.totalMontoUsd).toBeCloseTo(622.31, 2);

    const grupos = agruparPendientesRecepcion(seleccionadas, 'analista');
    expect(grupos).toHaveLength(1);
    expect(grupos[0].titulo).toBe('JAVIER LEIVA');

    const wsp = construirWhatsappPendientesRecepcion({
      filas: seleccionadas,
      agrupacion: 'analista',
      campos: [...CAMPOS_POR_DEFECTO_PENDIENTES, 'detalle_items'],
      incluirResumen: true,
    });

    expect(wsp).toContain(`🚨 *${AVISO_WHATSAPP_POR_DEFECTO}*`);
    expect(wsp).toContain('NO HA LLEGADO A ALMACEN DAR STATUS');
    expect(wsp).toContain('🛒 *Analista encargado:* JAVIER LEIVA');
    expect(wsp).toContain('📅 *Montada:* 16-11-2026');
    expect(wsp).toContain('💳 *Pago Tesorería:* 17-11-2026');
    expect(wsp).toContain('ESTOPERA DE CAJA');
    expect(wsp).not.toContain('OC-2026-0209');

    // Al desmarcar monto, oculta los importes en dólares
    const wspSinMonto = construirWhatsappPendientesRecepcion({
      filas: seleccionadas,
      agrupacion: 'sin_agrupar',
      campos: ['codigo', 'analista', 'fecha_montada', 'fecha_pago'],
      incluirResumen: true,
    });
    expect(wspSinMonto).not.toContain('Monto total');
    expect(wspSinMonto).toContain('🛒 *Analista encargado:* JAVIER LEIVA');
  });
});
