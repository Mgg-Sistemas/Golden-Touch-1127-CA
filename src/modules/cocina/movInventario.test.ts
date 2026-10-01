import { describe, it, expect } from 'vitest';
import { buscarInventario, filasInventario, rotuloOrigen, totalesInventario, type FilaKardex } from './movInventario';

const viveres = [
  { id: 'a', nombre: 'Arroz', unidad: 'KG' },
  { id: 'b', nombre: 'Pollo', unidad: 'KG' },
];

function k(p: Partial<FilaKardex> & { producto_id: string; delta: number; at: string }): FilaKardex {
  return { tipo: p.delta > 0 ? 'entrada' : 'salida', ...p };
}

describe('filasInventario', () => {
  it('deja fuera lo que no es víver, las comidas y los movimientos en cero', () => {
    const filas = filasInventario([
      k({ producto_id: 'a', delta: 10, at: '2026-09-20T10:00:00Z' }),
      k({ producto_id: 'z', delta: 5, at: '2026-09-20T11:00:00Z' }),            // no es víver
      k({ producto_id: 'b', delta: -3, at: '2026-09-21T10:00:00Z', ref_tipo: 'cocina' }), // comida
      k({ producto_id: 'b', delta: 0, at: '2026-09-21T11:00:00Z' }),            // en cero
    ], viveres);
    expect(filas.map((f) => f.producto_id)).toEqual(['a']);
  });

  it('sale de lo más nuevo a lo más viejo', () => {
    const filas = filasInventario([
      k({ producto_id: 'a', delta: 1, at: '2026-09-20T10:00:00Z' }),
      k({ producto_id: 'b', delta: 2, at: '2026-09-25T10:00:00Z' }),
      k({ producto_id: 'a', delta: 3, at: '2026-09-22T10:00:00Z' }),
    ], viveres);
    expect(filas.map((f) => f.delta)).toEqual([2, 3, 1]);
  });

  it('trae el nombre del víver, el comprobante, el motivo y el responsable', () => {
    const [f] = filasInventario([k({
      producto_id: 'b', delta: -4.567, at: '2026-09-22T10:00:00Z', tipo: 'salida',
      ref_tipo: 'salida_modulo', ref_codigo: ' SAL-2026-0007 ', detalle: '  Se dañó  ',
      actor_name: 'Ana', actor: 'ana@x.com',
    })], viveres);
    expect(f).toMatchObject({
      nombre: 'Pollo', unidad: 'KG', delta: -4.57, origen: 'salida_modulo',
      comprobante: 'SAL-2026-0007', detalle: 'Se dañó', responsable: 'Ana',
    });
  });

  it('sin nombre de quien lo hizo, queda el correo; sin nada, null', () => {
    const [con, sin] = filasInventario([
      k({ producto_id: 'a', delta: 1, at: '2026-09-25T10:00:00Z', actor: 'ana@x.com' }),
      k({ producto_id: 'a', delta: 1, at: '2026-09-24T10:00:00Z' }),
    ], viveres);
    expect(con.responsable).toBe('ana@x.com');
    expect(sin.responsable).toBeNull();
  });
});

describe('totalesInventario', () => {
  it('separa lo que entró de lo que salió, y esos son los números del panel', () => {
    const filas = filasInventario([
      k({ producto_id: 'a', delta: 112, at: '2026-09-20T10:00:00Z', ref_tipo: 'orden' }),
      k({ producto_id: 'a', delta: 25, at: '2026-09-21T10:00:00Z', ref_tipo: 'compra_directa' }),
      k({ producto_id: 'b', delta: 17, at: '2026-09-22T10:00:00Z', ref_tipo: 'manual' }),
      k({ producto_id: 'b', delta: -88.4, at: '2026-09-23T10:00:00Z', ref_tipo: 'salida_modulo' }),
      k({ producto_id: 'b', delta: -25, at: '2026-09-24T10:00:00Z', ref_tipo: 'manual' }),
    ], viveres);
    expect(totalesInventario(filas)).toEqual({ entradas: 154, salidas: 113.4, filas: 5 });
  });

  it('sin filas, todo en cero', () => {
    expect(totalesInventario([])).toEqual({ entradas: 0, salidas: 0, filas: 0 });
  });
});

describe('rotuloOrigen', () => {
  it('dice de dónde viene en palabras', () => {
    expect(rotuloOrigen('orden', 'entrada')).toBe('Orden de compra');
    expect(rotuloOrigen('salida_modulo', 'salida')).toBe('Salida de material');
    expect(rotuloOrigen('compra_directa', 'entrada')).toBe('Compra directa');
  });

  it('un origen desconocido sale legible, sin guiones bajos', () => {
    expect(rotuloOrigen('algo_nuevo', 'entrada')).toBe('algo nuevo');
  });

  it('sin origen, manda el tipo del kardex', () => {
    expect(rotuloOrigen(null, 'salida')).toBe('Ajuste manual');
    expect(rotuloOrigen('', 'entrada')).toBe('Entrada suelta');
  });
});

describe('buscarInventario', () => {
  const filas = filasInventario([
    k({ producto_id: 'a', delta: 10, at: '2026-09-20T10:00:00Z', ref_tipo: 'orden', ref_codigo: 'OC-2026-0033' }),
    k({ producto_id: 'b', delta: -5, at: '2026-09-21T10:00:00Z', detalle: 'Se dañó en la nevera', actor_name: 'Ana' }),
  ], viveres);

  it('busca por víver, comprobante, motivo, responsable u origen, sin acentos', () => {
    expect(buscarInventario(filas, 'arroz').map((f) => f.producto_id)).toEqual(['a']);
    expect(buscarInventario(filas, 'OC-2026').map((f) => f.producto_id)).toEqual(['a']);
    expect(buscarInventario(filas, 'dano').map((f) => f.producto_id)).toEqual(['b']);
    expect(buscarInventario(filas, 'ana').map((f) => f.producto_id)).toEqual(['b']);
    expect(buscarInventario(filas, 'orden de compra').map((f) => f.producto_id)).toEqual(['a']);
  });

  it('sin texto, salen todas', () => {
    expect(buscarInventario(filas, '  ')).toHaveLength(2);
  });
});
