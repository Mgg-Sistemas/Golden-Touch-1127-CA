import { describe, expect, it } from 'vitest';
import { coincideMenu, normalizarMenu } from './menuBuscar';

describe('buscador del menú', () => {
  it('no distingue tildes ni mayúsculas', () => {
    expect(normalizarMenu('  Conciliación  ')).toBe('conciliacion');
    expect(coincideMenu('conciliacion', 'Conciliación', '/app/conciliacion')).toBe(true);
    expect(coincideMenu('TESORE', 'Tesorería', '/app/tesoreria')).toBe(true);
  });

  it('encuentra por otros nombres del módulo', () => {
    expect(coincideMenu('compras', 'Pedidos / Compras', '/app/pedidos')).toBe(true);
    expect(coincideMenu('almacén', 'Depósito Mina', '/app/inventario/deposito-mina')).toBe(true);
    expect(coincideMenu('caja', 'Tesorería', '/app/tesoreria')).toBe(true);
    expect(coincideMenu('nómina', 'RRHH / Nómina', '/app/rrhh')).toBe(true);
  });

  it('todas las palabras tienen que estar; vacío deja todo', () => {
    expect(coincideMenu('deposito mina', 'Depósito Mina', '/app/inventario/deposito-mina')).toBe(true);
    expect(coincideMenu('deposito pinos', 'Depósito Mina', '/app/inventario/deposito-mina')).toBe(false);
    expect(coincideMenu('', 'Ventas', '/app/ventas')).toBe(true);
    expect(coincideMenu('xyz', 'Ventas', '/app/ventas')).toBe(false);
  });
});
