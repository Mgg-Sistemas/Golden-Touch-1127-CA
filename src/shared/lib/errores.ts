/* ============================================================
   Golden Touch · Mensaje de un error, venga de donde venga

   Supabase NO tira `Error`. Tira un objeto pelado
   `{ message, code, details, hint }`. Por eso el clásico

       err instanceof Error ? err.message : 'No se pudo pagar.'

   se comía la causa real y dejaba al usuario con una frase
   genérica que no dice nada y que a nosotros no nos deja
   rastrear el problema. El 10/09/2026 eso escondió durante
   horas un `23514 · violates check constraint` que impedía
   pagar las órdenes de mantenimiento viejas.

   `mensajeError` lee el mensaje de las dos formas y, si hay,
   agrega el `hint` de Postgres, que suele ser la parte útil.
   ============================================================ */

/**
 * Errores de Postgres que salían en inglés y en su jerga. El usuario leía
 * «canceling statement due to statement timeout» dentro de un aviso rojo y no
 * tenía forma de saber ni qué pasó ni qué hacer; nosotros tampoco ganábamos
 * nada, porque el texto crudo no dice qué consulta fue.
 *
 * Se traduce solo lo que la persona PUEDE resolver desde la pantalla. El resto
 * sigue pasando tal cual: un mensaje raro que se pueda buscar es mejor que uno
 * bonito que esconda la causa.
 */
function traducirPostgres(codigo: string, mensaje: string): string | null {
  const m = mensaje.toLowerCase();
  // 57014 · statement_timeout. El servidor corta la consulta a los pocos
  // segundos; casi siempre es un rango de fechas enorme o un listado sin filtrar.
  if (codigo === '57014' || m.includes('statement timeout') || m.includes('canceling statement')) {
    return 'La consulta tardó más de lo que el servidor permite y se canceló. '
      + 'Suele pasar al pedir un rango de fechas muy largo o una lista sin filtrar: '
      + 'achicá el rango (o filtrá por lo que estés buscando) y volvé a intentar. '
      + 'Si sigue pasando con un rango corto, avisá: hay que revisarlo del lado del servidor.';
  }
  // 08006 / 08003 · se cortó la conexión con la base.
  if (codigo === '08006' || codigo === '08003' || m.includes('connection terminated')) {
    return 'Se cortó la conexión con el servidor. Revisá internet y volvé a intentar; '
      + 'si estabas guardando, verificá antes si el cambio quedó.';
  }
  return null;
}

/** Texto legible de cualquier error: `Error`, error de Supabase/PostgREST o string. */
export function mensajeError(err: unknown, fallback: string): string {
  if (typeof err === 'string' && err.trim()) {
    return traducirPostgres('', err) ?? err.trim();
  }
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; hint?: unknown; details?: unknown; code?: unknown };
    const msg = typeof e.message === 'string' ? e.message.trim() : '';
    const cod = typeof e.code === 'string' ? e.code.trim() : '';
    // La traducción manda sobre el texto crudo: es el mismo error, dicho de una
    // forma con la que se puede hacer algo.
    const traducido = traducirPostgres(cod, msg);
    if (traducido) return traducido;
    const hint = typeof e.hint === 'string' ? e.hint.trim() : '';
    const det = typeof e.details === 'string' ? e.details.trim() : '';
    // El `details` solo se suma si aporta algo distinto del mensaje.
    const extra = [hint, det && det !== msg ? det : ''].filter(Boolean).join(' · ');
    if (msg) return extra ? `${msg} · ${extra}` : msg;
    if (extra) return `${fallback} ${extra}`;
    const code = typeof e.code === 'string' ? e.code.trim() : '';
    if (code) return `${fallback} (código ${code})`;
  }
  return fallback;
}
