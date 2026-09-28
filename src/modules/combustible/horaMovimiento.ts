/* ============================================================
   Golden Touch · Combustible · La hora de un movimiento del tanque

   El libro mayor se ordena por FECHA y, dentro del día, por HORA. El saldo
   corrido, el encadenado de contador y horómetro y el Excel salen de ese
   orden, así que una hora mal leída corre todo un día entero.

   Por qué esto vive acá y no adentro del repositorio (28/09/2026): revisando
   el Excel de combustible aparecieron TRES cosas que desordenaban el libro.

   1) HORAS A LAS QUE LES FALTA LA LETRA. En la base hay ocho filas con
      «6:42:08 M», «2:02:00 M», «07:45:00 M»: se perdió la A o la P del AM/PM.
      La versión anterior no las entendía y las mandaba al PRINCIPIO del día,
      con las que no tienen hora. Una carga de las seis de la tarde aparecía
      antes que una de las siete de la mañana. Ahora la hora se lee igual, sin
      el sufijo: no se inventa si era mañana o tarde —eso hay que corregirlo a
      mano—, pero al menos cae en su lugar aproximado y no al amanecer.

   2) HORAS DE 24 CON SUFIJO. «13:43:43 PM», «14:04:33 PM». Se leen por el
      número, que ya dice todo; el sufijo sobra y no las mueve.

   3) EL EMPATE. Las filas sin hora del mismo día empataban en todo, y el
      desempate quedaba en manos del orden en que la base devolviera las
      filas, que NO es fijo. Por eso el mismo tanque salía con un saldo en una
      lectura y con otro en la siguiente. `compararMovimientos` cierra el
      empate con datos de la fila, así el orden es siempre el mismo.
   ============================================================ */

/** Sin hora: queda primero del día (es lo más viejo que se puede suponer). */
export const SIN_HORA = -1;

/**
 * La hora como segundos desde medianoche, para ordenar.
 *
 * Acepta 12 y 24 horas, con o sin segundos, con «AM»/«PM», con «a. m.», y con
 * la «M» suelta de los registros a los que se les perdió la letra.
 */
export function horaOrden(h: string | null | undefined): number {
  if (!h) return SIN_HORA;
  const m = h.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(?:([AaPp])?\s*\.?\s*[Mm]\.?)?\s*$/);
  if (!m) return SIN_HORA;
  let hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3] ?? 0);
  if (hh > 23 || mm > 59 || ss > 59) return SIN_HORA;
  const ap = (m[4] ?? '').toUpperCase();
  // El sufijo solo mueve la hora si el número es de reloj de 12. «13:43 PM» ya
  // dice 13: aplicarle el PM daría 25.
  if (ap === 'P' && hh < 12) hh += 12;
  if (ap === 'A' && hh === 12) hh = 0;
  return hh * 3600 + mm * 60 + ss;
}

/** ¿Es una hora que el sistema entiende? Las que no, se listan para corregir. */
export function horaLegible(h: string | null | undefined): boolean {
  return !h || horaOrden(h) !== SIN_HORA;
}

/** ¿Le falta la A o la P del AM/PM? (los «6:42:08 M» que hay que revisar) */
export function horaSinAmPm(h: string | null | undefined): boolean {
  if (!h) return false;
  return /^\s*\d{1,2}:\d{2}(:\d{2})?\s*[Mm]\.?\s*$/.test(h) && !/[AaPp]\s*\.?\s*[Mm]/.test(h);
}

/** Lo mínimo para ordenar una fila del libro mayor. */
export interface FilaOrdenable {
  fecha?: string | null;
  hora?: string | null;
  /** Posición dentro del día, si alguien la fijó a mano. */
  orden?: number | null;
  created_at?: string | null;
  id?: string | null;
}

/**
 * El orden del libro mayor: fecha, hora, `orden`, cuándo se cargó y, por
 * último, el id.
 *
 * Los dos últimos son el desempate que faltaba. Sin ellos, las filas
 * importadas de un mismo día —misma fecha, sin hora, mismo `orden`, mismo
 * instante de carga— quedaban en el orden en que la base las devolviera, que
 * cambia entre lecturas: el saldo corrido, los medidores encadenados y el
 * Excel salían distintos cada vez sin que nadie hubiera tocado nada.
 */
export function compararMovimientos(a: FilaOrdenable, b: FilaOrdenable): number {
  const f = (a.fecha ?? '').localeCompare(b.fecha ?? '');
  if (f !== 0) return f;
  const h = horaOrden(a.hora) - horaOrden(b.hora);
  if (h !== 0) return h;
  const o = (Number(a.orden) || 0) - (Number(b.orden) || 0);
  if (o !== 0) return o;
  const c = (a.created_at ?? '').localeCompare(b.created_at ?? '');
  if (c !== 0) return c;
  return (a.id ?? '').localeCompare(b.id ?? '');
}

/**
 * La fecha «AAAA-MM-DD» como Date de MEDIODÍA UTC.
 *
 * A mediodía a propósito: `new Date('2026-09-25')` es medianoche UTC, y al
 * escribirla en un Excel desde Venezuela (UTC−4) se convierte a las 20:00 del
 * día ANTERIOR y la celda muestra 24/09. Es el desfase de un día clásico.
 * Desde el mediodía, ningún huso del mundo la corre de día.
 */
export function fechaParaExcel(f: string | null | undefined): Date | null {
  const d = String(f ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return new Date(`${d}T12:00:00Z`);
}

/* ───────── El campo de hora de la pantalla (28/09/2026) ─────────
   El campo era de texto libre y con eso entraron los «6:42:08 M» y los
   «13:43:43 PM». Ahora es un selector de hora del navegador, que en el
   teléfono abre el reloj. Adentro habla en 24 h («16:00:44»); afuera, el
   sistema entero muestra «4:00:44 PM», que es como está guardado el 95 % de
   los datos. Estas dos funciones traducen entre los dos, para no tener que
   tocar cada lugar donde se muestra la hora. */

/** La hora guardada → lo que entiende un <input type="time"> («16:00:44»). */
export function horaAInput(h: string | null | undefined): string {
  const seg = horaOrden(h);
  if (seg === SIN_HORA) return '';
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(Math.floor(seg / 3600))}:${dos(Math.floor((seg % 3600) / 60))}:${dos(seg % 60)}`;
}

/** Lo que devuelve un <input type="time"> → la hora como la guarda el sistema. */
export function horaDesdeInput(v: string | null | undefined): string {
  const t = String(v ?? '').trim();
  if (!t) return '';
  const seg = horaOrden(t);
  if (seg === SIN_HORA) return '';
  const h24 = Math.floor(seg / 3600);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${h12}:${dos(Math.floor((seg % 3600) / 60))}:${dos(seg % 60)} ${h24 < 12 ? 'AM' : 'PM'}`;
}
