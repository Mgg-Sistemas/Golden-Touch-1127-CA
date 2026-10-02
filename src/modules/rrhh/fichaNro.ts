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

   POR QUÉ NO SE PODÍA MODIFICAR. El número de ficha es con lo que se identifica
   a la persona en planillas, recibos y carnets ya impresos. Si se cambia, todo
   ese papel pasa a apuntar a nadie, y el número viejo queda libre para otra
   persona: dos personas distintas con el mismo número en papeles de fechas
   distintas. Por eso se fijaba en el alta y después quedaba quieto.

   QUÉ CAMBIÓ EL 02/10/2026. Se pidió poder editarlo: hay fichas cargadas con
   el número equivocado y no había forma de corregirlas. Ahora se cambia desde
   ✎ Editar, con las mismas reglas del alta (3 a 12 caracteres, letras, números
   y guiones). Lo que sigue sin poderse: dejar SIN ficha a quien ya tiene, y
   repetirla dentro de la misma nómina. El riesgo de arriba sigue siendo cierto,
   así que la pantalla avisa que el papel ya impreso queda con el número viejo.
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
      + 'Si lo dejas vacío, el sistema le asigna el siguiente.';
  }
  if (f.length > FICHA_MAX) {
    return `El número de ficha no puede pasar de ${FICHA_MAX} caracteres: va impreso en el carnet.`;
  }
  if (!/^[A-Z0-9-]+$/.test(f)) {
    return 'El número de ficha solo admite letras, números y guiones.';
  }
  return null;
}

/**
 * Compara dos fichas para ORDENAR la lista de personal.
 *
 * No alcanza con comparar el texto: así «10» queda antes que «2», porque
 * «1» es menor que «2» letra por letra. Se parte en tramos de números y de
 * letras, y los números se comparan COMO NÚMEROS. Con eso, 2 < 10 < GT-07, y
 * «001» y «1» quedan juntos (que son la misma ficha escrita distinto).
 *
 * Quien no tiene ficha va AL FINAL: es lo que falta cargar, no el número cero.
 */
const TRAMOS = /\d+|\D+/g;

export function compararFicha(a?: string | null, b?: string | null): number {
  const x = normalizarFicha(a);
  const y = normalizarFicha(b);
  if (x === null || y === null) return x === y ? 0 : (x === null ? 1 : -1);

  const tx = x.match(TRAMOS) ?? [];
  const ty = y.match(TRAMOS) ?? [];
  const hasta = Math.min(tx.length, ty.length);
  for (let i = 0; i < hasta; i++) {
    const p = tx[i];
    const q = ty[i];
    const pNum = /^\d/.test(p);
    const qNum = /^\d/.test(q);
    if (pNum !== qNum) return pNum ? -1 : 1;  // los números antes que las letras
    if (pNum) {
      const d = Number(p) - Number(q);
      if (d !== 0) return d;
      // Mismo número escrito distinto («001» y «1»): el más corto primero,
      // para que el orden sea siempre el mismo y no dependa del azar.
      if (p.length !== q.length) return p.length - q.length;
    } else {
      const d = p.localeCompare(q, 'es-VE');
      if (d !== 0) return d;
    }
  }
  return tx.length - ty.length;
}

/** Texto para mostrar: «Ficha 001» o vacío si no tiene. */
export function etiquetaFicha(v?: string | null): string {
  const f = normalizarFicha(v);
  return f ? `Ficha ${f}` : '';
}

/**
 * La ficha como se compara para saber si está REPETIDA: los números van sin los
 * ceros de la izquierda, así «001», «01» y «0001» son la misma ficha. Un código
 * con letras («GT-07») se compara tal cual. La base tiene la misma regla en el
 * índice único `personal_ficha_clave_uk`.
 */
export function claveFicha(v?: string | null): string | null {
  const f = normalizarFicha(v);
  if (f === null) return null;
  return /^\d+$/.test(f) ? f.replace(/^0+/, '') : f;
}

/** ¿Son la misma ficha? Dos vacías NO: quien no tiene ficha no repite la de nadie. */
export function mismaFicha(a?: string | null, b?: string | null): boolean {
  const x = claveFicha(a);
  return x !== null && x === claveFicha(b);
}

/**
 * Qué está mal con la ficha al EDITAR a alguien, o `null` si está bien.
 *
 * La ficha se puede cambiar por otra. Lo único que no se puede es dejar sin
 * número a quien ya tiene: la base lo rechaza igual, esto es para avisarlo
 * antes de guardar. A quien todavía no tiene, vacío lo deja como está.
 */
export function errorFichaEdicion(nueva?: string | null, actual?: string | null): string | null {
  if (normalizarFicha(nueva) !== null) return errorFicha(nueva);
  const antes = normalizarFicha(actual);
  if (antes === null) return null;
  return `El número de ficha no puede quedar vacío: esta persona tiene la ${antes}. Se puede cambiar por otro, pero no borrar.`;
}

/** ¿Se le está cambiando la ficha a alguien que ya tenía una? Es para avisar antes de guardar. */
export function fichaCambia(nueva?: string | null, actual?: string | null): boolean {
  const antes = normalizarFicha(actual);
  const ahora = normalizarFicha(nueva);
  return antes !== null && ahora !== null && antes !== ahora;
}
