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

   Aquí viven las piezas que se prueban sin base ni React.
   ============================================================ */
import type { ResumenViver, SaldoViver } from './cocinaMercado.repository';

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

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
