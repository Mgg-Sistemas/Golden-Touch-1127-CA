/* ============================================================
   Golden Touch · Pago de OC · aviso de "pago hecho, datos faltantes"

   Pagar una OC son tres pasos: se marca la OC como pagada (reserva atómica
   contra el doble cobro), sale la plata de la caja y se guardan en la OC los
   datos del pago. Si falla SOLO el tercero, la plata ya salió: decirle al
   usuario «No se pudo pagar» lo empuja a pagar dos veces. Por eso ese caso
   tiene su propio aviso, y la pantalla lo muestra como advertencia y da la
   orden por pagada.
   ============================================================ */

export const MENSAJE_PAGO_REGISTRADO_SIN_DATOS =
  'EL PAGO SÍ SE REALIZÓ: la plata salió de la caja y la orden quedó pagada. '
  + 'Lo que no se pudo guardar fueron los datos del pago (comprobante y adjuntos). '
  + 'NO vuelvas a pagarla: abrí el detalle de la OC y volvé a subir el comprobante.';

export const NOMBRE_PAGO_REGISTRADO_SIN_DATOS = 'PagoRegistradoSinDatos';

/** ¿Este error es un pago YA realizado al que solo le faltaron los datos?
 *  Se reconoce por `name` y no con `instanceof`: así sigue funcionando aunque
 *  el error viaje entre módulos o se reconstruya. */
export function esPagoRegistradoSinDatos(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { name?: unknown }).name === NOMBRE_PAGO_REGISTRADO_SIN_DATOS;
}
