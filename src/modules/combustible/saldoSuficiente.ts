/* ============================================================
   Golden Touch · Combustible · No se surte más de lo que hay

   LA REGLA (09/10/2026). De un tanque no puede salir más combustible del
   que tiene: si está en 0 L no se surte, y un surtido (o traslado, merma o
   envío a MGG) mayor que su saldo no se guarda.

   QUÉ SE COMPARA. El saldo del LIBRO del tanque (apertura + entradas y
   retornos − salidas), que es el que se ve en la tarjeta del tanque. No el
   saldo corrido a la fecha del movimiento: hay meses viejos con saldo
   corrido negativo (T3, 29/06 → 13/08) que ya se cuadraron después, y esas
   filas se tienen que poder corregir o borrar.

   QUÉ SE REVISA. Los movimientos NUEVOS de salida y las ediciones que
   AUMENTAN lo que sale del tanque. Bajar litros, cambiar la hora o borrar
   un movimiento viejo sigue libre. Litros negativos (las correcciones «como
   en el Excel») suman al tanque y no se frenan.

   La misma regla vive en la base (trigger combustible_tanque_sin_sobregiro),
   que bloquea el tanque mientras revisa: así dos personas surtiendo a la vez
   no lo dejan en negativo. Esto de aquí es para avisar antes de guardar.
   ============================================================ */
import { num } from '@/shared/lib/format';
import type { TipoMovTanque } from '@/shared/lib/types';

/** Margen de redondeo: el saldo se guarda con 2 decimales. */
const TOLERANCIA = 0.005;

/** ¿Este tipo de movimiento SACA litros del tanque? (uso, merma, traslado y envío a MGG) */
export function saleDelTanque(tipo: TipoMovTanque): boolean {
  return tipo === 'uso' || tipo === 'merma' || tipo === 'traslado';
}

const n = (v: number | null | undefined): number => (v == null || !Number.isFinite(Number(v)) ? 0 : Number(v));

/** Litros que el movimiento saca del tanque (negativo si en realidad suma). */
export function litrosQueSalen(tipo: TipoMovTanque, litros: number | null | undefined): number {
  return saleDelTanque(tipo) ? n(litros) : -n(litros);
}

/** El tanque está vacío (o en negativo por un histórico): no hay nada que surtir. */
export function tanqueSinLitros(saldo: number | null | undefined): boolean {
  return n(saldo) <= TOLERANCIA;
}

export interface MovSalida {
  tipo: TipoMovTanque;
  litros: number | null | undefined;
  tanqueId?: string | null;
}

/**
 * Cuántos litros MÁS saca del tanque este cambio. Es lo que hay que tener en el tanque.
 * - Movimiento nuevo (`antes` null) o pasado a otro tanque: todo lo que saca.
 * - Edición en el mismo tanque: solo la diferencia con lo que ya sacaba.
 * - Si después no es una salida (entrada / retorno), no se revisa: 0.
 */
export function litrosExtraQueSalen(antes: MovSalida | null, despues: MovSalida): number {
  if (!saleDelTanque(despues.tipo)) return 0;
  const nuevo = !antes || (antes.tanqueId != null && despues.tanqueId != null && antes.tanqueId !== despues.tanqueId);
  const extra = nuevo ? n(despues.litros) : n(despues.litros) - litrosQueSalen(antes.tipo, antes.litros);
  return Math.round(extra * 100) / 100;
}

/**
 * El mensaje si el tanque no alcanza; null si alcanza.
 * `edicion` cambia la redacción: al editar, `litros` es lo que el cambio agrega.
 */
export function errorSaldoInsuficiente(o: {
  nombre: string;
  saldo: number | null | undefined;
  litros: number;
  edicion?: boolean;
}): string | null {
  const litros = n(o.litros);
  if (!(litros > 0)) return null;
  const saldo = n(o.saldo);
  if (saldo - litros >= -TOLERANCIA) return null;
  const hay = num(Math.max(0, saldo));
  return o.edicion
    ? `El tanque ${o.nombre} tiene ${hay} L; el cambio saca ${num(litros)} L más y lo dejaría en negativo.`
    : `El tanque ${o.nombre} tiene ${hay} L; no se pueden surtir ${num(litros)} L.`;
}

/** Etiqueta del tanque en los selectores: «T1 · 845 L» o «T1 · sin litros». */
export function etiquetaTanque(nombre: string, saldo: number | null | undefined): string {
  return tanqueSinLitros(saldo) ? `${nombre} · sin litros` : `${nombre} · ${num(saldo)} L`;
}
