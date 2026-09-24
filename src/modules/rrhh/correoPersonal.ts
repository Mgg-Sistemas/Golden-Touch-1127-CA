/* ============================================================
   Golden Touch · RRHH · Correo del trabajador

   El correo de la PERSONA (no el de la empresa: ese vive en
   `shared/lib/empresa.ts` y es el que sale impreso en los documentos).

   La regla de verdad está en la base: un trigger que pasa a minúsculas y
   recorta, y un CHECK con esta misma forma mínima. Acá se repite para poder
   avisar mientras se escribe, en castellano, en vez de que el guardado
   explote con un mensaje de Postgres que no le dice nada a nadie.
   ============================================================ */

/**
 * Forma mínima de un correo: algo, arroba, algo, punto, algo; sin espacios.
 * No comprueba que exista —eso solo lo diría mandarle un mensaje—, sí que no
 * sea cualquier cosa. Es la MISMA expresión del CHECK `personal_correo_ck`.
 */
const RX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Minúsculas y sin espacios. Vacío es `null`: «sin correo» no es «''». */
export function normalizarCorreo(v?: string | null): string | null {
  const limpio = (v ?? '').trim().toLowerCase();
  return limpio || null;
}

/** Devuelve el problema del correo, o `null` si está bien (vacío está bien). */
export function errorCorreo(v?: string | null): string | null {
  const correo = normalizarCorreo(v);
  if (!correo) return null; // el correo no es obligatorio
  if (!RX_CORREO.test(correo)) return 'El correo no parece válido. Revisá que tenga arroba y dominio (ej. nombre@gmail.com).';
  return null;
}
