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

/** Texto legible de cualquier error: `Error`, error de Supabase/PostgREST o string. */
export function mensajeError(err: unknown, fallback: string): string {
  if (typeof err === 'string' && err.trim()) return err.trim();
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; hint?: unknown; details?: unknown; code?: unknown };
    const msg = typeof e.message === 'string' ? e.message.trim() : '';
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
