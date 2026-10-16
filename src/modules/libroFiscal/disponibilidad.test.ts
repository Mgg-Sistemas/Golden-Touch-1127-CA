import { beforeEach, describe, expect, it, vi } from 'vitest';

const respuestas = new Map<string, { error: unknown } | 'lanza'>();
const preguntas: { tabla: string; metodos: unknown[][] }[] = [];

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    from: (tabla: string) => {
      const reg = { tabla, metodos: [] as unknown[][] };
      preguntas.push(reg);
      const q: Record<string, unknown> = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') {
            const r = respuestas.get(tabla) ?? { error: null };
            return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
              (r === 'lanza' ? Promise.reject(new Error('sin red')) : Promise.resolve({ data: null, count: 0, ...r })).then(ok, ko);
          }
          return (...args: unknown[]) => { reg.metodos.push([prop, ...args]); return q; };
        },
      });
      return q;
    },
  },
}));

import { esTablaInexistente, olvidarDisponibilidad, r1Disponible, tablaDisponible } from './disponibilidad';

beforeEach(() => { respuestas.clear(); preguntas.length = 0; olvidarDisponibilidad(); });

describe('¿está la tabla en la base?', () => {
  it('responde: existe; pregunta con un conteo vacío, sin traer filas', async () => {
    expect(await tablaDisponible('retencion_entes')).toBe(true);
    expect(preguntas[0].metodos).toContainEqual(['select', '*', { head: true, count: 'exact' }]);
    expect(preguntas[0].metodos).toContainEqual(['limit', 0]);
  });

  it('«relation does not exist» o PGRST205: no existe', async () => {
    respuestas.set('a', { error: { code: '42P01', message: 'relation "public.a" does not exist' } });
    respuestas.set('b', { error: { code: 'PGRST205', message: "Could not find the table 'public.b' in the schema cache" } });
    expect(await tablaDisponible('a')).toBe(false);
    expect(await tablaDisponible('b')).toBe(false);
    expect(esTablaInexistente({ message: 'relation "x" does not exist' })).toBe(true);
    expect(esTablaInexistente({ code: '42501', message: 'permission denied' })).toBe(false);
  });

  it('otro rechazo de la base (sin permiso): la tabla existe', async () => {
    respuestas.set('c', { error: { code: '42501', message: 'permission denied for table c' } });
    expect(await tablaDisponible('c')).toBe(true);
  });

  it('se pregunta una sola vez por sesión', async () => {
    await tablaDisponible('retencion_entes');
    await tablaDisponible('retencion_entes');
    expect(preguntas).toHaveLength(1);
  });

  it('sin red: no, y vuelve a preguntar la próxima vez', async () => {
    respuestas.set('d', 'lanza');
    expect(await tablaDisponible('d')).toBe(false);
    respuestas.delete('d');
    expect(await tablaDisponible('d')).toBe(true);
    expect(preguntas).toHaveLength(2);
  });

  it('R1 está si están entes y perfiles', async () => {
    expect(await r1Disponible()).toBe(true);
    olvidarDisponibilidad();
    respuestas.set('retencion_contraparte_perfiles', { error: { code: 'PGRST205', message: 'Could not find the table' } });
    expect(await r1Disponible()).toBe(false);
  });
});
