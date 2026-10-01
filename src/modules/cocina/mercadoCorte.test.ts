import { describe, expect, it } from 'vitest';
import {
  comidasDelCiclo, entradasFechadas, entradasPorViver, esSoloEntradas, marcaCorte,
  motivoCorteValido, totalEntradas, MOTIVO_CORTE_SUGERIDO,
} from './mercadoCorte';
import type { ResumenViver } from './cocinaMercado.repository';

const fila = (id: string, nombre: string, entradas: number, extra: Partial<ResumenViver> = {}): ResumenViver => ({
  producto_id: id, sku: `SKU-${id}`, nombre, unidad: 'UND',
  saldo_inicial: 5, entradas, disponible: 5 + entradas, consumo: 2, mermas: 1, queda: 2 + entradas, ...extra,
});

describe('corte de inventario · de los ciclos anteriores se ven solo las entradas', () => {
  it('esSoloEntradas lee la marca de los totales', () => {
    expect(esSoloEntradas({ totales: { solo_entradas: true } })).toBe(true);
    expect(esSoloEntradas({ totales: { solo_entradas: false } })).toBe(false);
    expect(esSoloEntradas({ totales: {} })).toBe(false);
    expect(esSoloEntradas({ totales: null })).toBe(false);
    expect(esSoloEntradas(null)).toBe(false);
  });

  it('entradasPorViver deja solo los víveres que recibieron algo, por nombre', () => {
    const r = [fila('b', 'Papa', 10), fila('c', 'Sal', 0), fila('a', 'Arroz', 72.006)];
    const out = entradasPorViver(r);
    expect(out.map((x) => x.nombre)).toEqual(['Arroz', 'Papa']);
    expect(out[0]).toEqual({ producto_id: 'a', sku: 'SKU-a', nombre: 'Arroz', unidad: 'UND', entradas: 72.01 });
    expect(totalEntradas(out)).toBe(82.01);
    expect(entradasPorViver(null)).toEqual([]);
  });

  it('entradasFechadas ordena por fecha y pone el nombre del víver', () => {
    const r = [fila('a', 'Arroz', 72), fila('b', 'Papa', 10)];
    const out = entradasFechadas(r, {
      entradas: [
        { producto_id: 'a', fecha: '2026-09-30T13:34:37Z', cantidad: 72, ref: 'SP-2026-0227' },
        { producto_id: 'b', fecha: '2026-09-29T19:11:12Z', cantidad: 10, ref: 'SP-2026-0218' },
        { producto_id: 'x', fecha: '2026-10-01T19:20:21Z', cantidad: 30, ref: ' ' },
        { producto_id: 'a', fecha: '2026-09-20T10:00:00Z', cantidad: 0, ref: null },
      ],
      consumos: [{ producto_id: 'a', fecha: '2026-09-26T10:00:00Z', cantidad: 4 }],
      mermas: [],
    });
    expect(out.map((x) => [x.nombre, x.cantidad, x.ref])).toEqual([
      ['Papa', 10, 'SP-2026-0218'],
      ['Arroz', 72, 'SP-2026-0227'],
      ['(víver)', 30, null],
    ]);
    // Un ciclo sin foto congelada no tiene detalle fechado: queda el total por víver.
    expect(entradasFechadas(r, null)).toEqual([]);
  });

  it('marcaCorte arma la marca y limpia los textos', () => {
    expect(marcaCorte({ at: '2026-10-01T20:30:00.000Z', motivo: `  ${MOTIVO_CORTE_SUGERIDO}  `, por: 'a@b.com', porNombre: ' ANA ' })).toEqual({
      solo_entradas: true, corte_at: '2026-10-01T20:30:00.000Z', corte_motivo: MOTIVO_CORTE_SUGERIDO,
      corte_por: 'a@b.com', corte_por_nombre: 'ANA',
    });
    expect(marcaCorte({ at: 'x', motivo: 'm' }).corte_por).toBeNull();
  });

  it('el motivo tiene que explicar algo', () => {
    expect(motivoCorteValido(MOTIVO_CORTE_SUGERIDO)).toBe(true);
    expect(motivoCorteValido('   ok   ')).toBe(false);
    expect(motivoCorteValido(null)).toBe(false);
  });
});

describe('comidasDelCiclo · al entrar se ven las comidas del mercado en curso', () => {
  const inicio = '2026-10-01T20:30:00.000Z';
  const comidas = [
    { id: 'vieja', at: '2026-09-26T16:00:00Z', created_at: '2026-09-26T18:00:00Z' },
    { id: 'nueva', at: '2026-10-02T16:00:00Z', created_at: '2026-10-02T18:00:00Z' },
    // Servida antes del corte pero cargada después: descontó stock en este mercado.
    { id: 'atrasada', at: '2026-09-30T16:00:00Z', created_at: '2026-10-02T12:00:00Z' },
    { id: 'sinCarga', at: '2026-09-20T16:00:00Z', created_at: null },
  ];
  it('deja las servidas o cargadas desde el inicio', () => {
    expect(comidasDelCiclo(comidas, inicio).map((c) => c.id)).toEqual(['nueva', 'atrasada']);
  });
  it('sin mercado abierto no filtra', () => {
    expect(comidasDelCiclo(comidas, null)).toHaveLength(4);
    expect(comidasDelCiclo(comidas, 'no es fecha')).toHaveLength(4);
  });
});
