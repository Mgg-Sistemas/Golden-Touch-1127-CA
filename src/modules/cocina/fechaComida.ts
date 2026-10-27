/* ============================================================
   Golden Touch · Cocina · ¿La fecha de la comida cae dentro del mercado abierto?

   Traído de MGG (21/09/2026). POR QUÉ EXISTE. La comida descuenta el inventario
   el día que se CARGA, pero por fecha pertenece al mercado del día en que se
   SIRVIÓ. Cargar una comida atrasada es legítimo y pasa seguido —se sirve un día
   y se registra después—, pero tiene una consecuencia que no se ve:

   · Si esos víveres YA pasaron por un «CONTEO REAL» (un ajuste manual que puso
     el stock en lo que había de verdad), el conteo ya los había descontado. Al
     cargar la comida después, salen DOS VECES del inventario.

   Le pasó a MGG el 17 y el 19/09/2026: 19 comidas del 11 al 14/09 cargadas
   después del conteo del 14; hubo que devolver 211,21 unidades a mano.

   Aquí solo se DETECTA para poder avisar antes de guardar. No bloquea: la carga
   atrasada es válida, lo que hace falta es saber qué implica.

   Nota para GT: el libro del mercado ya NO se descuadra por esto (desde el
   21/09/2026 el ciclo cuenta el consumo por el movimiento de inventario, ver
   `sumarConsumoCocina`). Lo que sigue en pie es el riesgo del doble descuento,
   que es un problema de inventario, no de la cuenta del ciclo.

   SIN FIN PREVISTO (27/10/2026). Antes el ciclo «terminaba» a los 21 días de la
   apertura y una comida posterior a ese día se avisaba como «despues». El cierre
   del mercado es MANUAL: un mercado abierto no tiene fecha de fin, llega hasta
   hoy. Solo queda el aviso de «antes».
   ============================================================ */

/** Qué tiene de raro la fecha elegida, si es que tiene algo. */
export type FueraDelCiclo = 'antes' | null;

/** El mercado abierto, con lo poco que hace falta para ubicar la fecha. */
export interface VentanaMercado {
  /** Correlativo visible, p. ej. «MK-2026-0002». */
  numero: string | null;
  /** Instante de apertura (ISO). */
  inicio_at: string;
}

const soloDia = (v: string | null | undefined) => String(v ?? '').slice(0, 10);

/**
 * ¿La fecha de la comida cae fuera del ciclo del mercado abierto?
 *
 * 'antes' → es de un mercado anterior: el riesgo del doble descuento.
 * null    → está dentro (el mercado abierto llega hasta hoy), o no hay mercado con qué comparar.
 */
export function fueraDelCiclo(fecha: string, mercado: VentanaMercado | null | undefined): FueraDelCiclo {
  const f = soloDia(fecha);
  if (!f || !mercado) return null;
  const desde = soloDia(mercado.inicio_at);
  if (!desde) return null;
  if (f < desde) return 'antes';
  return null;
}

function dia(iso: string): string {
  const [y, m, d] = soloDia(iso).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(iso ?? '');
}

/** El texto del aviso, diciendo qué va a pasar. Vacío si no hay nada que avisar. */
export function avisoFueraDelCiclo(caso: FueraDelCiclo, mercado: VentanaMercado | null | undefined): string {
  if (!caso || !mercado) return '';
  const n = mercado.numero ?? 'abierto';
  return `Esa fecha es anterior al mercado ${n}, que arrancó el ${dia(mercado.inicio_at)}. `
    + 'La comida va a descontar el inventario HOY. Si esos víveres ya se contaron en un '
    + 'CONTEO REAL, van a salir dos veces del inventario: revisa el stock después de guardar.';
}
