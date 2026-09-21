/* ============================================================
   Golden Touch · Cocina · El panel del mercado, por capas

   Portado de MGG (MercadoPanel y mercadoComparar). GT tenía el mismo problema
   que MGG antes de ese cambio: el contador, la tabla de víveres, los avisos y
   las comidas venían apilados, y con todos los víveres el scroll no dejaba leer
   nada. Ahora se lee de lo macro a lo micro:
     1. La ecuación del ciclo, siempre visible. El contraste, solo si no cuadra.
     2. Qué se quiere mirar: Disponible, Movimientos o Ambos. Se recuerda.
     3. El detalle: primero los víveres que se movieron; los quietos, detrás de
        un botón.

   LA ADAPTACIÓN A GT
   En MGG «Queda» es la cuenta del libro y el contraste se hace contra el
   inventario. En GT «Queda» ya ES el stock del inventario, así que el contraste
   se da vuelta: la cuenta del ciclo (disponible − consumo) contra lo que hay.
   El signo es el de MGG: negativo = falta, positivo = sobra.

   Piezas puras: se prueban sin base ni React.
   ============================================================ */
import type { ResumenViver } from './cocinaMercado.repository';

const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const n = (v: unknown) => Number(v) || 0;

/* ───────── Qué se mira ───────── */

/** Qué bloque se está mirando. Se recuerda en el navegador. */
export type VistaMercado = 'disponible' | 'movimientos' | 'ambos' | 'distribucion';
export const VISTA_KEY = 'gt.cocina.mercado.vista';

/** La vista guardada, o «Disponible» si no hay una válida (el mismo arranque que MGG). */
export function leerVista(guardada: string | null | undefined): VistaMercado {
  return guardada === 'movimientos' || guardada === 'ambos' || guardada === 'distribucion'
    ? guardada : 'disponible';
}

export function vistaGuardada(): VistaMercado {
  try { return leerVista(localStorage.getItem(VISTA_KEY)); } catch { return 'disponible'; }
}

export function guardarVista(v: VistaMercado): void {
  try { localStorage.setItem(VISTA_KEY, v); } catch { /* modo privado: no se recuerda, no importa */ }
}

/* ───────── Los víveres que se movieron ───────── */

/**
 * Separa los víveres que SE MOVIERON en el ciclo (entró o se consumió algo) de los que
 * solo arrastran saldo. Los quietos no desaparecen: su stock sigue siendo real.
 */
export function separarMovidos(items: ResumenViver[]): { movidos: ResumenViver[]; quietos: ResumenViver[] } {
  const movidos: ResumenViver[] = [];
  const quietos: ResumenViver[] = [];
  for (const d of items) (n(d.entradas) !== 0 || n(d.consumo) !== 0 || n(d.mermas) !== 0 ? movidos : quietos).push(d);
  return { movidos, quietos };
}

/* ───────── Mermas y salidas ───────── */

/** Lo mínimo de una fila del kardex para saber si es merma. */
export interface MovimientoParaMerma {
  producto_id: string;
  delta: number | string | null;
  ref_tipo?: string | null;
}

/**
 * Mermas y salidas por víver: lo que bajó el inventario sin ser una comida de la cocina
 * (salida manual, ajuste a la baja, traslado). Decisión del usuario (15/09/2026): el ciclo
 * las resta en su propia columna, a la vista, y NO entran en el costo por plato.
 *
 * Las comidas se registran con `ref_tipo = 'cocina'`, y también sus reversos y las
 * ediciones: todo eso ya lo cuenta el consumo, y contarlo acá lo restaría dos veces.
 * Solo cuentan los víveres del ciclo y solo lo que baja. Devuelve cantidades positivas.
 */
export function sumarMermas(movs: MovimientoParaMerma[], viverIds: Set<string>): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of movs) {
    const delta = n(m.delta);
    if (delta >= 0 || m.ref_tipo === 'cocina' || !viverIds.has(m.producto_id)) continue;
    out.set(m.producto_id, r2((out.get(m.producto_id) ?? 0) - delta));
  }
  return out;
}

/* ───────── Contraste: la cuenta del ciclo contra el inventario ───────── */

export interface DiferenciaViver {
  producto_id: string;
  /** Lo que da la cuenta del ciclo: disponible − consumo − mermas. */
  cuenta: number;
  /** Lo que hay en el inventario: la columna «Queda». */
  inventario: number;
  /** inventario − cuenta. Negativo = falta; positivo = sobra. */
  diferencia: number;
}

/**
 * Víveres cuya cuenta del ciclo no da lo que hay en el inventario. Menos de un
 * centésimo es redondeo, no un faltante. Lo más descuadrado primero.
 */
export function diferenciasPorViver(items: ResumenViver[]): DiferenciaViver[] {
  const out: DiferenciaViver[] = [];
  for (const d of items) {
    const cuenta = r2(n(d.disponible) - n(d.consumo) - n(d.mermas));
    const inventario = r2(n(d.queda));
    const diferencia = r2(inventario - cuenta);
    if (Math.abs(diferencia) < 0.01) continue;
    out.push({ producto_id: d.producto_id, cuenta, inventario, diferencia });
  }
  return out.sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia));
}

/**
 * Por dónde pudo irse (o venir) la diferencia. La cuenta del ciclo ve entradas, comidas y,
 * desde el 15/09/2026, las mermas y salidas; un faltante que queda es algo que bajó el
 * inventario sin caer en la ventana del ciclo.
 */
export function explicarDiferencia(diferencia: number): string {
  return diferencia < 0
    ? 'salió del inventario sin que el ciclo lo viera: un movimiento fechado fuera de la ventana del ciclo, o un cambio hecho directo sobre el stock sin pasar por el kardex.'
    : 'entró por un movimiento que no es una entrada: un ajuste, un traslado o una devolución.';
}

/* ───────── Los cinco números del ciclo ───────── */

export interface EcuacionCiclo {
  saldoInicial: number;
  entradas: number;
  disponible: number;
  consumo: number;
  /** Mermas y salidas: bajan el inventario pero no son comidas (no van al costo por plato). */
  mermas: number;
  /** Suma del stock del inventario. */
  queda: number;
  /** disponible − consumo − mermas: lo que debería quedar según el ciclo. */
  cuenta: number;
  /** queda − cuenta. */
  diferencia: number;
  /** Cuántos víveres no cuadran (0 = todo cuadra). */
  viveresConDiferencia: number;
}

export function ecuacionDelCiclo(items: ResumenViver[]): EcuacionCiclo {
  let saldoInicial = 0, entradas = 0, consumo = 0, mermas = 0, queda = 0;
  for (const d of items) {
    saldoInicial = r2(saldoInicial + n(d.saldo_inicial));
    entradas = r2(entradas + n(d.entradas));
    consumo = r2(consumo + n(d.consumo));
    mermas = r2(mermas + n(d.mermas));
    queda = r2(queda + n(d.queda));
  }
  const disponible = r2(saldoInicial + entradas);
  const cuenta = r2(disponible - consumo - mermas);
  return {
    saldoInicial, entradas, disponible, consumo, mermas, queda, cuenta,
    diferencia: r2(queda - cuenta),
    viveresConDiferencia: diferenciasPorViver(items).length,
  };
}

/* ───────── Lo que costó dar de comer ───────── */

export interface CostoDelCiclo {
  /** Platos servidos. `null` = el mercado es anterior a que se guardaran (14/09/2026). */
  platos: number | null;
  /** Lo que costaron los víveres consumidos. */
  consumo: number;
  /** consumo / platos. `null` sin platos: un «0,00 por plato» al abrir el ciclo es un dato falso. */
  porPlato: number | null;
}

export function costoDelCiclo(platos: number | null | undefined, consumoValor: number | null | undefined): CostoDelCiclo {
  const consumo = r2(Math.max(0, n(consumoValor)));
  if (platos == null) return { platos: null, consumo, porPlato: null };
  const p = Math.max(0, Math.trunc(n(platos)));
  return { platos: p, consumo, porPlato: p > 0 ? r2(consumo / p) : null };
}

/* ───────── Qué filas muestra la tabla ───────── */

/**
 * Las filas de «Disponible a consumir», en el orden de MGG:
 * · primero los que se movieron;
 * · después los quietos que NO cuadran, siempre: escondidos, la tira contaba el
 *   descuadre pero la tabla no dejaba encontrarlo;
 * · los quietos que cuadran, solo si se pidió verlos.
 * Con «solo los que no cuadran», nada más esos. `quietosOcultables` cuenta los que el
 * botón muestra u oculta: ofrecer «ver 12» y mostrar 9 es una cuenta que no cierra.
 */
export function filasDisponible(
  items: ResumenViver[],
  opts: { verQuietos: boolean; soloDif: boolean },
): { filas: ResumenViver[]; quietosOcultables: number; difPorProducto: Map<string, DiferenciaViver> } {
  const difPorProducto = new Map(diferenciasPorViver(items).map((d) => [d.producto_id, d] as const));
  const { movidos, quietos } = separarMovidos(items);
  const quietosConDif = quietos.filter((d) => difPorProducto.has(d.producto_id));
  const quietosOk = quietos.filter((d) => !difPorProducto.has(d.producto_id));
  const base = [...movidos, ...quietosConDif];
  const filas = opts.soloDif
    ? base.filter((d) => difPorProducto.has(d.producto_id))
    : opts.verQuietos ? [...base, ...quietosOk] : base;
  return { filas, quietosOcultables: quietosOk.length, difPorProducto };
}

/* ───────── El consumo del ciclo, medido con el reloj del inventario ───────── */

/** Lo mínimo de un movimiento de kardex de cocina para sumar el consumo del ciclo. */
export interface MovimientoConsumo {
  producto_id: string;
  /** Negativo sale (consumo). Un reverso o una edición a la baja viene positivo y RESTA. */
  delta: number | string | null;
  /** PMP con el que salió. Es lo que vale ese consumo. */
  costo_promedio?: number | string | null;
  precio_unitario?: number | string | null;
  /** La comida que lo generó (`cocina_movimientos.id`). */
  ref_id?: string | null;
}

/**
 * Consumo del ciclo por víver, sumado sobre el KARDEX.
 *
 * POR QUÉ SOBRE EL KARDEX Y NO SOBRE LAS COMIDAS (21/09/2026). El ciclo cuenta las
 * entradas y las mermas por la fecha del movimiento de inventario, pero el consumo lo
 * contaba por la FECHA DE SERVICIO de la comida. Son dos relojes distintos en la misma
 * ecuación, y en cuanto una comida se carga con fecha retroactiva los dos dejan de
 * coincidir: el stock salió dentro del ciclo pero la comida quedó fuera, así que la
 * cuenta del ciclo denunciaba un faltante que no existía —y ese faltante no se iba
 * nunca, porque el ciclo anterior ya estaba cerrado y congelado—.
 *
 * Caso que lo destapó: POLLO BENEFICIADO SAN BLAS, 4 comidas del 13 y 14/09 cargadas el
 * 19/09, con el ciclo abierto desde el 15/09. Midiendo por el kardex, «disponible −
 * consumo − mermas» vuelve a dar exactamente lo que hay en el inventario.
 *
 * Devuelve además los ids de las comidas involucradas, para contar sus platos con el
 * mismo criterio (si el costo cae en este ciclo, los platos también).
 */
export function sumarConsumoCocina(movs: MovimientoConsumo[]): {
  porViver: Map<string, { cantidad: number; valor: number }>;
  comidaIds: Set<string>;
} {
  const porViver = new Map<string, { cantidad: number; valor: number }>();
  const comidaIds = new Set<string>();
  for (const m of movs) {
    const cantidad = -n(m.delta);                       // salida (delta<0) → consumo positivo
    const precio = n(m.costo_promedio) || n(m.precio_unitario);
    const acc = porViver.get(m.producto_id) ?? { cantidad: 0, valor: 0 };
    acc.cantidad = r2(acc.cantidad + cantidad);
    acc.valor = r2(acc.valor + cantidad * precio);
    porViver.set(m.producto_id, acc);
    if (m.ref_id) comidaIds.add(m.ref_id);
  }
  return { porViver, comidaIds };
}
