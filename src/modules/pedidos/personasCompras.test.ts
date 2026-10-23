import { describe, expect, it } from 'vitest';
import {
  crearMapaPersonasCompras,
  derivarNombreDesdeCorreo,
  nombrePersonaCompras,
} from './personasCompras';
import type { Usuario } from '@/shared/lib/types';

describe('personasCompras', () => {
  describe('derivarNombreDesdeCorreo', () => {
    it('extrae nombre y apellido desde correos separados por puntos o guiones', () => {
      expect(derivarNombreDesdeCorreo('pedro.perez@gmail.com')).toBe('PEDRO PEREZ');
      expect(derivarNombreDesdeCorreo('maria_rodriguez@goldentouch1127.com')).toBe('MARIA RODRIGUEZ');
      expect(derivarNombreDesdeCorreo('carlos-mendoza@empresa.com.ve')).toBe('CARLOS MENDOZA');
    });

    it('remueve dígitos al final del usuario', () => {
      expect(derivarNombreDesdeCorreo('kelvin2026@gmail.com')).toBe('KELVIN');
      expect(derivarNombreDesdeCorreo('analista1@gt.com')).toBe('ANALISTA');
    });
  });

  describe('nombrePersonaCompras', () => {
    it('reconoce a los aprobadores institucionales automáticamente', () => {
      expect(nombrePersonaCompras('touchgolden1127@gmail.com')).toBe('JESUS LOZADA');
      expect(nombrePersonaCompras('TOUCHGOLDEN1127@GMAIL.COM')).toBe('JESUS LOZADA');
      expect(nombrePersonaCompras('jhzgcontabilidad@gmail.com')).toBe('LEYDIS RENGEL');
      expect(nombrePersonaCompras('JHZGCONTABILIDAD@GMAIL.COM')).toBe('LEYDIS RENGEL');
    });

    it('reconoce a la analista de compras institucional Mariana Tovar', () => {
      expect(nombrePersonaCompras('marianatovar@gmail.com')).toBe('MARIANA TOVAR');
      expect(nombrePersonaCompras('marianatovar1127@gmail.com')).toBe('MARIANA TOVAR');
    });

    it('utiliza el mapa de usuarios cuando está disponible', () => {
      const mapa = new Map<string, string>([
        ['ana.solis@gt.com', 'ANA SOLIS'],
        ['compras@gt.com', 'ROBERTO BLANCO'],
      ]);
      expect(nombrePersonaCompras('ana.solis@gt.com', mapa)).toBe('ANA SOLIS');
      expect(nombrePersonaCompras('COMPRAS@GT.COM', mapa)).toBe('ROBERTO BLANCO');
    });

    it('NUNCA devuelve un correo con @ si el usuario no está en el mapa', () => {
      const res = nombrePersonaCompras('pedro.sanchez@proveedor.com');
      expect(res).toBe('PEDRO SANCHEZ');
      expect(res).not.toContain('@');
      expect(res).not.toContain('proveedor.com');
    });

    it('devuelve vacío si no se proporciona identificador', () => {
      expect(nombrePersonaCompras(null)).toBe('');
      expect(nombrePersonaCompras(undefined)).toBe('');
      expect(nombrePersonaCompras('')).toBe('');
    });

    it('respeta nombres que ya son texto sin arroba', () => {
      expect(nombrePersonaCompras('Jaime Campo')).toBe('JAIME CAMPO');
    });
  });

  describe('crearMapaPersonasCompras', () => {
    it('incluye aprobadores base e integra los usuarios con nombre y apellido', () => {
      const usuarios: Usuario[] = [
        {
          id: 'u-1',
          email: 'analista.junior@gt.com',
          nombre: 'Andrés',
          apellido: 'Bello',
          role: 'analista',
          created_at: '2026-01-01',
          estado: 'activo',
        },
      ];
      const mapa = crearMapaPersonasCompras(usuarios);
      expect(mapa.get('touchgolden1127@gmail.com')).toBe('JESUS LOZADA');
      expect(mapa.get('jhzgcontabilidad@gmail.com')).toBe('LEYDIS RENGEL');
      expect(mapa.get('analista.junior@gt.com')).toBe('ANDRÉS BELLO');
      expect(mapa.get('u-1')).toBe('ANDRÉS BELLO');
    });
  });
});
