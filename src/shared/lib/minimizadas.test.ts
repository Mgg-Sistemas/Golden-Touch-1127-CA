import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_MINIMIZADAS, cancelarSalida, confirmarSalida, intentarSalir, intercambiarMinimizada,
  descartarPestana, fijarRestauradorModulo, leerMinimizadas, minimizar, minimizarUltimaAbierta, mismoModulo, moduloActual,
  quitarMinimizada, registrarVentana, restaurarPestana, vaciarMinimizadas,
} from './minimizadas';

const MOD = 'Pedidos / Compras';
const RUTA = '/app/pedidos';
const a = { id: 'a', titulo: 'Orden SP-1' };
const b = { id: 'b', titulo: 'Orden SP-2' };
const c = { id: 'c', titulo: 'Orden SP-3' };
const d = { id: 'd', titulo: 'Orden SP-4' };

afterEach(() => vaciarMinimizadas());

describe('mismoModulo', () => {
  it('la ruta base y lo que cuelga de ella es el mismo módulo', () => {
    expect(mismoModulo(RUTA, '/app/pedidos')).toBe(true);
    expect(mismoModulo(RUTA, '/app/pedidos?detalle=1')).toBe(true);
    expect(mismoModulo(RUTA, '#/app/pedidos/x')).toBe(true);
    expect(mismoModulo(RUTA, '/app/pedidos/')).toBe(true);
  });
  it('otro módulo (incluso con prefijo parecido) no lo es', () => {
    expect(mismoModulo(RUTA, '/app/proveedores')).toBe(false);
    expect(mismoModulo(RUTA, '/app/pedidos-viejos')).toBe(false);
    expect(mismoModulo(RUTA, '/app')).toBe(false);
    expect(mismoModulo('', '/app/pedidos')).toBe(false);
  });
});

describe('minimizar', () => {
  it('admite hasta MAX_MINIMIZADAS y avisa «lleno» a la siguiente', () => {
    expect(MAX_MINIMIZADAS).toBe(3);
    expect(minimizar(MOD, RUTA, a)).toBe('ok');
    expect(minimizar(MOD, RUTA, b)).toBe('ok');
    expect(minimizar(MOD, RUTA, c)).toBe('ok');
    expect(minimizar(MOD, RUTA, d)).toBe('lleno');
    expect(leerMinimizadas().items.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
  it('minimizar la misma dos veces no la duplica ni gasta lugar (y refresca el título)', () => {
    minimizar(MOD, RUTA, a);
    minimizar(MOD, RUTA, b);
    minimizar(MOD, RUTA, c);
    expect(minimizar(MOD, RUTA, { id: 'a', titulo: 'Orden SP-1 · URGENTE' })).toBe('ok');
    expect(leerMinimizadas().items).toHaveLength(3);
    expect(leerMinimizadas().items[0].titulo).toBe('Orden SP-1 · URGENTE');
  });
  it('guarda el módulo y su ruta para el aviso de salida', () => {
    minimizar(MOD, RUTA, a);
    expect(leerMinimizadas().modulo).toBe(MOD);
    expect(leerMinimizadas().ruta).toBe(RUTA);
  });
  it('lo de otro módulo no se mezcla: arranca la barra de nuevo', () => {
    minimizar(MOD, RUTA, a);
    minimizar('Proveedores', '/app/proveedores', b);
    expect(leerMinimizadas().items.map((x) => x.id)).toEqual(['b']);
  });
});

describe('quitar / intercambiar / vaciar', () => {
  it('quitar la última deja el estado vacío (sin módulo)', () => {
    minimizar(MOD, RUTA, a);
    quitarMinimizada('a');
    expect(leerMinimizadas().items).toHaveLength(0);
    expect(leerMinimizadas().ruta).toBe('');
  });
  it('quitar una que no existe no hace nada', () => {
    minimizar(MOD, RUTA, a);
    quitarMinimizada('zzz');
    expect(leerMinimizadas().items).toHaveLength(1);
  });
  it('restaurar con otra abierta: la abierta ocupa el lugar y no se pasa del máximo', () => {
    minimizar(MOD, RUTA, a);
    minimizar(MOD, RUTA, b);
    minimizar(MOD, RUTA, c);
    intercambiarMinimizada('b', d);
    expect(leerMinimizadas().items.map((x) => x.id)).toEqual(['a', 'd', 'c']);
  });
  it('intercambiar con una que ya estaba minimizada no la duplica', () => {
    minimizar(MOD, RUTA, a);
    minimizar(MOD, RUTA, b);
    intercambiarMinimizada('a', b);
    expect(leerMinimizadas().items.map((x) => x.id)).toEqual(['b']);
  });
  it('vaciar limpia todo', () => {
    minimizar(MOD, RUTA, a);
    vaciarMinimizadas();
    expect(leerMinimizadas().items).toHaveLength(0);
  });
});

describe('salir del módulo', () => {
  it('sin pestañas minimizadas se sale sin preguntar', () => {
    expect(intentarSalir('/app/proveedores')).toBe(true);
    expect(leerMinimizadas().salida).toBeNull();
  });
  it('dentro del mismo módulo se navega sin preguntar', () => {
    minimizar(MOD, RUTA, a);
    expect(intentarSalir('/app/pedidos?detalle=9')).toBe(true);
    expect(leerMinimizadas().salida).toBeNull();
  });
  it('a otro módulo con pestañas minimizadas: no deja pasar y queda pendiente', () => {
    minimizar(MOD, RUTA, a);
    expect(intentarSalir('/app/proveedores')).toBe(false);
    expect(leerMinimizadas().salida).toBe('/app/proveedores');
    expect(leerMinimizadas().items).toHaveLength(1);
  });
  it('cancelar se queda en el módulo con sus pestañas', () => {
    minimizar(MOD, RUTA, a);
    intentarSalir('/app/proveedores');
    cancelarSalida();
    expect(leerMinimizadas().salida).toBeNull();
    expect(leerMinimizadas().items).toHaveLength(1);
  });
  it('confirmar devuelve el destino y pierde las pestañas', () => {
    minimizar(MOD, RUTA, a);
    minimizar(MOD, RUTA, b);
    intentarSalir('/app/inventario');
    expect(confirmarSalida()).toBe('/app/inventario');
    expect(leerMinimizadas().items).toHaveLength(0);
    expect(leerMinimizadas().salida).toBeNull();
  });
});

describe('moduloActual (el módulo de la ruta, para minimizar en cualquier módulo)', () => {
  it('lee el módulo de la ruta con o sin #, con subrutas y parámetros', () => {
    expect(moduloActual('#/app/tesoreria')).toEqual({ ruta: '/app/tesoreria', nombre: 'Tesorería' });
    expect(moduloActual('/app/combustible/x?y=1')).toEqual({ ruta: '/app/combustible', nombre: 'Combustible' });
    expect(moduloActual('#/app/maquinaria/ordenes')).toEqual({ ruta: '/app/maquinaria', nombre: 'Control de Maquinaria y Vehículos' });
    expect(moduloActual('#/app/pedidos').nombre).toBe('Pedidos / Compras');
  });
  it('fuera de un módulo conocido no falla', () => {
    expect(moduloActual('#/app')).toEqual({ ruta: '/app', nombre: 'Inicio' });
    expect(moduloActual('#/app/cosa-nueva').ruta).toBe('/app/cosa-nueva');
  });
});

describe('pestañas con su propio restaurar y descartar', () => {
  it('restaurarPestana usa el restaurar de la pestaña; sin él, el restaurador del módulo', () => {
    const propio = vi.fn();
    const delModulo = vi.fn();
    fijarRestauradorModulo(delModulo);
    minimizar(MOD, RUTA, { ...a, restaurar: propio });
    minimizar(MOD, RUTA, b);
    restaurarPestana('a');
    restaurarPestana('b');
    expect(propio).toHaveBeenCalledTimes(1);
    expect(delModulo).toHaveBeenCalledWith('b');
    fijarRestauradorModulo(null);
  });
  it('descartarPestana la quita y avisa a la ventana para que se cierre', () => {
    const cerrar = vi.fn();
    minimizar(MOD, RUTA, { ...a, descartar: cerrar });
    descartarPestana('a');
    expect(cerrar).toHaveBeenCalledTimes(1);
    expect(leerMinimizadas().items).toHaveLength(0);
  });
  it('minimizarUltimaAbierta manda a la barra la última ventana a la vista, no la indicada', () => {
    const m1 = vi.fn(); const m2 = vi.fn(); const m3 = vi.fn();
    const quitar = [registrarVentana('v1', m1), registrarVentana('v2', m2), registrarVentana('v3', m3)];
    minimizarUltimaAbierta('v3');
    expect(m2).toHaveBeenCalledTimes(1);
    expect(m1).not.toHaveBeenCalled();
    expect(m3).not.toHaveBeenCalled();
    quitar.forEach((q) => q());
    minimizarUltimaAbierta('x');   // sin ventanas: no hace nada
  });
});
