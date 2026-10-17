import { describe, expect, it } from 'vitest';
import type { Orden } from '@/shared/lib/types';
import { coincideOrden, grafiasMonto, personasQueRealizaron, realizadaPor } from './buscarOrdenes';

const personas = new Map([['kelvin@gt.com', 'KELVIN PEÑA'], ['ana@gt.com', 'ANA LÓPEZ']]);
const proveedores = new Map([['p1', { razon_social: 'FERRETERÍA EL ÑANDÚ C.A.', rif: 'J-12345678-9', contacto: 'Pedro', categorias: ['FERRETERÍA'] }]]);
const categorias = new Map([['SKU-1', 'LUBRICANTES']]);

const oc = {
  id: 'o1', codigo: 'OP-0001', oc_codigo: 'OC-0001', tipo: 'producto', proveedor_id: 'p1',
  solicitante_email: 'ana@gt.com', solicitante: 'ANA LÓPEZ', unidad_solicitante: 'MINA',
  items: [{ sku: 'SKU-1', nombre: 'Aceite 15W40', cantidad: 2, precio: 750.25, marca: 'PDV', equipo_nombre: 'Retroexcavadora CAT' }],
  total: 1500.5, total_moneda: 'USD', estado: 'oc_creada', notas: 'para el motor', historial: [],
  oc_creada_por: 'Kelvin@gt.com', oc_creada_en: '2026-10-15T14:00:00Z', created_at: '2026-10-14T12:00:00Z',
  condiciones_pago: 'credito_15_dias', metodo_pago: [{ metodo: 'pago_movil', moneda: 'Bs', monto: 300000 }],
  numero_administracion: '04141234567',
} as unknown as Orden;

const op = {
  id: 'o2', codigo: 'OP-0002', proveedor_id: null, solicitante_email: 'x@gt.com', items: [], total: 0,
  estado: 'aprobada', historial: [], aprobada_por: 'ana@gt.com', created_at: '2026-10-10T12:00:00Z',
} as unknown as Orden;

const ctx = { personas, proveedores, categorias };

describe('buscar órdenes por cualquier característica', () => {
  it('código, proveedor (nombre y RIF), solicitante, unidad, notas', () => {
    for (const q of ['oc-0001', 'nandu', 'j-12345678', 'ana lopez', 'mina', 'motor', 'ferreteria']) expect(coincideOrden(oc, q, ctx), q).toBe(true);
  });
  it('quién la hizo, estado, tipo, método y condiciones de pago, número de administración', () => {
    for (const q of ['kelvin', 'peña', 'OC creada', 'compra', 'pago movil', 'credito 15', '04141234567']) expect(coincideOrden(oc, q, ctx), q).toBe(true);
  });
  it('montos en varias grafías y fechas en los dos formatos', () => {
    for (const q of ['1500', '1500,50', '1.500,50', '1,500.50', '750.25', '15-10-2026', '2026-10-15', '14/10/2026']) expect(coincideOrden(oc, q, ctx), q).toBe(true);
  });
  it('productos: nombre, marca, equipo y categoría del catálogo', () => {
    for (const q of ['aceite', '15w40', 'pdv', 'retroexcavadora', 'lubricantes']) expect(coincideOrden(oc, q, ctx), q).toBe(true);
  });
  it('varias palabras: todas tienen que aparecer; lo que no está no coincide', () => {
    expect(coincideOrden(oc, 'kelvin aceite', ctx)).toBe(true);
    expect(coincideOrden(oc, 'kelvin tornillo', ctx)).toBe(false);
    expect(coincideOrden(oc, 'zzz', ctx)).toBe(false);
    expect(coincideOrden(oc, '   ', ctx)).toBe(true);
  });
});

describe('realizadas por', () => {
  it('la OC la hizo quien eligió la oferta; la OP sin OC, quien la aprobó', () => {
    expect(realizadaPor(oc)).toBe('kelvin@gt.com');
    expect(realizadaPor(op)).toBe('ana@gt.com');
    expect(realizadaPor({ ...op, aprobada_por: null } as Orden)).toBeNull();
  });
  it('cae al historial si no hay columna', () => {
    const o = { ...oc, oc_creada_por: null, oc_emitida_por: null, historial: [{ at: '', evento: 'oc_creada_reparto', actor: 'Ana@gt.com' }] } as unknown as Orden;
    expect(realizadaPor(o)).toBe('ana@gt.com');
  });
  it('lista de personas con nombre, ordenada', () => {
    expect(personasQueRealizaron([oc, op, oc], personas)).toEqual([
      { email: 'ana@gt.com', nombre: 'ANA LÓPEZ' }, { email: 'kelvin@gt.com', nombre: 'KELVIN PEÑA' },
    ]);
  });
});

describe('grafías de monto', () => {
  it('cubre punto, coma y miles', () => {
    expect(grafiasMonto(1500.5)).toEqual(expect.arrayContaining(['1500.5', '1500.50', '1500,50', '1.500,50', '1,500.50', '1.500', '1500']));
    expect(grafiasMonto(null)).toEqual([]);
  });
});
