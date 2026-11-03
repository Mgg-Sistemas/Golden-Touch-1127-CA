import { describe, it, expect } from 'vitest';
import type { Existencia } from '@/shared/lib/types';
import type { MovResumenRow } from './resumenInventario';
import {
  normalizarExistencias,
  normalizarMovimientosInventario,
  filtrarFilasInventario,
  procesarFilasReporteInventario,
  resumenInventario,
  obtenerMetricasFichaInventario,
  SIN_SEDE,
  type MapaProductos,
  type MapaSedes,
  type ProductoInfoInventario,
  type FilaReporteInventario,
} from './inventarioMoldeable';

/* ───────────── Helpers de fixtures ───────────── */

function mkInfo(extra: Partial<ProductoInfoInventario> = {}): ProductoInfoInventario {
  return { sku: 'SKU-1', nombre: 'Producto 1', categoria: 'Tornillos', unidad: 'und', stock_min: 0, estado: 'activo', ...extra };
}

function mkEx(extra: Partial<Existencia>): Existencia {
  return { producto_id: 'p1', almacen: 'General', stock: 0, costo_promedio: 0, ...extra } as Existencia;
}

function mkMov(extra: Partial<MovResumenRow>): MovResumenRow {
  return {
    id: 'm1',
    at: '2026-11-01T10:00:00Z',
    tipo: 'salida',
    producto_id: 'p1',
    sku: 'SKU-1',
    nombre: 'Producto 1',
    almacen: 'General',
    cantidad: 0,
    valor: 0,
    destino: '',
    solicitante: '',
    actor: 'Operador',
    detalle: '',
    ...extra,
  };
}

const PRODS: MapaProductos = new Map<string, ProductoInfoInventario>([
  ['p1', mkInfo({ sku: 'SKU-1', nombre: 'Tornillo', categoria: 'Tornillos', unidad: 'und', stock_min: 10 })],
  ['p2', mkInfo({ sku: 'SKU-2', nombre: 'Aceite', categoria: 'Lubricantes', unidad: 'L', stock_min: 0 })],
]);

const SEDES: MapaSedes = new Map<string, string>([
  ['General', 'Matanzas'],
  ['Depósito Mina', 'Los Pinos'],
]);

/* ───────────── normalizarExistencias ───────────── */

describe('normalizarExistencias', () => {
  it('calcula el valor como stock × costo y resuelve ficha + sede', () => {
    const [f] = normalizarExistencias([mkEx({ producto_id: 'p1', almacen: 'General', stock: 5, costo_promedio: 2 })], PRODS, SEDES);
    expect(f.valor).toBe(10);
    expect(f.sku).toBe('SKU-1');
    expect(f.categoria).toBe('Tornillos');
    expect(f.unidad).toBe('und');
    expect(f.sede).toBe('Matanzas');
    expect(f.ambito).toBe('existencias');
  });

  it('marca bajo mínimo cuando stock < stock_min (>0)', () => {
    const [bajo] = normalizarExistencias([mkEx({ producto_id: 'p1', stock: 3, costo_promedio: 1 })], PRODS, SEDES);
    expect(bajo.bajo_minimo).toBe(true);
    const [ok] = normalizarExistencias([mkEx({ producto_id: 'p1', stock: 20, costo_promedio: 1 })], PRODS, SEDES);
    expect(ok.bajo_minimo).toBe(false);
  });

  it('sin stock_min nunca marca bajo mínimo', () => {
    const [f] = normalizarExistencias([mkEx({ producto_id: 'p2', stock: 0, costo_promedio: 5 })], PRODS, SEDES);
    expect(f.bajo_minimo).toBe(false);
  });

  it('costo 0 da valor 0 sin romper', () => {
    const [f] = normalizarExistencias([mkEx({ producto_id: 'p1', stock: 8, costo_promedio: 0 })], PRODS, SEDES);
    expect(f.valor).toBe(0);
    expect(f.stock).toBe(8);
  });

  it('almacén sin sede conocida cae en «Sin sede»', () => {
    const [f] = normalizarExistencias([mkEx({ producto_id: 'p1', almacen: 'Legado', stock: 1, costo_promedio: 1 })], PRODS, SEDES);
    expect(f.sede).toBe(SIN_SEDE);
  });

  it('producto ausente del mapa usa valores de respaldo', () => {
    const [f] = normalizarExistencias([mkEx({ producto_id: 'fantasma', stock: 1, costo_promedio: 1 })], PRODS, SEDES);
    expect(f.sku).toBe('—');
    expect(f.categoria).toBe('Sin categoría');
  });
});

/* ───────────── normalizarMovimientosInventario ───────────── */

describe('normalizarMovimientosInventario', () => {
  it('mapea entradas/salidas/traslados al tipo normalizado', () => {
    const filas = normalizarMovimientosInventario(
      {
        entradas: [mkMov({ id: 'a', tipo: 'entrada', cantidad: 5, valor: 10 })],
        salidas: [mkMov({ id: 'b', tipo: 'salida', cantidad: 2, valor: 4 })],
        traslados: [mkMov({ id: 'c', tipo: 'transferencia', cantidad: 3, valor: 6 })],
      },
      PRODS,
      SEDES,
    );
    expect(filas.map((f) => f.tipo_mov)).toEqual(['entrada', 'salida', 'traslado']);
    expect(filas.every((f) => f.ambito === 'movimientos')).toBe(true);
  });

  it('deriva el costo unitario como valor ÷ cantidad y enriquece categoría/unidad', () => {
    const [f] = normalizarMovimientosInventario(
      { entradas: [mkMov({ id: 'a', tipo: 'entrada', producto_id: 'p2', cantidad: 4, valor: 20 })], salidas: [], traslados: [] },
      PRODS,
      SEDES,
    );
    expect(f.costo_promedio).toBe(5);
    expect(f.categoria).toBe('Lubricantes');
    expect(f.unidad).toBe('L');
    expect(f.fecha).toBe('2026-11-01');
  });

  it('un tipo «consumo» en el bloque de salidas se respeta como consumo', () => {
    const [f] = normalizarMovimientosInventario(
      { entradas: [], salidas: [mkMov({ id: 'b', tipo: 'consumo', cantidad: 1, valor: 2 })], traslados: [] },
      PRODS,
      SEDES,
    );
    expect(f.tipo_mov).toBe('consumo');
  });
});

/* ───────────── filtrarFilasInventario ───────────── */

describe('filtrarFilasInventario', () => {
  const filas = normalizarExistencias(
    [
      mkEx({ producto_id: 'p1', almacen: 'General', stock: 3, costo_promedio: 1 }),   // Tornillos, bajo mínimo
      mkEx({ producto_id: 'p2', almacen: 'Depósito Mina', stock: 0, costo_promedio: 5 }), // Lubricantes, sin stock
    ],
    PRODS,
    SEDES,
  );

  it('filtra por categoría', () => {
    expect(filtrarFilasInventario(filas, { categoriasSel: ['Tornillos'] }).map((f) => f.producto_id)).toEqual(['p1']);
  });
  it('filtra por almacén', () => {
    expect(filtrarFilasInventario(filas, { almacenesSel: ['Depósito Mina'] }).map((f) => f.producto_id)).toEqual(['p2']);
  });
  it('filtra por sede', () => {
    expect(filtrarFilasInventario(filas, { sedesSel: ['Matanzas'] }).map((f) => f.producto_id)).toEqual(['p1']);
  });
  it('solo bajo mínimo deja los que están por debajo', () => {
    expect(filtrarFilasInventario(filas, { soloBajoMinimo: true }).map((f) => f.producto_id)).toEqual(['p1']);
  });
  it('ocultar sin stock descarta stock ≤ 0', () => {
    expect(filtrarFilasInventario(filas, { ocultarSinStock: true }).map((f) => f.producto_id)).toEqual(['p1']);
  });
  it('sin filtros devuelve todo', () => {
    expect(filtrarFilasInventario(filas, {})).toHaveLength(2);
  });
});

/* ───────────── resumenInventario ───────────── */

describe('resumenInventario', () => {
  it('existencias: suma valor y stock, cuenta bajo mínimo', () => {
    const filas = normalizarExistencias(
      [
        mkEx({ producto_id: 'p1', stock: 3, costo_promedio: 2 }),   // 6, bajo mínimo (min 10)
        mkEx({ producto_id: 'p2', stock: 10, costo_promedio: 4 }),  // 40
      ],
      PRODS,
      SEDES,
    );
    const r = resumenInventario(filas, 'existencias');
    expect(r.valorTotal).toBe(46);
    expect(r.stockTotal).toBe(13);
    expect(r.numBajoMinimo).toBe(1);
    expect(r.numItems).toBe(2);
    expect(r.topCategorias[0].nombre).toBe('Lubricantes'); // 40 > 6
  });

  it('movimientos: separa entradas/salidas/consumo/traslados', () => {
    const filas = normalizarMovimientosInventario(
      {
        entradas: [mkMov({ id: 'a', tipo: 'entrada', cantidad: 5, valor: 10 })],
        salidas: [mkMov({ id: 'b', tipo: 'salida', cantidad: 2, valor: 4 }), mkMov({ id: 'c', tipo: 'consumo', cantidad: 1, valor: 2 })],
        traslados: [mkMov({ id: 'd', tipo: 'transferencia', cantidad: 3, valor: 6 })],
      },
      PRODS,
      SEDES,
    );
    const r = resumenInventario(filas, 'movimientos');
    expect(r.entradas).toBe(5);
    expect(r.salidas).toBe(2);
    expect(r.consumo).toBe(1);
    expect(r.traslados).toBe(3);
    expect(r.valorEntradas).toBe(10);
    expect(r.valorSalidas).toBe(6); // salida 4 + consumo 2
    expect(r.totalMovimientos).toBe(4);
  });
});

/* ───────────── procesarFilasReporteInventario ───────────── */

describe('procesarFilasReporteInventario', () => {
  const detalle = normalizarExistencias(
    [
      mkEx({ producto_id: 'p1', almacen: 'General', stock: 10, costo_promedio: 3 }), // Tornillos 30
      mkEx({ producto_id: 'p1', almacen: 'General', stock: 10, costo_promedio: 1 }), // Tornillos 10
      mkEx({ producto_id: 'p2', almacen: 'General', stock: 10, costo_promedio: 6 }), // Lubricantes 60
    ],
    PRODS,
    SEDES,
  );

  it('detallado conserva una fila por existencia con su % del total', () => {
    const { filas } = procesarFilasReporteInventario(detalle, 'detallado', { ambito: 'existencias' });
    expect(filas).toHaveLength(3);
    const mayor = filas.find((f) => f.valor === 60)!;
    expect(mayor.pct_del_total).toBe(60); // 60 de 100
    expect(mayor.total_items).toBe(1);
  });

  it('agrupa por categoría sumando valor, stock y nº de productos', () => {
    const { filas } = procesarFilasReporteInventario(detalle, 'categoria', { ambito: 'existencias' });
    expect(filas).toHaveLength(2);
    const tornillos = filas.find((f) => f.categoria === 'Tornillos')!;
    expect(tornillos.valor).toBe(40);
    expect(tornillos.stock).toBe(20);
    expect(tornillos.total_items).toBe(2);
    expect(tornillos.pct_del_total).toBe(40);
  });

  it('ordena los grupos por valor descendente por defecto', () => {
    const { filas } = procesarFilasReporteInventario(detalle, 'categoria', { ambito: 'existencias' });
    expect(filas[0].categoria).toBe('Lubricantes'); // 60 > 40
  });

  it('el resumen sale del detalle completo, no de los grupos', () => {
    const { resumen } = procesarFilasReporteInventario(detalle, 'categoria', { ambito: 'existencias' });
    expect(resumen.valorTotal).toBe(100);
    expect(resumen.numItems).toBe(3);
  });

  it('agrupa movimientos por tipo (entradas vs salidas)', () => {
    const movs = normalizarMovimientosInventario(
      {
        entradas: [mkMov({ id: 'a', tipo: 'entrada', cantidad: 5, valor: 10 })],
        salidas: [mkMov({ id: 'b', tipo: 'salida', cantidad: 2, valor: 4 }), mkMov({ id: 'c', tipo: 'salida', cantidad: 1, valor: 2 })],
        traslados: [],
      },
      PRODS,
      SEDES,
    );
    const { filas } = procesarFilasReporteInventario(movs, 'tipo', { ambito: 'movimientos' });
    const salida = filas.find((f) => f.tipo_mov === 'salida')!;
    expect(salida.cantidad).toBe(3);
    expect(salida.valor).toBe(6);
    expect(salida.total_items).toBe(2);
  });

  it('período sin movimientos devuelve filas vacías y resumen en cero', () => {
    const { filas, resumen } = procesarFilasReporteInventario([], 'tipo', { ambito: 'movimientos' });
    expect(filas).toHaveLength(0);
    expect(resumen.entradas).toBe(0);
    expect(resumen.totalMovimientos).toBe(0);
  });
});

/* ───────────── obtenerMetricasFichaInventario ───────────── */

describe('obtenerMetricasFichaInventario', () => {
  const fila: FilaReporteInventario = {
    id: 'x', ambito: 'existencias', producto_id: 'p1', sku: 'SKU-1', nombre: 'Tornillo',
    categoria: 'Tornillos', unidad: 'und', almacen: 'General', sede: 'Matanzas',
    stock: 3, costo_promedio: 2, valor: 6, stock_min: 10, bajo_minimo: true, estado: 'activo',
    fecha: '', hora: null, tipo_mov: null, cantidad: null, responsable: null, destino: null,
    total_items: 1, pct_del_total: 25,
  };

  it('nunca devuelve más de 4 recuadros y muestra el valor', () => {
    const m = obtenerMetricasFichaInventario(fila, ['valor', 'stock', 'pct_total']);
    expect(m.length).toBeLessThanOrEqual(4);
    expect(m.some((x) => x.clave === 'valor')).toBe(true);
    expect(m.some((x) => x.clave === 'stock')).toBe(true);
  });

  it('resalta en rojo la existencia bajo mínimo', () => {
    const m = obtenerMetricasFichaInventario(fila, ['stock']);
    const stock = m.find((x) => x.clave === 'stock')!;
    expect(stock.colorHex).toBe('#ef4444');
  });

  it('siempre devuelve al menos un recuadro de respaldo', () => {
    const m = obtenerMetricasFichaInventario(fila, []);
    expect(m.length).toBeGreaterThanOrEqual(1);
  });
});
