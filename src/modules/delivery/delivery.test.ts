import { describe, it, expect } from 'vitest';
import {
  diaVE, estadoRetencion, etiquetaEstado, filtrarHistorico, mensajeAceptado, mensajeCancelado, mensajeEnRuta,
  mensajeEntregado, minutosEntre, resumenPorRepartidor, siguienteAccion, telLink, textoDuracion, textoPagado,
} from './delivery';
import { MOTIVOS_CANCELACION, type EventoDeliveryRow, type PedidoDeliveryVista } from './delivery.types';

function pedido(over: Partial<PedidoDeliveryVista> = {}): PedidoDeliveryVista {
  return {
    id: 'p1', orden_id: 'o1', codigo: 'DEL-0001', estado: 'por_tomar',
    repartidor_email: null, repartidor_nombre: null,
    aceptado_en: null, en_ruta_en: null, entregado_en: null,
    fotos_recibido: [], fotos_entrega: [], nota_entrega: null,
    cancelaciones: 0, ultima_cancelacion_motivo: null, ultima_cancelacion_por: null, ultima_cancelacion_en: null,
    created_at: '2026-10-30T12:00:00Z', updated_at: null,
    orden: {
      id: 'o1', codigo: 'SP-0100', oc_codigo: 'OC-0050', total: 120, total_moneda: 'USD', urgente: false, notas: null,
      unidad_solicitante: 'TALLER',
      items: [
        { nombre: 'Cemento gris', cantidad: 10, unidad: 'sacos' },
        { nombre: 'Cabilla 1/2', cantidad: 2.5, unidad: 'qq' },
        { nombre: 'No se compra', cantidad: 1, comprar: false },
      ],
      pagada_en: '2026-10-30T11:00:00Z', analista_email: 'ana@gt.com',
    },
    proveedor: { razon_social: 'Ferretería El Tornillo', rif: 'J-12345678-9', telefono: '0414-123.45.67', direccion: 'Av. Guayana, Puerto Ordaz' },
    analista: { nombre: 'Ana Pérez', telefono: '04121234567' },
    ...over,
  };
}

const evento = (over: Partial<EventoDeliveryRow>): EventoDeliveryRow => ({
  id: Math.random().toString(36), pedido_id: 'p1', evento: 'aceptado', actor_email: null, actor_nombre: null,
  motivo: null, detalle: null, lat: null, lng: null, at: '2026-10-30T12:00:00Z', ...over,
});

describe('mensajes de WhatsApp', () => {
  const p = pedido({ estado: 'aceptado', repartidor_email: 'moto@gt.com', aceptado_en: '2026-10-30T13:00:00Z' });

  it('aceptado: título, DEL, OC, proveedor completo, productos comprados, quién y hora', () => {
    const m = mensajeAceptado(p, 'Luis Gómez');
    expect(m.startsWith('🛵 *PEDIDO ACEPTADO*')).toBe(true);
    expect(m).toContain('DEL-0001');
    expect(m).toContain('*OC:* OC-0050');
    expect(m).toContain('Ferretería El Tornillo (J-12345678-9)');
    expect(m).toContain('*Dirección:* Av. Guayana, Puerto Ordaz');
    expect(m).toContain('*Teléfono:* 0414-123.45.67');
    expect(m).toContain('• Cemento gris — 10 sacos');
    expect(m).toContain('• Cabilla 1/2 — 2,5 qq');
    expect(m).not.toContain('No se compra');
    expect(m).toContain('*Lo va a buscar:* Luis Gómez');
    expect(m).toContain('30/10/2026 09:00'); // hora de Venezuela (UTC-4)
    expect(m.endsWith('🏢 GOLDEN TOUCH 1127 C.A. · Delivery')).toBe(true);
  });

  it('urgente se marca', () => {
    expect(mensajeAceptado(pedido({ orden: { ...pedido().orden, urgente: true } }), 'X')).toContain('🚨 *URGENTE*');
  });

  it('cancelado: motivo, detalle y que vuelve a Por tomar', () => {
    const m = mensajeCancelado(p, MOTIVOS_CANCELACION[0], 'Se pinchó el caucho', 'Luis Gómez');
    expect(m.startsWith('⚠ *NO SE PUEDE BUSCAR EL PEDIDO*')).toBe(true);
    expect(m).toContain(`*Motivo:* ${MOTIVOS_CANCELACION[0]}`);
    expect(m).toContain('*Detalle:* Se pinchó el caucho');
    expect(m).toContain('*Avisa:* Luis Gómez');
    expect(m).toContain('*Por tomar*');
  });

  it('en ruta: cuántas fotos al recibir', () => {
    const m = mensajeEnRuta({ ...p, estado: 'en_ruta', fotos_recibido: [{ path: 'a', nombre: 'a.jpg' }, { path: 'b', nombre: 'b.jpg' }] }, 'Luis');
    expect(m.startsWith('🚚 *PEDIDO EN RUTA AL ALMACÉN*')).toBe(true);
    expect(m).toContain('*Fotos al recibir:* 2');
    expect(mensajeEnRuta(p, 'Luis')).toContain('sin fotos');
  });

  it('entregado: nota, fotos y tiempo desde que lo aceptó', () => {
    const m = mensajeEntregado({
      ...p, estado: 'entregado', entregado_en: '2026-10-30T14:05:00Z', fotos_entrega: [{ path: 'x', nombre: 'x.jpg' }],
    }, 'Luis', 'Recibió María en almacén');
    expect(m.startsWith('✅ *PEDIDO ENTREGADO EN ALMACÉN*')).toBe(true);
    expect(m).toContain('*Nota:* Recibió María en almacén');
    expect(m).toContain('*Fotos al entregar:* 1');
    expect(m).toContain('1 h 05 min');
  });

  it('ningún mensaje lleva el selector U+FE0F (ni aunque venga en lo escrito)', () => {
    const todos = [
      mensajeAceptado(p, 'Luis'),
      ...MOTIVOS_CANCELACION.map((mo) => mensajeCancelado(p, mo, 'detalle ⚠️', 'Luis')),
      mensajeEnRuta(p, 'Luis'),
      mensajeEntregado(p, 'Luis', 'nota ✔️'),
    ];
    for (const m of todos) expect(m.includes('️')).toBe(false);
  });

  it('sin proveedor ni productos no se rompe', () => {
    const m = mensajeAceptado(pedido({ proveedor: null, orden: { ...pedido().orden, items: [] } }), '');
    expect(m).toContain('DEL-0001');
    expect(m).not.toContain('Proveedor');
  });
});

describe('telLink · números venezolanos', () => {
  it('0414… → +58414…', () => {
    expect(telLink('0414-123.45.67')).toEqual({ numero: '+584141234567', tel: 'tel:+584141234567', wa: 'https://wa.me/584141234567' });
  });
  it('fijo 0286 y sin el cero', () => {
    expect(telLink('(0286) 961 2233')?.numero).toBe('+582869612233');
    expect(telLink('414 1234567')?.numero).toBe('+584141234567');
  });
  it('ya con 58 o con +', () => {
    expect(telLink('584241112233')?.wa).toBe('https://wa.me/584241112233');
    expect(telLink('+1 305 555 1234')?.numero).toBe('+13055551234');
  });
  it('varios números: el primero', () => {
    expect(telLink('0414-1234567 / 0286-9612233')?.numero).toBe('+584141234567');
  });
  it('vacío o basura → null', () => {
    expect(telLink('')).toBeNull();
    expect(telLink(null)).toBeNull();
    expect(telLink('s/n')).toBeNull();
    expect(telLink('123')).toBeNull();
  });
});

describe('estados', () => {
  it('etiquetaEstado', () => {
    expect(etiquetaEstado('por_tomar')).toBe('Por tomar');
    expect(etiquetaEstado('en_ruta')).toBe('En ruta');
    expect(etiquetaEstado('raro')).toBe('raro');
  });
  it('siguienteAccion', () => {
    expect(siguienteAccion('por_tomar')?.accion).toBe('aceptar');
    expect(siguienteAccion('aceptado')?.accion).toBe('en_ruta');
    expect(siguienteAccion('en_ruta')?.accion).toBe('entregar');
    expect(siguienteAccion('entregado')).toBeNull();
  });
  it('estadoRetencion: solo informativa', () => {
    expect(estadoRetencion({ comprobante_tipo: 'factura', retencion_finalizada: true })).toBe('hecha');
    expect(estadoRetencion({ comprobante_tipo: 'factura', retencion_finalizada: false })).toBe('pendiente');
    expect(estadoRetencion({ comprobante_tipo: 'nota_entrega', retencion_finalizada: false })).toBe('no_aplica');
    expect(estadoRetencion({ comprobante_tipo: null })).toBe('no_aplica');
  });
  it('textoPagado: fecha de Venezuela, quién y método', () => {
    expect(textoPagado({ pagada_en: '2026-10-30T14:15:00Z', pagada_por: 'Ana Pérez', metodo_pago_texto: 'Pago móvil' }))
      .toBe('Pagado el 30/10/2026 10:15 por Ana Pérez · Pago móvil');
    expect(textoPagado({ pagada_en: '2026-10-30T14:15:00Z' })).toBe('Pagado el 30/10/2026 10:15');
    expect(textoPagado({ pagada_en: null, pagada_por: 'Ana' })).toBe('');
  });
});

describe('tiempos', () => {
  it('minutosEntre y textoDuracion', () => {
    expect(minutosEntre('2026-10-30T12:00:00Z', '2026-10-30T12:45:00Z')).toBe(45);
    expect(minutosEntre(null, '2026-10-30T12:45:00Z')).toBeNull();
    expect(minutosEntre('2026-10-30T13:00:00Z', '2026-10-30T12:00:00Z')).toBeNull();
    expect(textoDuracion(45)).toBe('45 min');
    expect(textoDuracion(125)).toBe('2 h 05 min');
    expect(textoDuracion(null)).toBe('—');
  });
  it('diaVE usa la hora de Venezuela', () => {
    // 02:30 UTC del 31 = 22:30 del 30 en Caracas
    expect(diaVE('2026-10-31T02:30:00Z')).toBe('2026-10-30');
    expect(diaVE('2026-10-31T04:30:00Z')).toBe('2026-10-31');
    expect(diaVE(null)).toBe('');
  });
});

describe('resumenPorRepartidor', () => {
  const pedidos = [
    pedido({ id: 'a', estado: 'entregado', repartidor_email: 'luis@gt.com', repartidor_nombre: 'Luis', aceptado_en: '2026-10-30T12:00:00Z', entregado_en: '2026-10-30T12:30:00Z' }),
    pedido({ id: 'b', estado: 'entregado', repartidor_email: 'LUIS@gt.com', repartidor_nombre: 'Luis', aceptado_en: '2026-10-30T13:00:00Z', entregado_en: '2026-10-30T14:30:00Z' }),
    pedido({ id: 'c', estado: 'en_ruta', repartidor_email: 'luis@gt.com', aceptado_en: '2026-10-30T15:00:00Z' }),
    pedido({ id: 'd', estado: 'aceptado', repartidor_email: 'pedro@gt.com', repartidor_nombre: 'Pedro' }),
    pedido({ id: 'e', estado: 'por_tomar' }),
  ];
  const eventos = [
    evento({ pedido_id: 'a', evento: 'aceptado', actor_email: 'luis@gt.com' }),
    evento({ pedido_id: 'e', evento: 'aceptado', actor_email: 'pedro@gt.com' }),
    evento({ pedido_id: 'e', evento: 'cancelado', actor_email: 'pedro@gt.com', motivo: 'Lluvia' }),
    evento({ pedido_id: 'e', evento: 'aceptado', actor_email: 'pedro@gt.com' }),
    evento({ pedido_id: 'e', evento: 'cancelado', actor_email: 'pedro@gt.com' }),
    evento({ pedido_id: 'd', evento: 'aceptado', actor_email: 'pedro@gt.com' }),
  ];
  const r = resumenPorRepartidor(pedidos, eventos);

  it('agrupa por correo sin importar mayúsculas y ordena por entregas', () => {
    expect(r.map((x) => x.repartidor_email)).toEqual(['luis@gt.com', 'pedro@gt.com']);
  });
  it('cuenta entregados, en curso, cancelaciones y aceptados', () => {
    const luis = r[0];
    expect(luis).toMatchObject({ repartidor_nombre: 'Luis', aceptados: 3, entregados: 2, en_curso: 1, cancelaciones: 0 });
    const pedro = r[1];
    expect(pedro).toMatchObject({ aceptados: 3, entregados: 0, en_curso: 1, cancelaciones: 2, minutos_promedio: null });
  });
  it('tiempo promedio aceptado → entregado en minutos', () => {
    expect(r[0].minutos_promedio).toBe(60); // (30 + 90) / 2
  });
  it('sin datos, vacío', () => {
    expect(resumenPorRepartidor([], [])).toEqual([]);
  });
});

describe('filtrarHistorico', () => {
  const pedidos = [
    pedido({ id: 'a', estado: 'entregado', repartidor_email: 'luis@gt.com', aceptado_en: '2026-10-29T12:00:00Z', entregado_en: '2026-10-31T02:00:00Z' }),
    pedido({ id: 'b', estado: 'aceptado', repartidor_email: 'pedro@gt.com', aceptado_en: '2026-10-28T15:00:00Z' }),
    pedido({ id: 'c', estado: 'por_tomar', created_at: '2026-09-30T15:00:00Z' }),
  ];

  it('rango en hora de Venezuela (lo entregado a las 22:00 del 30 cuenta el 30)', () => {
    expect(filtrarHistorico(pedidos, { desde: '2026-10-30', hasta: '2026-10-30' }).map((p) => p.id)).toEqual(['a']);
    expect(filtrarHistorico(pedidos, { desde: '2026-10-01' }).map((p) => p.id)).toEqual(['a', 'b']);
    expect(filtrarHistorico(pedidos, { hasta: '2026-09-30' }).map((p) => p.id)).toEqual(['c']);
  });
  it('por motorizado y por estado', () => {
    expect(filtrarHistorico(pedidos, { repartidor: 'PEDRO@gt.com' }).map((p) => p.id)).toEqual(['b']);
    expect(filtrarHistorico(pedidos, { estado: 'por_tomar' }).map((p) => p.id)).toEqual(['c']);
    expect(filtrarHistorico(pedidos, { estado: '' }).length).toBe(3);
  });
  it('sin filtros: todo, lo más reciente primero', () => {
    expect(filtrarHistorico(pedidos).map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });
});
