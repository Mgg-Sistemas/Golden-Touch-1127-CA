/* ============================================================
   Golden Touch · RRHH · Número de ficha

   QUÉ CAMBIÓ EL 24/09/2026. El número de ficha lo ponía siempre la base
   (correlativo por nómina) y no había forma de escribirlo. Ahora se puede
   escribir AL DAR DE ALTA, con un mínimo de 3 caracteres, y una vez guardado
   YA NO SE PUEDE CAMBIAR.

   POR QUÉ ES TEXTO Y NO UN NÚMERO. Era una columna `integer`, y un entero no
   puede guardar «001»: lo guarda como 1. Con el mínimo de 3 caracteres eso
   dejaba afuera justo la forma en que se suelen escribir las fichas. Como
   texto, «001» se guarda «001» y también entra un código como «GT-07».

   POR QUÉ NO SE PUEDE MODIFICAR. El número de ficha es con lo que se identifica
   a la persona en planillas, recibos y carnets ya impresos. Si se cambia, todo
   ese papel pasa a apuntar a nadie, y el número viejo queda libre para otra
   persona: dos personas distintas con el mismo número en papeles de fechas
   distintas. Por eso se fija en el alta y después queda quieto, igual que la
   nómina a la que pertenece.
   ============================================================ */

/** Mínimo de caracteres del número de ficha. */
export const FICHA_MIN = 3;

/** Máximo, para que no entre un párrafo en un campo que va impreso en un carnet. */
export const FICHA_MAX = 12;

/**
 * Deja la ficha como se guarda: sin espacios en los bordes ni espacios
 * internos, en mayúsculas. Vacío devuelve `null`, que es lo que hace que la
 * base le asigne el correlativo siguiente.
 */
export function normalizarFicha(v?: string | null): string | null {
  const limpio = String(v ?? '').replace(/\s+/g, '').toUpperCase();
  return limpio || null;
}

/**
 * Qué está mal con la ficha escrita, o `null` si está bien.
 *
 * Dejarla vacía NO es un error: significa «que la asigne el sistema», que es
 * como venía funcionando y sigue siendo lo normal.
 */
export function errorFicha(v?: string | null): string | null {
  const f = normalizarFicha(v);
  if (f === null) return null; // vacía: la asigna la base
  if (f.length < FICHA_MIN) {
    return `El número de ficha necesita al menos ${FICHA_MIN} caracteres (por ejemplo 001). `
      + 'Si lo dejás vacío, el sistema le asigna el siguiente.';
  }
  if (f.length > FICHA_MAX) {
    return `El número de ficha no puede pasar de ${FICHA_MAX} caracteres: va impreso en el carnet.`;
  }
  if (!/^[A-Z0-9-]+$/.test(f)) {
    return 'El número de ficha solo admite letras, números y guiones.';
  }
  return null;
}

/** Texto para mostrar: «Ficha 001» o vacío si no tiene. */
export function etiquetaFicha(v?: string | null): string {
  const f = normalizarFicha(v);
  return f ? `Ficha ${f}` : '';
}

/**
 * ¿Se puede escribir la ficha de esta persona?
 *
 * Solo en el alta, o si por lo que sea quedó sin número. Una vez que tiene, no.
 * La base rechaza el cambio igual: esto es para que el campo se vea bloqueado
 * en vez de dejar escribir algo que después va a fallar al guardar.
 */
export function fichaEditable(esAlta: boolean, fichaActual?: string | null): boolean {
  return esAlta || normalizarFicha(fichaActual) === null;
}
