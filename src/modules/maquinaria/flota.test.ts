import { describe, it, expect } from 'vitest';
import {
  estadoEfectivo, statusDeEstado, estadoExigeMotivo, claseEquipo, restantesServicio, avisoServicio,
  avisoMasUrgente, decidirRepuesto, efectoOrden, columnaCompra, compraAbierta, accionesEquipo,
  siguientesEstadosOrden, sugerirServicio, coincideEquipo, ESTADOS_EQUIPO, faltaSalida, faltaCompra, validarLectura, etiquetaOrigenLectura,
  repuestosEditables, puedeBorrarOrden, listarApartados, guardarApartadoCustom, eliminarApartadoCustom, iconoDeClase,
  aliasesDeEquipo, nombreCortoEquipo,
} from './flota';

describe('estadoEfectivo (equipos de antes y de ahora)', () => {
  it('sin estado operativo se deduce del status de siempre', () => {
    expect(estadoEfectivo({ status: 'ACTIVO', activo: true })).toBe('operativa');
    expect(estadoEfectivo({ status: 'MANTENIMIENTO', activo: true })).toBe('taller');
    expect(estadoEfectivo({ status: 'FUERA DE SERVICIO', activo: true })).toBe('averiada');
    expect(estadoEfectivo({ status: 'INACTIVO', activo: true })).toBe('retirada');
    expect(estadoEfectivo({ status: 'OTRO VALOR', activo: true })).toBe('operativa');
    // 27/10/2026: el estatus «POR CONFIRMAR» del Excel no es operativa.
    expect(estadoEfectivo({ status: 'POR CONFIRMAR', activo: true })).toBe('por_confirmar');
    expect(estadoEfectivo({ status: 'por confirmar', activo: true })).toBe('por_confirmar');
    expect(statusDeEstado('por_confirmar')).toBe('POR CONFIRMAR');
  });
  it('inactivo siempre es retirada, aunque tenga estado', () => {
    expect(estadoEfectivo({ estado_operativo: 'taller', status: 'ACTIVO', activo: false })).toBe('retirada');
  });
  it('el estado operativo manda cuando existe', () => {
    expect(estadoEfectivo({ estado_operativo: 'repuestos', status: 'MANTENIMIENTO', activo: true })).toBe('repuestos');
    expect(estadoEfectivo({ estado_operativo: 'espera', status: 'ACTIVO', activo: true })).toBe('espera');
  });
  it('un valor desconocido cae al status', () => {
    expect(estadoEfectivo({ estado_operativo: 'xx', status: 'MANTENIMIENTO' })).toBe('taller');
  });
  it('ida y vuelta con el status clásico', () => {
    for (const e of Object.keys(ESTADOS_EQUIPO) as (keyof typeof ESTADOS_EQUIPO)[]) {
      const back = estadoEfectivo({ status: statusDeEstado(e), activo: e !== 'retirada' });
      expect(ESTADOS_EQUIPO[back].bucket === ESTADOS_EQUIPO[e].bucket || e === 'espera').toBe(true);
    }
  });
  it('motivo obligatorio solo al parar, esperar o retirar', () => {
    expect(estadoExigeMotivo('averiada')).toBe(true);
    expect(estadoExigeMotivo('retirada')).toBe(true);
    expect(estadoExigeMotivo('operativa')).toBe(false);
    expect(estadoExigeMotivo('taller')).toBe(false);
  });
});

describe('claseEquipo', () => {
  it('unifica maquinaria y equipos en maquinaria', () => {
    expect(claseEquipo({ grupo_mantenimiento: 'PLANTAS ELÉCTRICAS' })).toBe('maquinaria');
    expect(claseEquipo({ tipo: 'Planta eléctrica' })).toBe('maquinaria');
    expect(claseEquipo({ tipo: 'Generador' })).toBe('maquinaria');
    expect(claseEquipo({ tipo: 'Bomba de agua' })).toBe('maquinaria');
    expect(claseEquipo({ tipo: 'EXCAVADORA' })).toBe('maquinaria');
    expect(claseEquipo({ tipo: 'Motoniveladora' })).toBe('maquinaria');
    expect(claseEquipo({ tipo: 'Motobomba' })).toBe('maquinaria');
  });

  it('clasifica vehículos correctamente', () => {
    expect(claseEquipo({ grupo_mantenimiento: 'VEHÍCULOS DE CARGA' })).toBe('vehiculo');
    expect(claseEquipo({ tipo: 'Camión volteo' })).toBe('vehiculo');
    expect(claseEquipo({ tipo: 'Camioneta Hilux' })).toBe('vehiculo');
  });

  it('clasifica motos y lanchas en sus propias clases', () => {
    expect(claseEquipo({ tipo: 'Moto DT 175' })).toBe('moto');
    expect(claseEquipo({ tipo: 'Motocicleta Honda' })).toBe('moto');
    expect(claseEquipo({ tipo: 'Cuatrimoto' })).toBe('moto');
    expect(claseEquipo({ tipo: 'Lancha rápida' })).toBe('lancha');
    expect(claseEquipo({ tipo: 'Bote peñero' })).toBe('lancha');
    expect(claseEquipo({ tipo: 'Embarcación' })).toBe('lancha');
  });

  it('clasifica herramientas y equipos menores correctamente', () => {
    expect(claseEquipo({ tipo: 'Taladro percutor' })).toBe('herramienta');
    expect(claseEquipo({ tipo: 'Esmeril angular' })).toBe('herramienta');
    expect(claseEquipo({ tipo: 'Soldadora eléctrica' })).toBe('herramienta');
    expect(claseEquipo({ tipo: 'Herramienta de taller' })).toBe('herramienta');
    expect(claseEquipo({ grupo_mantenimiento: 'HERRAMIENTAS' })).toBe('herramienta');
  });
});

describe('claseEquipo por tipo exacto (reglas del 27/10/2026, flota del Excel)', () => {
  it('la categoría guardada en la ficha (clase) manda sobre el tipo', () => {
    expect(claseEquipo({ tipo: 'SUV', clase: 'maquinaria' })).toBe('maquinaria');
    expect(claseEquipo({ tipo: 'EXCAVADORA', clase: 'vehiculo' })).toBe('vehiculo');
    expect(claseEquipo({ tipo: 'MOTO', clase: 'lancha' })).toBe('lancha');
  });
  it('una clase guardada que no es un apartado se ignora y se deduce del tipo', () => {
    expect(claseEquipo({ tipo: 'SUV', clase: 'lo-que-sea' })).toBe('vehiculo');
    expect(claseEquipo({ tipo: 'SUV', clase: '' })).toBe('vehiculo');
    expect(claseEquipo({ tipo: 'SUV', clase: null })).toBe('vehiculo');
  });
  it('SUV es vehículo', () => {
    expect(claseEquipo({ equipo: 'CAMIONETA TOYOTA FORTUNER AB123CD', tipo: 'SUV', placa: 'AB123CD' })).toBe('vehiculo');
  });
  it('SEDÁN es vehículo', () => {
    expect(claseEquipo({ equipo: 'TOYOTA COROLLA', tipo: 'SEDÁN' })).toBe('vehiculo');
  });
  it('CAMIÓN CAVA es vehículo (y los demás tipos de carro / camión)', () => {
    expect(claseEquipo({ tipo: 'CAMIÓN CAVA' })).toBe('vehiculo');
    for (const tipo of ['VEHÍCULO', 'CAMIONETA', 'PICK-UP D/C', 'AUTOMÓVIL', 'RÚSTICO', 'TECHO DURO', 'CAMIÓN', 'CHASIS', 'CHUTO', 'AUTOBÚS', 'GANDOLA']) {
      expect(claseEquipo({ tipo }), tipo).toBe('vehiculo');
    }
  });
  it('REMOLQUE con placa es vehículo (de carretera)', () => {
    expect(claseEquipo({ equipo: 'REMOLQUE D INNOCENZO DM10 A97BE9P', tipo: 'REMOLQUE', placa: 'A97BE9P', marca: 'D INNOCENZO' })).toBe('vehiculo');
    expect(claseEquipo({ equipo: 'REMOLQUE REMYVECA 3SPL A09BH5F', tipo: 'REMOLQUE', placa: 'A09BH5F', marca: 'REMYVECA' })).toBe('vehiculo');
  });
  it('REMOLQUE REMEQ sin placa es lancha (náutico)', () => {
    expect(claseEquipo({ equipo: 'REMOLQUE REMEQ 2160221', tipo: 'REMOLQUE', placa: null, marca: 'REMEQ', notas: 'tipo TRAYLER · sin placa' })).toBe('lancha');
    expect(claseEquipo({ equipo: 'REMOLQUE X', tipo: 'REMOLQUE', placa: 'N/A' })).toBe('lancha');
  });
  it('MOTO ACUÁTICA es moto', () => {
    expect(claseEquipo({ equipo: 'MOTO ACUÁTICA SEA-DOO GTX LIMITED 325', tipo: 'MOTO ACUÁTICA', marca: 'SEA-DOO' })).toBe('moto');
  });
  it('MOTO es moto (incluidos UTV / ATV / Can Am / CFMOTO cargados como MOTO)', () => {
    expect(claseEquipo({ equipo: 'MOTO KEEWAY HORSE 150 AB2P82F', tipo: 'MOTO', placa: 'AB2P82F' })).toBe('moto');
    expect(claseEquipo({ equipo: 'MOTO CAN AM MAVERICK X3', tipo: 'MOTO', placa: 'N/A' })).toBe('moto');
    expect(claseEquipo({ equipo: 'NEW HORSE', tipo: 'MOTO' })).toBe('moto');
  });
  it('LANCHA es lancha', () => {
    expect(claseEquipo({ equipo: 'LANCHA SKYY · LEGACY 36 GEN X', tipo: 'LANCHA', placa: 'AGSP-RE-1.979' })).toBe('lancha');
  });
  it('EXCAVADORA y el resto de la flota pesada es maquinaria', () => {
    expect(claseEquipo({ equipo: 'EXCAVADORA CAT 320', tipo: 'EXCAVADORA', grupo_mantenimiento: 'FLOTA PESADA' })).toBe('maquinaria');
    for (const tipo of ['PAYLOADER', 'DUMPER', 'TRACTOR', 'RETROEXCAVADORA', 'MINI PALA', 'MONTACARGA', 'GENERADOR ELÉCTRICO', 'PLANTA ELÉCTRICA', 'COMPRESOR', 'PERFORADORA']) {
      expect(claseEquipo({ tipo }), tipo).toBe('maquinaria');
    }
  });
  it('herramienta se mantiene', () => {
    expect(claseEquipo({ equipo: 'TALADRO BOSCH', tipo: 'Taladro percutor' })).toBe('herramienta');
    expect(claseEquipo({ tipo: 'HIDROLAVADORA' })).toBe('herramienta');
  });
});

describe('gestión de apartados (listar, guardar, eliminar, icono)', () => {
  it('incluye herramientas en los apartados base', () => {
    const aps = listarApartados();
    expect(aps.some((a) => a.id === 'herramienta' && a.icon === '🛠️')).toBe(true);
    expect(iconoDeClase('herramienta')).toBe('🛠️');
    expect(iconoDeClase('maquinaria')).toBe('🚜');
    expect(iconoDeClase('vehiculo')).toBe('🚚');
  });

  it('permite guardar y eliminar apartados personalizados', () => {
    const ap = guardarApartadoCustom({ label: 'Generadores Menores', icon: '⚡', keywords: ['generador menor', 'alternador'] });
    expect(ap.id).toContain('generadores');
    expect(ap.icon).toBe('⚡');

    const lista = listarApartados();
    expect(lista.some((a) => a.id === ap.id)).toBe(true);
    expect(claseEquipo({ tipo: 'Alternador portátil' })).toBe(ap.id);

    eliminarApartadoCustom(ap.id);
    const listaPost = listarApartados();
    expect(listaPost.some((a) => a.id === ap.id)).toBe(false);
  });
});

describe('aviso de servicio por horas/km', () => {
  it('con base: N − (lectura − base)', () => {
    expect(restantesServicio(250, 1200, 1000)).toBe(50);
    expect(restantesServicio(250, 1300, 1000)).toBe(-50);
  });
  it('sin base: próximo dentro del margen del siguiente múltiplo', () => {
    expect(restantesServicio(250, 1240, null)).toBe(10);
    expect(restantesServicio(250, 1498.4, null)).toBe(1.6); // la Yamagro el 26/10: «faltan 1,6 h»
  });
  it('sin base: al pasar el múltiplo queda VENCIDO hasta registrar el mantenimiento (27/10/2026)', () => {
    // La Yamagro cargó 1.509,35 h el 27/10 sin hacer el servicio de las 1.500 h: antes salía «OK».
    expect(restantesServicio(250, 1509.35, null)).toBe(-9.35);
    expect(restantesServicio(250, 1500, null)).toBe(0);
    expect(restantesServicio(250, 1600, null)).toBe(-100);
    expect(avisoServicio(250, 1509.35, null, 'h')?.nivel).toBe('vencido');
    expect(avisoServicio(250, 1600, null, 'h')?.nivel).toBe('vencido');
    // Solo vuelve a «próximo» cuando se acerca el siguiente múltiplo.
    expect(avisoServicio(250, 1740, null, 'h')?.nivel).toBe('proximo');
    expect(restantesServicio(250, 1740, null)).toBe(10);
  });
  it('sin base, en el primer intervalo todavía no tocó ningún servicio', () => {
    expect(restantesServicio(250, 93.1, null)).toBe(156.9);
    expect(avisoServicio(250, 93.1, null, 'h')?.nivel).toBe('ok');
    expect(avisoServicio(250, 240, null, 'h')?.nivel).toBe('proximo');
  });
  it('null si falta el dato', () => {
    expect(restantesServicio(null, 100, null)).toBeNull();
    expect(restantesServicio(250, null, null)).toBeNull();
  });
  it('niveles ok / próximo / vencido (10% del intervalo)', () => {
    expect(avisoServicio(250, 1100, 1000, 'h')?.nivel).toBe('ok');
    expect(avisoServicio(250, 1230, 1000, 'h')?.nivel).toBe('proximo');
    expect(avisoServicio(250, 1250, 1000, 'h')?.nivel).toBe('vencido');
  });
  it('el más urgente gana', () => {
    const h = avisoServicio(250, 1100, 1000, 'h');
    const k = avisoServicio(5000, 9900, 5000, 'km');
    expect(avisoMasUrgente(h, k)?.unidad).toBe('km');
    expect(avisoMasUrgente(null, h)).toBe(h);
  });
});

describe('decidirRepuesto: del inventario, parcial o a compra', () => {
  it('stock suficiente sale del inventario', () => {
    expect(decidirRepuesto(2, 5)).toEqual({ desdeInventario: 2, aComprar: 0, tipo: 'stock' });
  });
  it('stock parcial: lo que hay sale, el resto a compra', () => {
    expect(decidirRepuesto(4, 2)).toEqual({ desdeInventario: 2, aComprar: 2, tipo: 'parcial' });
  });
  it('sin stock o pieza nueva: todo a compra', () => {
    expect(decidirRepuesto(3, 0)).toEqual({ desdeInventario: 0, aComprar: 3, tipo: 'compra' });
    expect(decidirRepuesto(3, null)).toEqual({ desdeInventario: 0, aComprar: 3, tipo: 'compra' });
  });
  it('stock negativo no cuenta y decimales no dejan residuos', () => {
    expect(decidirRepuesto(1, -4).tipo).toBe('compra');
    expect(decidirRepuesto(0.3, 0.1).aComprar).toBe(0.2);
  });
  it('efecto de la orden: con compra espera repuestos; sin compra, al taller', () => {
    expect(efectoOrden([{ producto_id: 'a', desde_inventario: 2, a_comprar: 0 }])).toMatchObject({ estadoOrden: 'abierta', estadoEquipo: 'taller', salen: 1, compran: 0 });
    expect(efectoOrden([{ producto_id: 'a', desde_inventario: 2, a_comprar: 2 }, { producto_id: null, desde_inventario: 0, a_comprar: 1 }]))
      .toMatchObject({ estadoOrden: 'repuestos', estadoEquipo: 'repuestos', salen: 1, compran: 2, nuevos: 1 });
    expect(efectoOrden([])).toMatchObject({ estadoOrden: 'abierta', estadoEquipo: 'taller' });
  });
});

describe('órdenes de servicio', () => {
  it('transiciones iguales a las de la base', () => {
    expect(siguientesEstadosOrden('abierta')).toEqual(['en_proceso', 'realizada', 'anulada']);
    expect(siguientesEstadosOrden('repuestos')).toEqual(['en_proceso', 'anulada']);
    expect(siguientesEstadosOrden('realizada')).toEqual([]);
  });
  it('sugiere el servicio por la avería', () => {
    expect(sugerirServicio('Dos cauchos traseros reventados', null)).toBe('cauchos');
    expect(sugerirServicio('se le dañó el gato', null)).toBe('hidraulico');
    expect(sugerirServicio('', { nivel: 'proximo', restante: 10, unidad: 'h', pct: 96, ratio: 0.96 })).toBe('preventivo');
    expect(sugerirServicio(null, null)).toBeNull();
  });
});

describe('editar y borrar órdenes de servicio', () => {
  const o = (estado: string, salida: string | null = null, compra: string | null = null) => ({ estado, solicitud_salida_id: salida, orden_compra_id: compra });
  it('los repuestos se editan solo abierta / esperando repuestos y sin salida ni pedido', () => {
    expect(repuestosEditables(o('abierta'))).toBe(true);
    expect(repuestosEditables(o('repuestos'))).toBe(true);
    expect(repuestosEditables(o('en_proceso'))).toBe(false);
    expect(repuestosEditables(o('realizada'))).toBe(false);
    expect(repuestosEditables(o('abierta', 'sal-1'))).toBe(false);
    expect(repuestosEditables(o('repuestos', null, 'sp-1'))).toBe(false);
  });
  it('una orden realizada (traza completa) solo la borra un administrador', () => {
    expect(puedeBorrarOrden({ estado: 'realizada' }, { maquinaria: true, admin: false })).toBe(false);
    expect(puedeBorrarOrden({ estado: 'realizada' }, { maquinaria: true, admin: true })).toBe(true);
    expect(puedeBorrarOrden({ estado: 'anulada' }, { maquinaria: true, admin: false })).toBe(true);
    expect(puedeBorrarOrden({ estado: 'abierta' }, { maquinaria: true, admin: false })).toBe(true);
    expect(puedeBorrarOrden({ estado: 'abierta' }, { maquinaria: false, admin: false })).toBe(false);
  });
});

describe('tablero de compras del equipo', () => {
  it('agrupa los estados de Pedidos en columnas', () => {
    expect(columnaCompra('pendiente')).toBe('solicitada');
    expect(columnaCompra('oc_aprobada')).toBe('ordenada');
    expect(columnaCompra('cuenta_abierta')).toBe('ordenada');
    expect(columnaCompra('pagada')).toBe('pagada');
    expect(columnaCompra('rechazada')).toBe('cancelada');
    expect(compraAbierta('pagada')).toBe(true);
    expect(compraAbierta('recibida')).toBe(false);
  });
});

describe('acciones por permiso', () => {
  it('solo lectura: consultar, bitácora, documentos y ficha', () => {
    expect(accionesEquipo({ maquinaria: false, combustible: false }, 'operativa')).toEqual(['bitacora', 'documentos', 'ficha']);
  });
  it('combustible sin maquinaria: no da acciones (el surtido es solo en Combustible)', () => {
    const a = accionesEquipo({ maquinaria: false, combustible: true }, 'operativa');
    expect(a).toEqual(['bitacora', 'documentos', 'ficha']);
    expect(a).not.toContain('lectura');
    expect(a).not.toContain('servicio');
    expect(a).not.toContain('retirar');
  });
  it('maquinaria: servicio, avería, espera, retirar y eliminar', () => {
    const a = accionesEquipo({ maquinaria: true, combustible: false }, 'operativa', { avisoServicio: true });
    expect(a).toEqual(expect.arrayContaining(['servicio', 'averia', 'lectura', 'espera', 'retirar', 'editar', 'mantt_hecho', 'eliminar']));
  });
  it('averiada no ofrece reportar otra avería; espera ofrece quitarla', () => {
    expect(accionesEquipo({ maquinaria: true, combustible: true }, 'averiada')).not.toContain('averia');
    expect(accionesEquipo({ maquinaria: true, combustible: true }, 'espera')).toContain('quitar_espera');
  });
  it('retirada solo se reactiva', () => {
    const a = accionesEquipo({ maquinaria: true, combustible: true }, 'retirada');
    expect(a).toContain('reactivar');
    expect(a).not.toContain('servicio');
    expect(a).not.toContain('lectura');
  });
});

describe('búsqueda sin acentos', () => {
  it('encuentra por cualquier dato y en cualquier orden', () => {
    const e = { equipo: 'JUMBO 024', marca: 'VOLVO', modelo: 'EC240', ubicacion: 'Peramanál', serial: 'VCE123' };
    expect(coincideEquipo(e, 'peramanal')).toBe(true);
    expect(coincideEquipo(e, 'volvo jumbo')).toBe(true);
    expect(coincideEquipo(e, 'cat')).toBe(false);
    expect(coincideEquipo(e, '  ')).toBe(true);
  });
});

describe('qué falta pedir de una orden', () => {
  const rep = [{ producto_id: 'p', desde_inventario: 2, a_comprar: 1 }];
  it('salida y compra pendientes mientras no estén vinculadas', () => {
    expect(faltaSalida({ estado: 'repuestos', solicitud_salida_id: null, repuestos: rep })).toBe(true);
    expect(faltaCompra({ estado: 'repuestos', orden_compra_id: null, repuestos: rep })).toBe(true);
    expect(faltaSalida({ estado: 'repuestos', solicitud_salida_id: 'x', repuestos: rep })).toBe(false);
    expect(faltaCompra({ estado: 'repuestos', orden_compra_id: 'y', repuestos: rep })).toBe(false);
  });
  it('una orden cerrada o anulada ya no pide nada', () => {
    expect(faltaSalida({ estado: 'anulada', solicitud_salida_id: null, repuestos: rep })).toBe(false);
    expect(faltaCompra({ estado: 'realizada', orden_compra_id: null, repuestos: rep })).toBe(false);
  });
  it('pieza nueva no sale del inventario', () => {
    expect(faltaSalida({ estado: 'abierta', solicitud_salida_id: null, repuestos: [{ producto_id: null, desde_inventario: 0, a_comprar: 1 }] })).toBe(false);
  });
});

describe('lecturas de horómetro / km', () => {
  const vig = { horometro: 1200, kilometraje: 50000 };
  it('hace falta al menos una lectura y que sea un número positivo', () => {
    expect(validarLectura({ horometro: null, kilometraje: null }, vig)).toMatch(/horómetro o el kilometraje/);
    expect(validarLectura({ horometro: -1, kilometraje: null }, vig)).toMatch(/positivo/);
  });
  it('no puede bajar de la vigente; igual o mayor sí', () => {
    expect(validarLectura({ horometro: 1199, kilometraje: null }, vig)).toMatch(/1200 h/);
    expect(validarLectura({ horometro: null, kilometraje: 49000 }, vig)).toMatch(/50000 km/);
    expect(validarLectura({ horometro: 1200, kilometraje: 50010 }, vig)).toBeNull();
    expect(validarLectura({ horometro: 5, kilometraje: null }, { horometro: null, kilometraje: null })).toBeNull();
  });
  it('corrección hacia abajo: solo admin y con motivo', () => {
    expect(validarLectura({ horometro: 10, kilometraje: null }, vig, { correccion: true, admin: false, motivo: 'cambio' })).toMatch(/administrador/);
    expect(validarLectura({ horometro: 10, kilometraje: null }, vig, { correccion: true, admin: true, motivo: '' })).toMatch(/motivo/);
    expect(validarLectura({ horometro: 10, kilometraje: null }, vig, { correccion: true, admin: true, motivo: 'cambio de horómetro' })).toBeNull();
  });
  it('origen legible', () => {
    expect(etiquetaOrigenLectura('combustible')).toMatch(/Combustible/);
    expect(etiquetaOrigenLectura(null)).toBe('—');
  });
});

describe('alias: cómo lo conocen los operadores', () => {
  it('varios alias separados por coma, sin vacíos ni repetidos', () => {
    expect(aliasesDeEquipo({ alias: 'L220G, la amarilla, , l220g' })).toEqual(['L220G', 'la amarilla']);
  });
  it('sin alias cargado valen el modelo y la placa', () => {
    expect(aliasesDeEquipo({ alias: null, modelo: 'EC240', placa: 'A12BC3D' })).toEqual(['EC240', 'A12BC3D']);
    expect(aliasesDeEquipo({ alias: '  ', modelo: null, placa: 'A12BC3D' })).toEqual(['A12BC3D']);
    expect(aliasesDeEquipo({})).toEqual([]);
  });
  it('nombre corto: primer alias; si no hay alias, el NOMBRE principal (no el modelo ni la placa)', () => {
    expect(nombreCortoEquipo({ alias: 'LA AMARILLA, L220G', modelo: 'L220G', equipo: 'PAYLOADER VOLVO' })).toBe('LA AMARILLA');
    expect(nombreCortoEquipo({ alias: null, modelo: 'L220G', equipo: 'PAYLOADER VOLVO' })).toBe('PAYLOADER VOLVO');
    expect(nombreCortoEquipo({ alias: null, modelo: null, placa: 'A12BC3D', equipo: 'CAMIÓN 01' })).toBe('CAMIÓN 01');
    expect(nombreCortoEquipo({ alias: null, modelo: null, placa: null, equipo: 'PLANTA PERKINS' })).toBe('PLANTA PERKINS');
  });
});
