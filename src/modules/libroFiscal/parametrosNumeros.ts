/* ============================================================
   Golden Touch · Retenciones · Parámetros › los números escritos a mano
   Un solo lector (leerMonto, formato venezolano) para todo lo que se escribe
   en Parámetros, y NADA se guarda en silencio: lo que no se entiende bloquea
   el guardado con un mensaje que nombra el campo; nunca pasa a 0, null ni NaN.
   El vacío se distingue ANTES de leer: según el campo es «sin dato» (null),
   un valor por defecto o algo que falta.
   ============================================================ */
import { leerMonto, textoLeido } from './validarCarga';
import type { Tramo } from './tarifas.repository';
import type { EntradaPrueba } from './probarRegla';

export type Leido<T> = { valor: T } | { error: string };

/** «No se entiende el %: escribe 1.234,56 o 1234,56.» */
export const noSeEntiende = (campo: string) => `No se entiende ${campo}: escribe 1.234,56 o 1234,56.`;

const vacio = (t: string | null | undefined) => String(t ?? '').trim() === '';
/** Sin el «%» que a veces se escribe o se pega junto al número. */
const sinPct = (t: string) => String(t ?? '').replace(/%/g, '');

/** Vacío = null (sin dato); lo demás con leerMonto. */
export function leerOpcional(texto: string, campo: string): Leido<number | null> {
  if (vacio(sinPct(texto))) return { valor: null };
  const n = leerMonto(sinPct(texto));
  return n == null ? { error: noSeEntiende(campo) } : { valor: n };
}

/** Vacío = falta (con `siFalta`); lo demás con leerMonto. */
export function leerObligatorio(texto: string, campo: string, siFalta: string): Leido<number> {
  if (vacio(sinPct(texto))) return { error: siFalta };
  const n = leerMonto(sinPct(texto));
  return n == null ? { error: noSeEntiende(campo) } : { valor: n };
}

/** Vacío = `porDefecto`; lo demás con leerMonto. */
export function leerConDefecto(texto: string, campo: string, porDefecto: number): Leido<number> {
  if (vacio(sinPct(texto))) return { valor: porDefecto };
  const n = leerMonto(sinPct(texto));
  return n == null ? { error: noSeEntiende(campo) } : { valor: n };
}

/** Un entero (orden, prioridad, días, número de serie): vacío = `porDefecto`; «0» es 0; con decimales no se entiende. */
export function leerEntero(texto: string, campo: string, porDefecto: number): Leido<number> {
  const r = leerConDefecto(texto, campo, porDefecto);
  if ('error' in r) return r;
  return Number.isInteger(r.valor) ? r : { error: `${campo.charAt(0).toUpperCase()}${campo.slice(1)} va sin decimales.` };
}

/** «Se leyó 36.500,00»: solo si el texto tiene punto o coma (donde puede haber duda) y se entiende. */
export function pistaLeido(texto: string, decimales = 2): string | null {
  if (!/[.,]/.test(String(texto ?? ''))) return null;
  const t = textoLeido(sinPct(texto), decimales);
  return t ? `Se leyó ${t}` : null;
}

/* ───────── Tramos de una tarifa (R5) ───────── */

export interface FilaTramo { id?: string; desde: string; hasta: string; pct: string; sustraendo: string }

/**
 * Lo escrito en el editor → los tramos, o el primer campo que no se entiende.
 * «Hasta» vacío = sin tope (y solo vacío: ilegible bloquea). Sustraendo vacío = 0.
 */
export function filasATramos(filas: FilaTramo[]): Leido<Tramo[]> {
  const tramos: Tramo[] = [];
  for (const [i, f] of filas.entries()) {
    const n = i + 1;
    const desde = leerObligatorio(f.desde, `«Más de» del tramo ${n}`, `Indica «Más de» del tramo ${n}.`);
    if ('error' in desde) return desde;
    const hasta = leerOpcional(f.hasta, `«Hasta» del tramo ${n}`);
    if ('error' in hasta) return hasta;
    const pct = leerObligatorio(f.pct, `el % del tramo ${n}`, `Indica el % del tramo ${n}.`);
    if ('error' in pct) return pct;
    const sustraendo = leerConDefecto(f.sustraendo, `el sustraendo del tramo ${n}`, 0);
    if ('error' in sustraendo) return sustraendo;
    tramos.push({ id: f.id, desdeMonto: desde.valor, hastaMonto: hasta.valor, pct: pct.valor, sustraendo: sustraendo.valor });
  }
  return { valor: tramos };
}

/* ───────── Valor de un código de clasificación (R4) ───────── */

export interface TextosValorCodigo { pct: string; basePct: string; minimo: string; sustraendo: string }
export interface NumerosValorCodigo { pct: number | null; basePct: number; minimo: number | null; sustraendoFactor: number | null }

/** Los números del valor de un código. Con tarifa no hay %. Mínimo y factor vacíos = sin dato; ilegibles bloquean. */
export function leerValorCodigo(t: TextosValorCodigo, conTarifa: boolean): Leido<NumerosValorCodigo> {
  const pct = conTarifa ? { valor: null } : leerOpcional(t.pct, 'el %');
  if ('error' in pct) return pct;
  const basePct = leerObligatorio(t.basePct, 'la porción de la base', 'Indica la porción de la base (%).');
  if ('error' in basePct) return basePct;
  const minimo = leerOpcional(t.minimo, 'el mínimo');
  if ('error' in minimo) return minimo;
  const sustraendo = leerOpcional(t.sustraendo, 'el factor del sustraendo');
  if ('error' in sustraendo) return sustraendo;
  return { valor: { pct: pct.valor, basePct: basePct.valor, minimo: minimo.valor, sustraendoFactor: sustraendo.valor } };
}

/* ───────── «Probar la regla» (R7) ───────── */

export interface TextosPrueba { tasa: string; pago: string; base: string; iva: string }

/** Los montos de la prueba: la tasa solo fuera de Bs (vacía = sin tasa); pago, base e IVA vacíos = 0. */
export function entradaDePrueba(e: Omit<EntradaPrueba, 'tasa' | 'pago' | 'baseImponible' | 'iva'>, t: TextosPrueba): Leido<EntradaPrueba> {
  const tasa = e.moneda === 'Bs' ? { valor: null } : leerOpcional(t.tasa, 'la tasa');
  if ('error' in tasa) return tasa;
  const pago = leerConDefecto(t.pago, 'el pago', 0);
  if ('error' in pago) return pago;
  const base = leerConDefecto(t.base, 'la base imponible', 0);
  if ('error' in base) return base;
  const iva = leerConDefecto(t.iva, 'el IVA', 0);
  if ('error' in iva) return iva;
  return { valor: { ...e, tasa: tasa.valor || null, pago: pago.valor, baseImponible: base.valor, iva: iva.valor } };
}

/* ───────── Supuestos con % propio (R6) ───────── */

/** El % y el orden de un supuesto: el % vacío falta («Indica el %»: no se guarda 0 %); orden vacío = 10. */
export function leerSupuestoNumeros(pct: string, orden: string): Leido<{ pct: number; orden: number }> {
  const p = leerObligatorio(pct, 'el %', 'Indica el %.');
  if ('error' in p) return p;
  const o = leerEntero(orden, 'el orden', 10);
  if ('error' in o) return o;
  return { valor: { pct: p.valor, orden: o.valor } };
}

/* ───────── Reglas (R7) ───────── */

/** La prioridad de una regla nueva: «0» es 0, vacío = 100 (la de siempre), ilegible bloquea. */
export const leerPrioridad = (texto: string) => leerEntero(texto, 'la prioridad', 100);

/* ───────── Ficha y versión de un impuesto (R2) ───────── */

/** Lo vacío en los enteros de la ficha y de la versión vale lo mismo que la base da por defecto. */
export const ENTEROS_IMPUESTO = {
  orden: { campo: 'el orden', porDefecto: 0 },
  serieInicial: { campo: 'el primer número de la serie', porDefecto: 1 },
  plazoEntregaDias: { campo: 'el plazo de entrega', porDefecto: 2 },
} as const;

/**
 * Lo que no se entiende en los enteros de la ficha o la versión (el campo lo
 * guarda como NaN mientras no se entienda), o null. Va antes que las reglas.
 */
export function faltaEnEnteros(x: Partial<Record<keyof typeof ENTEROS_IMPUESTO, number>>): string | null {
  for (const k of Object.keys(ENTEROS_IMPUESTO) as (keyof typeof ENTEROS_IMPUESTO)[]) {
    const v = x[k];
    if (v !== undefined && !Number.isFinite(v)) return noSeEntiende(ENTEROS_IMPUESTO[k].campo);
  }
  return null;
}
