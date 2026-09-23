/* ============================================================
   Golden Touch · Despiece de la RES EN CANAL

   Una res en canal no se guarda en el inventario como «res»: se despieza y lo
   que queda en el almacén son los CORTES —carne mechada, molida, para bistec y
   los que haga falta— más una MERMA (hueso, grasa, recorte) que no entra a
   ningún lado pero que tiene que quedar contada.

   Este archivo es solo cálculo (sin React ni Supabase) para poder probar con
   números de verdad las dos cosas que se pueden hacer mal:

   1. QUE LOS KILOS CUADREN. Cortes + merma tiene que dar exactamente los kilos
      de canal recibidos. Si no cuadra, la traza miente: o hay una pesada mal
      tomada o hay un corte que nadie anotó.

   2. QUÉ CUESTA CADA CORTE. La res se pagó entera, y la merma no se puede
      vender: su costo lo absorben los cortes. Por eso el costo del kilo de
      corte NO es el precio del kilo de canal, sino
          (kg de canal × precio del kg de canal) / kg de cortes
      Si se compran 100 kg a $2 y salen 92 kg de cortes, el kilo de corte entra
      a $2,1739 — no a $2. Repartir el costo entre los 100 kg dejaría $16 de
      mercadería inventada en el almacén.
   ============================================================ */
import { norm } from '@/shared/lib/texto';

/** Los tres cortes que siempre se preguntan. Se pueden agregar otros a mano. */
export const CORTES_SUGERIDOS = ['CARNE MECHADA', 'CARNE MOLIDA', 'CARNE PARA BISTEC'];

/** Tolerancia al comparar kilos: por debajo de esto es redondeo, no descuadre. */
const EPS = 0.005;

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * ¿Este producto es una res en canal? Se reconoce por el nombre, sin acentos ni
 * mayúsculas, así que sirve igual para «RES EN CANAL» que para «Carne de res en
 * canal». Es lo único que dispara el despiece al recibir.
 */
export function esResEnCanal(nombre: string | null | undefined): boolean {
  return norm(nombre).includes('res en canal');
}

/** Nombre de corte como se guarda y como entra al inventario: MAYÚSCULAS, sin espacios de más. */
export function nombreCorte(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

/** Un corte ya saneado, listo para entrar al inventario. */
export interface CorteListo {
  nombre: string;
  kg: number;
  /** Producto existente que le corresponde; `null` = hay que crearlo. */
  productoId?: string | null;
}

/** Una fila del formulario (el kg todavía es texto porque se está tecleando). */
export interface RenglonCorte {
  key: number;
  nombre: string;
  kg: string;
  productoId?: string | null;
}

export interface EntradaDespiece {
  /** Kilos de canal REALMENTE recibidos (los que se van a despiezar). */
  kgCanal: number;
  /** Precio por kilo al que se compró la canal. */
  precioCanal: number;
  cortes: CorteListo[];
  merma: number;
}

export interface DespieceCalc {
  kgCanal: number;
  kgCortes: number;
  merma: number;
  /** Kilos que no quedaron ni en un corte ni en la merma. Tiene que ser 0. */
  sinAsignar: number;
  cuadra: boolean;
  /** Lo que se pagó por los kilos de canal recibidos. */
  costoTotal: number;
  /** Costo del kilo de corte: el total repartido solo entre los cortes. */
  costoPorKgCorte: number;
  /** Cuánto de la res quedó como carne aprovechable, en %. */
  rendimientoPct: number;
}

/** Suma, reparte el costo y dice si los kilos cuadran. */
export function calcularDespiece(e: EntradaDespiece): DespieceCalc {
  const kgCanal = Math.max(0, Number(e.kgCanal) || 0);
  const merma = Math.max(0, Number(e.merma) || 0);
  const kgCortes = r2(e.cortes.reduce((a, c) => a + Math.max(0, Number(c.kg) || 0), 0));
  const sinAsignar = r2(kgCanal - kgCortes - merma);
  const costoTotal = r2(kgCanal * Math.max(0, Number(e.precioCanal) || 0));
  return {
    kgCanal: r2(kgCanal),
    kgCortes,
    merma: r2(merma),
    sinAsignar,
    cuadra: Math.abs(sinAsignar) < EPS,
    costoTotal,
    // Sin cortes no hay a quién repartirle el costo: 0 antes que Infinity.
    costoPorKgCorte: kgCortes > 0 ? r4(costoTotal / kgCortes) : 0,
    rendimientoPct: kgCanal > 0 ? r2((kgCortes / kgCanal) * 100) : 0,
  };
}

/**
 * Las filas del formulario que sí son un corte. Se descartan las vacías (el
 * renglón en blanco que queda al pie), y el nombre se normaliza acá una sola vez.
 */
export function cortesListos(renglones: RenglonCorte[]): CorteListo[] {
  return renglones
    .filter((r) => nombreCorte(r.nombre) || (Number(r.kg) || 0) > 0)
    .map((r) => ({
      nombre: nombreCorte(r.nombre),
      kg: r2(Math.max(0, Number(r.kg) || 0)),
      productoId: r.productoId ?? null,
    }));
}

/** Todo lo que impide guardar el despiece, en el orden en que conviene arreglarlo. */
export function erroresDespiece(e: EntradaDespiece): string[] {
  const errores: string[] = [];
  const cortes = e.cortes;

  if (!cortes.some((c) => c.kg > 0)) {
    errores.push('Cargá al menos un corte con sus kilos.');
  }
  if (cortes.some((c) => !c.nombre)) {
    errores.push('Hay un corte sin nombre: escribí cómo entra al inventario.');
  }
  cortes.forEach((c) => {
    if (c.nombre && c.kg <= 0) errores.push(`«${c.nombre}» no tiene kilos.`);
  });

  const vistos = new Map<string, string>();
  cortes.forEach((c) => {
    if (!c.nombre) return;
    const clave = norm(c.nombre);
    if (vistos.has(clave)) errores.push(`«${c.nombre}» está cargado dos veces: sumá los kilos en un solo renglón.`);
    else vistos.set(clave, c.nombre);
  });

  if ((Number(e.merma) || 0) < 0) errores.push('La merma no puede ser negativa.');

  const calc = calcularDespiece(e);
  if (!calc.cuadra) {
    errores.push(
      calc.sinAsignar > 0
        ? `Faltan ${calc.sinAsignar} kg por repartir: los cortes (${calc.kgCortes} kg) y la merma (${calc.merma} kg) no llegan a los ${calc.kgCanal} kg recibidos.`
        : `Sobran ${Math.abs(calc.sinAsignar)} kg: los cortes (${calc.kgCortes} kg) y la merma (${calc.merma} kg) pasan los ${calc.kgCanal} kg recibidos.`,
    );
  }
  return errores;
}

/** Lo que el bloque de despiece edita: los renglones tal cual se teclean. */
export interface EstadoDespiece {
  cortes: RenglonCorte[];
  merma: string;
}

/** Arranca con los tres cortes de siempre, sin kilos: se completan pesando. */
export function despieceInicial(): EstadoDespiece {
  return {
    cortes: CORTES_SUGERIDOS.map((nombre, i) => ({ key: i + 1, nombre, kg: '' })),
    merma: '',
  };
}

/** Lo que el formulario de recepción manda por cada res en canal recibida. */
export interface DespiecePorItem {
  /** SKU del renglón de la orden que es la res en canal. */
  sku: string;
  cortes: CorteListo[];
  merma: number;
}

/** Lo que queda escrito en la traza de la compra cuando una res se despieza. */
export interface TrazaDespiece {
  sku: string;
  producto: string;
  kg_canal: number;
  merma: number;
  rendimiento_pct: number;
  costo_kg_corte: number;
  resumen: string;
  cortes: { nombre: string; kg: number; producto_id: string; creado: boolean }[];
}

/** La merma que hace cuadrar la cuenta: lo que quede después de los cortes. */
export function mermaQueCuadra(kgCanal: number, cortes: CorteListo[]): number {
  const kgCortes = cortes.reduce((a, c) => a + Math.max(0, Number(c.kg) || 0), 0);
  return Math.max(0, r2((Number(kgCanal) || 0) - kgCortes));
}

/** Una línea para la traza de la compra y para el detalle del kardex. */
export function resumenDespiece(calc: DespieceCalc, cortes: CorteListo[]): string {
  const detalle = cortes
    .filter((c) => c.kg > 0)
    .map((c) => `${c.nombre} ${c.kg} kg`)
    .join(' · ');
  return `${calc.kgCanal} kg de res en canal → ${detalle} · merma ${calc.merma} kg (rendimiento ${calc.rendimientoPct} %)`;
}
