import { describe, expect, it } from 'vitest';
import {
  errorFotosSalidaMina, errorRetornoMina, errorSalidaMina, filtrarPorRetornar, leerCantidad, mensajeRetornoMina, mensajeSalidaMina,
  pendienteRetorno, type SalidaMina,
} from './salidasMina';

const salida = (x: Partial<SalidaMina> = {}): SalidaMina => ({
  id: 's1', codigo: 'SDM-0001', producto_id: 'p1', producto_nombre: 'MANGUERA 2 PULGADAS', unidad: 'und',
  cantidad: 2, motivo: 'Para la bomba del pozo 3', autorizado_por: 'JESUS GARCIA', retorna: true, retornado: 0, retornos: [], fotos: [],
  estado: 'por_retornar', actor: 'x@y', actor_name: 'Pedro', created_at: '2026-10-13T13:45:00Z', ...x,
});

describe('salida del Depósito Mina', () => {
  const ok = { productoId: 'p1', cantidad: 2, stock: 5, motivo: 'Bomba', autorizado: 'JESUS GARCIA', retorna: false };
  it('pide material, cantidad, que alcance, motivo y si retorna', () => {
    expect(errorSalidaMina(ok)).toBeNull();
    expect(errorSalidaMina({ ...ok, productoId: null })).toMatch(/material/);
    expect(errorSalidaMina({ ...ok, cantidad: 0 })).toMatch(/cuánto sale/);
    expect(errorSalidaMina({ ...ok, cantidad: 6 })).toMatch(/No alcanza/);
    expect(errorSalidaMina({ ...ok, motivo: ' a ' })).toMatch(/motivo/);
    expect(errorSalidaMina({ ...ok, autorizado: ' ' })).toMatch(/quién autorizó/);
    expect(errorSalidaMina({ ...ok, retorna: null })).toMatch(/SÍ o NO/);
  });
  it('lee cantidades con coma', () => {
    expect(leerCantidad('2,5')).toBe(2.5);
    expect(leerCantidad('x')).toBe(0);
  });
  it('máximo 4 fotos y solo imágenes', () => {
    const f = { name: 'a.jpg', type: 'image/jpeg' };
    expect(errorFotosSalidaMina([f, f, f, f])).toBeNull();
    expect(errorFotosSalidaMina([f, f], 3)).toMatch(/hasta 4/);
    expect(errorFotosSalidaMina([{ name: 'a.pdf', type: 'application/pdf' }])).toMatch(/no es una imagen/);
  });
});

describe('retorno', () => {
  it('lo que falta y el retorno por partes', () => {
    expect(pendienteRetorno(salida({ retornado: 1.5 }))).toBe(0.5);
    expect(pendienteRetorno(salida({ retorna: false }))).toBe(0);
    expect(errorRetornoMina(salida({ retornado: 1.5 }), 0.5)).toBeNull();
    expect(errorRetornoMina(salida({ retornado: 1.5 }), 1)).toMatch(/Solo faltan 0,5/);
    expect(errorRetornoMina(salida({ retorna: false }), 1)).toMatch(/no retorna/);
    expect(errorRetornoMina(salida({ retornado: 2 }), 1)).toMatch(/completa/);
  });
});

describe('buscador de Por retornar', () => {
  const lista = [
    salida(),
    salida({ id: 's2', codigo: 'SDM-0002', producto_nombre: 'CABLE 10 AWG', motivo: 'Planta Yamagro', autorizado_por: 'EDINSON ANGULO', unidad: 'm', cantidad: 50, retornado: 20, created_at: '2026-10-17T15:00:00Z' }),
  ];
  it('vacío devuelve todo; busca por material, código, motivo, quién autorizó y unidad, sin acentos ni mayúsculas', () => {
    expect(filtrarPorRetornar(lista, '')).toHaveLength(2);
    expect(filtrarPorRetornar(lista, 'manguéra').map((s) => s.id)).toEqual(['s1']);
    expect(filtrarPorRetornar(lista, 'sdm-0002').map((s) => s.id)).toEqual(['s2']);
    expect(filtrarPorRetornar(lista, 'yamagro').map((s) => s.id)).toEqual(['s2']);
    expect(filtrarPorRetornar(lista, 'jesus').map((s) => s.id)).toEqual(['s1']);
    expect(filtrarPorRetornar(lista, 'pedro')).toHaveLength(2);
  });
  it('varias palabras: todas tienen que aparecer; también busca por fecha y por lo que falta', () => {
    expect(filtrarPorRetornar(lista, 'cable yamagro').map((s) => s.id)).toEqual(['s2']);
    expect(filtrarPorRetornar(lista, 'cable bomba')).toHaveLength(0);
    expect(filtrarPorRetornar(lista, '17/10/2026').map((s) => s.id)).toEqual(['s2']);
    expect(filtrarPorRetornar(lista, '13-10-2026').map((s) => s.id)).toEqual(['s1']);
    expect(filtrarPorRetornar(lista, '30').map((s) => s.id)).toEqual(['s2']); // faltan 30 m
  });
});

describe('aviso de WhatsApp', () => {
  it('salida: material, cantidad, motivo y retorna SÍ / NO', () => {
    const t = mensajeSalidaMina(salida({ fotos: [{ path: 'a', filename: 'a.jpg' }] }));
    expect(t).toMatch(/^📤 \*SALIDA DE DEPÓSITO\*/);
    expect(t).toContain('📦 *Material:* MANGUERA 2 PULGADAS');
    expect(t).toContain('🔢 *Cantidad:* 2 und');
    expect(t).toContain('📝 *Motivo:* Para la bomba del pozo 3');
    expect(t).toContain('✅ *Autorizado por:* JESUS GARCIA');
    expect(t).toContain('🔄 *Retorna:* SÍ');
    expect(t).toContain('📷 *Fotos:* 1');
    expect(t).toContain('👷 *Registrado por:* Pedro');
    expect(t).toContain('🕒 13/10/2026 09:45');
    expect(mensajeSalidaMina(salida({ retorna: false }))).toContain('❌ *Retorna:* NO');
  });
  it('retorno parcial y completo', () => {
    expect(mensajeRetornoMina(salida({ retornado: 1.5 }), 1.5, 'Volvió bien', 'Pedro')).toContain('⏳ *Falta por retornar:* 0,5 und');
    expect(mensajeRetornoMina(salida({ retornado: 2 }), 0.5)).toContain('✅ *Retornó completo*');
  });
  it('ningún emoji necesita el selector U+FE0F (WhatsApp lo pierde)', () => {
    for (const t of [mensajeSalidaMina(salida()), mensajeSalidaMina(salida({ retorna: false })), mensajeRetornoMina(salida(), 1, 'x')]) {
      expect(t).not.toMatch(/️/);
    }
  });
  it('Inventario General (30/10/2026): el aviso dice de dónde salió y adónde vuelve', () => {
    const g = salida({ almacen: 'General', codigo: 'SIG-0001' });
    const s = mensajeSalidaMina(g);
    expect(s).toContain('📤 *SALIDA DE INVENTARIO GENERAL*');
    expect(s).toContain('🔖 *N°:* SIG-0001');
    expect(s).toContain('GOLDEN TOUCH 1127 C.A. · Inventario General');
    expect(s).not.toContain('Depósito Mina');
    const r = mensajeRetornoMina(g, 1);
    expect(r).toContain('📥 *RETORNO AL INVENTARIO GENERAL*');
    expect(r).toContain('· Inventario General');
    // Las de la Mina (con o sin dato de almacén) siguen igual.
    expect(mensajeSalidaMina(salida({ almacen: 'Depósito Mina' }))).toContain('📤 *SALIDA DE DEPÓSITO*');
    expect(mensajeSalidaMina(salida())).toContain('· Depósito Mina');
  });
});
