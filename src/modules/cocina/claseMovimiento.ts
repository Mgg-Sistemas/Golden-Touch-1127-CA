/* ============================================================
   Golden Touch · Cocina · De qué es cada movimiento del kardex

   Pedido del usuario (29/09/2026): que el resumen de Distribución de comidas
   diga «lo que había», «lo consumido a la fecha», «las salidas o ajustes
   manuales hechos por inventario» y «lo que queda».

   Para eso hay que poder mirar una fila del kardex y decir a cuál de los cuatro
   cajones va. Antes cada pantalla lo decidía por su cuenta y no siempre igual,
   y de ahí salían dos números distintos para la misma cosa:

   · El panel del mercado contaba como CONSUMO todo lo que tuviera
     `ref_tipo = 'cocina'`, reversos incluidos: un reverso de comida (que entra)
     resta consumo, que es lo correcto. El control de distribución, en cambio,
     lo sumaba a ENTRADAS, así que el mismo reverso inflaba el disponible y
     dejaba el consumo alto.
   · Las 13 filas de `cocina_sync` —«consumo de cocina que no había descontado
     stock», del 30/07/2026, 179,55 unidades— caían en «otras salidas» en las
     dos pantallas, cuando son comidas.

   Las reglas viven aquí una sola vez. Es una pieza pura: se prueba sin base ni
   React.
   ============================================================ */

const n = (v: unknown) => Number(v) || 0;

/**
 * Los `ref_tipo` del kardex que son consumo de la cocina.
 *
 * `cocina` son las comidas, sus ediciones y sus reversos. `cocina_sync` es la
 * sincronización del 30/07/2026: comidas que se habían registrado sin descontar
 * el stock y se descontaron después. Las dos son comida servida, no una salida
 * de depósito, y por eso van al mismo cajón.
 */
export const REF_TIPOS_COCINA = ['cocina', 'cocina_sync'] as const;

/** Para el filtro de PostgREST: `ref_tipo` nulo o ninguno de los de cocina. */
export const NO_COCINA_OR = `ref_tipo.is.null,ref_tipo.not.in.(${REF_TIPOS_COCINA.join(',')})`;

/** ¿Esta fila del kardex la movió la cocina al servir (o al deshacer) una comida? */
export function esDeCocina(refTipo: string | null | undefined): boolean {
  const r = (refTipo ?? '').trim().toLowerCase();
  return (REF_TIPOS_COCINA as readonly string[]).includes(r);
}

/**
 * Los cuatro cajones del ciclo.
 *
 * · `entrada`  — lo que llegó al depósito (mercado, orden, compra, carga inicial).
 * · `consumo`  — lo que se fue en comidas. Un reverso también es `consumo`: entra,
 *                así que resta de lo consumido en vez de sumar a lo que llegó.
 * · `salida`   — bajó el inventario y no fue una comida: salida de material a un
 *                módulo, salida manual, el reverso de una compra.
 * · `ajuste`   — una corrección hecha sobre el stock desde Inventario.
 */
export type ClaseMovimiento = 'entrada' | 'consumo' | 'salida' | 'ajuste';

/** Lo mínimo de una fila del kardex para saber en qué cajón va. */
export interface MovimientoClasificable {
  /** Positivo entró, negativo salió. */
  delta: number | string | null;
  /** El `tipo` del kardex: entrada, salida, ajuste, consumo, creacion… */
  tipo?: string | null;
  /** El `ref_tipo` del kardex: cocina, orden, manual, salida_modulo… */
  refTipo?: string | null;
}

/**
 * En qué cajón va la fila. El orden de las preguntas importa: primero si es de
 * la cocina (porque un reverso entra y de todas formas es consumo), después el
 * signo, y solo al final se separa el ajuste de la salida.
 *
 * Un ajuste se reconoce por el `tipo` del kardex, no por el `ref_tipo`: los dos
 * llegan con `ref_tipo = 'manual'`, y lo que los distingue es que Inventario
 * escribe `tipo = 'ajuste'` cuando corrige el stock y `tipo = 'salida'` cuando
 * saca material.
 */
export function claseMovimiento(m: MovimientoClasificable): ClaseMovimiento {
  if (esDeCocina(m.refTipo)) return 'consumo';
  if (n(m.delta) > 0) return 'entrada';
  return (m.tipo ?? '').trim().toLowerCase() === 'ajuste' ? 'ajuste' : 'salida';
}
