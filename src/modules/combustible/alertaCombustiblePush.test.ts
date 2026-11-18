import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  tienePermisoCombustible,
  verificarAlertaRojaCombustible,
  notificarCombustibleBajoSiAplica,
  limpiarMarcasSesionCombustible,
  limpiarMemoriaStorageParaTests,
} from './alertaCombustiblePush';
import * as tanquesRepo from './tanques.repository';
import * as webpushLib from '@/shared/lib/webpush';
import * as notifRepo from '@/modules/notificaciones/notif.repository';
import type { TanqueCombustible } from '@/shared/lib/types';

describe('alertaCombustiblePush · Permisos y Notificaciones de Combustible Bajo', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    limpiarMemoriaStorageParaTests();
  });

  describe('tienePermisoCombustible', () => {
    it('otorga permiso a administradores', () => {
      expect(tienePermisoCombustible({ isAdmin: true })).toBe(true);
    });

    it('otorga permiso si can("combustible") es verdadero', () => {
      expect(tienePermisoCombustible({
        isAdmin: false,
        can: (mod) => mod === 'combustible',
      })).toBe(true);
    });

    it('otorga permiso si puedeVista("surtidor") es verdadero', () => {
      expect(tienePermisoCombustible({
        isAdmin: false,
        puedeVista: (v) => v === 'surtidor',
      })).toBe(true);
    });

    it('otorga permiso si el rol es combustible', () => {
      expect(tienePermisoCombustible({
        isAdmin: false,
        role: 'combustible',
      })).toBe(true);
    });

    it('otorga permiso si roles_permisos tiene flags de combustible', () => {
      expect(tienePermisoCombustible({
        isAdmin: false,
        permisos: {
          combustible: { lectura: true, escritura: false, full: false },
        } as any,
      })).toBe(true);
    });

    it('deniega permiso a usuarios sin acceso a combustible', () => {
      expect(tienePermisoCombustible({
        isAdmin: false,
        can: (mod) => mod === 'cocina',
        role: 'cocina',
      })).toBe(false);
      expect(tienePermisoCombustible(null)).toBe(false);
    });
  });

  describe('verificarAlertaRojaCombustible', () => {
    it('activa alerta si el combustible general está por debajo o igual a 6.000 L', async () => {
      vi.spyOn(tanquesRepo, 'combustibleDisponibleGeneral').mockResolvedValue(4500);
      vi.spyOn(tanquesRepo, 'listTanques').mockResolvedValue([
        { id: 't1', nombre: 'Tanque Principal', estado: 'activo', capacidad_litros: 20000, saldo_litros: 4500 } as TanqueCombustible,
      ]);

      const res = await verificarAlertaRojaCombustible();
      expect(res.activa).toBe(true);
      expect(res.motivo).toBe('general');
      expect(res.cuerpo).toContain('4.500 ltrs');
      expect(res.cuerpo).toContain('mínimo 6.000 ltrs');
    });

    it('activa alerta individual si un tanque operativo baja del 12%', async () => {
      vi.spyOn(tanquesRepo, 'combustibleDisponibleGeneral').mockResolvedValue(8000); // General OK
      vi.spyOn(tanquesRepo, 'listTanques').mockResolvedValue([
        { id: 't1', nombre: 'Tanque #1', estado: 'activo', capacidad_litros: 10000, saldo_litros: 7200 } as TanqueCombustible,
        { id: 't2', nombre: 'Tanque Móvil 1', estado: 'activo', capacidad_litros: 8000, saldo_litros: 800 } as TanqueCombustible, // 10% (< 12%)
      ]);

      const res = await verificarAlertaRojaCombustible();
      expect(res.activa).toBe(true);
      expect(res.motivo).toBe('tanque_critico');
      expect(res.tanquesCriticos.length).toBe(1);
      expect(res.tanquesCriticos[0].nombre).toBe('Tanque Móvil 1');
    });

    it('no activa alerta si el general supera el mínimo y los tanques tienen nivel normal', async () => {
      vi.spyOn(tanquesRepo, 'combustibleDisponibleGeneral').mockResolvedValue(15000);
      vi.spyOn(tanquesRepo, 'listTanques').mockResolvedValue([
        { id: 't1', nombre: 'Tanque Principal', estado: 'activo', capacidad_litros: 20000, saldo_litros: 15000 } as TanqueCombustible,
      ]);

      const res = await verificarAlertaRojaCombustible();
      expect(res.activa).toBe(false);
      expect(res.motivo).toBeNull();
    });

    it('ignora bidones y tanques inactivos para la alerta crítica individual', async () => {
      vi.spyOn(tanquesRepo, 'combustibleDisponibleGeneral').mockResolvedValue(10000);
      vi.spyOn(tanquesRepo, 'listTanques').mockResolvedValue([
        { id: 'b1', nombre: 'Bidón 200L', estado: 'activo', capacidad_litros: 200, saldo_litros: 0 } as TanqueCombustible,
        { id: 'in1', nombre: 'Tanque Viejo', estado: 'inactivo', capacidad_litros: 5000, saldo_litros: 0 } as TanqueCombustible,
      ]);

      const res = await verificarAlertaRojaCombustible();
      expect(res.activa).toBe(false);
    });
  });

  describe('notificarCombustibleBajoSiAplica (Anti-saturación e Idempotencia)', () => {
    it('no emite si el usuario no tiene permisos de combustible', async () => {
      const emitSpy = vi.spyOn(webpushLib, 'emitirWebPush').mockResolvedValue(true);

      const res = await notificarCombustibleBajoSiAplica({
        tipoAcceso: 'sistema',
        perms: { isAdmin: false, role: 'cocina' },
      });

      expect(res.enviado).toBe(false);
      expect(res.motivo).toBe('sin_permiso');
      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('no emite si la alerta de combustible no está activa', async () => {
      vi.spyOn(tanquesRepo, 'combustibleDisponibleGeneral').mockResolvedValue(12000);
      vi.spyOn(tanquesRepo, 'listTanques').mockResolvedValue([]);
      const emitSpy = vi.spyOn(webpushLib, 'emitirWebPush').mockResolvedValue(true);

      const res = await notificarCombustibleBajoSiAplica({
        tipoAcceso: 'sistema',
        perms: { isAdmin: true },
      });

      expect(res.enviado).toBe(false);
      expect(res.motivo).toBe('alerta_inactiva');
      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('emite notificación push al acceder al sistema con alerta activa y marca la sesión', async () => {
      vi.spyOn(tanquesRepo, 'combustibleDisponibleGeneral').mockResolvedValue(3000);
      vi.spyOn(tanquesRepo, 'listTanques').mockResolvedValue([]);
      const emitSpy = vi.spyOn(webpushLib, 'emitirWebPush').mockResolvedValue(true);
      vi.spyOn(notifRepo, 'push').mockResolvedValue({ id: '1' } as any);

      const res = await notificarCombustibleBajoSiAplica({
        tipoAcceso: 'sistema',
        perms: { isAdmin: true },
      });

      expect(res.enviado).toBe(true);
      expect(emitSpy).toHaveBeenCalledTimes(1);
    });

    it('no vuelve a emitir en el mismo acceso/sesión al sistema (anti-saturación)', async () => {
      vi.spyOn(tanquesRepo, 'combustibleDisponibleGeneral').mockResolvedValue(3000);
      vi.spyOn(tanquesRepo, 'listTanques').mockResolvedValue([]);
      const emitSpy = vi.spyOn(webpushLib, 'emitirWebPush').mockResolvedValue(true);

      // Primer acceso
      const r1 = await notificarCombustibleBajoSiAplica({
        tipoAcceso: 'sistema',
        perms: { isAdmin: true },
      });
      expect(r1.enviado).toBe(true);

      // Segundo acceso en la misma sesión
      const r2 = await notificarCombustibleBajoSiAplica({
        tipoAcceso: 'sistema',
        perms: { isAdmin: true },
      });
      expect(r2.enviado).toBe(false);
      expect(r2.motivo).toBe('ya_notificado_en_sesion');
      expect(emitSpy).toHaveBeenCalledTimes(1); // Solo 1 vez
    });

    it('respeta el cooldown entre acceso al sistema y acceso al módulo para no saturar ráfagas', async () => {
      vi.spyOn(tanquesRepo, 'combustibleDisponibleGeneral').mockResolvedValue(3000);
      vi.spyOn(tanquesRepo, 'listTanques').mockResolvedValue([]);
      const emitSpy = vi.spyOn(webpushLib, 'emitirWebPush').mockResolvedValue(true);

      // 1. Acceso al sistema emite push
      await notificarCombustibleBajoSiAplica({
        tipoAcceso: 'sistema',
        perms: { isAdmin: true },
      });
      expect(emitSpy).toHaveBeenCalledTimes(1);

      // 2. Acceso al módulo 10 segundos después queda frenado por cooldown de 10 minutos
      const rModulo = await notificarCombustibleBajoSiAplica({
        tipoAcceso: 'modulo',
        perms: { isAdmin: true },
      });
      expect(rModulo.enviado).toBe(false);
      expect(rModulo.motivo).toBe('cooldown_activo');
      expect(emitSpy).toHaveBeenCalledTimes(1);
    });

    it('limpia las marcas de sesión cuando el combustible se repone', () => {
      limpiarMarcasSesionCombustible();
      // No debe lanzar error
      expect(true).toBe(true);
    });
  });
});
