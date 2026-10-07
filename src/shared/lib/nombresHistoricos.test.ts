import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));
import { nombreEnFecha, type CambioNombre } from './nombresHistoricos';

const cambio = (p: Partial<CambioNombre>): CambioNombre => ({
  id: 'c', usuario_id: 'u1', email: 'ana@gt.com', nombre_anterior: null, apellido_anterior: null,
  nombre_nuevo: null, apellido_nuevo: null, motivo: 'm', cambiado_por: null, cambiado_por_nombre: null,
  cambiado_en: '2026-10-01T12:00:00Z', ...p,
});

// Ana Pérez → Ana Gómez (01/10) → Ana María Gómez (05/10).
const cambios = [
  cambio({ id: '1', nombre_anterior: 'Ana', apellido_anterior: 'Pérez', nombre_nuevo: 'Ana', apellido_nuevo: 'Gómez', cambiado_en: '2026-10-01T12:00:00Z' }),
  cambio({ id: '2', nombre_anterior: 'Ana', apellido_anterior: 'Gómez', nombre_nuevo: 'Ana María', apellido_nuevo: 'Gómez', cambiado_en: '2026-10-05T12:00:00Z' }),
];

describe('nombreEnFecha', () => {
  it('antes del primer cambio: el nombre original', () => {
    expect(nombreEnFecha('ANA@gt.com', 'Ana María Gómez', '2026-09-20T08:00:00Z', cambios)).toBe('Ana Pérez');
  });
  it('entre los dos cambios: el nombre intermedio', () => {
    expect(nombreEnFecha('ana@gt.com', 'Ana María Gómez', '2026-10-03', cambios)).toBe('Ana Gómez');
  });
  it('después del último cambio o sin fecha: el actual', () => {
    expect(nombreEnFecha('ana@gt.com', 'Ana María Gómez', '2026-10-06', cambios)).toBe('Ana María Gómez');
    expect(nombreEnFecha('ana@gt.com', 'Ana María Gómez', null, cambios)).toBe('Ana María Gómez');
  });
  it('otro correo no se ve afectado', () => {
    expect(nombreEnFecha('luis@gt.com', 'Luis Díaz', '2026-09-01', cambios)).toBe('Luis Díaz');
  });
});
