/* ============================================================
   Golden Touch · Cocina · Iniciar un mercado con fecha, como MGG

   Decisión del usuario (14/09/2026): la fecha de inicio se elige, como en MGG.

   DOS REGLAS QUE VIENEN DE MGG
   1. Ningún ciclo pisa a otro, ni siquiera a uno descartado. Los ciclos toman
      comidas y entradas por rango de tiempo, no por identificador: si dos rangos
      se solapan, los mismos platos entran en los dos.
   2. El saldo inicial es el stock A LA FECHA DE INICIO:
         saldo = stock de ahora − entradas desde el inicio + consumos desde el inicio
      con las mismas entradas y consumos que después cuenta el panel. Solo es
      exacto si en esos días nadie sacó nada por otra puerta (salida manual,
      ajuste, traslado): por eso conviene dejar la fecha en hoy.

   LA ADAPTACIÓN A GT
   GT guarda instantes (inicio_at, cierre_at), no fechas. El ciclo elegido empieza
   a las 00:00 de ese día en Caracas, salvo que ese mismo día haya terminado el
   ciclo anterior: entonces empieza en el instante en que terminó, porque las horas
   previas ya son de ese ciclo.

   Piezas puras: se prueban sin base ni React.
   ============================================================ */

const TZ = 'America/Caracas';
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Día (YYYY-MM-DD) de un instante, en hora de Caracas. */
export function diaCaracas(instante: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(instante));
}

/** Las 00:00 de un día en Caracas (UTC−4 todo el año, sin horario de verano), como instante ISO. */
export function inicioDelDia(dia: string): string {
  return new Date(`${dia}T00:00:00-04:00`).toISOString();
}

/** Lo mínimo de un mercado existente para saber hasta dónde llega. */
export interface CicloPrevio {
  numero?: string | null;
  estado: string;
  cierre_at: string | null;
}

/** El cierre más tardío entre los ciclos existentes. `null` si no hay ninguno cerrado. */
export function ultimoCierre(previos: CicloPrevio[]): { numero: string | null; cierre_at: string } | null {
  let ultimo: { numero: string | null; cierre_at: string } | null = null;
  for (const p of previos) {
    if (!p.cierre_at) continue;
    if (!ultimo || new Date(p.cierre_at).getTime() > new Date(ultimo.cierre_at).getTime()) {
      ultimo = { numero: p.numero ?? null, cierre_at: p.cierre_at };
    }
  }
  return ultimo;
}

/** Primer día que se puede elegir: el del último cierre, en Caracas. Sin ciclos cerrados, no hay mínimo. */
export function primerDiaElegible(previos: CicloPrevio[]): string | null {
  const u = ultimoCierre(previos);
  return u ? diaCaracas(u.cierre_at) : null;
}

export type InicioResuelto = { inicio_at: string; ajustadoAlCierre: boolean } | { error: string };

const dmy = (dia: string) => { const [y, m, d] = dia.split('-'); return `${d}/${m}/${y}`; };

/**
 * El instante de inicio para la fecha elegida, o por qué no se puede.
 *
 * · Después de hoy: error. El saldo se reconstruye con lo que ya pasó; con una fecha
 *   futura sería el stock del momento del clic, y lo que se consumiera hasta el inicio
 *   quedaría como faltante para siempre.
 * · Antes del día del último cierre: pisaría ese ciclo → error.
 * · El mismo día del último cierre: empieza en el instante del cierre, no a las 00:00.
 * · Después: a las 00:00 de ese día.
 */
export function resolverInicio(dia: string, previos: CicloPrevio[], hoy: string = diaCaracas(new Date())): InicioResuelto {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia ?? '')) return { error: 'Elegí una fecha de inicio válida.' };
  if (previos.some((p) => p.estado === 'abierto')) {
    return { error: 'Ya hay un mercado abierto: se cierra o se descarta antes de iniciar otro.' };
  }
  if (dia > hoy) {
    return { error: 'La fecha de inicio no puede ser posterior a hoy: el saldo inicial se calcula con lo que ya pasó.' };
  }
  const inicio = inicioDelDia(dia);
  const u = ultimoCierre(previos);
  if (!u) return { inicio_at: inicio, ajustadoAlCierre: false };
  const cierreMs = new Date(u.cierre_at).getTime();
  if (new Date(inicio).getTime() >= cierreMs) return { inicio_at: inicio, ajustadoAlCierre: false };
  const diaCierre = diaCaracas(u.cierre_at);
  if (dia === diaCierre) return { inicio_at: new Date(cierreMs).toISOString(), ajustadoAlCierre: true };
  return {
    error: `Esa fecha pisa al mercado ${u.numero ?? 'anterior'}, que terminó el ${dmy(diaCierre)}. `
      + 'Elegí desde ese día en adelante: dos ciclos sobre los mismos días cuentan los consumos dos veces.',
  };
}

/** Un víver con su stock actual, tal como lo trae el inventario. */
export interface ViverParaSaldo {
  id: string;
  sku: string;
  nombre: string;
  unidad?: string | null;
  stock?: number | string | null;
}

export interface SaldoCalculado {
  producto_id: string;
  sku: string;
  nombre: string;
  unidad: string | null;
  cantidad: number;
}

/**
 * Saldo inicial a la fecha de inicio: stock de ahora − entradas + consumos desde el inicio.
 *
 * Como en MGG, un saldo en cero o negativo no entra. Negativo quiere decir que en esos
 * días salió algo por otra puerta; el víver igual aparece en el panel si tiene stock.
 */
export function reconstruirSaldo(
  viveres: ViverParaSaldo[],
  entradas: Map<string, number>,
  consumos: Map<string, { cantidad: number }>,
): SaldoCalculado[] {
  const out: SaldoCalculado[] = [];
  for (const v of viveres) {
    const cantidad = r2((Number(v.stock) || 0) - (entradas.get(v.id) ?? 0) + (consumos.get(v.id)?.cantidad ?? 0));
    if (cantidad <= 0) continue;
    out.push({ producto_id: v.id, sku: v.sku, nombre: v.nombre, unidad: v.unidad ?? null, cantidad });
  }
  return out;
}
