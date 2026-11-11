/* ============================================================
   Golden Touch · Combustible · arrastre al cambiar el contador de un tanque

   EL CASO (10/11/2026). Al Tanque #1 se le dañó el contador y se puso uno
   nuevo, que arranca en cero. El viejo cerró en 208.861.

   POR QUÉ NO SE PUEDE GUARDAR LO QUE MARCA EL CONTADOR NUEVO. El acumulado
   del tanque (`contador_global_ini/fin`) es un totalizador y todo el módulo
   se apoya en que SOLO SUBE: `ultimoContadorTanque` toma el número más alto,
   y `planCadenaMedidor` ordena los movimientos por la lectura final y
   RE-ESCRIBE los iniciales. Guardar un 30 lo colaría como el movimiento más
   antiguo del tanque y reescribiría los 110 registros viejos.

   LA REGLA. Lo que marca el surtidor y lo que guarda el sistema dejan de ser
   el mismo número. Se registra el cambio como un cierre y se convierte:

       acumulado = acumulado de cierre + (lo que marca − arranque del nuevo)

   Así el acumulado sigue creciendo, las dos rutinas de arriba no se enteran,
   y ningún dato viejo se toca. Un movimiento ANTERIOR al cambio no tiene
   arrastre: su lectura ya era el acumulado.

   Sirve para cualquier tanque y las veces que haga falta: al segundo cambio,
   el «acumulado de cierre» es el acumulado del sistema en ese momento.
   ============================================================ */

export interface CambioContador {
  /** Día en que se puso el contador nuevo (YYYY-MM-DD). */
  fecha: string;
  /** Con cuánto cerró el acumulado del sistema (lo que marcaba el viejo). */
  acumuladoCierre: number;
  /** En cuánto arranca el contador nuevo. Normalmente 0. */
  lecturaNueva: number;
}

const num = (v: number | null | undefined): number | null =>
  v == null || !Number.isFinite(Number(v)) ? null : Number(v);

const redondear = (v: number): number => Math.round(v * 100) / 100;

/**
 * Qué cambio de contador le toca a un movimiento: el último que YA había
 * ocurrido en su fecha. Un movimiento anterior a todo cambio devuelve null,
 * que es lo que mantiene la historia intacta.
 */
export function cambioVigente(cambios: CambioContador[], fecha: string | null | undefined): CambioContador | null {
  if (!fecha || !cambios?.length) return null;
  let vigente: CambioContador | null = null;
  for (const c of cambios) {
    if (c.fecha <= fecha && (vigente === null || c.fecha > vigente.fecha)) vigente = c;
  }
  return vigente;
}

/** Lo que marca el surtidor → lo que guarda el sistema. Sin cambio, son lo mismo. */
export function aAcumulado(lectura: number | null | undefined, cambio: CambioContador | null): number | null {
  const l = num(lectura);
  if (l === null) return null;
  if (!cambio) return redondear(l);
  return redondear(cambio.acumuladoCierre + (l - cambio.lecturaNueva));
}

/** Lo que guarda el sistema → lo que marca el surtidor. Sin cambio, son lo mismo. */
export function aLecturaFisica(acumulado: number | null | undefined, cambio: CambioContador | null): number | null {
  const a = num(acumulado);
  if (a === null) return null;
  if (!cambio) return redondear(a);
  return redondear(a - cambio.acumuladoCierre + cambio.lecturaNueva);
}

/**
 * Por qué NO se puede asentar este cambio de contador, en palabras para quien
 * lo está cargando. Devuelve null cuando sí se puede.
 *
 * La regla que importa: el cambio NO puede quedar antes del último movimiento
 * ya cargado. Si quedara antes, esos movimientos pasarían a interpretarse con
 * el arrastre y sus cifras se recalcularían mal — justo lo que esto evita.
 */
export function motivoNoRegistrable(e: {
  fecha: string;
  ultimaFechaMovimiento?: string | null;
  acumuladoCierre: number | null;
  lecturaNueva: number | null;
}): string | null {
  if (!e.fecha?.trim()) return 'Indique qu\u00e9 d\u00eda se cambi\u00f3 el contador.';
  const cierre = num(e.acumuladoCierre);
  if (cierre === null || cierre < 0) return 'Indique con cu\u00e1nto qued\u00f3 el contador viejo.';
  const nueva = num(e.lecturaNueva);
  if (nueva === null || nueva < 0) return 'Indique en cu\u00e1nto arranca el contador nuevo (normalmente cero).';
  const ultima = e.ultimaFechaMovimiento?.trim();
  if (ultima && e.fecha < ultima) {
    return `Ya hay movimientos cargados hasta el ${ultima}. El cambio no puede ser anterior, o esos movimientos quedar\u00edan mal calculados.`;
  }
  return null;
}
