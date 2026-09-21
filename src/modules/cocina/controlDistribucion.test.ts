import { describe, it, expect } from 'vitest';
import {
  calcularEoq, construirDias, demandaAnualEstimada, diasEntre, estadoStock, filtrarPorEstado,
  subtituloFiltro, totalizarControl, type EstadoStock,
} from './controlDistribucion';

/* Los tres juegos de parámetros de la hoja «Control de consumo de pollo», con los
   resultados que la propia hoja muestra. Si alguna fórmula se mueve, esto lo canta. */
describe('EOQ · reproduce la hoja de pollo', () => {
  it('Los Pinos (D=1700, S=3, H=1, L=3)', () => {
    const r = calcularEoq({ demandaAnual: 1700, costoOrden: 3, costoAlmacenar: 1, leadTimeDias: 3 });
    expect(r.lote).toBe(101);            // 101 UND
    expect(r.puntoReorden).toBe(14);     // 14 UND
    expect(r.ordenesPorAno).toBeCloseTo(16.83, 2);
    expect(r.cicloDias).toBe(22);
  });

  it('La Esperanza (D=360, S=3.33, H=1.20, L=2)', () => {
    const r = calcularEoq({ demandaAnual: 360, costoOrden: 3.33, costoAlmacenar: 1.2, leadTimeDias: 2 });
    expect(r.lote).toBe(45);
    expect(r.puntoReorden).toBe(2);
    expect(r.ordenesPorAno).toBe(8);
    expect(r.cicloDias).toBe(46);
  });

  it('Golden Touch (D=960, S=3.33, H=1.20, L=2)', () => {
    const r = calcularEoq({ demandaAnual: 960, costoOrden: 3.33, costoAlmacenar: 1.2, leadTimeDias: 2 });
    expect(r.lote).toBe(73);
    expect(r.puntoReorden).toBe(5);
    expect(r.ordenesPorAno).toBeCloseTo(13.15, 2);
    expect(r.cicloDias).toBe(28);
  });

  it('sin demanda o sin costos no inventa un lote', () => {
    expect(calcularEoq({ demandaAnual: 0, costoOrden: 3, costoAlmacenar: 1, leadTimeDias: 3 }).lote).toBe(0);
    expect(calcularEoq({ demandaAnual: 100, costoOrden: 0, costoAlmacenar: 1, leadTimeDias: 3 }).lote).toBe(0);
    expect(calcularEoq({ demandaAnual: 100, costoOrden: 3, costoAlmacenar: 0, leadTimeDias: 3 }).lote).toBe(0);
  });
});

describe('demanda anual estimada', () => {
  it('anualiza sobre los días del período y cae cerca de la demanda de la hoja', () => {
    // Los Pinos: 54 UND en los 12 días de la hoja. A mano escribieron D = 1.700.
    expect(demandaAnualEstimada(54, 12)).toBe(1642.5);
  });

  it('NO anualiza sobre los días con consumo: eso multiplicaría el pedido', () => {
    // El mismo consumo repartido en 1 solo día daría 19.710 al año: una montaña.
    expect(demandaAnualEstimada(54, 1)).toBe(19710);
    expect(demandaAnualEstimada(54, 12)).toBeLessThan(demandaAnualEstimada(54, 1));
  });

  it('sin días es cero', () => {
    expect(demandaAnualEstimada(54, 0)).toBe(0);
  });
});

describe('semáforo de stock', () => {
  it('reproduce los estados de Los Pinos (punto de reorden 14)', () => {
    expect(estadoStock(27, 14)).toBe('normal');
    expect(estadoStock(18, 14)).toBe('alerta');
    expect(estadoStock(10, 14)).toBe('reordenar');
    expect(estadoStock(9, 14)).toBe('reordenar');
  });
  it('justo en el punto de reorden ya hay que pedir', () => {
    expect(estadoStock(14, 14)).toBe('reordenar');
    expect(estadoStock(21, 14)).toBe('alerta');
    expect(estadoStock(21.01, 14)).toBe('normal');
  });
});

describe('control diario · reproduce la tabla de Los Pinos', () => {
  const dias = diasEntre('2026-09-14', '2026-09-20');
  const filas = construirDias({
    dias,
    aperturaInventario: 0,
    movimientos: [
      { fecha: '2026-09-14', delta: 55, refTipo: 'compra' },
      { fecha: '2026-09-15', delta: -9, refTipo: 'cocina' },
      { fecha: '2026-09-16', delta: -10, refTipo: 'cocina' },
      { fecha: '2026-09-17', delta: -9, refTipo: 'cocina' },
      { fecha: '2026-09-18', delta: -9, refTipo: 'cocina' },
      { fecha: '2026-09-19', delta: -8, refTipo: 'cocina' },
      { fecha: '2026-09-20', delta: -9, refTipo: 'cocina' },
    ],
    comensalesPorDia: {
      '2026-09-14': 80, '2026-09-15': 48, '2026-09-16': 72, '2026-09-17': 40,
      '2026-09-18': 80, '2026-09-19': 48, '2026-09-20': 72,
    },
    // El 19 se contó 9 donde la cuenta decía 10: falta una unidad.
    conteosPorDia: { '2026-09-19': 9 },
    puntoReorden: 14,
  });

  it('arrastra el inventario y calcula el teórico', () => {
    expect(filas.map((f) => f.invTeorico)).toEqual([55, 46, 36, 27, 18, 10, 0]);
    expect(filas.map((f) => f.invInicial)).toEqual([0, 55, 46, 36, 27, 18, 9]);
  });

  it('el conteo físico corrige la cuenta del día siguiente', () => {
    expect(filas[5].invFisico).toBe(9);
    expect(filas[5].diferencia).toBe(-1);
    expect(filas[6].invInicial).toBe(9);   // abre con lo contado, no con el teórico 10
  });

  it('los días sin conteo no inventan una merma', () => {
    expect(filas[0].invFisico).toBeNull();
    expect(filas[0].diferencia).toBeNull();
  });

  it('el ratio es consumo por comensal', () => {
    expect(filas[1].ratio).toBeCloseTo(0.188, 3);
    expect(filas[3].ratio).toBeCloseTo(0.225, 3);
    expect(filas[0].ratio).toBe(0);        // ese día no se consumió
  });

  it('el estado sigue al inventario del día', () => {
    expect(filas.map((f) => f.estado)).toEqual([
      'normal', 'normal', 'normal', 'normal', 'alerta', 'reordenar', 'reordenar',
    ]);
  });

  it('los totales dan los de la hoja', () => {
    const t = totalizarControl(filas);
    expect(t.entradas).toBe(55);
    expect(t.consumo).toBe(54);
    expect(t.merma).toBe(-1);
    expect(t.comensales).toBe(440);
    expect(t.diasConConsumo).toBe(6);
    expect(t.promedioDiario).toBe(9);
    expect(t.ratioPromedio).toBeCloseTo(0.159, 3);
    expect(t.invFinal).toBe(0);
  });
});

describe('control diario · lo que no es una comida', () => {
  it('separa la salida manual del consumo de cocina', () => {
    const filas = construirDias({
      dias: ['2026-09-14'],
      aperturaInventario: 20,
      movimientos: [
        { fecha: '2026-09-14', delta: -5, refTipo: 'cocina' },
        { fecha: '2026-09-14', delta: -3, refTipo: 'salida' },
      ],
      comensalesPorDia: { '2026-09-14': 50 },
      conteosPorDia: {},
      puntoReorden: 2,
    });
    expect(filas[0].consumo).toBe(5);
    expect(filas[0].otrasSalidas).toBe(3);
    expect(filas[0].invTeorico).toBe(12);
    expect(filas[0].ratio).toBeCloseTo(0.1, 3);   // el ratio mide comida servida
  });
});

describe('rango de días', () => {
  it('incluye los dos extremos', () => {
    expect(diasEntre('2026-09-14', '2026-09-16')).toEqual(['2026-09-14', '2026-09-15', '2026-09-16']);
  });
  it('cruza el fin de mes', () => {
    expect(diasEntre('2026-09-29', '2026-10-01')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01']);
  });
  it('rango invertido o vacío no devuelve nada', () => {
    expect(diasEntre('2026-09-16', '2026-09-14')).toEqual([]);
    expect(diasEntre('', '2026-09-14')).toEqual([]);
  });
  it('respeta el tope', () => {
    expect(diasEntre('2026-01-01', '2026-12-31', 10)).toHaveLength(10);
  });
});

describe('recorte por estado', () => {
  const lista: Array<{ nombre: string; estado: EstadoStock }> = [
    { nombre: 'ATUN', estado: 'reordenar' },
    { nombre: 'HUEVO', estado: 'normal' },
    { nombre: 'CAFE', estado: 'alerta' },
    { nombre: 'PASTA', estado: 'reordenar' },
  ];

  it('«todos» devuelve la lista tal cual', () => {
    expect(filtrarPorEstado(lista, 'todos')).toEqual(lista);
  });

  it('deja solo los del estado pedido, en el mismo orden', () => {
    expect(filtrarPorEstado(lista, 'reordenar').map((p) => p.nombre)).toEqual(['ATUN', 'PASTA']);
    expect(filtrarPorEstado(lista, 'alerta').map((p) => p.nombre)).toEqual(['CAFE']);
  });

  it('un estado sin nadie devuelve vacío', () => {
    expect(filtrarPorEstado([{ nombre: 'X', estado: 'normal' as EstadoStock }], 'reordenar')).toEqual([]);
  });
});

describe('subtítulo del PDF', () => {
  it('sin recorte no dice nada', () => {
    expect(subtituloFiltro('todos')).toBe('');
    expect(subtituloFiltro('todos', '   ')).toBe('');
  });

  it('nombra el estado', () => {
    expect(subtituloFiltro('reordenar')).toBe('Solo los víveres por REORDENAR');
    expect(subtituloFiltro('alerta')).toBe('Solo los víveres EN ALERTA');
  });

  it('suma la búsqueda', () => {
    expect(subtituloFiltro('reordenar', ' pollo ')).toBe('Solo los víveres por REORDENAR · búsqueda «pollo»');
    expect(subtituloFiltro('todos', 'pollo')).toBe('búsqueda «pollo»');
  });
});
