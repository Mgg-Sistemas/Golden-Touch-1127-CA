/* ============================================================
   Golden Touch · Cocina · Cerrar el mercado sin descartar lo que hay

   Cambio del 28/09/2026, pedido por el usuario: descartar un mercado estaba
   generando controversias porque tiraba a la basura el saldo que quedaba, y
   el ciclo siguiente arrancaba en cero aunque la despensa estuviera llena.

   Ahora hay UNA sola salida: CERRAR.
     · Todos los movimientos del ciclo (entradas, comidas y mermas) se
       CONGELAN en el histórico: quedan como una foto, no se rearman
       consultando el kardex, así una corrección posterior en Inventario no
       cambia un ciclo ya cerrado.
     · Lo que queda en la despensa NO se descarta: es el saldo inicial del
       mercado nuevo. Durante el ciclo nuevo se le suman las entradas.

   CIERRE MANUAL (27/10/2026, decisión del usuario). El mercado ya no dura
   21 días: un mercado abierto arranca en su `inicio_at` y NO tiene fin hasta
   que una persona lo cierra. Mientras esté abierto, el libro, la Distribución
   y el stock llegan hasta HOY. Al cerrar se elige la fecha de cierre (por
   defecto hoy): esa fecha es el fin del ciclo y el inicio del siguiente.

   Aquí viven las piezas que se prueban sin base ni React.
   ============================================================ */
import type { ResumenViver, SaldoViver } from './cocinaMercado.repository';
import { diaCaracas, hoyCaracas } from './comidaMovil';

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/* ───────── La fecha del cierre ───────── */

const soloDia = (v: string | null | undefined) => String(v ?? '').slice(0, 10);
const ES_DIA = /^\d{4}-\d{2}-\d{2}$/;

function dmy(iso: string): string {
  const [y, m, d] = soloDia(iso).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(iso ?? '');
}

/**
 * El instante en que cierra el mercado para la fecha elegida (AAAA-MM-DD, día de Caracas):
 *   · hoy (o una fecha posterior) → AHORA MISMO: lo cargado después de este instante ya es
 *     del mercado siguiente;
 *   · un día anterior → el FINAL de ese día en Caracas (23:59:59.999): el ciclo que cierra se
 *     lleva las comidas de ese día completo y el siguiente arranca ahí.
 * Devuelve '' si la fecha no se puede leer.
 */
export function instanteDeCierre(fecha: string, ahora: Date = new Date()): string {
  const f = soloDia(fecha);
  if (!ES_DIA.test(f)) return '';
  if (f >= hoyCaracas(ahora)) return ahora.toISOString();
  return new Date(`${f}T23:59:59.999-04:00`).toISOString();
}

/**
 * ¿Sirve esa fecha para cerrar el mercado? Tiene que caer dentro del ciclo: no antes del día
 * en que arrancó y no en el futuro. Devuelve el instante del cierre ya resuelto.
 */
export function validarCierre(
  fecha: string, inicioAt: string, ahora: Date = new Date(),
): { cierre: string } | { error: string } {
  const f = soloDia(fecha);
  if (!ES_DIA.test(f)) return { error: 'Elige la fecha de cierre del mercado.' };
  if (f > hoyCaracas(ahora)) return { error: 'El cierre no puede ser una fecha futura: el mercado llega hasta hoy.' };
  const inicioDia = diaCaracas(inicioAt);
  if (inicioDia && f < inicioDia) return { error: `El cierre no puede ser anterior al inicio del mercado (${dmy(inicioDia)}).` };
  const cierre = instanteDeCierre(f, ahora);
  if (!cierre || Date.parse(cierre) <= Date.parse(inicioAt)) {
    return { error: 'El cierre tiene que ser posterior al instante en que arrancó el mercado.' };
  }
  return { cierre };
}

/** Un movimiento del ciclo, ya congelado en el histórico. */
export interface MovimientoCongelado {
  producto_id: string;
  fecha: string;
  cantidad: number;
  /** Código del comprobante (la comida, la orden de compra…). */
  ref?: string | null;
  /** Para las comidas: desayuno, almuerzo o cena. Para las mermas: el motivo. */
  detalle?: string | null;
  /** Solo en los consumos: lo que costó. */
  valor?: number;
}

/** La foto de todo lo que se movió en el ciclo. */
export interface MovimientosCiclo {
  entradas: MovimientoCongelado[];
  consumos: MovimientoCongelado[];
  mermas: MovimientoCongelado[];
  /** Cuándo se sacó la foto (el instante del cierre). */
  congelado_at?: string;
}

export const MOVIMIENTOS_VACIOS: MovimientosCiclo = { entradas: [], consumos: [], mermas: [] };

/** ¿Este ciclo tiene sus movimientos congelados? (los cerrados antes del 28/09/2026 no) */
export function tieneCongelados(m: { movimientos?: MovimientosCiclo | null } | null | undefined): boolean {
  const x = m?.movimientos;
  return !!x && (x.entradas.length > 0 || x.consumos.length > 0 || x.mermas.length > 0);
}

/** Los movimientos congelados de un víver, para el detalle del histórico. */
export function movimientosDeViver(mov: MovimientosCiclo | null | undefined, productoId: string): MovimientosCiclo {
  const filtrar = (xs: MovimientoCongelado[] | undefined) => (xs ?? []).filter((x) => x.producto_id === productoId);
  return {
    entradas: filtrar(mov?.entradas),
    consumos: filtrar(mov?.consumos),
    mermas: filtrar(mov?.mermas),
    congelado_at: mov?.congelado_at,
  };
}

/** Cuántos movimientos guarda la foto del ciclo. */
export function contarMovimientos(mov: MovimientosCiclo | null | undefined): number {
  return (mov?.entradas.length ?? 0) + (mov?.consumos.length ?? 0) + (mov?.mermas.length ?? 0);
}

/**
 * El saldo con el que arranca el mercado nuevo: lo que quedó en la despensa.
 *
 * Es la regla del cambio: al cerrar NO se descarta nada. Lo que tiene cantidad
 * mayor a cero pasa al ciclo siguiente; lo que quedó en cero no se arrastra
 * para no ensuciar la lista del mercado nuevo.
 */
export function saldoParaElNuevo(resumen: ResumenViver[]): SaldoViver[] {
  return resumen
    .filter((r) => round2(Number(r.queda) || 0) > 0)
    .map((r) => ({
      producto_id: r.producto_id,
      sku: r.sku,
      nombre: r.nombre,
      unidad: r.unidad ?? null,
      cantidad: round2(Number(r.queda) || 0),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** Lo que se le muestra al usuario antes de cerrar: qué se lleva el mercado nuevo. */
export interface AvanceCierre {
  /** Víveres que pasan al ciclo nuevo (cantidad > 0). */
  viveresQuePasan: number;
  /** Suma de unidades que pasan. */
  unidadesQuePasan: number;
  /** Víveres que quedaron en cero: no se arrastran. */
  viveresEnCero: number;
}

export function avanceCierre(resumen: ResumenViver[]): AvanceCierre {
  const pasan = resumen.filter((r) => round2(Number(r.queda) || 0) > 0);
  return {
    viveresQuePasan: pasan.length,
    unidadesQuePasan: round2(pasan.reduce((a, r) => a + (Number(r.queda) || 0), 0)),
    viveresEnCero: resumen.filter((r) => round2(Number(r.queda) || 0) <= 0).length,
  };
}
