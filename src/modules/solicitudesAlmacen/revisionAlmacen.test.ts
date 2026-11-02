import { describe, it, expect } from 'vitest';
import {
  acotarDisponible, acotarPorAlmacen, aplicarLote, avisoLote, estadoExistencia, existenciaRenglon, porAlmacenDe, estadoSolicitudTexto, faltante,
  propuestaDesdeExistencias, resumenRevision, revisionGuardada, textoLoteSegunExistencias, textoWhatsappRevision, textoWhatsappSolicitud, tieneDe,
  TEXTO_LOTE_TODO_A_COMPRAS, TEXTO_LOTE_TODO_DISPONIBLE, TEXTO_SIN_EXISTENCIA,
  type OrdenSP, type RenglonSP,
} from './revisionAlmacen';

const CANDADOS: RenglonSP = { sku: 'EPP-001', nombre: 'CANDADOS DE SEGURIDAD', unidad: 'UND', cantidad: 48, productoId: 'p-candado' };
const LENTES: RenglonSP = { sku: 'EQU-009', nombre: 'LENTE DE SEGURIDAD', unidad: 'UND', cantidad: 10, productoId: 'p-lente' };
const CAL: RenglonSP = { sku: 'MAT-002', nombre: 'CAL', unidad: 'kg', cantidad: 2.5, productoId: 'p-cal' };
const SIN_VINCULO: RenglonSP = { sku: '', nombre: 'GUANTES DE CARNAZA', unidad: 'par', cantidad: 6 };

const orden: OrdenSP = {
  codigo: 'SP-2026-0261', solicitante: 'EDINSON ANGULO', unidad_solicitante: 'PRODUCCION', urgente: true,
  created_at: '2026-10-29T14:56:18Z', estado: 'revision_almacen', items: [CANDADOS, LENTES],
};

describe('acotarDisponible / faltante', () => {
  it('lo que tiene Almacén queda entre 0 y lo solicitado', () => {
    expect(acotarDisponible(60, 48)).toBe(48);
    expect(acotarDisponible(-3, 48)).toBe(0);
    expect(acotarDisponible(null, 48)).toBe(0);
    expect(acotarDisponible(4, 48)).toBe(4);
  });
  it('con decimales no deja basura de coma flotante', () => {
    expect(faltante(2.5, 0.1 + 0.2)).toBe(2.2);
    expect(acotarDisponible(1.25, 2.5)).toBe(1.25);
  });
});

describe('estadoExistencia', () => {
  it('verde si alcanza, ámbar parcial, rojo sin stock o sin vincular', () => {
    expect(estadoExistencia(10, 12)).toBe('alcanza');
    expect(estadoExistencia(10, 10)).toBe('alcanza');
    expect(estadoExistencia(10, 4)).toBe('parcial');
    expect(estadoExistencia(10, 0)).toBe('sin_stock');
    expect(estadoExistencia(10, null)).toBe('sin_vincular');
  });
});

describe('propuestaDesdeExistencias', () => {
  it('por renglón, el mínimo entre lo solicitado y la existencia', () => {
    const r = propuestaDesdeExistencias([CANDADOS, LENTES], { 'p-candado': 4, 'p-lente': 25 });
    expect(r).toMatchObject([{ idx: 0, cantidad_disponible: 4 }, { idx: 1, cantidad_disponible: 10 }]);
  });
  it('renglón sin producto vinculado: 0', () => {
    expect(propuestaDesdeExistencias([SIN_VINCULO], { x: 100 })).toMatchObject([{ idx: 0, cantidad_disponible: 0 }]);
  });
  it('producto que no apareció en el inventario: 0', () => {
    expect(propuestaDesdeExistencias([CANDADOS], {})).toMatchObject([{ idx: 0, cantidad_disponible: 0 }]);
  });
  it('cantidades decimales', () => {
    expect(propuestaDesdeExistencias([CAL], { 'p-cal': 1.75 })).toMatchObject([{ idx: 0, cantidad_disponible: 1.75 }]);
    expect(propuestaDesdeExistencias([CAL], { 'p-cal': 40 })).toMatchObject([{ idx: 0, cantidad_disponible: 2.5 }]);
  });
});

describe('aplicarLote', () => {
  const items = [CANDADOS, CAL, SIN_VINCULO];
  it('todo según existencias', () => {
    expect(aplicarLote(items, 'todo_disponible_segun_stock', { 'p-candado': 50, 'p-cal': 1 }).map((r) => r.cantidad_disponible))
      .toEqual([48, 1, 0]);
  });
  it('todo disponible: Almacén cubre todo, aun lo sin vincular', () => {
    expect(aplicarLote(items, 'todo_disponible').map((r) => r.cantidad_disponible)).toEqual([48, 2.5, 6]);
  });
  it('todo a Compras', () => {
    expect(aplicarLote(items, 'todo_a_compras').map((r) => r.cantidad_disponible)).toEqual([0, 0, 0]);
  });
});

describe('resumenRevision', () => {
  it('un renglón parcial sale en las dos listas', () => {
    const r = resumenRevision([CANDADOS, LENTES], [{ idx: 0, cantidad_disponible: 4 }, { idx: 1, cantidad_disponible: 10 }]);
    expect(r.disponibles).toEqual([
      { nombre: 'CANDADOS DE SEGURIDAD', unidad: 'UND', cantidad: 4 },
      { nombre: 'LENTE DE SEGURIDAD', unidad: 'UND', cantidad: 10 },
    ]);
    expect(r.aCompras).toEqual([{ nombre: 'CANDADOS DE SEGURIDAD', unidad: 'UND', cantidad: 44 }]);
  });
  it('todo cubierto: nada a Compras', () => {
    const r = resumenRevision([CANDADOS], [{ idx: 0, cantidad_disponible: 48 }]);
    expect(r.aCompras).toEqual([]);
    expect(r.disponibles).toHaveLength(1);
  });
  it('nada cubierto (o renglón sin revisión): todo a Compras', () => {
    const r = resumenRevision([CANDADOS, SIN_VINCULO], []);
    expect(r.disponibles).toEqual([]);
    expect(r.aCompras.map((l) => l.cantidad)).toEqual([48, 6]);
  });
  it('decimales y lo que se pase de lo solicitado se acota', () => {
    const r = resumenRevision([CAL], [{ idx: 0, cantidad_disponible: 1.2 }]);
    expect(r.disponibles[0].cantidad).toBe(1.2);
    expect(r.aCompras[0].cantidad).toBe(1.3);
    expect(resumenRevision([CAL], [{ idx: 0, cantidad_disponible: 9 }]).aCompras).toEqual([]);
  });
});

describe('Solo Los Pinos (02/11/2026): la Mina ya no entra en la revisión', () => {
  it('la propuesta y los lotes guardan el desglose con mina = 0 (la base sigue igual)', () => {
    expect(propuestaDesdeExistencias([CANDADOS], { 'p-candado': 10 })).toEqual([
      { idx: 0, cantidad_disponible: 10, por_almacen: { los_pinos: 10, mina: 0 } },
    ]);
    expect(aplicarLote([CANDADOS], 'todo_disponible')[0].por_almacen).toEqual({ los_pinos: 48, mina: 0 });
    expect(aplicarLote([CANDADOS], 'todo_a_compras')[0].por_almacen).toEqual({ los_pinos: 0, mina: 0 });
  });
  it('lo de cada almacén nunca pasa de lo solicitado', () => {
    expect(acotarPorAlmacen({ los_pinos: 40, mina: 30 }, 48)).toEqual({ los_pinos: 40, mina: 8 });
    expect(acotarPorAlmacen({ los_pinos: -2, mina: 5 }, 48)).toEqual({ los_pinos: 0, mina: 5 });
  });
  it('sin desglose guardado, todo es de Los Pinos', () => {
    expect(porAlmacenDe({ idx: 0, cantidad_disponible: 7 })).toEqual({ los_pinos: 7, mina: 0 });
    expect(tieneDe({ idx: 0, cantidad_disponible: 7 })).toBe(7);
    expect(tieneDe(undefined)).toBe(0);
  });
  it('una revisión vieja con Mina se sigue leyendo y cuenta como «tiene»; el WhatsApp solo nombra Los Pinos', () => {
    const rev = revisionGuardada([{ idx: 0, cantidad_disponible: 40, por_almacen: { los_pinos: 10, mina: 30 } }]);
    expect(rev).toEqual([{ idx: 0, cantidad_disponible: 40, por_almacen: { los_pinos: 10, mina: 30 } }]);
    expect(tieneDe(rev[0])).toBe(40);
    const res = resumenRevision([CANDADOS], rev);
    expect(res.disponibles).toEqual([{ nombre: 'CANDADOS DE SEGURIDAD', unidad: 'UND', cantidad: 40 }]);
    expect(res.aCompras).toEqual([{ nombre: 'CANDADOS DE SEGURIDAD', unidad: 'UND', cantidad: 8 }]);
    const t = textoWhatsappRevision(orden, res, 'X');
    expect(t).toContain('✅ *TIENE:*\n📍 _Los Pinos:_\n🔸 40 UND · CANDADOS DE SEGURIDAD');
    expect(t).not.toContain('Mina');
  });
});

describe('«Según existencias» con la existencia del momento (02/11/2026)', () => {
  const TORNILLO: RenglonSP = { sku: 'FER-010', nombre: 'TORNILLO 2 1/2"', unidad: 'UND', cantidad: 50, productoId: 'p-tornillo' };
  // Caso real (SP-2026-0399): renglón genérico, piden 1 und, el parecido tiene 40 LITROS.
  const ACEITE: RenglonSP = { sku: '', nombre: 'ACEITE HIDRAULICO 68', unidad: 'und', cantidad: 1 };
  const parecido = (nombre: string) => {
    if (nombre === 'ACEITE HIDRAULICO 68') return { nombre: 'ACEITE HIDRAULICO 68', stock: 40, unidad: 'LITROS' };
    if (nombre === 'GUANTES DE CARNAZA') return { nombre: 'GUANTES DE CARNAZA LARGOS', stock: 0, unidad: 'PAR' };
    return null;
  };

  it('existenciaRenglon dice de dónde sale la existencia', () => {
    expect(existenciaRenglon(TORNILLO, { 'p-tornillo': 41 })).toEqual({ origen: 'vinculado', stock: 41, unidad: 'UND' });
    expect(existenciaRenglon(TORNILLO, {})).toEqual({ origen: 'no_esta', stock: null, unidad: 'UND' });
    expect(existenciaRenglon(ACEITE, {}, parecido)).toEqual({ origen: 'parecido', stock: 40, unidad: 'LITROS', parecido: 'ACEITE HIDRAULICO 68' });
    expect(existenciaRenglon(CAL, {}, parecido)).toEqual({ origen: 'no_esta', stock: null, unidad: 'KG' });
    expect(existenciaRenglon({ ...SIN_VINCULO, nombre: 'ALGO RARO' }, {}, parecido)).toEqual({ origen: 'sin_vincular', stock: null, unidad: 'PAR' });
  });
  it('la propuesta usa el parecido: sale min(stock del parecido, solicitado); sin parecido, 0', () => {
    expect(aplicarLote([ACEITE, TORNILLO, SIN_VINCULO], 'todo_disponible_segun_stock', { 'p-tornillo': 41 }, parecido).map((r) => r.cantidad_disponible))
      .toEqual([1, 41, 0]);
    // Sin `sugerido` (la propuesta inicial al abrir), lo sin vincular arranca en 0.
    expect(propuestaDesdeExistencias([ACEITE], {}).map((r) => r.cantidad_disponible)).toEqual([0]);
    expect(faltante(1, aplicarLote([ACEITE], 'todo_disponible_segun_stock', {}, parecido)[0].cantidad_disponible)).toBe(0);
  });
  it('el toast dice cuánto hay y cuánto sale, renglón por renglón', () => {
    expect(textoLoteSegunExistencias([ACEITE, TORNILLO], { 'p-tornillo': 41 }, parecido))
      .toBe('Según inventario Los Pinos: ACEITE HIDRAULICO 68 · hay 40 LITROS (parecido) · sale 1 · TORNILLO 2 1/2" · hay 41 UND · sale 41');
    expect(textoLoteSegunExistencias([ACEITE, TORNILLO], {}, parecido))
      .toBe('Según inventario Los Pinos: ACEITE HIDRAULICO 68 · hay 40 LITROS (parecido) · sale 1 · TORNILLO 2 1/2" · no está en inventario → Compras');
  });
  it('parecido con otro nombre lo nombra; sin vincular y sin existencia van a Compras; decimales con coma', () => {
    expect(textoLoteSegunExistencias([CAL, SIN_VINCULO, { ...SIN_VINCULO, nombre: 'ALGO RARO' }], { 'p-cal': 1.5 }, parecido))
      .toBe('Según inventario Los Pinos: CAL · hay 1,5 KG · sale 1,5 · GUANTES DE CARNAZA · hay 0 PAR (parecido: GUANTES DE CARNAZA LARGOS) → Compras · ALGO RARO · sin vincular → Compras');
  });
  it('si no hay nada de nada: todo va a Compras (toast de aviso)', () => {
    expect(textoLoteSegunExistencias([TORNILLO, SIN_VINCULO], { 'p-tornillo': 0 }, parecido)).toBe(TEXTO_SIN_EXISTENCIA);
    expect(textoLoteSegunExistencias([SIN_VINCULO], {})).toBe(TEXTO_SIN_EXISTENCIA);
    expect(textoLoteSegunExistencias([], {})).toBe(TEXTO_SIN_EXISTENCIA);
    expect(avisoLote('todo_disponible_segun_stock', [TORNILLO], { 'p-tornillo': 0 })).toEqual({ texto: TEXTO_SIN_EXISTENCIA, tipo: 'warning' });
    expect(avisoLote('todo_disponible_segun_stock', [TORNILLO], { 'p-tornillo': 41 }).tipo).toBe('info');
  });
  it('«Todo disponible» y «Todo a Compras» responden siempre, aunque no cambie nada', () => {
    expect(avisoLote('todo_disponible', [], {})).toEqual({ texto: TEXTO_LOTE_TODO_DISPONIBLE, tipo: 'success' });
    expect(avisoLote('todo_a_compras', [], {})).toEqual({ texto: TEXTO_LOTE_TODO_A_COMPRAS, tipo: 'warning' });
  });
});

describe('revisionGuardada', () => {
  it('lee idx + cantidad_disponible y descarta lo raro', () => {
    expect(revisionGuardada([{ idx: 0, cantidad_disponible: 4 }, { idx: 1, disponible: '2.5' }, { idx: -1, cantidad_disponible: 1 }, null, 'x']))
      .toEqual([{ idx: 0, cantidad_disponible: 4 }, { idx: 1, cantidad_disponible: 2.5 }]);
    expect(revisionGuardada(null)).toEqual([]);
  });
});

describe('textoWhatsappRevision', () => {
  it('formato completo: tiene, va a Compras, nota y quién', () => {
    const resumen = resumenRevision([CANDADOS], [{ idx: 0, cantidad_disponible: 4 }]);
    expect(textoWhatsappRevision(orden, resumen, 'María Pérez', 'Retirar en el galpón 2')).toBe([
      '📦 *ALMACÉN HA REVISADO LA ORDEN SP-2026-0261*',
      '👤 Solicitante: EDINSON ANGULO · 🏢 Unidad: PRODUCCION',
      '✅ *TIENE:*',
      '📍 _Los Pinos:_',
      '🔸 4 UND · CANDADOS DE SEGURIDAD',
      '🛒 *VA A SOLICITAR A COMPRAS:*',
      '🔸 44 UND · CANDADOS DE SEGURIDAD',
      '📝 Nota: Retirar en el galpón 2',
      '🏢 GOLDEN TOUCH 1127 C.A. · Revisado por María Pérez',
    ].join('\n'));
  });
  it('si no tiene nada', () => {
    const t = textoWhatsappRevision(orden, resumenRevision([CANDADOS], []), 'María Pérez');
    expect(t).toContain('✅ *TIENE:* nada de lo solicitado');
    expect(t).not.toContain('📝 Nota');
  });
  it('si cubre todo', () => {
    const t = textoWhatsappRevision(orden, resumenRevision([CANDADOS], [{ idx: 0, cantidad_disponible: 48 }]), 'María Pérez');
    expect(t).toContain('🛒 *VA A SOLICITAR A COMPRAS:* nada, Almacén cubre todo');
  });
  it('cantidades decimales con coma y unidad en mayúsculas', () => {
    const t = textoWhatsappRevision(orden, resumenRevision([CAL], [{ idx: 0, cantidad_disponible: 1.5 }]), 'X');
    expect(t).toContain('🔸 1,5 KG · CAL');
    expect(t).toContain('🔸 1 KG · CAL');
  });
  it('sin el selector invisible U+FE0F', () => {
    const t = textoWhatsappRevision({ ...orden, solicitante: 'A️' }, resumenRevision([CANDADOS], []), 'X');
    expect(t).not.toMatch(/️/);
  });
});

describe('textoWhatsappSolicitud', () => {
  it('número, fecha, solicitante, unidad, urgente, productos, estado y empresa', () => {
    const t = textoWhatsappSolicitud({ ...orden, motivo: 'Reposición de EPP', items: [CANDADOS, { ...SIN_VINCULO, finalidad: 'Cuadrilla 3' }] });
    const l = t.split('\n');
    expect(l[0]).toBe('📝 *SOLICITUD DE PEDIDO SP-2026-0261*');
    expect(l[1]).toMatch(/^📅 Fecha: 29\/10\/2026/);
    expect(t).toContain('👤 Solicitante: EDINSON ANGULO · 🏢 Unidad: PRODUCCION');
    expect(t).toContain('🚨 *URGENTE*');
    expect(t).toContain('🎯 Motivo: Reposición de EPP');
    expect(t).toContain('📦 Productos:\n🔸 48 UND · CANDADOS DE SEGURIDAD\n🔸 6 PAR · GUANTES DE CARNAZA (para: Cuadrilla 3)');
    expect(t).toContain('📍 Estado: En revisión de Almacén');
    expect(l[l.length - 1]).toBe('🏢 GOLDEN TOUCH 1127 C.A.');
  });
  it('sin urgente no lo dice; el estado es el que tenga', () => {
    const t = textoWhatsappSolicitud({ ...orden, urgente: false, estado: 'pendiente' });
    expect(t).not.toContain('URGENTE');
    expect(t).toContain('📍 Estado: En Compras, por aprobar');
  });
  it('estados conocidos', () => {
    expect(estadoSolicitudTexto('revision_almacen')).toBe('En revisión de Almacén');
    expect(estadoSolicitudTexto('finalizada')).toBe('Finalizada');
    expect(estadoSolicitudTexto('oc_emitida')).toBe('oc emitida');
  });
});
