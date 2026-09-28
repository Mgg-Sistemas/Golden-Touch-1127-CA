import { describe, it, expect } from 'vitest';
import {
  FILTROS_VACIOS, detalleCorto, erroresForm, filtrarAsignaciones, filtrosActivos, formDesde, formVacio,
  comprometido, itemVacio, limpiarItem, payloadDe, porCategoria, resumenAsignaciones, totalRenglones, valorTotal,
  type Asignacion, type PersonaMin,
} from './asignacionesReglas';

const personas = new Map<string, PersonaMin>([
  ['p1', { id: 'p1', nombre: 'Ender', apellido: 'Mejía', cedula: 'V-123', cargo: 'Jefe de sector', empresa: 'GT', activo: true }],
  ['p2', { id: 'p2', nombre: 'Froilán', apellido: 'Ortiz', cargo: 'Soldador', empresa: 'MTO', activo: false }],
]);
const base = (p: Partial<Asignacion>): Asignacion => ({
  id: 'x', codigo: 'ASG-2026-0001', personal_id: 'p1', fecha: '2026-09-10', categoria: 'equipo', descripcion: 'Laptop',
  cantidad: 1, valor_unitario: 500, retornable: true, estado: 'asignado', reingresa_inventario: false, created_at: '2026-09-10T10:00:00Z', ...p,
});
const lista: Asignacion[] = [
  base({ id: 'a', descripcion: 'Laptop Dell', serial: 'ABC1' }),
  base({ id: 'b', personal_id: 'p2', categoria: 'dotacion', descripcion: 'Camisa', cantidad: 3, valor_unitario: 10, retornable: false, estado: 'entregado', fecha: '2026-08-01', producto_id: 'prod' }),
  base({ id: 'c', personal_id: 'p2', categoria: 'linea', descripcion: 'Línea Movilnet', numero_linea: '0416-1234567', valor_unitario: 0 }),
  base({ id: 'd', estado: 'devuelto', fecha: '2026-07-01', descripcion: 'Taladro', categoria: 'herramienta' }),
];

describe('filtrarAsignaciones', () => {
  it('sin filtros devuelve todo', () => { expect(filtrarAsignaciones(lista, FILTROS_VACIOS, personas)).toHaveLength(4); });
  it('pendientes = retorna y lo tiene', () => {
    expect(filtrarAsignaciones(lista, { ...FILTROS_VACIOS, estado: 'pendientes' }, personas).map((a) => a.id)).toEqual(['a', 'c']);
  });
  it('rango de fechas, empresa, origen y retorna', () => {
    expect(filtrarAsignaciones(lista, { ...FILTROS_VACIOS, desde: '2026-08-01', hasta: '2026-08-31' }, personas).map((a) => a.id)).toEqual(['b']);
    expect(filtrarAsignaciones(lista, { ...FILTROS_VACIOS, empresa: 'MTO' }, personas).map((a) => a.id)).toEqual(['b', 'c']);
    expect(filtrarAsignaciones(lista, { ...FILTROS_VACIOS, origen: 'inventario' }, personas).map((a) => a.id)).toEqual(['b']);
    expect(filtrarAsignaciones(lista, { ...FILTROS_VACIOS, retorna: 'no' }, personas).map((a) => a.id)).toEqual(['b']);
  });
  it('el texto busca en la persona y en lo asignado, sin tildes', () => {
    expect(filtrarAsignaciones(lista, { ...FILTROS_VACIOS, texto: 'froilan' }, personas).map((a) => a.id)).toEqual(['b', 'c']);
    expect(filtrarAsignaciones(lista, { ...FILTROS_VACIOS, texto: 'abc1' }, personas).map((a) => a.id)).toEqual(['a']);
    expect(filtrarAsignaciones(lista, { ...FILTROS_VACIOS, texto: '0416' }, personas).map((a) => a.id)).toEqual(['c']);
  });
  it('cuenta filtros activos', () => {
    expect(filtrosActivos(FILTROS_VACIOS)).toBe(0);
    expect(filtrosActivos({ ...FILTROS_VACIOS, texto: 'x', desde: '2026-01-01' })).toBe(2);
  });
});

describe('resumen', () => {
  it('totales, pendientes y pendientes de gente inactiva', () => {
    const r = resumenAsignaciones(lista, personas);
    expect(r.total).toBe(4);
    expect(r.valor).toBe(500 + 30 + 0 + 500);
    expect(r.pendientes).toBe(2);
    expect(r.valorPendiente).toBe(500);
    expect(r.trabajadoresConPendientes).toBe(2);
    expect(r.devueltas).toBe(1);
    expect(r.entregadas).toBe(1);
    expect(r.pendientesInactivos).toBe(1);
  });
  it('por categoría solo las que tienen algo', () => {
    expect(porCategoria(lista).map((c) => c.categoria)).toEqual(['dotacion', 'linea', 'equipo', 'herramienta']);
    expect(valorTotal({ cantidad: 3, valor_unitario: 10.005 })).toBe(30.02);
  });
});

describe('formulario', () => {
  it('valida lo obligatorio, el stock y la línea', () => {
    const f = formVacio('2026-09-28');
    expect(erroresForm(f)).toEqual(['Elegí el trabajador.', 'Escribí qué se asigna.']);
    const g = { ...f, personal_id: 'p1', descripcion: 'Botas', desdeInventario: true, producto_id: 'prod', cantidad: '5' };
    expect(erroresForm(g, 3)).toEqual(['No alcanza el stock: hay 3 y se quieren asignar 5.']);
    expect(erroresForm({ ...g, cantidad: '2' }, 3)).toEqual([]);
    expect(erroresForm({ ...g, desdeInventario: false, categoria: 'linea' })).toEqual(['Indicá el número de la línea.']);
  });
  it('arma el payload y vuelve al formulario', () => {
    const f = { ...formVacio('2026-09-28'), personal_id: 'p1', descripcion: ' Laptop ', cantidad: '1', valor_unitario: '450,5', categoria: 'equipo' as const, serial: 'S1', retornable: true };
    const p = payloadDe(f);
    expect(p).toMatchObject({ descripcion: 'Laptop', valor_unitario: 450.5, producto_id: null, serial: 'S1', retornable: true });
    expect(formDesde(base({ serial: 'S1', valor_unitario: 450.5 })).valor_unitario).toBe('450.5');
    expect(detalleCorto(base({ marca_modelo: 'Dell 5420', serial: 'S1' }))).toBe('Dell 5420 · S/N S1');
  });
});

describe('varios artículos', () => {
  const uno = { ...formVacio('2026-09-28'), personal_id: 'p1', categoria: 'equipo' as const, descripcion: 'Laptop', desdeInventario: true, producto_id: 'prod', cantidad: '2', valor_unitario: '500' };
  it('detecta el renglón vacío', () => {
    expect(itemVacio(formVacio('2026-09-28'))).toBe(true);
    expect(itemVacio({ ...formVacio('2026-09-28'), descripcion: 'Botas' })).toBe(false);
    expect(itemVacio({ ...formVacio('2026-09-28'), producto_id: 'prod' })).toBe(false);
  });
  it('suma lo comprometido del mismo producto', () => {
    expect(comprometido([uno, { ...uno, cantidad: '3' }], 'prod')).toBe(5);
    expect(comprometido([uno, { ...uno, producto_id: 'otro' }], 'prod')).toBe(2);
    expect(comprometido([{ ...uno, desdeInventario: false }], 'prod')).toBe(0);
  });
  it('al limpiar conserva trabajador, fecha y categoría', () => {
    const l = limpiarItem(uno);
    expect(l).toMatchObject({ personal_id: 'p1', fecha: '2026-09-28', categoria: 'equipo', descripcion: '', producto_id: '', cantidad: '1' });
  });
  it('suma el total de los renglones', () => {
    expect(totalRenglones([uno, { ...uno, cantidad: '1', valor_unitario: '10,5' }])).toBe(1010.5);
    expect(totalRenglones([{ ...uno, valor_unitario: '' }])).toBe(0);
  });
});
