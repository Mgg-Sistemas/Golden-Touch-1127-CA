/* ============================================================
   Golden Touch · RRHH · Condiciones de salud del trabajador

   Dos preguntas de la hoja de ingreso que antes se quedaban en el papel:
   ¿padece alguna alergia? y ¿padece alguna enfermedad?, cada una con su
   detalle. Ahora se cargan en la ficha, salen en la ficha técnica y van en
   el QR del carnet, que es para lo que sirven: quien asiste a alguien
   accidentado escanea el carnet y ve a qué no puede ser alérgico.

   POR QUÉ EL «SÍ / NO» ES UN BOOLEANO QUE ADMITE NULO. Son TRES estados, no
   dos: sí, no, y «no se preguntó todavía». Mostrar «No tiene alergias» por
   una ficha que nadie completó sería peor que no mostrar nada, porque se
   actúa como si el dato estuviera confirmado.

   EL DETALLE VIVE COLGADO DEL «SÍ». Si la respuesta pasa a «no», el detalle
   se borra: un «alérgico a la penicilina» guardado bajo un «no tiene
   alergias» hace que el papel diga una cosa y la pantalla otra. Esto también
   lo hace la base (trigger `personal_normaliza_salud` + CHECK), así que no
   hay camino por el que queden en desacuerdo.
   ============================================================ */

/** Una de las dos condiciones: la respuesta y, si es «sí», el detalle. */
export interface Condicion {
  tiene: boolean | null;
  detalle: string | null;
}

/** Deja la condición como se guarda: sin espacios, y sin detalle si no es «sí». */
export function normalizarCondicion(tiene?: boolean | null, detalle?: string | null): Condicion {
  const si = tiene === true ? true : tiene === false ? false : null;
  const texto = (detalle ?? '').trim();
  return { tiene: si, detalle: si === true && texto ? texto : null };
}

/** «Sí», «No» o «—» cuando nadie lo preguntó. */
export function etiquetaSiNo(v?: boolean | null): string {
  if (v === true) return 'Sí';
  if (v === false) return 'No';
  return '—';
}

/**
 * La condición escrita para mostrar: «Sí · penicilina», «No», o «—».
 *
 * Un «sí» sin detalle sale como «Sí (sin detallar)»: es una respuesta
 * incompleta, y decir solamente «Sí» parecería que no hay nada más que saber.
 */
export function textoCondicion(tiene?: boolean | null, detalle?: string | null): string {
  const c = normalizarCondicion(tiene, detalle);
  if (c.tiene === null) return '—';
  if (c.tiene === false) return 'No';
  return c.detalle ? `Sí · ${c.detalle}` : 'Sí (sin detallar)';
}

/** ¿Hay algo cargado de salud? Sirve para no mostrar un bloque vacío. */
export function haySalud(p: {
  tiene_alergias?: boolean | null; tiene_enfermedad?: boolean | null;
}): boolean {
  return p.tiene_alergias !== null && p.tiene_alergias !== undefined
    || p.tiene_enfermedad !== null && p.tiene_enfermedad !== undefined;
}

/**
 * Las líneas de salud que van DENTRO del QR del carnet.
 *
 * Solo lo que se sabe: lo que nadie contestó no aparece, porque en el QR no
 * hay lugar para renglones que no dicen nada. El «no» sí aparece: en una
 * emergencia, saber que no tiene alergias también sirve.
 */
export function lineasSaludQr(p: {
  tiene_alergias?: boolean | null; alergias_detalle?: string | null;
  tiene_enfermedad?: boolean | null; enfermedad_detalle?: string | null;
}): string[] {
  const lineas: string[] = [];
  const al = normalizarCondicion(p.tiene_alergias, p.alergias_detalle);
  if (al.tiene !== null) lineas.push(`Alergias: ${al.tiene ? (al.detalle ?? 'SÍ') : 'no'}`);
  const en = normalizarCondicion(p.tiene_enfermedad, p.enfermedad_detalle);
  if (en.tiene !== null) lineas.push(`Enfermedad: ${en.tiene ? (en.detalle ?? 'SÍ') : 'no'}`);
  return lineas;
}
