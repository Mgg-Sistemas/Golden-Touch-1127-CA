/* ============================================================
   Pestañas minimizadas de los modales: el tope de 3, el intercambio al
   restaurar y el aviso al salir de un módulo con pestañas minimizadas.
   ============================================================ */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_MINIMIZADAS, actualizarVentana, cerrarVentana, claveModulo, descartarSalida, etiquetaModulo,
  leerPestanas, minimizarVentana, montarBarraPestanas, necesitaAvisoSalida, puedeMinimizar,
  quitarVentana, registrarVentana, reiniciarPestanas, restaurarVentana, solicitarSalida,
} from './pestanasModal';

const abrir = (...ids: string[]) => ids.forEach((id) => registrarVentana(id, `Orden ${id}`, () => undefined));
const minimizadas = () => leerPestanas().minimizadas.map((v) => v.id);

beforeEach(() => reiniciarPestanas());

describe('minimizar', () => {
  it('minimiza una ventana y la barra la lista', () => {
    abrir('a');
    expect(minimizarVentana('a')).toBe(true);
    expect(minimizadas()).toEqual(['a']);
  });

  it('solo deja minimizar hasta 3 a la vez', () => {
    abrir('a', 'b', 'c', 'd');
    expect(minimizarVentana('a')).toBe(true);
    expect(minimizarVentana('b')).toBe(true);
    expect(minimizarVentana('c')).toBe(true);
    expect(puedeMinimizar()).toBe(false);
    expect(MAX_MINIMIZADAS).toBe(3);
    // La cuarta no se minimiza: sigue a la vista, no se pierde.
    expect(minimizarVentana('d')).toBe(false);
    expect(minimizadas()).toEqual(['a', 'b', 'c']);
  });

  it('al cerrar una minimizada se libera un lugar', () => {
    abrir('a', 'b', 'c', 'd');
    ['a', 'b', 'c'].forEach(minimizarVentana);
    quitarVentana('b');
    expect(puedeMinimizar()).toBe(true);
    expect(minimizarVentana('d')).toBe(true);
    expect(minimizadas()).toEqual(['a', 'c', 'd']);
  });

  it('una ventana que no existe no se minimiza', () => {
    expect(minimizarVentana('nada')).toBe(false);
  });
});

describe('restaurar', () => {
  it('restaurar una pestaña minimiza la que estaba a la vista (intercambio)', () => {
    abrir('a', 'b');
    minimizarVentana('a');          // a minimizada, b a la vista
    restaurarVentana('a');
    expect(minimizadas()).toEqual(['b']);
    expect(leerPestanas().ventanas.find((v) => v.id === 'a')?.minimizada).toBe(false);
  });

  it('con 3 minimizadas y una a la vista, restaurar no pasa de 3', () => {
    abrir('a', 'b', 'c', 'd');
    ['a', 'b', 'c'].forEach(minimizarVentana);
    restaurarVentana('b');
    expect(minimizadas()).toEqual(['a', 'c', 'd']);
  });
});

describe('título y cierre', () => {
  it('el título se actualiza sin duplicar la ventana', () => {
    abrir('a');
    actualizarVentana('a', 'Orden SP-2026-0187-1', () => undefined);
    registrarVentana('a', 'otro', () => undefined);
    expect(leerPestanas().ventanas).toHaveLength(1);
    expect(leerPestanas().ventanas[0].titulo).toBe('Orden SP-2026-0187-1');
  });

  it('cerrar desde la barra llama al cierre del modal', () => {
    const cierre = vi.fn();
    registrarVentana('a', 'Orden', cierre);
    cerrarVentana('a');
    expect(cierre).toHaveBeenCalledTimes(1);
  });

  it('usa el último onClose que dio el modal (no el del primer dibujo)', () => {
    const viejo = vi.fn(); const nuevo = vi.fn();
    registrarVentana('a', 'Orden', viejo);
    actualizarVentana('a', 'Orden', nuevo);
    cerrarVentana('a');
    expect(viejo).not.toHaveBeenCalled();
    expect(nuevo).toHaveBeenCalledTimes(1);
  });
});

describe('barra', () => {
  it('sin barra montada no se ofrece minimizar; al montarla sí', () => {
    expect(leerPestanas().hayBarra).toBe(false);
    const desmontar = montarBarraPestanas();
    expect(leerPestanas().hayBarra).toBe(true);
    desmontar();
    expect(leerPestanas().hayBarra).toBe(false);
  });
});

describe('salir de un módulo', () => {
  it('claveModulo separa módulos y deja las subrutas dentro del suyo', () => {
    expect(claveModulo('/app/pedidos')).toBe('pedidos');
    expect(claveModulo('/app/pedidos/historico')).toBe('pedidos');
    expect(claveModulo('/app/inventario')).toBe('inventario');
    expect(claveModulo('/app/inventario/deposito-mina')).toBe('deposito-mina');
    expect(claveModulo('/app/inventario/deposito-mina/telefono')).toBe('deposito-mina');
    expect(claveModulo('/app')).toBe('');
  });

  it('etiquetaModulo da el nombre del menú', () => {
    expect(etiquetaModulo('/app/pedidos/historico')).toBe('Pedidos / Compras');
    expect(etiquetaModulo('/app/tesoreria')).toBe('Tesorería');
    expect(etiquetaModulo('/app/inexistente')).toBeNull();
  });

  it('sin pestañas minimizadas no avisa, aunque cambie de módulo', () => {
    abrir('a');                      // a la vista, no minimizada
    expect(necesitaAvisoSalida('/app/pedidos', '/app/tesoreria')).toBe(false);
  });

  it('con pestañas minimizadas avisa solo al cambiar de módulo', () => {
    abrir('a');
    minimizarVentana('a');
    expect(necesitaAvisoSalida('/app/pedidos', '/app/tesoreria')).toBe(true);
    expect(necesitaAvisoSalida('/app/pedidos', '/app/pedidos/historico')).toBe(false);
    expect(necesitaAvisoSalida('/app/pedidos', '/app')).toBe(true);
  });

  it('la salida pendiente se guarda y se descarta', () => {
    solicitarSalida('/app/tesoreria');
    expect(leerPestanas().salidaPendiente).toBe('/app/tesoreria');
    descartarSalida();
    expect(leerPestanas().salidaPendiente).toBeNull();
  });
});
