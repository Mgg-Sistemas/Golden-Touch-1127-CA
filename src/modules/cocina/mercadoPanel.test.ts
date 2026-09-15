import { describe, it, expect } from 'vitest';
import type { ResumenViver } from './cocinaMercado.repository';
import {
  costoDelCiclo, diferenciasPorViver, ecuacionDelCiclo, explicarDiferencia, filasDisponible, leerVista,
  separarMovidos, sumarMermas, vistaGuardada,
} from './mercadoPanel';

function fila(id: string, v: { saldo?: number; ent?: number; cons?: number; mer?: number; queda?: number } = {}): ResumenViver {
  const saldo = v.saldo ?? 0;
  const ent = v.ent ?? 0;
  const cons = v.cons ?? 0;
  const mer = v.mer ?? 0;
  return {
    producto_id: id, sku: id.toUpperCase(), nombre: `VIVER ${id}`, unidad: 'KG',
    saldo_inicial: saldo, entradas: ent, disponible: saldo + ent, consumo: cons, mermas: mer,
    // Por defecto cuadra: en el inventario hay lo que da la cuenta.
    queda: v.queda ?? saldo + ent - cons - mer,
  };
}
const ids = (rs: ResumenViver[]) => rs.map((r) => r.producto_id);

describe('leerVista', () => {
  it('sin nada guardado arranca en «Disponible», como MGG', () => {
    expect(leerVista(null)).toBe('disponible');
    expect(leerVista(undefined)).toBe('disponible');
  });

  it('respeta lo guardado', () => {
    expect(leerVista('movimientos')).toBe('movimientos');
    expect(leerVista('ambos')).toBe('ambos');
    expect(leerVista('disponible')).toBe('disponible');
  });

  it('un valor ajeno no rompe la pantalla', () => {
    expect(leerVista('kanban')).toBe('disponible');
  });

  it('sin almacenamiento del navegador, cae en «Disponible»', () => {
    expect(vistaGuardada()).toBe('disponible');
  });
});

describe('separarMovidos', () => {
  it('se movió si entró o se consumió algo; si solo arrastra saldo, está quieto', () => {
    const { movidos, quietos } = separarMovidos([fila('a', { saldo: 5, cons: 1 }), fila('b', { ent: 2 }), fila('c', { saldo: 3 })]);
    expect(ids(movidos)).toEqual(['a', 'b']);
    expect(ids(quietos)).toEqual(['c']);
  });

  it('una merma también es movimiento: la pérdida tiene que verse en la tabla', () => {
    expect(ids(separarMovidos([fila('a', { saldo: 5, mer: 2 })]).movidos)).toEqual(['a']);
  });
});

describe('diferenciasPorViver', () => {
  it('si la cuenta da lo que hay, no hay diferencia', () => {
    expect(diferenciasPorViver([fila('a', { saldo: 10, ent: 5, cons: 3 })])).toEqual([]);
  });

  it('falta: en el inventario hay menos de lo que da la cuenta', () => {
    expect(diferenciasPorViver([fila('a', { saldo: 10, ent: 5, cons: 3, queda: 9 })]))
      .toEqual([{ producto_id: 'a', cuenta: 12, inventario: 9, diferencia: -3 }]);
  });

  it('sobra: en el inventario hay más', () => {
    expect(diferenciasPorViver([fila('a', { saldo: 10, queda: 12 })])[0].diferencia).toBe(2);
  });

  it('menos de un centésimo es redondeo', () => {
    expect(diferenciasPorViver([fila('a', { saldo: 10, queda: 10.004 })])).toEqual([]);
  });

  it('una merma registrada no es diferencia: los 25 pollos perdidos del MK-2026-0002', () => {
    // 1,5 al iniciar + 25 comprados − 25 perdidos (salida manual) = 1,5 en el inventario.
    expect(diferenciasPorViver([fila('pollo', { saldo: 1.5, ent: 25, mer: 25, queda: 1.5 })])).toEqual([]);
  });

  it('un mercado cerrado antes de las mermas (sin el campo) cuenta como antes', () => {
    const viejo = fila('a', { saldo: 10, cons: 3, queda: 7 });
    delete viejo.mermas;
    expect(diferenciasPorViver([viejo])).toEqual([]);
  });

  it('lo más descuadrado primero, sin importar el signo', () => {
    const difs = diferenciasPorViver([fila('a', { saldo: 10, queda: 9 }), fila('b', { saldo: 10, queda: 15 })]);
    expect(difs.map((d) => d.producto_id)).toEqual(['b', 'a']);
  });
});

describe('ecuacionDelCiclo', () => {
  it('suma los cinco números y compara la cuenta con el inventario', () => {
    const ec = ecuacionDelCiclo([fila('a', { saldo: 10, ent: 5, cons: 3, queda: 9 }), fila('b', { saldo: 4, cons: 1 })]);
    expect(ec).toEqual({
      saldoInicial: 14, entradas: 5, disponible: 19, consumo: 4, mermas: 0, queda: 12, cuenta: 15, diferencia: -3, viveresConDiferencia: 1,
    });
  });

  it('las mermas restan en la cuenta del ciclo', () => {
    const ec = ecuacionDelCiclo([fila('pollo', { saldo: 1.5, ent: 25, mer: 25 }), fila('b', { saldo: 4, cons: 1 })]);
    expect(ec).toMatchObject({ disponible: 30.5, consumo: 1, mermas: 25, queda: 4.5, cuenta: 4.5, diferencia: 0, viveresConDiferencia: 0 });
  });

  it('sin víveres, todo en cero', () => {
    expect(ecuacionDelCiclo([]).viveresConDiferencia).toBe(0);
  });
});

describe('costoDelCiclo', () => {
  it('costo por plato = consumo / platos', () => {
    expect(costoDelCiclo(40, 500)).toEqual({ platos: 40, consumo: 500, porPlato: 12.5 });
  });

  it('sin platos servidos no hay costo por plato: un cero sería un dato falso', () => {
    expect(costoDelCiclo(0, 100).porPlato).toBeNull();
  });

  it('un mercado sin platos guardados no dice cero platos', () => {
    expect(costoDelCiclo(null, 100)).toEqual({ platos: null, consumo: 100, porPlato: null });
    expect(costoDelCiclo(undefined, 100).platos).toBeNull();
  });

  it('tolera negativos', () => {
    expect(costoDelCiclo(-3, -10)).toEqual({ platos: 0, consumo: 0, porPlato: null });
  });
});

describe('filasDisponible', () => {
  const items = [
    fila('q1', { saldo: 3 }),              // quieto, cuadra
    fila('m', { saldo: 2, cons: 1 }),      // se movió, cuadra
    fila('q2', { saldo: 5, queda: 4 }),    // quieto, NO cuadra
    fila('md', { ent: 2, queda: 0 }),      // se movió, NO cuadra
  ];

  it('primero los que se movieron, después los quietos que no cuadran; los demás, ocultos', () => {
    const r = filasDisponible(items, { verQuietos: false, soloDif: false });
    expect(ids(r.filas)).toEqual(['m', 'md', 'q2']);
    // El botón cuenta solo los quietos que cuadran: q2 ya está a la vista.
    expect(r.quietosOcultables).toBe(1);
  });

  it('«ver los que no se movieron» los agrega al final', () => {
    expect(ids(filasDisponible(items, { verQuietos: true, soloDif: false }).filas)).toEqual(['m', 'md', 'q2', 'q1']);
  });

  it('«solo los que no cuadran» deja esos y nada más, aunque se hayan pedido los quietos', () => {
    expect(ids(filasDisponible(items, { verQuietos: false, soloDif: true }).filas)).toEqual(['md', 'q2']);
    expect(ids(filasDisponible(items, { verQuietos: true, soloDif: true }).filas)).toEqual(['md', 'q2']);
  });

  it('devuelve las diferencias por víver para marcar las filas', () => {
    expect([...filasDisponible(items, { verQuietos: false, soloDif: false }).difPorProducto.keys()].sort()).toEqual(['md', 'q2']);
  });
});

describe('explicarDiferencia', () => {
  it('un faltante ya no culpa a las salidas manuales: esas ahora son mermas', () => {
    expect(explicarDiferencia(-3)).not.toContain('salida manual');
    expect(explicarDiferencia(-3)).toContain('fecha anterior');
  });

  it('un sobrante apunta a lo que entró sin ser entrada', () => {
    expect(explicarDiferencia(2)).toContain('ajuste');
  });
});

describe('sumarMermas', () => {
  const viveres = new Set(['pollo', 'arroz']);

  it('suma lo que bajó el inventario sin ser comida, en positivo', () => {
    const m = sumarMermas([
      { producto_id: 'pollo', delta: -25, ref_tipo: null },          // salida manual: se perdieron
      { producto_id: 'pollo', delta: '-1.5', ref_tipo: 'ajuste' },    // conteo real a la baja
    ], viveres);
    expect(m.get('pollo')).toBe(26.5);
  });

  it('las comidas (y sus reversos) no son merma: ya las cuenta el consumo', () => {
    expect(sumarMermas([{ producto_id: 'arroz', delta: -3, ref_tipo: 'cocina' }], viveres).size).toBe(0);
  });

  it('solo lo que baja y solo los víveres del ciclo', () => {
    const m = sumarMermas([
      { producto_id: 'arroz', delta: 4, ref_tipo: null },     // un ajuste hacia arriba no es merma
      { producto_id: 'filtro', delta: -2, ref_tipo: null },   // no es víver
    ], viveres);
    expect(m.size).toBe(0);
  });
});
