import { describe, expect, it } from 'vitest';
import {
  buscarDetalle, filtrarClase, filtrarViveres, rangoValido, totalesDetalle, ventanaDelReporte,
} from './detalleDistribucion';
import type { MovimientoDetalle } from './controlDistribucion.repository';

const mov = (p: Partial<MovimientoDetalle>): MovimientoDetalle => ({
  id: 'm1', producto_id: 'p1', sku: 'VIV-001', nombre: 'POLLO', unidad: 'KG',
  fecha: '2026-09-20T10:00:00Z', clase: 'consumo', cantidad: 9, tipo: 'consumo',
  origen: 'Comida', comprobante: null, motivo: null, responsable: null, ...p,
});

const lista: MovimientoDetalle[] = [
  mov({ id: '1', clase: 'entrada', cantidad: 55, origen: 'Orden de compra', comprobante: 'OC-014', responsable: 'Ana' }),
  mov({ id: '2', clase: 'consumo', cantidad: 9 }),
  mov({ id: '3', clase: 'consumo', cantidad: 2 }),
  mov({ id: '4', producto_id: 'p2', nombre: 'ARROZ', sku: 'VIV-002', clase: 'salida', cantidad: 20, origen: 'Salida de material', comprobante: 'SAL-003', motivo: 'A campamento' }),
  mov({ id: '5', producto_id: 'p2', nombre: 'ARROZ', sku: 'VIV-002', clase: 'ajuste', cantidad: 7, origen: 'Ajuste manual', motivo: 'Conteo del depósito', responsable: 'Luis' }),
];

describe('el recorte del detalle', () => {
  it('por cajón', () => {
    expect(filtrarClase(lista, 'consumo').map((f) => f.id)).toEqual(['2', '3']);
    expect(filtrarClase(lista, 'ajuste').map((f) => f.id)).toEqual(['5']);
    expect(filtrarClase(lista, 'todas')).toEqual(lista);
  });

  it('por víver, y un conjunto vacío no recorta nada', () => {
    expect(filtrarViveres(lista, new Set(['p2'])).map((f) => f.id)).toEqual(['4', '5']);
    expect(filtrarViveres(lista, new Set())).toEqual(lista);
  });
});

describe('la búsqueda del detalle', () => {
  it('encuentra por comprobante, motivo y responsable', () => {
    expect(buscarDetalle(lista, 'OC-014').map((f) => f.id)).toEqual(['1']);
    expect(buscarDetalle(lista, 'campamento').map((f) => f.id)).toEqual(['4']);
    expect(buscarDetalle(lista, 'luis').map((f) => f.id)).toEqual(['5']);
  });

  it('no le importan los acentos ni el código del víver', () => {
    expect(buscarDetalle(lista, 'VIV-002').map((f) => f.id)).toEqual(['4', '5']);
    expect(buscarDetalle(lista, 'depósito').map((f) => f.id)).toEqual(['5']);
    expect(buscarDetalle(lista, 'deposito').map((f) => f.id)).toEqual(['5']);
  });

  it('encuentra por fecha', () => {
    expect(buscarDetalle(lista, '2026-09-20')).toHaveLength(5);
  });

  it('un espacio suelto no vacía la tabla', () => {
    expect(buscarDetalle(lista, '   ')).toEqual(lista);
  });
});

describe('los totales del detalle', () => {
  it('cuadran cajón por cajón con el resumen', () => {
    expect(totalesDetalle(lista)).toEqual({
      entradas: 55, consumo: 11, salidas: 20, ajustes: 7, filas: 5,
    });
  });

  it('sin movimientos da todo en cero', () => {
    expect(totalesDetalle([])).toEqual({ entradas: 0, consumo: 0, salidas: 0, ajustes: 0, filas: 0 });
  });
});

describe('el rango de fechas del reporte', () => {
  const ciclo = { desde: '2026-09-01', hasta: '2026-09-29' };

  it('un campo vacío vuelve al del ciclo', () => {
    expect(rangoValido('', '2026-09-15', ciclo)).toEqual({ desde: '2026-09-01', hasta: '2026-09-15' });
    expect(rangoValido('2026-09-10', '', ciclo)).toEqual({ desde: '2026-09-10', hasta: '2026-09-29' });
  });

  it('un rango al revés se da vuelta en vez de vaciar la pantalla', () => {
    expect(rangoValido('2026-09-20', '2026-09-05', ciclo)).toEqual({ desde: '2026-09-05', hasta: '2026-09-20' });
  });

  it('recorta la hora si viene con ella', () => {
    expect(rangoValido('2026-09-05T13:20:00Z', '2026-09-20', ciclo)).toEqual({ desde: '2026-09-05', hasta: '2026-09-20' });
  });
});

describe('la ventana del mercado abierto llega hasta HOY (cierre manual, 27/10/2026)', () => {
  // El mercado real MK-2026-0004: arrancó el 14/10/2026 y sigue abierto.
  const inicio = '2026-10-14T18:41:56.338Z';
  const sinElegir = { desde: '', hasta: '' };

  it('sin rango elegido va del inicio del ciclo hasta hoy', () => {
    expect(ventanaDelReporte(inicio, sinElegir, '2026-10-27'))
      .toEqual({ desde: '2026-10-14', hasta: '2026-10-27', esDelCiclo: true });
  });

  it('el caso del incidente: al día siguiente, el mismo panel ya llega hasta el día nuevo (no se queda en el día que se abrió)', () => {
    expect(ventanaDelReporte(inicio, sinElegir, '2026-10-18').hasta).toBe('2026-10-18');
    expect(ventanaDelReporte(inicio, sinElegir, '2026-10-19').hasta).toBe('2026-10-19');
    expect(ventanaDelReporte(inicio, sinElegir, '2026-10-27').hasta).toBe('2026-10-27');
  });

  it('pasados los 21 días sigue llegando hasta hoy: el mercado no tiene fin hasta que se cierra', () => {
    expect(ventanaDelReporte(inicio, sinElegir, '2026-11-20'))
      .toEqual({ desde: '2026-10-14', hasta: '2026-11-20', esDelCiclo: true });
  });

  it('un rango elegido a mano se respeta, pero nunca más allá de hoy', () => {
    expect(ventanaDelReporte(inicio, { desde: '2026-10-20', hasta: '2026-10-22' }, '2026-10-27'))
      .toEqual({ desde: '2026-10-20', hasta: '2026-10-22', esDelCiclo: false });
    expect(ventanaDelReporte(inicio, { desde: '', hasta: '2026-11-05' }, '2026-10-27'))
      .toEqual({ desde: '2026-10-14', hasta: '2026-10-27', esDelCiclo: true });
  });

  it('sin inicio de ciclo mira solo hoy', () => {
    expect(ventanaDelReporte(null, sinElegir, '2026-10-27')).toEqual({ desde: '2026-10-27', hasta: '2026-10-27', esDelCiclo: true });
  });
});
