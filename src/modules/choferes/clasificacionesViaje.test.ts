import { describe, expect, it } from 'vitest';
import {
  CLASIFICACIONES_BASE, SIN_CLASIFICAR, clasificarCategoriaPorTasa, categoriaDeViaje, etiquetaCategoria,
  tarifaSugeridaCategoria, claveDeClasificacion, resumenPorCategoria, tasasDeConductor, type ClasificacionViaje,
} from './choferes';

const mina: ClasificacionViaje = { clave: 'VIAJE MINA', nombre: 'Viaje mina', icono: '⛏', tarifa_usd: 35, activo: true, orden: 4 };
const conMina = [...CLASIFICACIONES_BASE, mina];

describe('clasificaciones de viaje (catálogo)', () => {
  it('coincidencia exacta con la tarifa de una clasificación nueva', () => {
    expect(clasificarCategoriaPorTasa(35, null, conMina)).toBe('VIAJE MINA');
  });
  it('sin coincidencia exacta: la más cercana en proporción', () => {
    expect(clasificarCategoriaPorTasa(13, null, CLASIFICACIONES_BASE)).toBe('VIAJE CORTO');
    expect(clasificarCategoriaPorTasa(4, null, CLASIFICACIONES_BASE)).toBe('VIAJE INTERNO');
    expect(clasificarCategoriaPorTasa(40, null, conMina)).toBe('VIAJE MINA');
    expect(clasificarCategoriaPorTasa(48, null, conMina)).toBe('VIAJE LARGO');
  });
  it('una clasificación inactiva no se detecta; sin activas → sin clasificar', () => {
    expect(clasificarCategoriaPorTasa(35, null, [...CLASIFICACIONES_BASE, { ...mina, activo: false }])).not.toBe('VIAJE MINA');
    expect(clasificarCategoriaPorTasa(35, null, CLASIFICACIONES_BASE.map((c) => ({ ...c, activo: false })))).toBe(SIN_CLASIFICAR);
  });
  it('las base usan la tasa del chofer; las nuevas la del catálogo', () => {
    const chofer = { tarifa_corto_usd: 30, tarifa_largo_usd: 90, tarifa_interno_usd: 2 };
    expect(tarifaSugeridaCategoria('VIAJE CORTO', chofer, conMina)).toBe(30);
    expect(tarifaSugeridaCategoria('VIAJE MINA', chofer, conMina)).toBe(35);
    expect(clasificarCategoriaPorTasa(90, chofer, conMina)).toBe('VIAJE LARGO');
  });
  it('sin tasas propias, el chofer toma las tarifas del catálogo', () => {
    const t = tasasDeConductor({ tarifa_viaje_usd: 0 }, { corto: 20, largo: 70, interno: 3 });
    expect(t).toEqual({ corto: 20, largo: 70, interno: 3 });
  });
  it('conserva la clave guardada aunque la clasificación sea nueva o se haya renombrado', () => {
    expect(categoriaDeViaje({ categoria_viaje: 'VIAJE MINA', tarifa_usd: 1 }, null, conMina)).toBe('VIAJE MINA');
    expect(etiquetaCategoria('VIAJE MINA', [{ ...mina, nombre: 'Viaje a la mina' }])).toBe('VIAJE A LA MINA');
    expect(etiquetaCategoria('VIAJE CORTO')).toBe('VIAJE CORTO');
    expect(claveDeClasificacion('  viaje   mina ')).toBe('VIAJE MINA');
  });
  it('resumen por tipo: las tres de siempre + las nuevas con viajes', () => {
    const r = resumenPorCategoria([
      { categoria: 'VIAJE CORTO', observaciones: 'VIAJE CORTO', viajes: 2, totalPagar: 50 },
      { categoria: 'VIAJE MINA', observaciones: 'VIAJE MINA', viajes: 3, totalPagar: 105 },
    ]);
    expect(r.map((x) => x.clave)).toEqual(['VIAJE LARGO', 'VIAJE CORTO', 'VIAJE INTERNO', 'VIAJE MINA']);
    expect(r.find((x) => x.clave === 'VIAJE MINA')).toMatchObject({ viajes: 3, monto: 105 });
  });
});