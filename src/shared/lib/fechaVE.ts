/* ============================================================
   Golden Touch · Fechas en formato venezolano (DD-MM-AAAA)

   El selector nativo del navegador escribe la fecha en el formato del
   IDIOMA DEL SISTEMA: en una máquina en inglés, 21 de octubre sale como
   10-21-1973, que acá se lee como «21 de mes 10» — o directamente no se
   puede escribir a mano. Estas funciones dejan tipear en DD-MM-AAAA y
   traducen a lo que guarda la base (AAAA-MM-DD), sin tocar el calendario,
   que se sigue pudiendo abrir.

   Todo se hace con texto, sin pasar por `Date`: construir un Date con una
   fecha suelta la corre un día según la zona horaria.
   ============================================================ */

/** Los días que tiene cada mes, contemplando el año bisiesto. */
function diasDelMes(mes: number, anio: number): number {
  if (mes === 2) return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(mes) ? 30 : 31;
}

/** ¿`AAAA-MM-DD` es una fecha que existe? (31/02 no existe, aunque «parezca»). */
export function fechaIsoValida(iso: string | null | undefined): boolean {
  const s = String(iso ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [a, m, d] = s.split('-').map(Number);
  if (a < 1900 || a > 2200) return false;
  if (m < 1 || m > 12) return false;
  return d >= 1 && d <= diasDelMes(m, a);
}

/** `AAAA-MM-DD` → `DD-MM-AAAA`. Vacío si no hay fecha. */
export function isoAVe(iso: string | null | undefined): string {
  const s = String(iso ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  return `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}`;
}

/**
 * `DD-MM-AAAA` → `AAAA-MM-DD`, o `null` si todavía no es una fecha completa
 * y válida. Acepta cualquier separador (21/10/1973, 21.10.1973) —así lo ya
 * escrito con barras y lo pegado de otro lado siguen entrando— y un solo
 * dígito en día o mes (1-3-1990), que es como la gente escribe de apuro.
 */
export function veAIso(texto: string | null | undefined): string | null {
  const t = String(texto ?? '').trim();
  const m = /^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{4})$/.exec(t);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return fechaIsoValida(iso) ? iso : null;
}

/**
 * Da forma a lo que se está tecleando: deja solo dígitos y va poniendo los
 * guiones solos. No valida todavía —mientras se escribe, «2» es un día que
 * puede terminar en 21— solo acomoda.
 */
export function formatearMientrasEscribe(texto: string): string {
  const d = String(texto ?? '').replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}`;
}

/**
 * Qué decirle a quien escribió algo que no sirve. `null` = está bien (o
 * está vacío, que es distinto de estar mal: un campo opcional en blanco no
 * es un error).
 */
export function errorFechaVe(texto: string | null | undefined): string | null {
  const t = String(texto ?? '').trim();
  if (!t) return null;
  if (veAIso(t)) return null;
  if (/^\d{1,2}[/\-. ]\d{1,2}[/\-. ]\d{4}$/.test(t)) return 'Esa fecha no existe. Revisá el día y el mes.';
  return 'Escribila como DD-MM-AAAA (por ejemplo 21-10-1973).';
}
