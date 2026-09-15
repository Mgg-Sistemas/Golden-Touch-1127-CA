/* ============================================================
   Golden Touch · Cocina · Iniciar un mercado en el instante del clic

   Decisión del usuario (14/09/2026, 16:54): el mercado empieza en el momento
   exacto en que se presiona «Iniciar mercado», no a las 00:00 ni en una fecha
   elegida. Lo movido antes de ese instante no cuenta como entrada ni consumo del
   ciclo: queda dentro del saldo inicial. Reemplaza a la fecha elegible «como
   MGG» de la mañana del mismo día.

   EL SALDO INICIAL
   Es el stock de ese instante. Leer el inventario tarda: si entre el clic y la
   lectura entra o sale algo, el stock leído ya lo incluye y el ciclo también lo
   contaría. Por eso se corrige con lo movido desde el clic:
      saldo = stock leído − entradas + consumos + mermas desde el clic
   con las mismas lecturas que después usa el panel.

   Piezas puras: se prueban sin base ni React.
   ============================================================ */

const TZ = 'America/Caracas';
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Día (YYYY-MM-DD) de un instante, en hora de Caracas. */
export function diaCaracas(instante: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(instante));
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

export type InicioResuelto = { inicio_at: string; ajustadoAlCierre: boolean } | { error: string };

/**
 * El instante de inicio: el del clic.
 *
 * · Con un mercado abierto: error. Hay uno a la vez.
 * · Si el último cierre quedó DESPUÉS del clic (el reloj de la computadora que cerró iba
 *   adelantado), empieza en ese cierre: dos ciclos no comparten ni un instante.
 */
export function resolverInicio(clic: string, previos: CicloPrevio[]): InicioResuelto {
  const ms = Date.parse(clic ?? '');
  if (!Number.isFinite(ms)) return { error: 'No se pudo tomar la hora del inicio. Probá de nuevo.' };
  if (previos.some((p) => p.estado === 'abierto')) {
    return { error: 'Ya hay un mercado abierto: se cierra o se descarta antes de iniciar otro.' };
  }
  const u = ultimoCierre(previos);
  const cierreMs = u ? Date.parse(u.cierre_at) : NaN;
  if (Number.isFinite(cierreMs) && cierreMs > ms) {
    return { inicio_at: new Date(cierreMs).toISOString(), ajustadoAlCierre: true };
  }
  return { inicio_at: new Date(ms).toISOString(), ajustadoAlCierre: false };
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
 * Saldo inicial al instante del clic: stock leído − entradas + consumos + mermas desde el clic.
 *
 * Como en MGG, un saldo en cero o negativo no entra. Negativo quiere decir que en esos
 * segundos salió algo por otra puerta; el víver igual aparece en el panel si tiene stock.
 * Las mermas van desde el 15/09/2026: el ciclo las resta, así que una salida entre el clic
 * y la lectura también tiene que volver al saldo, o se contaría dos veces.
 */
export function reconstruirSaldo(
  viveres: ViverParaSaldo[],
  entradas: Map<string, number>,
  consumos: Map<string, { cantidad: number }>,
  mermas: Map<string, number> = new Map(),
): SaldoCalculado[] {
  const out: SaldoCalculado[] = [];
  for (const v of viveres) {
    const cantidad = r2((Number(v.stock) || 0) - (entradas.get(v.id) ?? 0) + (consumos.get(v.id)?.cantidad ?? 0) + (mermas.get(v.id) ?? 0));
    if (cantidad <= 0) continue;
    out.push({ producto_id: v.id, sku: v.sku, nombre: v.nombre, unidad: v.unidad ?? null, cantidad });
  }
  return out;
}
