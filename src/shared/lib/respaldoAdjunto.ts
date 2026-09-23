/* ============================================================
   Golden Touch · El respaldo que viaja por correo

   El 23/09/2026 el envío por correo devolvía «Edge Function returned
   a non-2xx status code». En los registros el estado era 413
   (Payload Too Large): la petición ni llegaba a nuestro código.

   La cuenta: el volcado de la base son ~15 MB de texto, y un adjunto
   viaja en base64, que agranda todo un 33 % → ~20 MB. Ni el portón de
   las Edge Functions ni Brevo (tope de 10 MB por correo) aceptan eso.

   Por eso el respaldo se comprime antes de enviarse. Un .sql es texto
   muy repetitivo y baja alrededor de diez veces. Se empaqueta en ZIP
   y no en GZIP porque Brevo filtra por extensión y acepta `.zip`,
   igual que antes había que mandar `.sql` como `.sql.txt`.

   La descarga manual NO pasa por acá: baja el .sql tal cual, sin
   comprimir y sin límite de tamaño, porque no cruza ningún servidor.
   ============================================================ */

/**
 * Tope del adjunto, medido sobre el archivo (no sobre su base64).
 *
 * Es el mismo número que `MAX_ADJUNTO_BYTES` en
 * `supabase/functions/_shared/brevo.ts`: quien corta de verdad es el servidor,
 * así que el aviso de acá tiene que usar su misma vara. Si allá cambia, acá
 * también.
 */
export const TOPE_ADJUNTO_BYTES = 8 * 1024 * 1024;

/** Cuánto ocupa en base64 algo de `bytes` bytes: crece un tercio, redondeando de a 4. */
export function tamanoEnBase64(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

/** Tamaño legible, para poder decirle al usuario un número y no «es muy grande». */
export function enMegas(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Nombre del .sql que va adentro del ZIP. */
export function nombreSqlRespaldo(fecha: string, automatico: boolean): string {
  return `gt-respaldo${automatico ? '-auto' : ''}-${fecha}.sql`;
}

/** Nombre del ZIP adjunto. */
export function nombreZipRespaldo(fecha: string, automatico: boolean): string {
  return `gt-respaldo${automatico ? '-auto' : ''}-${fecha}.zip`;
}

/**
 * Aviso si el respaldo comprimido igual no entra en un correo, o `null` si entra.
 *
 * Existe para que el día que la base crezca lo suficiente esto NO vuelva a
 * fallar con un 413 indescifrable: se corta antes, se dice el tamaño real y
 * se indica la salida (la descarga manual, que no tiene este límite).
 */
export function avisoSiNoEntraEnCorreo(bytesZip: number): string | null {
  if (bytesZip <= TOPE_ADJUNTO_BYTES) return null;
  return `El respaldo comprimido pesa ${enMegas(bytesZip)} y el correo admite hasta `
    + `${enMegas(TOPE_ADJUNTO_BYTES)}, así que no se puede enviar por esa vía. `
    + 'Usá «Descargar» en esta misma ventana: baja el archivo completo sin límite de tamaño. '
    + 'Avisá que pasó esto, porque significa que la base creció y hay que darle otra salida al respaldo automático.';
}
