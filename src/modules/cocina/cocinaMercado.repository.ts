/* ============================================================
   Golden Touch · Cocina · Ciclo de mercado (21 días)
   El mercado dura 21 días. Al llegar el día 22 se hace un CIERRE:
   se saca la foto de lo que queda (stock actual de cada víver), se
   arma el reporte (saldo inicial + entradas del mercado − consumo =
   lo que queda) y el siguiente ciclo arranca con ese saldo. El
   contador y el cierre son manuales (Cocina presiona «Cerrar mercado»).
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { Producto } from '@/shared/lib/types';
import { listViveres } from './cocina.repository';
import { movimientosDeViver, saldoParaElNuevo, tieneCongelados, type MovimientosCiclo } from './mercadoCierre';
import { reconstruirSaldo, resolverInicio } from './mercadoInicio';
import { marcaCorte } from './mercadoCorte';
import { esDeCocina, NO_COCINA_OR, REF_TIPOS_COCINA } from './claseMovimiento';
import { sumarConsumoCocina, sumarMermas, type MovimientoConsumo, type MovimientoParaMerma } from './mercadoPanel';
import { filasInventario, type FilaKardex, type MovInventario } from './movInventario';
import { todasLasFilas } from '@/shared/lib/todasLasFilas';

const TABLE = 'cocina_mercados';
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Días que dura un ciclo de mercado. Al día 22 toca cerrar. */
export const CICLO_DIAS = 21;

/** Foto de un víver en un momento (inicio o cierre del ciclo). */
export interface SaldoViver {
  producto_id: string;
  sku: string;
  nombre: string;
  unidad: string | null;
  cantidad: number;
}

/** Fila del resumen del ciclo por víver. */
export interface ResumenViver {
  producto_id: string;
  sku: string;
  nombre: string;
  unidad: string | null;
  saldo_inicial: number;   // lo que quedó del mercado anterior (al iniciar el ciclo)
  entradas: number;        // entradas de inventario (nuevo mercado) durante el ciclo
  disponible: number;      // saldo_inicial + entradas (total disponible a consumir)
  consumo: number;         // consumido por cocina durante el ciclo
  /** Mermas y salidas: lo que bajó el inventario sin ser una comida (salida manual, ajuste a la
   *  baja, traslado). Desde el 15/09/2026; los mercados cerrados antes no la traen (= 0). */
  mermas?: number;
  queda: number;          // stock actual (lo que queda → pasa al próximo ciclo)
}

export interface TotalesMercado {
  viveres: number;
  consumo_valor: number;   // costo total consumido (Bs/$ del inventario)
  entradas_total: number;  // suma de cantidades entradas
  queda_viveres: number;   // víveres con saldo > 0 que pasan al próximo
  /** Suma de las mermas y salidas del ciclo, en unidades. Desde el 15/09/2026. */
  mermas_total?: number;
  /** Platos servidos en el ciclo (costo por plato del panel). Desde el 14/09/2026: los anteriores no lo traen. */
  platos?: number;
  /* ── Descarte (14/09/2026) ──
     Viven en este jsonb para no pedir migración; los mercados anteriores no los
     traen. Un mercado descartado queda con estado 'cerrado' y esta marca. */
  /** true si el ciclo se descartó: no cuenta y no le pasa saldo al siguiente. */
  descartado?: boolean;
  /** Por qué se descartó. Obligatorio al descartar. */
  motivo_descarte?: string | null;
  /** Correo de quien descartó. */
  descartado_por?: string | null;
  /** Nombre visible de quien descartó. */
  descartado_por_nombre?: string | null;
  /** Instante del descarte (ISO). */
  descartado_at?: string | null;
  /* ── Corte de inventario (01/10/2026) ──
     «Partir del stock real»: los ciclos cerrados hasta el corte muestran solo sus
     entradas en el histórico. También vive en este jsonb, sin migración. */
  /** true si de este ciclo se muestran solo las entradas. */
  solo_entradas?: boolean;
  /** Instante del corte (ISO). Solo lo trae el ciclo que se cerró con el corte. */
  corte_at?: string | null;
  /** Por qué se hizo el corte. */
  corte_motivo?: string | null;
  /** Correo de quien hizo el corte. */
  corte_por?: string | null;
  /** Nombre visible de quien hizo el corte. */
  corte_por_nombre?: string | null;
}

/** Corte de inventario: lo que hay que decir para cerrar partiendo del stock real. */
export interface CorteInventario {
  motivo: string;
  porNombre?: string | null;
}

export interface Mercado {
  id: string;
  numero: string | null;
  inicio_at: string;
  cierre_at: string | null;
  estado: 'abierto' | 'cerrado';
  saldo_inicial: SaldoViver[];
  saldo_final: SaldoViver[] | null;
  resumen: ResumenViver[] | null;
  totales: TotalesMercado | null;
  cerrado_por: string | null;
  nota: string | null;
  created_at: string;
  /** Foto de los movimientos del ciclo, congelada al cerrar (28/09/2026). Los
   *  ciclos cerrados antes no la traen y su detalle se lee del kardex. */
  movimientos: MovimientosCiclo | null;
}

function normalizar(r: Record<string, unknown>): Mercado {
  return {
    id: String(r.id),
    numero: (r.numero as string) ?? null,
    inicio_at: String(r.inicio_at),
    cierre_at: (r.cierre_at as string) ?? null,
    estado: r.estado === 'cerrado' ? 'cerrado' : 'abierto',
    saldo_inicial: Array.isArray(r.saldo_inicial) ? (r.saldo_inicial as SaldoViver[]) : [],
    saldo_final: Array.isArray(r.saldo_final) ? (r.saldo_final as SaldoViver[]) : null,
    resumen: Array.isArray(r.resumen) ? (r.resumen as ResumenViver[]) : null,
    totales: (r.totales as TotalesMercado) ?? null,
    cerrado_por: (r.cerrado_por as string) ?? null,
    nota: (r.nota as string) ?? null,
    created_at: String(r.created_at),
    movimientos: (r.movimientos as MovimientosCiclo) ?? null,
  };
}

/** Foto del stock actual de cada víver (para saldo inicial/final). */
export function snapshotViveres(viveres: Producto[]): SaldoViver[] {
  return viveres
    .map((p) => ({
      producto_id: p.id, sku: p.sku, nombre: p.nombre,
      unidad: p.unidad ?? null, cantidad: round2(Number(p.stock) || 0),
    }));
}

/** Correlativo del mercado: MK-AAAA-#### (atómico, reusa next_correlativo). */
async function nextNumeroMercado(): Promise<string> {
  const year = new Date().getFullYear();
  const { data, error } = await supabase.rpc('next_correlativo', { p_clave: `cocina-mercado-${year}` });
  if (error) throw error;
  return `MK-${year}-${String(Number(data) || 1).padStart(4, '0')}`;
}

/** El mercado ABIERTO actual (o null si no hay ninguno). */
export async function getMercadoActivo(): Promise<Mercado | null> {
  const { data, error } = await supabase.from(TABLE).select('*')
    .eq('estado', 'abierto').order('inicio_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? normalizar(data as Record<string, unknown>) : null;
}

/**
 * Inicia un mercado. Lo abre una PERSONA, con el botón «Iniciar mercado».
 *
 * Reemplaza a `asegurarMercadoActivo`, que la pantalla llamaba en cada carga y que
 * creaba un mercado cada vez que no encontraba uno abierto. Con eso, un mercado
 * descartado reaparecía abierto en la carga siguiente sin que nadie lo decidiera,
 * y dos pantallas abiertas a la vez podían crear dos.
 *
 * Empieza en el INSTANTE del clic (decisión del usuario, 14/09/2026 16:54): lo movido antes
 * queda dentro del saldo inicial y no cuenta como entrada ni consumo del ciclo. El saldo es
 * el stock de ese instante; como leer el inventario tarda, se corrige con lo movido desde el
 * clic (reconstruirSaldo). Las reglas viven en mercadoInicio.ts. La guarda está aquí y no
 * solo en la pantalla, porque la pantalla se puede saltear.
 */
export async function iniciarMercado(): Promise<Mercado> {
  // La hora va primero, antes de cualquier espera: es el instante en que se presionó el botón.
  const clic = new Date().toISOString();
  const actual = await getMercadoActivo();
  if (actual) throw new Error(`Ya hay un mercado abierto (${actual.numero ?? 'sin número'}). Recarga la pantalla.`);
  const previos = await listMercados();
  const inicio = resolverInicio(clic, previos);
  if ('error' in inicio) throw new Error(inicio.error);
  const vs = await listViveres();
  const ahora = new Date().toISOString();
  const ids = new Set(vs.map((p) => p.id));
  const [entradas, { porViver: consumos }, mermas] = await Promise.all([
    entradasPorViver(inicio.inicio_at, ahora, ids),
    consumoDelCiclo(inicio.inicio_at, ahora),
    mermasPorViver(inicio.inicio_at, ahora, ids),
  ]);
  const numero = await nextNumeroMercado();
  const { data, error } = await supabase.from(TABLE).insert({
    numero, estado: 'abierto', inicio_at: inicio.inicio_at,
    saldo_inicial: reconstruirSaldo(vs, entradas, consumos, mermas),
  }).select('*').single();
  if (error) throw error;
  return normalizar(data as Record<string, unknown>);
}

/** Estado del contador del ciclo: día actual, días que faltan y si ya venció (día 22+). */
export function diasDelCiclo(m: Mercado): { transcurridos: number; dia: number; faltan: number; vencido: boolean } {
  const ini = new Date(m.inicio_at).getTime();
  const ahora = Date.now();
  const transcurridos = Math.max(0, Math.floor((ahora - ini) / 86_400_000));
  const dia = transcurridos + 1;                 // día 1 = el día que arrancó
  const faltan = Math.max(0, CICLO_DIAS - dia);
  return { transcurridos, dia, faltan, vencido: dia > CICLO_DIAS };
}

/** Entradas de inventario (nuevo mercado) por víver dentro de la ventana [desde, hasta].
 *
 *  Se excluye lo de cocina para que los tres cajones de la ecuación —entradas, consumo y
 *  mermas— no se pisen: lo de cocina lo netea `consumoDelCiclo` (un reverso de comida
 *  resta consumo; si además contara como entrada, inflaría el disponible). */
async function entradasPorViver(desde: string, hasta: string, viverIds: Set<string>): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('movimientos')
    .select('producto_id, delta, tipo, at')
    .eq('tipo', 'entrada').or(NO_COCINA).gte('at', desde).lte('at', hasta);
  if (error) throw error;
  const out = new Map<string, number>();
  for (const r of (data ?? []) as { producto_id: string; delta: number }[]) {
    if (!viverIds.has(r.producto_id)) continue;
    out.set(r.producto_id, round2((out.get(r.producto_id) ?? 0) + (Number(r.delta) || 0)));
  }
  return out;
}

/** Movimientos del kardex que NO vienen de la cocina. Cuáles son los `ref_tipo` de
 *  cocina lo dice `claseMovimiento`, que es la misma lista que usa el control de
 *  distribución: de ahí sale que las dos pantallas den el mismo número. */
const NO_COCINA = NO_COCINA_OR;

/** Los `ref_tipo` que son consumo de cocina, para el `in` de PostgREST. */
const COCINA = [...REF_TIPOS_COCINA];

/**
 * Mermas y salidas por víver dentro de la ventana [desde, hasta]: todo lo que bajó el
 * inventario sin ser una comida. Decisión del usuario (15/09/2026): el mercado resta las
 * pérdidas en su propia columna, a la vista y sin mezclarlas con el costo por plato. Antes
 * quedaban fuera de la cuenta y aparecían como «diferencia»: 25 pollos perdidos se leían
 * como un −25 sin explicación. Las reglas (qué es merma) viven en `sumarMermas`.
 *
 * El filtro de cocina va también en la consulta: las comidas son cientos de filas por ciclo
 * y, sin él, el tope de filas de la API podía dejar mermas afuera.
 */
async function mermasPorViver(desde: string, hasta: string, viverIds: Set<string>): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('movimientos')
    .select('producto_id, delta, ref_tipo')
    .lt('delta', 0).or(NO_COCINA).gte('at', desde).lte('at', hasta);
  if (error) throw error;
  return sumarMermas((data ?? []) as MovimientoParaMerma[], viverIds);
}

/**
 * Consumo de cocina dentro de la ventana [desde, hasta]: por víver (cantidad y valor) y los
 * platos servidos, que alimentan el costo por plato del panel (como en MGG).
 *
 * SE MIDE SOBRE EL KARDEX, no sobre la fecha de servicio de las comidas (21/09/2026). El
 * porqué está en `sumarConsumoCocina`: mezclar los dos relojes hacía que una comida cargada
 * con fecha retroactiva descontara stock dentro del ciclo pero no contara como consumo, y el
 * panel denunciaba un faltante que no existía y que ya no se podía corregir.
 *
 * Los PLATOS siguen el mismo criterio: son los de las comidas cuyo descuento cayó en la
 * ventana. Si el costo entra en este ciclo, los platos también; si no, el costo por plato
 * saldría de dividir el gasto de unas comidas por los platos de otras.
 */
async function consumoDelCiclo(desde: string, hasta: string): Promise<{
  porViver: Map<string, { cantidad: number; valor: number }>; platos: number;
}> {
  // Paginado: `movimientos` pasa las 1.000 filas y PostgREST corta sin avisar.
  const movs = await todasLasFilas<MovimientoConsumo>((a, b) => supabase.from('movimientos')
    .select('producto_id, delta, costo_promedio, precio_unitario, ref_id')
    .in('ref_tipo', COCINA).gte('at', desde).lte('at', hasta)
    .order('at').order('id').range(a, b));
  const { porViver, comidaIds } = sumarConsumoCocina(movs);

  let platos = 0;
  if (comidaIds.size) {
    const { data } = await supabase.from('cocina_movimientos').select('platos').in('id', [...comidaIds]);
    for (const m of (data ?? []) as { platos: number | null }[]) {
      platos += Math.max(0, Math.trunc(Number(m.platos) || 0));
    }
  }
  return { porViver, platos };
}

/**
 * Junta TODOS los movimientos del ciclo para dejarlos congelados en el histórico
 * (28/09/2026). Antes el detalle de un ciclo cerrado se rearmaba consultando el
 * kardex por rango de fechas: si alguien corregía un movimiento en Inventario,
 * un ciclo ya cerrado cambiaba solo. Ahora el ciclo cerrado es una foto fija.
 */
export async function congelarMovimientos(m: Mercado, hastaISO: string, viverIds: Set<string>): Promise<MovimientosCiclo> {
  const [ent, cons, mer] = await Promise.all([
    todasLasFilas<{ producto_id: string; delta: number; at: string; ref_codigo: string | null }>((a, b) =>
      supabase.from('movimientos').select('producto_id, delta, at, ref_codigo')
        .eq('tipo', 'entrada').or(NO_COCINA).gte('at', m.inicio_at).lte('at', hastaISO)
        .order('at').order('id').range(a, b)),
    todasLasFilas<{ producto_id: string; delta: number; at: string; costo_promedio: number | null; precio_unitario: number | null; ref_id: string | null; ref_codigo: string | null }>((a, b) =>
      supabase.from('movimientos').select('producto_id, delta, at, costo_promedio, precio_unitario, ref_id, ref_codigo')
        .in('ref_tipo', COCINA).gte('at', m.inicio_at).lte('at', hastaISO)
        .order('at').order('id').range(a, b)),
    todasLasFilas<{ producto_id: string; delta: number; at: string; tipo: string; detalle: string | null; ref_tipo: string | null }>((a, b) =>
      supabase.from('movimientos').select('producto_id, delta, at, tipo, detalle, ref_tipo')
        .lt('delta', 0).or(NO_COCINA).gte('at', m.inicio_at).lte('at', hastaISO)
        .order('at').order('id').range(a, b)),
  ]);

  // El tipo de comida se trae de una sola vez para no pedirlo fila por fila.
  const comidaIds = [...new Set(cons.map((r) => r.ref_id).filter((x): x is string => !!x))];
  const comidas = new Map<string, { codigo: string | null; tipo_comida: string | null }>();
  for (let i = 0; i < comidaIds.length; i += 200) {
    const { data } = await supabase.from('cocina_movimientos').select('id, codigo, tipo_comida').in('id', comidaIds.slice(i, i + 200));
    for (const c of (data ?? []) as { id: string; codigo: string | null; tipo_comida: string | null }[]) {
      comidas.set(c.id, { codigo: c.codigo, tipo_comida: c.tipo_comida });
    }
  }

  return {
    entradas: ent.filter((r) => viverIds.has(r.producto_id)).map((r) => ({
      producto_id: r.producto_id, fecha: r.at, cantidad: round2(Number(r.delta) || 0), ref: r.ref_codigo,
    })),
    consumos: cons.filter((r) => viverIds.has(r.producto_id) && (Number(r.delta) || 0) !== 0).map((r) => {
      const cantidad = round2(-(Number(r.delta) || 0));
      const precio = Number(r.costo_promedio) || Number(r.precio_unitario) || 0;
      const c = r.ref_id ? comidas.get(r.ref_id) : undefined;
      return {
        producto_id: r.producto_id, fecha: r.at, cantidad, valor: round2(cantidad * precio),
        ref: c?.codigo ?? r.ref_codigo ?? null, detalle: c?.tipo_comida ?? null,
      };
    }),
    mermas: mer.filter((r) => viverIds.has(r.producto_id) && esMerma(r)).map((r) => ({
      producto_id: r.producto_id, fecha: r.at, cantidad: round2(Math.abs(Number(r.delta) || 0)),
      ref: r.tipo, detalle: r.detalle?.trim() || null,
    })),
    congelado_at: hastaISO,
  };
}

/** Mismo criterio que `sumarMermas`: baja de stock que no es una comida. */
function esMerma(r: { tipo: string; ref_tipo: string | null }): boolean {
  return !esDeCocina(r.ref_tipo);
}
/**
 * Resumen del ciclo por víver: saldo inicial (del mercado anterior) + entradas (nuevo
 * mercado) = disponible; consumo de cocina; y lo que queda (stock actual). `hastaISO`
 * permite congelar la ventana al cerrar (por defecto, ahora).
 */
export async function computeResumen(
  m: Mercado, viveres: Producto[], hastaISO?: string,
): Promise<{ items: ResumenViver[]; totales: TotalesMercado }> {
  const hasta = hastaISO ?? new Date().toISOString();
  const viverIds = new Set(viveres.map((p) => p.id));
  const [entradas, { porViver: consumos, platos }, mermas] = await Promise.all([
    entradasPorViver(m.inicio_at, hasta, viverIds),
    consumoDelCiclo(m.inicio_at, hasta),
    mermasPorViver(m.inicio_at, hasta, viverIds),
  ]);
  const inicialPorId = new Map(m.saldo_inicial.map((s) => [s.producto_id, Number(s.cantidad) || 0]));
  // Unión de víveres actuales + los que tenían saldo inicial (por si alguno se agotó/desactivó).
  const idsTodos = new Set<string>([...viverIds, ...inicialPorId.keys()]);
  const prodPorId = new Map(viveres.map((p) => [p.id, p]));
  const iniPorId = new Map(m.saldo_inicial.map((s) => [s.producto_id, s]));

  const items: ResumenViver[] = [];
  for (const id of idsTodos) {
    const p = prodPorId.get(id);
    const ini = iniPorId.get(id);
    const saldoInicial = inicialPorId.get(id) ?? 0;
    const ent = entradas.get(id) ?? 0;
    const cons = consumos.get(id)?.cantidad ?? 0;
    const mer = mermas.get(id) ?? 0;
    const queda = p ? round2(Number(p.stock) || 0) : round2(saldoInicial + ent - cons - mer);
    const disponible = round2(saldoInicial + ent);
    // Solo interesan víveres con algún movimiento/saldo en el ciclo.
    if (saldoInicial === 0 && ent === 0 && cons === 0 && mer === 0 && queda === 0) continue;
    items.push({
      producto_id: id,
      sku: p?.sku ?? ini?.sku ?? '',
      nombre: p?.nombre ?? ini?.nombre ?? '(víver)',
      unidad: p?.unidad ?? ini?.unidad ?? null,
      saldo_inicial: round2(saldoInicial), entradas: ent, disponible, consumo: cons, mermas: mer, queda,
    });
  }
  items.sort((a, b) => a.nombre.localeCompare(b.nombre));

  const totales: TotalesMercado = {
    viveres: items.length,
    // Solo las comidas: las mermas se ven en su columna pero no encarecen el plato.
    consumo_valor: round2([...consumos.values()].reduce((a, c) => a + c.valor, 0)),
    entradas_total: round2(items.reduce((a, i) => a + i.entradas, 0)),
    queda_viveres: items.filter((i) => i.queda > 0).length,
    mermas_total: round2(items.reduce((a, i) => a + (i.mermas ?? 0), 0)),
    platos,
  };
  return { items, totales };
}

/**
 * Cierra el mercado abierto. Desde el 28/09/2026 el cierre es la ÚNICA salida, y
 * no descarta nada de lo que hay:
 *
 *   1. congela el resumen y TODOS los movimientos del ciclo (entradas, comidas y
 *      mermas) en el histórico, para que un ciclo cerrado ya no cambie aunque
 *      después se corrija algo en Inventario;
 *   2. guarda la foto de lo que quedó en la despensa;
 *   3. ABRE el mercado siguiente con ese saldo. Sobre él se van sumando las
 *      entradas del mercado nuevo.
 *
 * Devuelve el mercado cerrado (con resumen y totales) para el reporte.
 *
 * CORTE DE INVENTARIO (01/10/2026). Con `corte`, el cierre es además un corte: el ciclo
 * que cierra —y todos los cerrados antes— quedan en el histórico mostrando solo sus
 * entradas, y el mercado nuevo arranca con el stock real de este instante. No se borra
 * nada: el resumen y los movimientos se guardan igual. Las reglas viven en mercadoCorte.ts.
 */
export async function cerrarMercado(
  m: Mercado, actorEmail: string, nota?: string | null, corte?: CorteInventario | null,
): Promise<Mercado> {
  if (m.estado !== 'abierto') throw new Error('El mercado ya está cerrado.');
  const cierre = new Date().toISOString();

  // GT-SIN-12 · Los víveres se releen de la BASE, no se reciben del componente.
  // Antes el `queda` y el saldo final salían del array que la pantalla tenía en
  // memoria, mientras el consumo sí se leía fresco: el mismo cálculo mezclaba
  // dos instantes. Si alguien registraba el almuerzo con el diálogo de cierre
  // abierto (y la pestaña en segundo plano no refresca), el ciclo siguiente
  // arrancaba con kilos que ya no existían y el informe no cerraba su cuenta.
  const viveres = await listViveres();
  const { items, totales } = await computeResumen(m, viveres, cierre);
  const saldoFinal = snapshotViveres(viveres).filter((s) => s.cantidad > 0);
  // La foto de lo que se movió en el ciclo: es lo que se va al histórico.
  const movimientos = await congelarMovimientos(m, cierre, new Set(viveres.map((p) => p.id)));

  const motivoCorte = corte?.motivo?.trim() || null;
  const totalesFinal: TotalesMercado = motivoCorte
    ? { ...totales, ...marcaCorte({ at: cierre, motivo: motivoCorte, por: actorEmail, porNombre: corte?.porNombre }) }
    : totales;

  const { data, error } = await supabase.from(TABLE).update({
    estado: 'cerrado', cierre_at: cierre, cerrado_por: actorEmail,
    saldo_final: saldoFinal, resumen: items, totales: totalesFinal, movimientos,
    nota: (motivoCorte ?? nota?.trim()) || null,
  }).eq('id', m.id).eq('estado', 'abierto').select('*').single();
  if (error) throw error;

  // Abre el siguiente ciclo con lo que quedó: NO se descarta nada de la despensa.
  // El saldo sale del resumen del ciclo (la columna «Queda»), que es la misma cifra
  // que se imprime en el reporte: así lo que dice el papel es con lo que arranca el
  // mercado nuevo. Si esto falla, se reabre el ciclo anterior: quedarse sin NINGÚN
  // mercado abierto deja la pantalla de Cocina sin ciclo y sin forma de registrar.
  try {
    const numero = await nextNumeroMercado();
    const { error: eIns } = await supabase.from(TABLE).insert({
      numero, estado: 'abierto', inicio_at: cierre, saldo_inicial: saldoParaElNuevo(items),
    });
    if (eIns) throw eIns;
  } catch (e) {
    await supabase.from(TABLE)
      .update({ estado: 'abierto', cierre_at: null, cerrado_por: null })
      .eq('id', m.id).eq('estado', 'cerrado');
    throw e;
  }
  // Corte: los ciclos cerrados antes también pasan a mostrar solo sus entradas. Si esto
  // falla, el corte ya está hecho (el ciclo nuevo arrancó bien) y no se deshace por una
  // marca: a lo sumo un ciclo viejo sigue mostrando su resumen completo.
  if (motivoCorte) await marcarHistoricoSoloEntradas().catch(() => undefined);
  return normalizar(data as Record<string, unknown>);
}

/**
 * Marca TODOS los ciclos cerrados como «solo entradas». Se usa en el corte de inventario:
 * lo anterior al corte queda en el histórico mostrando únicamente lo que entró. Solo toca
 * la marca de `totales`; el resumen y los movimientos guardados no cambian.
 */
export async function marcarHistoricoSoloEntradas(): Promise<number> {
  const { data, error } = await supabase.from(TABLE).select('id, totales').eq('estado', 'cerrado');
  if (error) throw error;
  let marcados = 0;
  for (const r of (data ?? []) as { id: string; totales: TotalesMercado | null }[]) {
    if (r.totales?.solo_entradas === true) continue;
    const { error: eUpd } = await supabase.from(TABLE)
      .update({ totales: { ...(r.totales ?? {}), solo_entradas: true } }).eq('id', r.id);
    if (eUpd) throw eUpd;
    marcados++;
  }
  return marcados;
}

/* Descartar un mercado se quitó el 28/09/2026: tirar el saldo que quedaba generaba
   controversias y dejaba al ciclo siguiente arrancando en cero con la despensa llena.
   La única salida es CERRAR, que conserva lo que hay. Los mercados descartados antes
   de esa fecha siguen en el histórico, con su motivo y su firma: no se borró nada. */
/** Historial de ciclos (cerrados y el abierto), más recientes primero. */
export async function listMercados(): Promise<Mercado[]> {
  const { data, error } = await supabase.from(TABLE).select('*').order('inicio_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => normalizar(r as Record<string, unknown>));
}

/** Solo los ciclos CERRADOS (histórico), más recientes primero. */
export async function listMercadosCerrados(): Promise<Mercado[]> {
  const { data, error } = await supabase.from(TABLE).select('*')
    .eq('estado', 'cerrado').order('cierre_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => normalizar(r as Record<string, unknown>));
}

/** Recalcula los totales de un resumen editado (para el histórico). */
export function totalesDesdeResumen(items: ResumenViver[]): TotalesMercado {
  return {
    viveres: items.length,
    consumo_valor: 0,   // el valor $ del consumo no se recalcula al editar cantidades a mano
    entradas_total: round2(items.reduce((a, i) => a + (Number(i.entradas) || 0), 0)),
    queda_viveres: items.filter((i) => (Number(i.queda) || 0) > 0).length,
    mermas_total: round2(items.reduce((a, i) => a + (Number(i.mermas) || 0), 0)),
  };
}

/**
 * Edita un ciclo CERRADO del histórico: nota y/o el resumen por víver (cantidades). Al
 * guardar el resumen, recalcula `disponible` (= saldo + entradas), los totales y la foto
 * `saldo_final` (lo que queda). Corrige el reporte de ESE ciclo; no reescribe el ciclo
 * siguiente (que ya arrancó con su propio saldo).
 */
export async function actualizarMercadoHistorico(
  id: string, patch: { resumen?: ResumenViver[]; nota?: string | null },
): Promise<Mercado> {
  const upd: Record<string, unknown> = {};
  if (patch.nota !== undefined) upd.nota = patch.nota?.trim() || null;
  if (patch.resumen !== undefined) {
    // Lo que la edición no recalcula se toma de lo guardado: el valor del consumo
    // (antes quedaba en $0 al guardar, aunque solo se tocara la nota) y la marca de
    // descarte. Un mercado descartado no se corrige: sus cifras son las del descarte.
    const { data: actual, error: eActual } = await supabase.from(TABLE).select('totales').eq('id', id).single();
    if (eActual) throw eActual;
    const previos = (actual as { totales?: TotalesMercado | null } | null)?.totales ?? null;
    if (previos?.descartado) {
      throw new Error('Un mercado descartado no se corrige: sus cifras quedan como estaban al descartarlo.');
    }
    if (previos?.solo_entradas) {
      throw new Error('Este ciclo quedó antes del corte de inventario: muestra solo sus entradas y no se corrige.');
    }
    const items = patch.resumen.map((r) => {
      const saldo = round2(Number(r.saldo_inicial) || 0);
      const ent = round2(Number(r.entradas) || 0);
      const cons = round2(Number(r.consumo) || 0);
      const mer = round2(Number(r.mermas) || 0);
      const queda = round2(Number(r.queda) || 0);
      return { ...r, saldo_inicial: saldo, entradas: ent, consumo: cons, mermas: mer, queda, disponible: round2(saldo + ent) };
    });
    upd.resumen = items;
    upd.totales = { ...(previos ?? {}), ...totalesDesdeResumen(items), consumo_valor: previos?.consumo_valor ?? 0 };
    upd.saldo_final = items.filter((i) => i.queda > 0).map((i) => ({
      producto_id: i.producto_id, sku: i.sku, nombre: i.nombre, unidad: i.unidad, cantidad: i.queda,
    }));
  }
  const { data, error } = await supabase.from(TABLE).update(upd).eq('id', id).select('*').single();
  if (error) throw error;
  return normalizar(data as Record<string, unknown>);
}

/**
 * Elimina un ciclo del histórico (no repone stock ni toca el ciclo abierto).
 *
 * Un mercado DESCARTADO no se elimina: es el rastro de por qué ese ciclo no cuenta.
 * La pantalla ya oculta el botón; la guarda va también aquí porque la pantalla se
 * puede saltear.
 */
export async function eliminarMercado(id: string): Promise<void> {
  const { data: actual, error: eActual } = await supabase.from(TABLE).select('totales').eq('id', id).maybeSingle();
  if (eActual) throw eActual;
  if ((actual as { totales?: TotalesMercado | null } | null)?.totales?.descartado) {
    throw new Error('Un mercado descartado no se elimina: es el rastro de por qué ese ciclo no cuenta.');
  }
  if ((actual as { totales?: TotalesMercado | null } | null)?.totales?.solo_entradas) {
    throw new Error('Este ciclo es el rastro del corte de inventario (guarda las entradas): no se elimina.');
  }
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

/** Detalle por víver de un ciclo: la nueva entrada, los consumos y las mermas (con fechas). */
export interface DetalleViverCiclo {
  entradas: { fecha: string; cantidad: number; ref?: string | null }[];
  consumos: { fecha: string; cantidad: number; valor: number; codigo?: string | null; tipo_comida?: string | null }[];
  /** Salidas que no son comidas, con su motivo tal como se escribió en el inventario. */
  mermas: { fecha: string; cantidad: number; tipo: string; detalle: string | null; actor: string | null }[];
}
export async function detalleViverCiclo(m: Mercado, productoId: string, hastaISO?: string): Promise<DetalleViverCiclo> {
  // Ciclo cerrado con su foto (28/09/2026 en adelante): se lee de ahí. Así el detalle
  // dice lo mismo que el reporte del cierre aunque después se corrija algo en Inventario.
  if (tieneCongelados(m)) {
    const f = movimientosDeViver(m.movimientos, productoId);
    return {
      entradas: f.entradas.map((x) => ({ fecha: x.fecha, cantidad: x.cantidad, ref: x.ref ?? null })),
      consumos: f.consumos.map((x) => ({
        fecha: x.fecha, cantidad: x.cantidad, valor: x.valor ?? 0,
        codigo: x.ref ?? null, tipo_comida: x.detalle ?? null,
      })),
      mermas: f.mermas.map((x) => ({
        fecha: x.fecha, cantidad: x.cantidad, tipo: x.ref ?? 'salida', detalle: x.detalle ?? null, actor: null,
      })),
    };
  }
  const hasta = hastaISO ?? m.cierre_at ?? new Date().toISOString();
  // Los consumos salen del KARDEX, igual que la cuenta del ciclo (ver consumoDelCiclo):
  // así la lista que se ve aquí explica exactamente el número de arriba. La comida solo
  // aporta su código y el tipo; la fecha que se muestra es la del movimiento, que es
  // cuando el víver salió de verdad del inventario.
  const [movs, consumoMovs, salidas] = await Promise.all([
    supabase.from('movimientos').select('delta, at, ref_codigo, tipo')
      .eq('tipo', 'entrada').or(NO_COCINA).eq('producto_id', productoId).gte('at', m.inicio_at).lte('at', hasta).order('at'),
    supabase.from('movimientos').select('delta, at, costo_promedio, precio_unitario, ref_id, ref_codigo')
      .in('ref_tipo', COCINA).eq('producto_id', productoId).gte('at', m.inicio_at).lte('at', hasta).order('at'),
    supabase.from('movimientos').select('delta, at, tipo, detalle, actor_name, actor')
      .eq('producto_id', productoId).lt('delta', 0).or(NO_COCINA).gte('at', m.inicio_at).lte('at', hasta).order('at'),
  ]);
  const entradas = ((movs.data ?? []) as { delta: number; at: string; ref_codigo: string | null }[])
    .map((r) => ({ fecha: r.at, cantidad: round2(Number(r.delta) || 0), ref: r.ref_codigo }));
  const mermas = ((salidas.data ?? []) as { delta: number; at: string; tipo: string; detalle: string | null; actor_name: string | null; actor: string | null }[])
    .map((r) => ({
      fecha: r.at, cantidad: round2(Math.abs(Number(r.delta) || 0)), tipo: r.tipo,
      detalle: r.detalle?.trim() || null, actor: r.actor_name ?? r.actor ?? null,
    }));
  type FilaConsumo = {
    delta: number; at: string; costo_promedio: number | null; precio_unitario: number | null;
    ref_id: string | null; ref_codigo: string | null;
  };
  const filas = (consumoMovs.data ?? []) as FilaConsumo[];
  // Un solo viaje para los códigos y el tipo de comida de todos los movimientos.
  const ids = [...new Set(filas.map((r) => r.ref_id).filter((x): x is string => !!x))];
  const comidas = new Map<string, { codigo: string | null; tipo_comida: string | null }>();
  if (ids.length) {
    const { data } = await supabase.from('cocina_movimientos').select('id, codigo, tipo_comida').in('id', ids);
    for (const c of (data ?? []) as { id: string; codigo: string | null; tipo_comida: string | null }[]) {
      comidas.set(c.id, { codigo: c.codigo, tipo_comida: c.tipo_comida });
    }
  }
  const consumos: DetalleViverCiclo['consumos'] = filas.map((r) => {
    const cantidad = round2(-(Number(r.delta) || 0));
    const precio = Number(r.costo_promedio) || Number(r.precio_unitario) || 0;
    const comida = r.ref_id ? comidas.get(r.ref_id) : undefined;
    return {
      fecha: r.at, cantidad, valor: round2(cantidad * precio),
      codigo: comida?.codigo ?? r.ref_codigo ?? null,
      tipo_comida: comida?.tipo_comida ?? null,
    };
  });
  return { entradas, consumos, mermas };
}

/* ───────── Las entradas y salidas del ciclo, para la pantalla (28/09/2026) ─────────
   Pedido del usuario: que lo que se ve en Alimentación coincida con Inventario. Los
   totales ya salían del mismo kardex; lo que faltaba eran las FILAS detrás. Un ciclo
   cerrado las lee de su foto congelada, así el histórico no cambia. */

/** Las entradas, salidas y ajustes de víveres del ciclo (las comidas van aparte). */
export async function listMovInventarioCiclo(
  m: Mercado, viveres: Producto[], hastaISO?: string,
): Promise<MovInventario[]> {
  const secos = viveres.map((p) => ({ id: p.id, nombre: p.nombre, unidad: p.unidad ?? null }));

  // Ciclo cerrado con su foto: se lee de ahí, como el detalle del víver.
  if (tieneCongelados(m)) {
    const mv = m.movimientos!;
    const crudas: FilaKardex[] = [
      ...mv.entradas.map((x, i) => ({
        id: `e${i}`, producto_id: x.producto_id, delta: x.cantidad, at: x.fecha,
        tipo: 'entrada', ref_codigo: x.ref ?? null, detalle: x.detalle ?? null,
      })),
      ...mv.mermas.map((x, i) => ({
        id: `m${i}`, producto_id: x.producto_id, delta: -Math.abs(x.cantidad), at: x.fecha,
        // En la foto, `ref` guarda el tipo del kardex y `detalle` el motivo.
        tipo: x.ref ?? 'salida', detalle: x.detalle ?? null,
      })),
    ];
    return filasInventario(crudas, secos);
  }

  const hasta = hastaISO ?? m.cierre_at ?? new Date().toISOString();
  const filas = await todasLasFilas<FilaKardex>((a, b) =>
    supabase.from('movimientos').select('id, producto_id, delta, at, tipo, ref_tipo, ref_codigo, detalle, actor_name, actor')
      .or(NO_COCINA).gte('at', m.inicio_at).lte('at', hasta)
      .order('at', { ascending: false }).order('id').range(a, b));
  return filasInventario(filas, secos);
}
