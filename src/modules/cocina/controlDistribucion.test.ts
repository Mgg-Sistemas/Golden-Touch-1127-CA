import { describe, it, expect } from 'vitest';
import {
  calcularEoq, construirDias, demandaAnualEstimada, desdeParaKardex, diasEntre, estadoStock, filtrarDistribucion,
  filtrarPorEstado, subtituloFiltro, totalizarControl, type EstadoStock,
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

describe('la cuenta del período: lo que había, lo consumido, lo que sacó Inventario y lo que queda', () => {
  const armar = () => construirDias({
    dias: ['2026-09-14', '2026-09-15', '2026-09-16'],
    aperturaInventario: 100,
    movimientos: [
      { fecha: '2026-09-14', delta: 50, tipo: 'entrada', refTipo: 'orden' },
      { fecha: '2026-09-14', delta: -20, tipo: 'consumo', refTipo: 'cocina' },
      { fecha: '2026-09-15', delta: -30, tipo: 'salida', refTipo: 'salida_modulo' },
      { fecha: '2026-09-15', delta: -10, tipo: 'ajuste', refTipo: 'manual' },
      { fecha: '2026-09-16', delta: -15, tipo: 'consumo', refTipo: 'cocina' },
    ],
    comensalesPorDia: { '2026-09-14': 100, '2026-09-16': 100 },
    conteosPorDia: {},
    puntoReorden: 10,
  });

  it('el día abre con lo que cerró el anterior y «había» es ese saldo más las entradas', () => {
    const f = armar();
    expect(f[0].invInicial).toBe(100);
    expect(f[0].entradas).toBe(50);
    expect(f[0].disponible).toBe(150);
    expect(f[1].invInicial).toBe(130);
    expect(f[1].disponible).toBe(130);   // ese día no entró nada
  });

  it('separa la salida de inventario del ajuste manual', () => {
    const f = armar();
    expect(f[1].salidas).toBe(30);
    expect(f[1].ajustes).toBe(10);
    expect(f[1].otrasSalidas).toBe(40);  // las dos juntas, para quien las mire sumadas
  });

  it('la cuenta cierra: había − consumido − salidas − ajustes = queda', () => {
    const t = totalizarControl(armar());
    expect(t.invInicial).toBe(100);
    expect(t.entradas).toBe(50);
    expect(t.disponible).toBe(150);
    expect(t.consumo).toBe(35);
    expect(t.salidas).toBe(30);
    expect(t.ajustes).toBe(10);
    expect(t.otrasSalidas).toBe(40);
    expect(t.invFinal).toBe(75);
    expect(t.disponible - t.consumo - t.salidas - t.ajustes).toBe(t.invFinal);
  });

  it('un reverso de comida resta del consumo; NO suma a lo que había', () => {
    // Es el error que hacía que este reporte y el panel del mercado dieran distinto.
    const t = totalizarControl(construirDias({
      dias: ['2026-09-14'],
      aperturaInventario: 100,
      movimientos: [
        { fecha: '2026-09-14', delta: -20, tipo: 'consumo', refTipo: 'cocina' },
        { fecha: '2026-09-14', delta: 8, tipo: 'consumo', refTipo: 'cocina' },
      ],
      comensalesPorDia: {},
      conteosPorDia: {},
      puntoReorden: 0,
    }));
    expect(t.consumo).toBe(12);
    expect(t.entradas).toBe(0);
    expect(t.disponible).toBe(100);
    expect(t.invFinal).toBe(88);
  });

  it('la sincronización de cocina es consumo, no una salida de inventario', () => {
    const t = totalizarControl(construirDias({
      dias: ['2026-07-30'],
      aperturaInventario: 100,
      movimientos: [{ fecha: '2026-07-30', delta: -80, tipo: 'consumo', refTipo: 'cocina_sync' }],
      comensalesPorDia: {},
      conteosPorDia: {},
      puntoReorden: 0,
    }));
    expect(t.consumo).toBe(80);
    expect(t.salidas).toBe(0);
    expect(t.ajustes).toBe(0);
  });

  it('sin días, la cuenta no inventa un saldo', () => {
    const t = totalizarControl([]);
    expect(t.invInicial).toBe(0);
    expect(t.disponible).toBe(0);
    expect(t.invFinal).toBe(0);
  });

  it('el conteo físico manda: el día siguiente abre con lo contado y «había» lo refleja', () => {
    const f = construirDias({
      dias: ['2026-09-14', '2026-09-15'],
      aperturaInventario: 100,
      movimientos: [
        { fecha: '2026-09-14', delta: -20, tipo: 'consumo', refTipo: 'cocina' },
        { fecha: '2026-09-15', delta: 10, tipo: 'entrada', refTipo: 'orden' },
      ],
      comensalesPorDia: {},
      conteosPorDia: { '2026-09-14': 75 },
      puntoReorden: 0,
    });
    expect(f[0].invTeorico).toBe(80);
    expect(f[0].diferencia).toBe(-5);
    expect(f[1].invInicial).toBe(75);
    expect(f[1].disponible).toBe(85);
    expect(totalizarControl(f).invFinal).toBe(85);
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

describe('recorte desde las tarjetas', () => {
  const viv = (nombre: string, estado: EstadoStock, consumo: number, merma: number,
    salidas = 0, ajustes = 0) =>
    ({ nombre, estado, totales: { consumo, salidas, ajustes, merma } });
  const lista = [
    viv('ATUN', 'reordenar', 5, -2, 4, 0),
    viv('HUEVO', 'normal', 0, 0),
    viv('CAFE', 'alerta', 3, 0, 0, 1.25),
    viv('PASTA', 'reordenar', 0, 1.5),
  ];

  it('«todos» no recorta', () => {
    expect(filtrarDistribucion(lista, 'todos')).toEqual(lista);
  });

  it('la tarjeta de Consumo deja los que consumieron', () => {
    expect(filtrarDistribucion(lista, 'con-consumo').map((p) => p.nombre)).toEqual(['ATUN', 'CAFE']);
  });

  it('la tarjeta de Merma deja los descuadrados, sobre o falte', () => {
    expect(filtrarDistribucion(lista, 'con-merma').map((p) => p.nombre)).toEqual(['ATUN', 'PASTA']);
  });

  it('las tarjetas de estado siguen funcionando igual', () => {
    expect(filtrarDistribucion(lista, 'reordenar').map((p) => p.nombre)).toEqual(['ATUN', 'PASTA']);
    expect(filtrarDistribucion(lista, 'normal').map((p) => p.nombre)).toEqual(['HUEVO']);
  });

  it('la tarjeta de Salidas deja los que sacó Inventario', () => {
    expect(filtrarDistribucion(lista, 'con-salidas').map((p) => p.nombre)).toEqual(['ATUN']);
  });

  it('la tarjeta de Ajustes deja los que Inventario corrigió', () => {
    expect(filtrarDistribucion(lista, 'con-ajustes').map((p) => p.nombre)).toEqual(['CAFE']);
  });

  it('un consumo o una merma de cero no cuentan', () => {
    expect(filtrarDistribucion([viv('X', 'normal', 0, 0)], 'con-consumo')).toEqual([]);
    expect(filtrarDistribucion([viv('X', 'normal', 0, 0)], 'con-merma')).toEqual([]);
  });
});

describe('el subtítulo de los recortes nuevos', () => {
  it('nombra el consumo y la merma', () => {
    expect(subtituloFiltro('con-consumo')).toBe('Solo los víveres CON CONSUMO en el período');
    expect(subtituloFiltro('con-merma')).toBe('Solo los víveres CON MERMA en el período');
  });
});

describe('desdeParaKardex · el saldo guardado vale desde su instante', () => {
  it('con el instante del ciclo, el kardex se lee desde ahí', () => {
    expect(desdeParaKardex('2026-10-01', '2026-10-01T20:45:10.500Z')).toBe('2026-10-01T20:45:10.500Z');
    // Lo normaliza a ISO aunque venga con otro formato de zona.
    expect(desdeParaKardex('2026-10-01', '2026-10-01T16:45:10.5-04:00')).toBe('2026-10-01T20:45:10.500Z');
  });
  it('sin instante (rango elegido a mano), desde las 00:00 del día', () => {
    expect(desdeParaKardex('2026-10-01')).toBe('2026-10-01T00:00:00');
    expect(desdeParaKardex('2026-10-01', null)).toBe('2026-10-01T00:00:00');
    expect(desdeParaKardex('2026-10-01', 'no es fecha')).toBe('2026-10-01T00:00:00');
  });
});
