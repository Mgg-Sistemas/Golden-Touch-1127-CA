import { describe, expect, it } from 'vitest';
import { borradorDesdeInforme } from './informeBorrador';

describe('borradorDesdeInforme', () => {
  it('un informe nuevo toma los valores por defecto de la configuración', () => {
    const cfg = {
      id: 1, ciudad: 'Puerto Ordaz', para_nombre: 'Ender Mejías', para_cargo: 'Rep. Legal',
      de_nombre: 'Marco Romero', de_cargo: 'Geología', firma_nombre: 'Ing. Marco Romero',
      firma_cargo: 'Geólogo', direccion_pie: 'Sector La Esperanza',
      logo_gt: true, logo_cvm: false, actualizado_en: '2026-10-02T00:00:00Z',
    };
    const b = borradorDesdeInforme(null, cfg);
    expect(b.ciudad).toBe('Puerto Ordaz');
    expect(b.para_nombre).toBe('Ender Mejías');
    expect(b.logo_cvm).toBe(false);
    expect(b.estado).toBe('borrador');
    expect(b.apartados).toEqual([]);
  });
  it('sin configuración no revienta: queda todo vacío y los logos encendidos', () => {
    const b = borradorDesdeInforme(null, null);
    expect(b.ciudad).toBe('');
    expect(b.logo_gt).toBe(true);
    expect(b.logo_cvm).toBe(true);
  });
  it('al editar, gana lo guardado en el informe, no la configuración', () => {
    const cfg = { id: 1, ciudad: 'Puerto Ordaz', para_nombre: 'Otro', para_cargo: null,
      de_nombre: null, de_cargo: null, firma_nombre: null, firma_cargo: null,
      direccion_pie: null, logo_gt: true, logo_cvm: true, actualizado_en: '' };
    const inf = { id: 'i1', codigo: 'X', codigo_anio: null, codigo_nro: null,
      fecha: '2026-01-01', estado: 'finalizado' as const, ciudad: 'Caracas',
      para_nombre: 'Ender Mejías', para_cargo: null, de_nombre: null, de_cargo: null,
      firma_nombre: null, firma_cargo: null, direccion_pie: null,
      logo_gt: false, logo_cvm: true, apartados: [], creado_en: '' };
    const b = borradorDesdeInforme(inf, cfg);
    expect(b.ciudad).toBe('Caracas');
    expect(b.para_nombre).toBe('Ender Mejías');
    expect(b.logo_gt).toBe(false);
  });
  it('los nulos del informe se vuelven texto vacío, para que el formulario no muestre «null»', () => {
    const inf = { id: 'i1', codigo: 'X', codigo_anio: null, codigo_nro: null,
      fecha: '2026-01-01', estado: 'borrador' as const, ciudad: null,
      para_nombre: null, para_cargo: null, de_nombre: null, de_cargo: null,
      firma_nombre: null, firma_cargo: null, direccion_pie: null,
      logo_gt: true, logo_cvm: true, apartados: [], creado_en: '' };
    const b = borradorDesdeInforme(inf, null);
    expect(b.ciudad).toBe('');
    expect(b.para_cargo).toBe('');
  });
});
