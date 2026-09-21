/* ============================================================
   Golden Touch · Cocina · Control de distribución (formato EOQ)

   Adaptación de la hoja «Control de consumo de pollo» (cocinas Los Pinos, La
   Esperanza y Golden Touch) a TODO el mercado: el mismo control, producto por
   producto, sin cargar a mano lo que el sistema ya sabe.

   De la hoja se conservan las dos mitades:

   1. EL LOTE ÓPTIMO (EOQ). Con la demanda anual (D), el costo de emitir una
      orden (S), el costo de almacenar una unidad un año (H) y el tiempo de
      entrega (L):
         Q*  = √(2·D·S / H)          lote óptimo de compra
         ROP = (D / 365) · L         punto de reorden
         órdenes/año = D / Q*        ·  ciclo = 365 / órdenes-año
      La diferencia con la hoja: allá D se escribe a mano. Acá, para que el
      control sirva en los ~70 productos del mercado sin cargar nada, D se
      ESTIMA del consumo real (promedio diario × 365) y se puede pisar producto
      por producto cuando se conozca el número verdadero.

   2. EL CONTROL DIARIO. Una fila por día con inventario inicial, entradas,
      consumo, inventario teórico, conteo físico, merma, comensales, ratio y
      estado. Todo sale del kardex y de las comidas registradas; lo único humano
      es el conteo físico, y es opcional: sin él la fila igual se arma.

   Piezas puras: se prueban sin base de datos ni React.
   ============================================================ */

const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const r3 = (v: number) => Math.round((Number(v) || 0) * 1000) / 1000;
const n = (v: unknown) => Number(v) || 0;

/** Días del año que se usan para pasar de demanda anual a demanda diaria. */
export const DIAS_ANO = 365;

/* ───────── 1) Lote óptimo de compra (EOQ) ───────── */

export interface ParametrosEoq {
  /** Demanda anual (D), en unidades. */
  demandaAnual: number;
  /** Costo de emitir una orden (S). */
  costoOrden: number;
  /** Costo de almacenar una unidad durante un año (H). */
  costoAlmacenar: number;
  /** Tiempo de entrega en días (L). */
  leadTimeDias: number;
}

export interface ResultadoEoq {
  demandaAnual: number;
  /** Q*: cuántas unidades conviene pedir de una vez. */
  lote: number;
  /** ROP: con este stock hay que volver a pedir. */
  puntoReorden: number;
  /** Cuántas órdenes al año salen con ese lote. */
  ordenesPorAno: number;
  /** Cada cuántos días toca comprar. */
  cicloDias: number;
}

/**
 * El lote óptimo y el punto de reorden. Si falta un dato (demanda o costos en
 * cero) devuelve todo en cero en vez de inventar un número: un EOQ sin demanda
 * no significa nada, y mostrarlo como si significara algo es peor que no tenerlo.
 */
export function calcularEoq(p: ParametrosEoq): ResultadoEoq {
  const D = Math.max(0, n(p.demandaAnual));
  const S = Math.max(0, n(p.costoOrden));
  const H = Math.max(0, n(p.costoAlmacenar));
  const L = Math.max(0, n(p.leadTimeDias));
  const vacio: ResultadoEoq = { demandaAnual: r2(D), lote: 0, puntoReorden: 0, ordenesPorAno: 0, cicloDias: 0 };
  if (D <= 0 || S <= 0 || H <= 0) return vacio;

  // La hoja muestra el lote y el punto de reorden en unidades enteras: media
  // unidad de pollo no se pide ni se cuenta.
  const lote = Math.round(Math.sqrt((2 * D * S) / H));
  if (lote <= 0) return vacio;
  const puntoReorden = Math.round((D / DIAS_ANO) * L);
  const ordenesPorAno = r2(D / lote);
  return {
    demandaAnual: r2(D),
    lote,
    puntoReorden,
    ordenesPorAno,
    cicloDias: Math.round(DIAS_ANO / ordenesPorAno),
  };
}

/**
 * Demanda anual estimada a partir del consumo observado. `dias` son los días del
 * PERÍODO, no los que tuvieron consumo.
 *
 * Es la diferencia entre estimar y exagerar: un producto que se sirve una vez
 * cada dos semanas tiene un solo día con consumo, y anualizar sobre ese día daría
 * 365 veces esa ración — el sistema pediría una montaña. Anualizar sobre el
 * calendario da lo que de verdad se come al año. Se confirma contra la hoja: Los
 * Pinos consumió 54 UND en 12 días, que anualizado da 1.642, y la demanda que ahí
 * escribieron a mano es 1.700.
 */
export function demandaAnualEstimada(consumoTotal: number, dias: number): number {
  const d = Math.max(0, Math.trunc(n(dias)));
  if (d <= 0) return 0;
  return r2((n(consumoTotal) / d) * DIAS_ANO);
}

/* ───────── 2) Estado del stock ───────── */

export type EstadoStock = 'normal' | 'alerta' | 'reordenar';

export const ESTADO_STOCK_LABEL: Record<EstadoStock, string> = {
  normal: '✅ NORMAL (stock óptimo)',
  alerta: '⚠️ ALERTA (se acerca al reorden)',
  reordenar: '🚨 REORDENAR (stock crítico)',
};

export const ESTADO_STOCK_BADGE: Record<EstadoStock, string> = {
  normal: 'badge success',
  alerta: 'badge warning',
  reordenar: 'badge danger',
};

/** El estado por el que se recorta el listado, o «todos» para no recortar nada. */
export type FiltroEstado = EstadoStock | 'todos';

const FILTRO_ESTADO_TEXTO: Record<EstadoStock, string> = {
  reordenar: 'Solo los víveres por REORDENAR',
  alerta: 'Solo los víveres EN ALERTA',
  normal: 'Solo los víveres en NORMAL',
};

/** Deja únicamente los de ese estado. Con «todos» devuelve la lista tal cual. */
export function filtrarPorEstado<T extends { estado: EstadoStock }>(items: T[], estado: FiltroEstado): T[] {
  return estado === 'todos' ? items : items.filter((i) => i.estado === estado);
}

/**
 * Qué recorte del mercado es este listado, para imprimirlo en el PDF. El papel
 * con el que se sale a comprar tiene que decir de qué es: «Solo los víveres por
 * REORDENAR» no es lo mismo que el mercado entero. Vacío si no hay recorte.
 */
export function subtituloFiltro(estado: FiltroEstado, buscar = ''): string {
  const partes: string[] = [];
  if (estado !== 'todos') partes.push(FILTRO_ESTADO_TEXTO[estado]);
  const b = String(buscar ?? '').trim();
  if (b) partes.push(`búsqueda «${b}»`);
  return partes.join(' · ');
}

/**
 * Semáforo del stock contra el punto de reorden, igual que la hoja: en el punto
 * de reorden o por debajo hay que pedir; hasta una vez y media ese punto, avisa.
 */
export function estadoStock(stock: number, puntoReorden: number): EstadoStock {
  const s = n(stock);
  const rop = n(puntoReorden);
  if (s <= rop) return 'reordenar';
  if (s <= rop * 1.5) return 'alerta';
  return 'normal';
}

/* ───────── 3) El control diario ───────── */

/** Lo mínimo de un movimiento de inventario para armar el día. */
export interface MovimientoDia {
  /** Fecha del movimiento, AAAA-MM-DD. */
  fecha: string;
  /** Positivo entra, negativo sale. */
  delta: number;
  /** 'cocina' = lo consumió una comida; cualquier otra cosa es merma o salida. */
  refTipo?: string | null;
}

export interface FilaDia {
  fecha: string;
  invInicial: number;
  entradas: number;
  /** Lo que se fue en comidas de la cocina. */
  consumo: number;
  /** Lo que bajó el inventario sin ser una comida (salida manual, ajuste, traslado). */
  otrasSalidas: number;
  invTeorico: number;
  /** Lo contado en el depósito ese día; null si nadie contó. */
  invFisico: number | null;
  /** físico − teórico. null sin conteo. Negativo = falta. */
  diferencia: number | null;
  comensales: number;
  /** Consumo por comensal. 0 si ese día no hubo comensales. */
  ratio: number;
  estado: EstadoStock;
}

export interface EntradaControl {
  /** Días del control, en orden, AAAA-MM-DD. */
  dias: string[];
  /** Inventario con el que abre el primer día. */
  aperturaInventario: number;
  movimientos: MovimientoDia[];
  /** Comensales por día (los platos servidos). */
  comensalesPorDia: Map<string, number> | Record<string, number>;
  /** Conteo físico por día, donde lo haya. */
  conteosPorDia: Map<string, number> | Record<string, number>;
  /** Punto de reorden vigente, para el semáforo de cada día. */
  puntoReorden: number;
}

function leer(mapa: Map<string, number> | Record<string, number>, clave: string): number | undefined {
  const v = mapa instanceof Map ? mapa.get(clave) : mapa[clave];
  return v == null ? undefined : Number(v);
}

/**
 * Arma la tabla diaria del producto.
 *
 * El día abre con lo que cerró el anterior y, si ese día se contó físicamente,
 * abre con LO CONTADO: es la razón de ser del conteo, que la cuenta vuelva a la
 * realidad en vez de arrastrar el error hacia adelante.
 */
export function construirDias(e: EntradaControl): FilaDia[] {
  const porDia = new Map<string, { entradas: number; consumo: number; otras: number }>();
  for (const m of e.movimientos) {
    const acc = porDia.get(m.fecha) ?? { entradas: 0, consumo: 0, otras: 0 };
    const d = n(m.delta);
    if (d > 0) acc.entradas = r2(acc.entradas + d);
    else if (m.refTipo === 'cocina') acc.consumo = r2(acc.consumo - d);
    else acc.otras = r2(acc.otras - d);
    porDia.set(m.fecha, acc);
  }

  const filas: FilaDia[] = [];
  let abre = r2(e.aperturaInventario);
  for (const fecha of e.dias) {
    const mov = porDia.get(fecha) ?? { entradas: 0, consumo: 0, otras: 0 };
    const invTeorico = r2(abre + mov.entradas - mov.consumo - mov.otras);
    const fisico = leer(e.conteosPorDia, fecha);
    const invFisico = fisico == null ? null : r2(fisico);
    const comensales = Math.max(0, Math.trunc(leer(e.comensalesPorDia, fecha) ?? 0));
    filas.push({
      fecha,
      invInicial: abre,
      entradas: mov.entradas,
      consumo: mov.consumo,
      otrasSalidas: mov.otras,
      invTeorico,
      invFisico,
      diferencia: invFisico == null ? null : r2(invFisico - invTeorico),
      comensales,
      ratio: comensales > 0 ? r3(mov.consumo / comensales) : 0,
      estado: estadoStock(invFisico ?? invTeorico, e.puntoReorden),
    });
    abre = invFisico ?? invTeorico;
  }
  return filas;
}

/* ───────── 4) Totales del control ───────── */

export interface TotalesControl {
  entradas: number;
  consumo: number;
  otrasSalidas: number;
  /** Suma de las diferencias de los días contados. Negativo = falta. */
  merma: number;
  comensales: number;
  /** Días con consumo registrado (los que cuentan para el promedio). */
  diasConConsumo: number;
  /** Consumo promedio por día con consumo. */
  promedioDiario: number;
  /** Promedio de los ratios diarios de los días con consumo (el de la hoja). */
  ratioPromedio: number;
  /** Consumo total sobre comensales totales. */
  ratioGlobal: number;
  /** Inventario con el que cierra el último día. */
  invFinal: number;
}

export function totalizarControl(filas: FilaDia[]): TotalesControl {
  let entradas = 0, consumo = 0, otras = 0, merma = 0, comensales = 0;
  let diasConConsumo = 0, sumaRatios = 0;
  for (const f of filas) {
    entradas = r2(entradas + f.entradas);
    consumo = r2(consumo + f.consumo);
    otras = r2(otras + f.otrasSalidas);
    if (f.diferencia != null) merma = r2(merma + f.diferencia);
    comensales += f.comensales;
    // El promedio se hace sobre el ratio EXACTO, no sobre el que se muestra: promediar
    // seis números ya redondeados a tres decimales corre el resultado (0,160 en vez de
    // 0,159 en la hoja de Los Pinos).
    if (f.consumo > 0) { diasConConsumo += 1; sumaRatios += f.comensales > 0 ? f.consumo / f.comensales : 0; }
  }
  const ultima = filas.length ? filas[filas.length - 1] : null;
  return {
    entradas, consumo, otrasSalidas: otras, merma, comensales, diasConConsumo,
    promedioDiario: diasConConsumo > 0 ? r2(consumo / diasConConsumo) : 0,
    ratioPromedio: diasConConsumo > 0 ? r3(sumaRatios / diasConConsumo) : 0,
    ratioGlobal: comensales > 0 ? r3(consumo / comensales) : 0,
    invFinal: ultima ? (ultima.invFisico ?? ultima.invTeorico) : 0,
  };
}

/* ───────── 5) Rango de días ───────── */

/** Los días AAAA-MM-DD entre dos fechas, inclusive. Tope para no colgar la vista. */
export function diasEntre(desde: string, hasta: string, tope = 400): string[] {
  if (!desde || !hasta || hasta < desde) return [];
  const out: string[] = [];
  const d = new Date(`${desde}T00:00:00Z`);
  const fin = new Date(`${hasta}T00:00:00Z`);
  while (d <= fin && out.length < tope) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
