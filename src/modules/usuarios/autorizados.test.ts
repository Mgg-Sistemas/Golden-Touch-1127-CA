import { afterEach, describe, expect, it } from 'vitest';
import { puedeAprobarOc, puedeAprobarSalidas, puedeCancelarOc } from '@/modules/pedidos/aprobadoresOc';
import { autorizadoPara, resumenAutorizacion, setAutorizados, type UsuarioAutorizado } from './autorizados';

const fila = (email: string, oc: boolean, sal: boolean): UsuarioAutorizado => ({
  email, aprobar_oc: oc, aprobar_salidas: sal, firma: null, firma_w: null, firma_h: null,
});

describe('Usuarios autorizados · quién aprueba OC y salidas', () => {
  afterEach(() => setAutorizados(null));

  it('con la lista cargada, solo aprueba OC quien tiene la opción', () => {
    setAutorizados([fila('ana@gt.com', true, false), fila('luis@gt.com', false, true)]);
    expect(puedeAprobarOc('compras', 'ANA@gt.com ')).toBe(true);
    expect(puedeAprobarOc('compras', 'luis@gt.com')).toBe(false);
    expect(puedeAprobarOc('jefa_de_administracion', 'otra@gt.com')).toBe(false);
  });

  it('el admin que NO está en la lista no aprueba (29/10/2026)', () => {
    setAutorizados([fila('ana@gt.com', true, true), fila('jefe@gt.com', true, true)]);
    expect(puedeAprobarOc('admin', 'admin@gmail.com')).toBe(false);
    expect(puedeAprobarOc('admin', null)).toBe(false);
    expect(puedeAprobarSalidas('admin', 'admin@gmail.com')).toBe(false);
    expect(puedeAprobarOc('admin', 'jefe@gt.com')).toBe(true);
    expect(puedeAprobarSalidas('admin', 'jefe@gt.com')).toBe(true);
  });

  it('salidas: solo autorizados con «Aprobar órdenes de salida»', () => {
    setAutorizados([fila('ana@gt.com', true, false), fila('luis@gt.com', false, true), fila('eva@gt.com', true, true)]);
    expect(puedeAprobarSalidas('analista_de_almacen', 'luis@gt.com')).toBe(true);
    expect(puedeAprobarSalidas('jefe_de_almacen', 'ana@gt.com')).toBe(false);
    expect(puedeAprobarSalidas('obrero', 'eva@gt.com')).toBe(true);
  });

  it('cancelar una OC firmada sigue la misma lista', () => {
    setAutorizados([fila('ana@gt.com', true, false)]);
    expect(puedeCancelarOc('oc_aprobada', 'compras', 'ana@gt.com')).toBe(true);
    expect(puedeCancelarOc('oc_aprobada', 'compras', 'luis@gt.com')).toBe(false);
    expect(puedeCancelarOc('oc_aprobada', 'admin', 'admin@gmail.com')).toBe(false);
  });

  it('sin lista cargada nadie aprueba (ni el admin)', () => {
    expect(autorizadoPara('ana@gt.com', 'oc')).toBeNull();
    expect(puedeAprobarOc('jefa_de_administracion', 'x@y.com')).toBe(false);
    expect(puedeAprobarOc('admin', 'x@y.com')).toBe(false);
    expect(puedeAprobarSalidas('admin', 'x@y.com')).toBe(false);
  });

  it('resumen de opciones', () => {
    expect(resumenAutorizacion({ aprobar_oc: true, aprobar_salidas: true })).toBe('Aprueba compras y salidas');
    expect(resumenAutorizacion({ aprobar_oc: false, aprobar_salidas: true })).toBe('Aprueba órdenes de salida');
  });
});
