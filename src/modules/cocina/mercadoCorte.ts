/* ============================================================
   Golden Touch · Cocina · Corte de inventario: partir del stock real

   Pedido del usuario (01/10/2026): «en Distribución de comidas vamos a partir
   con lo que está. Coloca lo demás en un histórico que se vea solo las
   entradas». El stock de ese día —el mercado que entró más los ajustes hechos
   en Inventario— es lo real, y de ahí arranca la cuenta.

   LA METODOLOGÍA (decisión del usuario, 01/10/2026, 16:46): «al hacer el corte,
   el saldo que estaba será el inicio del nuevo mercado + lo nuevo». El mercado
   nuevo NO arranca en el instante del clic con todo adentro del saldo: arranca
   en el instante en que ENTRÓ la compra nueva. Su saldo inicial es lo que había
   justo antes, y la compra —y todo lo movido después: comidas, salidas y los
   ajustes hechos en Inventario— cuenta dentro del ciclo nuevo. Así
       saldo que estaba + lo nuevo − consumo − salidas/ajustes = stock real.

   EL CORTE ES UN CIERRE, CON DOS DIFERENCIAS
   · El ciclo cierra en el instante en que entró el mercado nuevo, y el nuevo
     abre ahí mismo con el saldo de ese instante (no se descarta nada).
   · Los ciclos anteriores quedan en «Mercados cerrados» mostrando SOLO LAS
     ENTRADAS: su consumo, sus mermas y su saldo ya no describen el almacén y
     se dejan de mostrar. No se borra nada: los datos siguen guardados en el
     ciclo, la marca solo cambia lo que se ve.

   La marca vive en `totales` (jsonb), como la del descarte: no pide migración.
   Aquí viven las piezas que se prueban sin base ni React.
   ============================================================ */
import type { ResumenViver } from './cocinaMercado.repository';
import type { MovimientosCiclo } from './mercadoCierre';
import { diaCaracas } from './mercadoInicio';

const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

/** Largo mínimo del motivo del corte: tiene que explicar algo dentro de seis meses. */
export const MOTIVO_CORTE_MIN = 10;

/** El motivo que se propone al abrir el diálogo (se puede cambiar). */
export const MOTIVO_CORTE_SUGERIDO =
  'Corte de mercado: el saldo que había es el inicio del mercado nuevo, más lo que entró.';

export function motivoCorteValido(motivo: string | null | undefined): boolean {
  return (motivo ?? '').trim().length >= MOTIVO_CORTE_MIN;
}

/** ¿De este ciclo se muestran solo las entradas? (quedó antes de un corte de inventario) */
export function esSoloEntradas(
  m: { totales?: { solo_entradas?: boolean | null } | null } | null | undefined,
): boolean {
  return m?.totales?.solo_entradas === true;
}

/** Lo que el corte le agrega a los totales del ciclo que cierra. */
export interface MarcaCorte {
  solo_entradas: true;
  /** Instante del corte (ISO). */
  corte_at: string;
  corte_motivo: string;
  corte_por: string | null;
  corte_por_nombre: string | null;
  /** Comprobante de la compra con la que arranca el mercado nuevo. `null` si arrancó en el instante del corte. */
  corte_mercado: string | null;
}

export function marcaCorte(o: { at: string; motivo: string; por?: string | null; porNombre?: string | null; mercado?: string | null }): MarcaCorte {
  return {
    solo_entradas: true,
    corte_at: o.at,
    corte_motivo: o.motivo.trim(),
    corte_por: o.por?.trim() || null,
    corte_por_nombre: o.porNombre?.trim() || null,
    corte_mercado: o.mercado?.trim() || null,
  };
}

/* ───────── Lo único que se ve de un ciclo anterior al corte: sus entradas ───────── */

/** Total de entradas de un víver en el ciclo. */
export interface EntradaViver {
  producto_id: string;
  sku: string;
  nombre: string;
  unidad: string | null;
  entradas: number;
}

/** Los víveres que tuvieron entradas en el ciclo, por nombre. Los que no recibieron nada no salen. */
export function entradasPorViver(resumen: ResumenViver[] | null | undefined): EntradaViver[] {
  return (resumen ?? [])
    .map((r) => ({
      producto_id: r.producto_id, sku: r.sku ?? '', nombre: r.nombre, unidad: r.unidad ?? null,
      entradas: r2(Number(r.entradas) || 0),
    }))
    .filter((r) => r.entradas > 0)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Suma de las entradas, en unidades. */
export function totalEntradas(filas: { entradas: number }[]): number {
  return r2(filas.reduce((a, f) => a + (Number(f.entradas) || 0), 0));
}

/** Una entrada con su fecha y su comprobante, tal como quedó congelada al cerrar. */
export interface EntradaFechada {
  producto_id: string;
  nombre: string;
  unidad: string | null;
  fecha: string;
  cantidad: number;
  /** Comprobante: la orden o solicitud de compra. `null` si fue una entrada manual. */
  ref: string | null;
}

/**
 * Las entradas del ciclo una por una (fecha, comprobante, víver, cantidad), de la más
 * vieja a la más nueva. Salen de la foto congelada al cerrar; un ciclo cerrado antes del
 * 28/09/2026 no la trae y devuelve una lista vacía (queda el total por víver).
 */
export function entradasFechadas(
  resumen: ResumenViver[] | null | undefined,
  mov: MovimientosCiclo | null | undefined,
): EntradaFechada[] {
  const porId = new Map((resumen ?? []).map((r) => [r.producto_id, r] as const));
  return (mov?.entradas ?? [])
    .filter((e) => (Number(e.cantidad) || 0) > 0)
    .map((e) => {
      const v = porId.get(e.producto_id);
      return {
        producto_id: e.producto_id, nombre: v?.nombre ?? '(víver)', unidad: v?.unidad ?? null,
        fecha: e.fecha, cantidad: r2(Number(e.cantidad) || 0), ref: e.ref?.trim() || null,
      };
    })
    .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime() || a.nombre.localeCompare(b.nombre, 'es'));
}

/* ───────── Las comidas que se ven al entrar: las del mercado en curso ───────── */

/**
 * Las comidas del mercado en curso. Una comida es del ciclo si se sirvió desde su inicio
 * o si se CARGÓ desde su inicio: el stock baja cuando se carga, así que una comida con
 * fecha atrasada cargada hoy también es consumo de este mercado.
 * Sin inicio (no hay mercado abierto) no se filtra nada.
 */
export function comidasDelCiclo<T extends { at: string; created_at?: string | null }>(
  movs: T[], inicioAt: string | null | undefined,
): T[] {
  const ini = Date.parse(inicioAt ?? '');
  if (!Number.isFinite(ini)) return movs;
  return movs.filter((m) => {
    const servida = Date.parse(m.at);
    const cargada = Date.parse(m.created_at ?? '');
    return (Number.isFinite(servida) && servida >= ini) || (Number.isFinite(cargada) && cargada >= ini);
  });
}

/* ───────── «Lo nuevo»: la compra con la que arranca el mercado nuevo ───────── */

/** Una fila de entrada del kardex con comprobante. */
export interface EntradaConComprobante {
  producto_id: string;
  delta: number | string | null;
  at: string;
  ref_codigo: string | null;
}

/** Una recepción de compra dentro del ciclo: candidata a ser «el mercado nuevo». */
export interface RecepcionCiclo {
  /** Comprobante (la solicitud u orden de compra). */
  ref: string;
  /** Instante del primer renglón recibido (ISO, tal como lo trae el kardex). */
  desde: string;
  /** Víveres distintos que entraron. */
  viveres: number;
  /** Unidades que entraron. */
  unidades: number;
}

/**
 * Agrupa las entradas por comprobante y día (una compra recibida en dos días son dos
 * recepciones). La más nueva primero: es la que se propone como mercado nuevo.
 */
export function agruparRecepciones(filas: EntradaConComprobante[]): RecepcionCiclo[] {
  const grupos = new Map<string, { ref: string; desde: string; ids: Set<string>; unidades: number }>();
  for (const f of filas) {
    const ref = f.ref_codigo?.trim();
    const cantidad = Number(f.delta) || 0;
    if (!ref || cantidad <= 0 || !Number.isFinite(Date.parse(f.at))) continue;
    const clave = `${ref}|${diaCaracas(f.at)}`;
    const g = grupos.get(clave) ?? { ref, desde: f.at, ids: new Set<string>(), unidades: 0 };
    if (Date.parse(f.at) < Date.parse(g.desde)) g.desde = f.at;
    g.ids.add(f.producto_id);
    g.unidades = r2(g.unidades + cantidad);
    grupos.set(clave, g);
  }
  return [...grupos.values()]
    .map((g) => ({ ref: g.ref, desde: g.desde, viveres: g.ids.size, unidades: g.unidades }))
    .sort((a, b) => Date.parse(b.desde) - Date.parse(a.desde));
}

/** Identifica una recepción en el selector del corte. */
export function claveRecepcion(r: RecepcionCiclo): string {
  return `${r.ref}|${r.desde}`;
}

/**
 * El instante en que arranca el mercado nuevo: un milisegundo ANTES del primer renglón de
 * la compra. Así la compra entera queda dentro del ciclo nuevo y nada de ella en el que
 * cierra (las dos ventanas incluyen sus bordes; con el mismo instante se contaría doble).
 */
export function instanteAntesDe(at: string): string {
  return new Date(Date.parse(at) - 1).toISOString();
}

/**
 * ¿El instante elegido sirve como inicio del mercado nuevo? Tiene que caer DENTRO del
 * ciclo que se cierra: después de su inicio y no en el futuro.
 */
export function validarInicioNuevo(
  inicioNuevo: string, inicioCiclo: string, ahora: string,
): { inicio: string } | { error: string } {
  const t = Date.parse(inicioNuevo ?? '');
  if (!Number.isFinite(t)) return { error: 'No se pudo leer la fecha del mercado nuevo. Prueba de nuevo.' };
  if (t <= Date.parse(inicioCiclo)) return { error: 'El mercado nuevo tiene que haber entrado después del inicio del ciclo que se cierra.' };
  if (t > Date.parse(ahora)) return { error: 'La compra elegida es posterior al momento del corte.' };
  return { inicio: new Date(t).toISOString() };
}

/* ───────── Rehacer un corte hecho «en el instante» ─────────
   Un corte sin compra elegida deja todo dentro del saldo del mercado nuevo. Si la compra
   ya había entrado, la metodología pide otra cosa: saldo que estaba + lo nuevo. Rehacer el
   corte mueve la frontera entre los dos ciclos al instante en que entró la compra, sin
   abrir otro mercado: el que cerró termina ahí y el abierto empieza ahí. */

/** Lo mínimo de un mercado para saber si su corte se puede rehacer. */
export interface MercadoParaCorte {
  estado: string;
  inicio_at: string;
  cierre_at?: string | null;
  totales?: { solo_entradas?: boolean | null; corte_at?: string | null; corte_mercado?: string | null } | null;
}

/**
 * ¿El mercado abierto nació de un corte «en el instante» de este mercado cerrado?
 * Tiene que ser un corte (con su marca), sin compra elegida todavía, y los dos ciclos
 * tienen que tocarse: el cierre de uno es el inicio del otro.
 */
export function esCorteRehacible(abierto: MercadoParaCorte, anterior: MercadoParaCorte): boolean {
  if (abierto.estado !== 'abierto' || anterior.estado !== 'cerrado') return false;
  if (!esSoloEntradas(anterior) || !anterior.totales?.corte_at || anterior.totales?.corte_mercado) return false;
  const cierre = Date.parse(anterior.cierre_at ?? '');
  return Number.isFinite(cierre) && cierre === Date.parse(abierto.inicio_at);
}

/** El mercado cerrado cuyo corte dio origen al abierto y todavía se puede rehacer, si lo hay. */
export function cortePrevio<T extends MercadoParaCorte>(abierto: MercadoParaCorte | null | undefined, cerrados: T[]): T | null {
  if (!abierto) return null;
  return cerrados.find((c) => esCorteRehacible(abierto, c)) ?? null;
}
