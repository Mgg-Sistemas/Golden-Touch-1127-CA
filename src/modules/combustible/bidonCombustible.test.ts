import { describe, it, expect } from 'vitest';
import { esBidon, etiquetaTanqueDestino, prepararCamposSalidaBidon } from './bidonCombustible';
import type { TanqueCombustible } from '@/shared/lib/types';

describe('bidonCombustible', () => {
  it('detecta correctamente bidones por nombre con o sin tildes y mayúsculas', () => {
    expect(esBidon('BIDON')).toBe(true);
    expect(esBidon('BIDÓN')).toBe(true);
    expect(esBidon('Bidon 20L')).toBe(true);
    expect(esBidon('Bidón de 20 L')).toBe(true);
    expect(esBidon('BIDONES')).toBe(true);
    expect(esBidon('Bidones de mina')).toBe(true);
    expect(esBidon('Tanque #1')).toBe(false);
    expect(esBidon('Camión de servicio (Tanque 3)')).toBe(false);
    expect(esBidon('')).toBe(false);
    expect(esBidon(null)).toBe(false);
  });

  it('muestra etiqueta de salida directa para bidones', () => {
    const bidon: TanqueCombustible = {
      id: 't-bidon',
      nombre: 'BIDON 20L',
      tipo: 'rectangular',
      es_movil: true,
      capacidad_litros: 20,
      saldo_litros: 0,
      saldo_usd: 0,
      tasa_usd_litro: 0.7,
      estado: 'activo',
      orden: 4,
      created_at: '2026-10-23T00:00:00Z',
    };
    expect(etiquetaTanqueDestino(bidon)).toBe('🪣 BIDON 20L · salida directa (sin saldo)');

    const tanque1: TanqueCombustible = {
      id: 't-1',
      nombre: 'TANQUE #1',
      tipo: 'cilindrico_horizontal',
      es_movil: false,
      capacidad_litros: 36000,
      saldo_litros: 15000,
      saldo_usd: 10500,
      tasa_usd_litro: 0.7,
      estado: 'activo',
      orden: 1,
      created_at: '2026-10-23T00:00:00Z',
    };
    expect(etiquetaTanqueDestino(tanque1)).toBe('TANQUE #1 · 15.000 L');
  });

  it('prepara los campos asignando el equipo y nota de salida directa', () => {
    const res = prepararCamposSalidaBidon('TANQUE #1', 'BIDON 20L', {
      fecha: '2026-10-23',
      autorizado_por: 'JUAN',
    });
    expect(res.equipo).toBe('BIDON 20L');
    expect(res.observacion).toBe('Salida a BIDON 20L');
    expect(res.autorizado_por).toBe('JUAN');

    const resConEquipo = prepararCamposSalidaBidon('TANQUE #3', 'BIDON', {
      fecha: '2026-10-23',
      equipo: 'GENERADOR GEP',
      observacion: 'Apoyo campamento',
    });
    expect(resConEquipo.equipo).toBe('GENERADOR GEP');
    expect(resConEquipo.observacion).toBe('Apoyo campamento · Salida a BIDON');
  });

  it('garantiza que los bidones se mantengan con saldo 0', () => {
    const lista: TanqueCombustible[] = [
      { id: '1', nombre: 'TANQUE #1', tipo: 'cilindrico_horizontal', es_movil: false, capacidad_litros: 36000, saldo_litros: 5000, saldo_usd: 3500, tasa_usd_litro: 0.7, estado: 'activo', orden: 1, created_at: '' },
      { id: '2', nombre: 'BIDON 20L', tipo: 'rectangular', es_movil: true, capacidad_litros: 20, saldo_litros: 20, saldo_usd: 14, tasa_usd_litro: 0.7, estado: 'activo', orden: 2, created_at: '' },
    ];
    const procesada = lista.map((t) => (esBidon(t.nombre) ? { ...t, saldo_litros: 0, saldo_usd: 0 } : t));
    expect(procesada[0].saldo_litros).toBe(5000);
    expect(procesada[1].saldo_litros).toBe(0);
    expect(procesada[1].saldo_usd).toBe(0);
  });
});

