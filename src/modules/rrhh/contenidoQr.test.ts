import { describe, it, expect } from 'vitest';
import { contenidoQrPersona } from './carnetPersonal';
import type { Personal } from '@/shared/lib/types';

const p = (extra: Partial<Personal>): Personal => ({
  id: '1', empresa: 'GT', nombre: 'ANA', apellido: 'PÉREZ', sueldo_base: 0, activo: true, created_at: '2026-01-01', ...extra,
});

describe('QR del carnet', () => {
  it('lleva el enlace a /c/<token>, que decide qué mostrar al escanear', () => {
    expect(contenidoQrPersona(p({ carnet_token: 'abc' }), 'https://sistema.goldentouch1127.com'))
      .toBe('https://sistema.goldentouch1127.com/c/abc');
  });
  it('sin token queda el texto de antes', () => {
    expect(contenidoQrPersona(p({ carnet_token: null }), 'https://x')).toContain('Nombre: ANA PÉREZ');
  });
});
