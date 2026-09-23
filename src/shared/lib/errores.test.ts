import { describe, expect, it } from 'vitest';
import { mensajeError, motivoDeEdgeFunction } from './errores';

describe('mensajeError · lo que ya hacía', () => {
  it('un Error devuelve su mensaje', () => {
    expect(mensajeError(new Error('No hay saldo en la caja'), 'Falló')).toBe('No hay saldo en la caja');
  });
  it('un error de Supabase suma el hint, que es la parte útil', () => {
    expect(mensajeError({ message: 'violates check constraint', hint: 'Revisá el estado' }, 'Falló'))
      .toBe('violates check constraint · Revisá el estado');
  });
  it('sin mensaje, al menos dice el código', () => {
    expect(mensajeError({ code: '23514' }, 'No se pudo pagar.')).toBe('No se pudo pagar. (código 23514)');
  });
  it('sin nada, el texto de reserva', () => {
    expect(mensajeError(null, 'No se pudo cargar')).toBe('No se pudo cargar');
  });
});

describe('mensajeError · timeout del servidor', () => {
  // Lo que veía el usuario: «canceling statement due to statement timeout»,
  // en inglés, dentro de un aviso rojo y sin nada que pudiera hacer.
  const crudo = 'canceling statement due to statement timeout';

  it('lo traduce por el código de Postgres', () => {
    const m = mensajeError({ code: '57014', message: crudo }, 'Falló');
    expect(m).toMatch(/tardó más de lo que el servidor permite/);
    expect(m).toMatch(/achicá el rango/);
    expect(m).not.toMatch(/canceling statement/);
  });

  it('lo traduce aunque no venga el código', () => {
    expect(mensajeError({ message: crudo }, 'Falló')).toMatch(/tardó más de lo que el servidor permite/);
  });

  it('lo traduce cuando llega como texto suelto', () => {
    expect(mensajeError(crudo, 'Falló')).toMatch(/tardó más de lo que el servidor permite/);
  });

  it('dice qué hacer si ya se acotó el rango', () => {
    expect(mensajeError({ code: '57014', message: crudo }, 'Falló')).toMatch(/avisá/);
  });

  it('la traducción pisa el hint crudo: es el mismo error mejor dicho', () => {
    const m = mensajeError({ code: '57014', message: crudo, hint: 'increase statement_timeout' }, 'Falló');
    expect(m).not.toMatch(/statement_timeout/);
  });
});

describe('mensajeError · conexión cortada', () => {
  it('traduce la caída de conexión', () => {
    expect(mensajeError({ code: '08006', message: 'connection terminated unexpectedly' }, 'Falló'))
      .toMatch(/Se cortó la conexión/);
  });
  it('avisa de verificar si el cambio quedó', () => {
    expect(mensajeError({ code: '08003', message: 'connection does not exist' }, 'Falló'))
      .toMatch(/verificá antes si el cambio quedó/);
  });
});

describe('mensajeError · lo que NO se traduce', () => {
  it('un error desconocido pasa tal cual, para poder buscarlo', () => {
    const m = mensajeError({ code: '23505', message: 'duplicate key value violates unique constraint' }, 'Falló');
    expect(m).toBe('duplicate key value violates unique constraint');
  });
});

describe('motivoDeEdgeFunction · el «non-2xx» deja de tapar la causa', () => {
  // Así es como llega: supabase-js pone siempre el mismo mensaje inútil y
  // guarda la respuesta real en `context`.
  const comoLlega = (cuerpo: unknown) => ({
    message: 'Edge Function returned a non-2xx status code',
    context: { json: async () => cuerpo },
  });

  it('saca el motivo del cuerpo de la respuesta', async () => {
    const m = await motivoDeEdgeFunction(comoLlega({ error: 'Tipo de adjunto no permitido' }), 'Falló');
    expect(m).toBe('Tipo de adjunto no permitido');
  });

  it('el motivo real pisa al «non-2xx»', async () => {
    const m = await motivoDeEdgeFunction(comoLlega({ error: 'Alcanzaste el límite de correos por hora.' }), 'Falló');
    expect(m).not.toMatch(/non-2xx/);
  });

  it('si el cuerpo no trae motivo, queda el mensaje del error', async () => {
    const m = await motivoDeEdgeFunction(comoLlega({ ok: true }), 'Falló');
    expect(m).toBe('Edge Function returned a non-2xx status code');
  });

  it('si el cuerpo no es JSON no rompe', async () => {
    const roto = {
      message: 'Edge Function returned a non-2xx status code',
      context: { json: async () => { throw new SyntaxError('no es JSON'); } },
    };
    await expect(motivoDeEdgeFunction(roto, 'Falló')).resolves.toBe('Edge Function returned a non-2xx status code');
  });

  it('un error sin `context` se comporta como siempre', async () => {
    await expect(motivoDeEdgeFunction(new Error('Se cayó la red'), 'Falló')).resolves.toBe('Se cayó la red');
    await expect(motivoDeEdgeFunction(null, 'No se pudo enviar')).resolves.toBe('No se pudo enviar');
  });
});
