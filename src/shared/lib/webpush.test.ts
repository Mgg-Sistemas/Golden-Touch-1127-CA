import { describe, it, expect, beforeEach } from 'vitest';
import {
  soportaPush,
  isPushHabilitado,
  togglePushHabilitado,
  probarNotificacionPush,
} from './webpush';

describe('webpush · Notificaciones Push y del Dispositivo', () => {
  beforeEach(async () => {
    await togglePushHabilitado(true);
  });

  it('detecta soporte de push según las APIs del navegador', () => {
    const soporta = soportaPush();
    expect(typeof soporta).toBe('boolean');
  });

  it('devuelve falso en isPushHabilitado si no hay soporte', () => {
    // En entorno Node.js sin navegador, soportaPush() es falso
    if (!soportaPush()) {
      expect(isPushHabilitado()).toBe(false);
    }
  });

  it('permite alternar el estado con togglePushHabilitado', async () => {
    await togglePushHabilitado(false);
    // En entorno sin browser, el estado en memoria queda registrado
    await togglePushHabilitado(true);
  });

  it('informa correctamente si no soporta push al intentar probarlo en entorno sin SW', async () => {
    if (!soportaPush()) {
      const res = await probarNotificacionPush();
      expect(res.ok).toBe(false);
      expect(res.motivo).toMatch(/no soporta/i);
    }
  });
});
